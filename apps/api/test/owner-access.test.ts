import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EmailJob, RateLimit, Registration } from '../src/db/models.js';
import { processEmailBatch } from '../src/services/emailOutbox.js';
import { PASSWORD, registrationPayload, setupTestApp, submit, teardownTestApp, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let reference: string;
let publicId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  const res = await submit(ctx, registrationPayload({ representative: { name: 'Owner Person', contacts: { email: 'Owner@Example.test', preferred: 'email' } } })).expect(201);
  reference = res.body.reference;
  publicId = res.body.registrationPublicId;
});
afterAll(teardownTestApp);
beforeEach(async () => {
  await RateLimit.deleteMany({});
});

const work = () =>
  processEmailBatch({ transport: ctx.deps.emailTransport, logger: ctx.deps.logger, appBaseUrl: 'http://localhost:5173', sessionSecret: ctx.deps.config.SESSION_SECRET });

async function requestLinkAndGetToken(): Promise<string> {
  ctx.sent.length = 0;
  await request(ctx.app).post('/api/v1/registrations/access/request').send({ eventSlug: ctx.eventSlug, email: 'owner@example.test', reference }).expect(202);
  await work();
  const mail = ctx.sent.find((m) => m.subject.includes('manage'));
  const token = mail?.text.match(/#t=([A-Za-z0-9_-]{43})/)?.[1];
  if (!token) throw new Error('no token in email');
  return token;
}

async function ownerAgent() {
  const token = await requestLinkAndGetToken();
  const a = request.agent(ctx.app);
  const ex = await a.post('/api/v1/registrations/manage/exchange').send({ token }).expect(200);
  return { a, csrf: ex.body.csrfToken as string, token };
}

describe('owner access', () => {
  it('a reference alone cannot retrieve private data', async () => {
    await request(ctx.app).get('/api/v1/registrations/manage').expect(401);
    await request(ctx.app).get(`/api/v1/registrations/manage?reference=${reference}`).expect(401);
  });

  it('access requests return the same generic response whether or not they match', async () => {
    const good = await request(ctx.app).post('/api/v1/registrations/access/request').send({ eventSlug: ctx.eventSlug, email: 'owner@example.test', reference }).expect(202);
    const wrongEmail = await request(ctx.app).post('/api/v1/registrations/access/request').send({ eventSlug: ctx.eventSlug, email: 'nobody@example.test', reference }).expect(202);
    const wrongRef = await request(ctx.app).post('/api/v1/registrations/access/request').send({ eventSlug: ctx.eventSlug, email: 'owner@example.test', reference: 'HEH-00000000' }).expect(202);
    expect(good.body).toEqual(wrongEmail.body);
    expect(good.body).toEqual(wrongRef.body);
  });

  it('stores only a token hash and seals the secret in the outbox until sent', async () => {
    await request(ctx.app).post('/api/v1/registrations/access/request').send({ eventSlug: ctx.eventSlug, email: 'owner@example.test', reference }).expect(202);
    const reg = await Registration.findOne({ publicId }).lean();
    expect(reg?.manageTokenHash).toMatch(/^[0-9a-f]{64}$/);
    const job = await EmailJob.findOne({ registrationId: reg!._id, type: 'access_link', status: 'queued' }).lean();
    expect(job?.sealedSecret).toBeTruthy();
    await work();
    const sentJob = await EmailJob.findById(job!._id).lean();
    expect(sentJob?.status).toBe('sent');
    expect(sentJob?.sealedSecret).toBeUndefined();
  });

  it('exchanges a token once for a short owner session and returns details', async () => {
    const { a, token } = await ownerAgent();
    const me = await a.get('/api/v1/registrations/manage').expect(200);
    expect(me.body.registration.reference).toBe(reference);
    expect(me.body.registration.attendees).toHaveLength(2);
    expect(me.body.registration.canEdit).toBe(true);
    // Single-use
    await request(ctx.app).post('/api/v1/registrations/manage/exchange').send({ token }).expect(401);
  });

  it('updates with a revision precondition and rejects stale revisions', async () => {
    const { a, csrf } = await ownerAgent();
    const me = (await a.get('/api/v1/registrations/manage').expect(200)).body.registration;
    const body = {
      revision: me.revision,
      representative: { name: me.representativeName, contacts: me.contacts },
      attendees: [
        { publicId: me.attendees[0].id, fullName: me.attendees[0].fullName, ageCategory: 'adult', rsvp: 'declined' },
        { fullName: 'New Added Person', ageCategory: 'adult', rsvp: 'confirmed' },
      ],
    };
    // CSRF required
    await a.patch(`/api/v1/registrations/${publicId}`).send(body).expect(403);
    const ok = await a.patch(`/api/v1/registrations/${publicId}`).set('X-CSRF-Token', csrf).send(body).expect(200);
    expect(ok.body.registration.revision).toBe(me.revision + 1);
    expect(ok.body.registration.attendees.map((x: { rsvp: string }) => x.rsvp)).toEqual(['declined', 'confirmed']);
    const stale = await a.patch(`/api/v1/registrations/${publicId}`).set('X-CSRF-Token', csrf).send(body).expect(409);
    expect(stale.body.error.code).toBe('revision_conflict');
    expect(await EmailJob.countDocuments({ type: 'registration_updated' })).toBe(1);
  });

  it('owners cannot change their contact details (staff-assisted only)', async () => {
    const { a, csrf } = await ownerAgent();
    const me = (await a.get('/api/v1/registrations/manage').expect(200)).body.registration;
    const res = await a
      .patch(`/api/v1/registrations/${publicId}`)
      .set('X-CSRF-Token', csrf)
      .send({ revision: me.revision, representative: { name: me.representativeName, contacts: { email: 'attacker@example.test', preferred: 'email' } }, attendees: [] , noAttendeesReason: 'x'})
      .expect(403);
    expect(res.body.error.code).toBe('contact_change_requires_staff');
  });

  it('owners cannot edit other registrations', async () => {
    const other = await submit(ctx, registrationPayload()).expect(201);
    const { a, csrf } = await ownerAgent();
    await a.post(`/api/v1/registrations/${other.body.registrationPublicId}/cancel`).set('X-CSRF-Token', csrf).send({ revision: 0 }).expect(404);
  });

  it('edits are refused after the self-service deadline', async () => {
    const { a, csrf } = await ownerAgent();
    const me = (await a.get('/api/v1/registrations/manage').expect(200)).body.registration;
    ctx.setNow(new Date('2026-10-24T10:00:00+08:00'));
    const res = await a.post(`/api/v1/registrations/${publicId}/cancel`).set('X-CSRF-Token', csrf).send({ revision: me.revision }).expect(422);
    expect(res.body.error.code).toBe('edit_window_closed');
    ctx.setNow(new Date('2026-10-12T10:00:00+08:00'));
  });

  it('cancels and then refuses further access', async () => {
    const { a, csrf } = await ownerAgent();
    const me = (await a.get('/api/v1/registrations/manage').expect(200)).body.registration;
    const res = await a.post(`/api/v1/registrations/${publicId}/cancel`).set('X-CSRF-Token', csrf).send({ revision: me.revision }).expect(200);
    expect(res.body.registration.status).toBe('cancelled');
    expect(res.body.registration.canEdit).toBe(false);
    ctx.sent.length = 0;
    await request(ctx.app).post('/api/v1/registrations/access/request').send({ eventSlug: ctx.eventSlug, email: 'owner@example.test', reference }).expect(202);
    await work();
    expect(ctx.sent.some((m) => m.subject.includes('cancelled'))).toBe(true);
    expect(ctx.sent.some((m) => m.subject.includes('manage'))).toBe(false);
  });

  it('opening a manage link does not sign out an admin in the same browser', async () => {
    const r = await submit(ctx, registrationPayload({ representative: { name: 'Admin Family', contacts: { email: 'adminfam@example.test', preferred: 'email' } } })).expect(201);
    ctx.sent.length = 0;
    await request(ctx.app).post('/api/v1/registrations/access/request').send({ eventSlug: ctx.eventSlug, email: 'adminfam@example.test', reference: r.body.reference }).expect(202);
    await work();
    const token = ctx.sent.find((m) => m.subject.includes('manage'))!.text.match(/#t=([A-Za-z0-9_-]{43})/)![1];
    const a = request.agent(ctx.app);
    const s0 = await a.get('/api/v1/auth/session').expect(200);
    const login = await a.post('/api/v1/auth/login').set('X-CSRF-Token', s0.body.csrfToken).send({ email: 'admin@example.test', password: PASSWORD }).expect(200);
    const sid1 = login.headers['set-cookie']?.[0]?.split(';')[0];
    await a.get('/api/v1/admin/events').expect(200);
    const ex = await a.post('/api/v1/registrations/manage/exchange').send({ token }).expect(200);
    expect(ex.headers['set-cookie']?.[0]?.split(';')[0]).not.toBe(sid1); // session id rotated
    await a.get('/api/v1/admin/events').expect(200); // still signed in as admin
    await a.get('/api/v1/registrations/manage').expect(200); // and has owner access
  });
});
