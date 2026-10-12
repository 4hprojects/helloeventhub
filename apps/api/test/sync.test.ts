import { createHash } from 'node:crypto';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rosterChecksumInput, type SyncPullResponse, type VenueRosterItem } from '@heh/contracts';
import { Checkin, RateLimit, Registration } from '../src/db/models.js';
import { agent, registrationPayload, setupTestApp, submit, teardownTestApp, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let token: string;
let deviceId: string;
let admin: Awaited<ReturnType<typeof agent>>;
const T0 = new Date('2026-10-12T10:00:00+08:00');
const later = (min: number) => new Date(T0.getTime() + min * 60_000);

beforeAll(async () => {
  ctx = await setupTestApp();
  await submit(ctx, registrationPayload({ attendees: [{ fullName: 'Venue Alpha', ageCategory: 'adult', rsvp: 'confirmed' }, { fullName: 'Venue Beta', ageCategory: 'child', rsvp: 'tentative' }] })).expect(201);
  await submit(ctx, registrationPayload({ attendees: [{ fullName: 'Venue Gamma', ageCategory: 'adult', rsvp: 'confirmed' }] })).expect(201);
  admin = await agent(ctx, 'admin@example.test');
  const d = await admin.a.post(`/api/v1/admin/events/${ctx.eventId}/venue-devices`).set('X-CSRF-Token', admin.csrf).send({ label: 'Main laptop' }).expect(201);
  token = d.body.token;
  deviceId = d.body.id;
});
afterAll(teardownTestApp);
beforeEach(async () => {
  await RateLimit.deleteMany({});
});

const dev = (path: string) => `/api/v1/sync/events/${ctx.eventId}${path}`;
const auth = () => ({ Authorization: `Bearer ${token}` });

async function pullAll(): Promise<VenueRosterItem[]> {
  const items: VenueRosterItem[] = [];
  let cursor = '';
  for (;;) {
    const res = await request(ctx.app).get(dev('/pull')).query(cursor ? { cursor } : {}).set(auth()).expect(200);
    const body = res.body as SyncPullResponse;
    items.push(...body.items);
    cursor = body.nextCursor;
    if (!body.hasMore) return items;
  }
}

describe('device auth', () => {
  it('requires a valid device token scoped to the event', async () => {
    await request(ctx.app).get(dev('/pull')).expect(401);
    await request(ctx.app).get(dev('/pull')).set({ Authorization: `Bearer ${'x'.repeat(43)}` }).expect(401);
    await request(ctx.app).get(`/api/v1/sync/events/${ctx.otherEventId}/pull`).set(auth()).expect(404);
  });
  it('only event admins can issue tokens', async () => {
    const committee = await agent(ctx, 'committee@example.test');
    await committee.a.post(`/api/v1/admin/events/${ctx.eventId}/venue-devices`).set('X-CSRF-Token', committee.csrf).send({ label: 'Nope' }).expect(403);
    const list = await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/venue-devices`).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(token);
  });
});

describe('roster pull', () => {
  it('serves only settled changes, then the full roster with a matching checksum', async () => {
    ctx.setNow(new Date()); // registrations were just written: inside the settle window
    const fresh = await request(ctx.app).get(dev('/pull')).set(auth()).expect(200);
    expect(fresh.body.items).toHaveLength(0);
    ctx.setNow(new Date(Date.now() + 2 * 60_000));
    const items = await pullAll();
    expect(items.map((i) => i.fullName).sort()).toEqual(['Venue Alpha', 'Venue Beta', 'Venue Gamma']);
    expect(items[0]).toMatchObject({ active: true, branch: expect.any(String), reference: expect.stringMatching(/^HEH-/) });
    expect(JSON.stringify(items)).not.toMatch(/example\.test/); // no contacts in the roster
    const summary = await request(ctx.app).get(dev('/roster-summary')).set(auth()).expect(200);
    const local = createHash('sha256').update(rosterChecksumInput(items.filter((i) => i.active))).digest('hex');
    expect(summary.body).toMatchObject({ activeCount: 3, checksum: local });
  });

  it('cursor returns only later changes, including cancellations', async () => {
    let cursor = '';
    for (;;) {
      const r = await request(ctx.app).get(dev('/pull')).query(cursor ? { cursor } : {}).set(auth()).expect(200);
      cursor = r.body.nextCursor;
      if (!r.body.hasMore) break;
    }
    const reg = await Registration.findOne({ representativeName: 'Example Representative' }).sort({ createdAt: -1 }).lean();
    await admin.a.post(`/api/v1/admin/events/${ctx.eventId}/registrations/${reg!.publicId}/cancel`).set('X-CSRF-Token', admin.csrf).send({ revision: reg!.revision }).expect(200);
    ctx.setNow(new Date(Date.now() + 2 * 60_000));
    const delta = await request(ctx.app).get(dev('/pull')).query({ cursor }).set(auth()).expect(200);
    expect(delta.body.items.map((i: VenueRosterItem) => [i.fullName, i.active])).toEqual([['Venue Gamma', false]]);
    const again = await request(ctx.app).get(dev('/pull')).query({ cursor: delta.body.nextCursor }).set(auth()).expect(200);
    expect(again.body.items).toHaveLength(0);
  });

  it('rejects revoked devices', async () => {
    const d = await admin.a.post(`/api/v1/admin/events/${ctx.eventId}/venue-devices`).set('X-CSRF-Token', admin.csrf).send({ label: 'Spare' }).expect(201);
    await request(ctx.app).get(dev('/pull')).set({ Authorization: `Bearer ${d.body.token}` }).expect(200);
    await admin.a.post(`/api/v1/admin/events/${ctx.eventId}/venue-devices/${d.body.id}/revoke`).set('X-CSRF-Token', admin.csrf).expect(200);
    await request(ctx.app).get(dev('/pull')).set({ Authorization: `Bearer ${d.body.token}` }).expect(401);
  });
});

describe('push', () => {
  const op = () => ulid();
  const checkin = (attendeeId: string, opId = op()) => ({ opId, type: 'checkin', attendeeId, operatorId: 'op-1', deviceTime: later(5).toISOString() });

  it('accepts a check-in once; replays and second devices never double count', async () => {
    const items = await pullAll();
    const alpha = items.find((i) => i.fullName === 'Venue Alpha')!;
    const first = checkin(alpha.attendeeId);
    const r1 = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [first] }).expect(200);
    expect(r1.body.results[0]).toMatchObject({ result: 'accepted' });
    const replay = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [first] }).expect(200);
    expect(replay.body.results[0].result).toBe('already_applied');
    const other = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [checkin(alpha.attendeeId)] }).expect(200);
    expect(other.body.results[0]).toMatchObject({ result: 'already_applied', code: 'already_checked_in', firstCheckedInAt: later(5).toISOString() });
    expect(await Checkin.countDocuments({})).toBe(1);
    const dash = await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(200);
    expect(dash.body.checkedIn).toBe(1);
  });

  it('handles concurrent check-ins of the same person from two stations', async () => {
    const items = await pullAll();
    const beta = items.find((i) => i.fullName === 'Venue Beta')!;
    const [a, b] = await Promise.all([
      request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [checkin(beta.attendeeId)] }),
      request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [checkin(beta.attendeeId)] }),
    ]);
    expect([a.body.results[0].result, b.body.results[0].result].sort()).toEqual(['accepted', 'already_applied']);
    expect(await Checkin.countDocuments({})).toBe(2);
  });

  it('flags check-ins for cancelled people for review and rejects unknown ids', async () => {
    const items = await pullAll();
    const gamma = items.find((i) => i.fullName === 'Venue Gamma')!;
    const res = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [checkin(gamma.attendeeId), checkin('01ARZ3NDEKTSV4RRFFQ69G5FAV')] }).expect(200);
    expect(res.body.results.map((r: { result: string }) => r.result)).toEqual(['needs_review', 'rejected']);
  });

  it('creates walk-ins idempotently, grouped into one venue registration', async () => {
    const groupId = `G-${ulid()}`;
    const w = (name: string, temp = `W-${ulid()}`) => ({
      opId: op(),
      type: 'walkin',
      tempAttendeeId: temp,
      groupId,
      groupName: 'Walk-in Family',
      fullName: name,
      ageCategory: 'adult',
      branchLabel: 'Denio',
      checkedIn: true,
      operatorId: 'op-1',
      deviceTime: later(30).toISOString(),
    });
    const one = w('Walk In One');
    const two = w('Walk In Two');
    const res = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [one, two] }).expect(200);
    expect(res.body.results.map((r: { result: string }) => r.result)).toEqual(['accepted', 'accepted']);
    expect(res.body.results[0].registrationId).toBe(res.body.results[1].registrationId);
    const replay = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [one] }).expect(200);
    expect(replay.body.results[0]).toMatchObject({ result: 'already_applied', attendeeId: res.body.results[0].attendeeId });
    // Same temp attendee with a new op id still maps to the same cloud attendee.
    const dupTemp = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [{ ...one, opId: op() }] }).expect(200);
    expect(dupTemp.body.results[0]).toMatchObject({ result: 'already_applied', attendeeId: res.body.results[0].attendeeId });
    const reg = await Registration.findOne({ publicId: res.body.results[0].registrationId }).lean();
    expect(reg).toMatchObject({ source: 'venue', lateRegistration: true });
    const dash = await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(200);
    expect(dash.body.checkedIn).toBe(4);
  });

  it('validates op payloads', async () => {
    await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [] }).expect(422);
    await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [{ opId: 'short', type: 'checkin' }] }).expect(422);
    expect(deviceId).toBeTruthy();
  });
});

describe('venue corrections (update / add / undo)', () => {
  const base = () => ({ opId: ulid(), operatorId: 'op-1', deviceTime: later(40).toISOString() });
  let fam: VenueRosterItem[];

  beforeAll(async () => {
    await submit(ctx, registrationPayload({ attendees: [{ fullName: 'Fix Mispelled', ageCategory: 'adult', rsvp: 'tentative' }, { fullName: 'Fix Other', ageCategory: 'adult', rsvp: 'confirmed' }] })).expect(201);
    ctx.setNow(new Date(Date.now() + 5 * 60_000));
    fam = (await pullAll()).filter((i) => i.fullName.startsWith('Fix '));
  });

  it('applies an update at the expected revision; stale revision goes to review; replay is idempotent', async () => {
    const p = fam.find((i) => i.fullName === 'Fix Mispelled')!;
    const op = { ...base(), type: 'attendee_update', attendeeId: p.attendeeId, baseRevision: p.revision, fullName: 'Fix Misspelled', rsvp: 'confirmed' };
    const r = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [op] }).expect(200);
    expect(r.body.results[0].result).toBe('accepted');
    const replay = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [op] }).expect(200);
    expect(replay.body.results[0].result).toBe('already_applied');
    const stale = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [{ ...op, opId: ulid(), fullName: 'Something Else' }] }).expect(200);
    expect(stale.body.results[0]).toMatchObject({ result: 'needs_review', code: 'changed_online' });
    const reg = await Registration.findOne({ publicId: p.registrationId }).lean();
    const detail = await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/registrations/${reg!.publicId}`).expect(200);
    expect(detail.body.registration.attendees.find((a: { id: string }) => a.id === p.attendeeId)).toMatchObject({ fullName: 'Fix Misspelled', rsvp: 'confirmed' });
  });

  it('adds a person to an existing household (idempotent) and refuses cancelled households', async () => {
    const regId = fam[0]!.registrationId;
    const temp = `W-${ulid()}`;
    const op = { ...base(), type: 'attendee_add', tempAttendeeId: temp, registrationId: regId, fullName: 'Fix Extra Cousin', ageCategory: 'child', checkedIn: true };
    const r = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [op] }).expect(200);
    expect(r.body.results[0]).toMatchObject({ result: 'accepted', registrationId: regId });
    const again = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [{ ...op, opId: ulid() }] }).expect(200);
    expect(again.body.results[0]).toMatchObject({ result: 'already_applied', attendeeId: r.body.results[0].attendeeId });
    const cancelled = await Registration.findOne({ status: 'cancelled' }).lean();
    const bad = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [{ ...op, opId: ulid(), tempAttendeeId: `W-${ulid()}`, registrationId: cancelled!.publicId }] }).expect(200);
    expect(bad.body.results[0]).toMatchObject({ result: 'needs_review', code: 'registration_cancelled' });
  });

  it('undoes only the check-in made by the named op', async () => {
    const p = fam.find((i) => i.fullName === 'Fix Other')!;
    const before = (await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(200)).body.checkedIn;
    const ci = { ...base(), type: 'checkin', attendeeId: p.attendeeId };
    await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [ci] }).expect(200);
    const wrongOp = await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [{ ...base(), type: 'checkin_undo', attendeeId: p.attendeeId, checkinOpId: ulid() }] }).expect(200);
    expect(wrongOp.body.results[0]).toMatchObject({ result: 'needs_review', code: 'checked_in_by_other_op' });
    const undo = { ...base(), type: 'checkin_undo', attendeeId: p.attendeeId, checkinOpId: ci.opId, reason: 'Tapped wrong person' };
    expect((await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [undo] }).expect(200)).body.results[0].result).toBe('accepted');
    expect((await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [undo] }).expect(200)).body.results[0].result).toBe('already_applied');
    const after = (await admin.a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(200)).body.checkedIn;
    expect(after).toBe(before);
    // Can be checked in again afterwards
    expect((await request(ctx.app).post(dev('/push')).set(auth()).send({ ops: [{ ...base(), type: 'checkin', attendeeId: p.attendeeId }] }).expect(200)).body.results[0].result).toBe('accepted');
  });
});
