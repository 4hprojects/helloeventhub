import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Attendee, DuplicateFlag, EmailJob, Event, RateLimit, Registration } from '../src/db/models.js';
import { registrationPayload, setupTestApp, submit, teardownTestApp, uid, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(teardownTestApp);
beforeEach(async () => {
  await RateLimit.deleteMany({});
  ctx.setTurnstile('passed');
});

describe('GET /events/:slug', () => {
  it('returns public details and categories without private data', async () => {
    const res = await request(ctx.app).get(`/api/v1/events/${ctx.eventSlug}`).expect(200);
    expect(res.body.title).toContain('Alsem');
    expect(res.body.registrationOpen).toBe(true);
    expect(res.body.venueName).toBeNull();
    expect(res.body.categories).toHaveLength(9);
    expect(Object.keys(res.body)).not.toEqual(expect.arrayContaining(['registrations']));
    expect(Object.keys(res.body)).not.toEqual(expect.arrayContaining(['attendees']));
  });
  it('404s for unknown slugs', async () => {
    await request(ctx.app).get('/api/v1/events/nope').expect(404);
  });
});

describe('POST /events/:id/registrations', () => {
  it('creates a registration and returns reference + per-status summary', async () => {
    const res = await submit(ctx, registrationPayload()).expect(201);
    expect(res.body.reference).toMatch(/^HEH-[0-9A-Z]{8}$/);
    expect(res.body.countSummary).toEqual({ confirmed: 1, tentative: 1, declined: 0, total: 2 });
    expect(res.body.confirmationEmailQueued).toBe(true);
    expect(res.body).not.toHaveProperty('manageToken');
    const reg = await Registration.findOne({ reference: res.body.reference }).lean();
    expect(reg?.contacts?.emailNormalized).toBe('rep@example.test');
    expect(reg?.consent?.version).toBe('2026-10-v2');
    expect(await Attendee.countDocuments({ registrationId: reg!._id })).toBe(2);
    expect(await EmailJob.countDocuments({ registrationId: reg!._id, type: 'registration_confirmation' })).toBe(1);
  });

  it('does not count the representative unless listed as an attendee', async () => {
    const res = await submit(ctx, registrationPayload({ attendees: [{ fullName: 'Someone Else', ageCategory: 'adult', rsvp: 'confirmed' }] })).expect(201);
    expect(res.body.countSummary.total).toBe(1);
    const reg = await Registration.findOne({ reference: res.body.reference }).lean();
    const names = (await Attendee.find({ registrationId: reg!._id }).lean()).map((a) => a.fullName);
    expect(names).toEqual(['Someone Else']);
  });

  it('replays the same result for a retried idempotency key and never duplicates', async () => {
    const key = uid();
    const body = registrationPayload({ representative: { name: 'Retry Person', contacts: { mobile: '0917 555 1234', preferred: 'mobile' } } });
    const first = await submit(ctx, body, key).expect(201);
    const second = await submit(ctx, { ...body, turnstileToken: 'a-new-token' }, key).expect(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.reference).toBe(first.body.reference);
    expect(await Registration.countDocuments({ representativeName: 'Retry Person' })).toBe(1);
  });

  it('handles concurrent double-submit with the same key', async () => {
    const key = uid();
    const body = registrationPayload({ representative: { name: 'Double Click', contacts: { email: 'dc@example.test', preferred: 'email' } } });
    const [a, b] = await Promise.all([submit(ctx, body, key), submit(ctx, body, key)]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect(a.body.reference).toBe(b.body.reference);
    expect(await Registration.countDocuments({ representativeName: 'Double Click' })).toBe(1);
  });

  it('returns 409 when the same key is reused with a different payload', async () => {
    const key = uid();
    await submit(ctx, registrationPayload(), key).expect(201);
    const res = await submit(ctx, registrationPayload({ notes: 'changed' }), key).expect(409);
    expect(res.body.error.code).toBe('idempotency_conflict');
  });

  it('requires an Idempotency-Key header', async () => {
    const res = await request(ctx.app).post(`/api/v1/events/${ctx.eventId}/registrations`).send(registrationPayload()).expect(400);
    expect(res.body.error.code).toBe('idempotency_key_required');
  });

  it('validates contacts, attendee limits and privacy with field errors', async () => {
    const noContact = await submit(ctx, registrationPayload({ representative: { name: 'No Contact', contacts: { preferred: 'email' } } })).expect(422);
    expect(noContact.body.error.fieldErrors['representative.contacts']).toEqual(['Provide at least one way to contact you: email, mobile or Messenger']);
    const badPhone = await submit(ctx, registrationPayload({ representative: { name: 'Bad Phone', contacts: { mobile: '12345', preferred: 'mobile' } } })).expect(422);
    expect(badPhone.body.error.fieldErrors['representative.contacts.mobile']).toBeDefined();
    const many = Array.from({ length: 21 }, (_, i) => ({ fullName: `Person ${i} Test`, ageCategory: 'adult', rsvp: 'confirmed' }));
    await submit(ctx, registrationPayload({ attendees: many })).expect(422);
    await submit(ctx, registrationPayload({ acceptedPrivacy: false })).expect(422);
    await submit(ctx, registrationPayload({ attendees: [] })).expect(422);
  });

  it('accepts 20 attendees and a messenger-only contact', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ fullName: `Big Family ${i} Member`, ageCategory: i % 3 ? 'adult' : 'child', rsvp: 'confirmed' }));
    const res = await submit(
      ctx,
      registrationPayload({ attendees: many, representative: { name: 'Messenger Only', contacts: { messengerDisplayName: 'Msgr Name', preferred: 'messenger' } } }),
    ).expect(201);
    expect(res.body.countSummary.total).toBe(20);
    expect(res.body.confirmationEmailQueued).toBe(false);
  });

  it('allows zero attendees with an explicit reason', async () => {
    const res = await submit(ctx, registrationPayload({ attendees: [], noAttendeesReason: 'Working abroad this year' })).expect(201);
    expect(res.body.countSummary.total).toBe(0);
  });

  it('rejects unknown or inactive branch ids', async () => {
    await submit(ctx, registrationPayload({ eventCategoryId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' })).expect(422);
    const ok = await submit(ctx, registrationPayload({ eventCategoryId: ctx.categoryIds[0] })).expect(201);
    expect(ok.body.reference).toBeTruthy();
  });

  it('rejects failed bot checks and accepts (flagged) when Turnstile is unavailable', async () => {
    ctx.setTurnstile('failed');
    const bad = await submit(ctx, registrationPayload()).expect(422);
    expect(bad.body.error.code).toBe('bot_check_failed');
    ctx.setTurnstile('unavailable');
    const ok = await submit(ctx, registrationPayload()).expect(201);
    const reg = await Registration.findOne({ reference: ok.body.reference }).lean();
    expect(reg?.botCheck).toBe('unverified');
  });

  it('refuses submissions when registration is closed or consent version is outdated', async () => {
    await submit(ctx, registrationPayload({ consentVersion: 'old' })).expect(422);
    await Event.updateOne({ slug: ctx.eventSlug }, { $set: { registrationStatus: 'closed' } });
    const res = await submit(ctx, registrationPayload()).expect(422);
    expect(res.body.error.code).toBe('registration_closed');
    await Event.updateOne({ slug: ctx.eventSlug }, { $set: { registrationStatus: 'open' } });
  });

  it('marks registrations after the snapshot cutoff as late, or closes them when late registration is off', async () => {
    ctx.setNow(new Date('2026-10-21T10:00:00+08:00'));
    const late = await submit(ctx, registrationPayload()).expect(201);
    expect(late.body.lateRegistration).toBe(true);
    await Event.updateOne({ slug: ctx.eventSlug }, { $set: { allowLateRegistration: false } });
    await submit(ctx, registrationPayload()).expect(422);
    await Event.updateOne({ slug: ctx.eventSlug }, { $set: { allowLateRegistration: true } });
    ctx.setNow(new Date('2026-10-12T10:00:00+08:00'));
  });

  it('enforces capacity when configured', async () => {
    const current = await Attendee.countDocuments({ status: 'active', registrationActive: true, rsvp: { $in: ['confirmed', 'tentative'] } });
    await Event.updateOne({ slug: ctx.eventSlug }, { $set: { capacity: current + 1 } });
    const res = await submit(ctx, registrationPayload()).expect(422);
    expect(res.body.error.code).toBe('capacity_reached');
    await Event.updateOne({ slug: ctx.eventSlug }, { $unset: { capacity: 1 } });
  });

  it('flags possible duplicate names without merging', async () => {
    const one = registrationPayload({ attendees: [{ fullName: 'José Dupli Cate', ageCategory: 'adult', rsvp: 'confirmed' }] });
    const two = registrationPayload({ attendees: [{ fullName: 'jose dupli-cate', ageCategory: 'adult', rsvp: 'confirmed' }] });
    await submit(ctx, one).expect(201);
    await submit(ctx, two).expect(201);
    await new Promise((r) => setTimeout(r, 200));
    const flag = await DuplicateFlag.findOne({ matchKey: 'name:jose dupli cate' }).lean();
    expect(flag?.status).toBe('open');
    expect(flag?.attendeeIds).toHaveLength(2);
    expect(await Attendee.countDocuments({ normalizedName: 'jose dupli cate', status: 'active' })).toBe(2);
  });

  it('rejects oversized and malformed bodies', async () => {
    const huge = registrationPayload({ notes: 'x'.repeat(70_000) });
    await submit(ctx, huge).expect(413);
    await request(ctx.app).post(`/api/v1/events/${ctx.eventId}/registrations`).set('Idempotency-Key', uid()).set('Content-Type', 'application/json').send('{bad').expect(400);
  });

  it('ignores NoSQL operator injection in fields', async () => {
    const res = await submit(ctx, registrationPayload({ representative: { name: { $gt: '' }, contacts: { email: 'x@example.test', preferred: 'email' } } })).expect(422);
    expect(res.body.error.code).toBe('validation_failed');
  });
});

describe('security headers', () => {
  it('sets CSP, nosniff and frame protections', async () => {
    const res = await request(ctx.app).get('/api/v1/health').expect(200);
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toBeTruthy();
  });
  it('blocks cross-site mutations from unknown origins', async () => {
    const res = await submit(ctx, registrationPayload()).set('Origin', 'https://evil.example').expect(403);
    expect(res.body.error.code).toBe('origin_not_allowed');
  });
});
