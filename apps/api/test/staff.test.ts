import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminUser, AuditLog, Membership, Organization, RateLimit } from '../src/db/models.js';
import { temporaryPassword } from '../src/routes/staff.js';
import { agent, setupTestApp, teardownTestApp, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let admin: Awaited<ReturnType<typeof agent>>;
const url = (p = '') => `/api/v1/admin/events/${ctx.eventId}/staff${p}`;

beforeAll(async () => {
  ctx = await setupTestApp();
  admin = await agent(ctx, 'admin@example.test');
});
afterAll(teardownTestApp);
beforeEach(async () => {
  await RateLimit.deleteMany({});
});

describe('staff management', () => {
  it('generates readable temporary passwords that meet the policy', () => {
    const p = temporaryPassword();
    expect(p).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
    expect(new Set(p).size).toBeGreaterThanOrEqual(6);
  });

  it('lists staff; committee members cannot manage staff', async () => {
    const list = await admin.a.get(url()).expect(200);
    expect(list.body.items.map((s: { email: string }) => s.email).sort()).toEqual(['admin@example.test', 'committee@example.test']);
    expect(list.body.items.find((s: { isYou: boolean }) => s.isYou).email).toBe('admin@example.test');
    const committee = await agent(ctx, 'committee@example.test');
    await committee.a.get(url()).expect(403);
    await committee.a.post(url()).set('X-CSRF-Token', committee.csrf).send({ email: 'x@example.test', name: 'X Person', role: 'committee' }).expect(403);
  });

  it('invites a new person with a one-time password they must change before anything else', async () => {
    const res = await admin.a.post(url()).set('X-CSRF-Token', admin.csrf).send({ email: 'New.Member@Example.test', name: 'New Member', role: 'committee' }).expect(201);
    expect(res.body.tempPassword).toMatch(/^[a-z2-9-]{19}$/);
    expect(await AuditLog.countDocuments({ action: 'staff.granted' })).toBe(1);
    expect(JSON.stringify(await AuditLog.find({ action: 'staff.granted' }).lean())).not.toContain(res.body.tempPassword);
    await admin.a.post(url()).set('X-CSRF-Token', admin.csrf).send({ email: 'new.member@example.test', name: 'New Member', role: 'committee' }).expect(409);

    const newbie = await agent(ctx, 'new.member@example.test', res.body.tempPassword);
    const session = await newbie.a.get('/api/v1/auth/session').expect(200);
    expect(session.body.user.mustChangePassword).toBe(true);
    const blocked = await newbie.a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(403);
    expect(blocked.body.error.code).toBe('password_change_required');
    const changed = await newbie.a.post('/api/v1/auth/password').set('X-CSRF-Token', newbie.csrf).send({ currentPassword: res.body.tempPassword, newPassword: 'my-own-strong-passphrase' }).expect(200);
    await newbie.a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).set('X-CSRF-Token', changed.body.csrfToken).expect(200);
  });

  it('changes roles but protects the last event admin and the current user', async () => {
    const list = (await admin.a.get(url()).expect(200)).body.items as Array<{ id: string; email: string }>;
    const me = list.find((s) => s.email === 'admin@example.test')!;
    const committee = list.find((s) => s.email === 'committee@example.test')!;
    await admin.a.patch(url(`/${me.id}`)).set('X-CSRF-Token', admin.csrf).send({ role: 'committee' }).expect(409);
    await admin.a.post(url(`/${me.id}/remove`)).set('X-CSRF-Token', admin.csrf).expect(409);
    await admin.a.patch(url(`/${committee.id}`)).set('X-CSRF-Token', admin.csrf).send({ role: 'event_admin' }).expect(200);
    const promoted = await agent(ctx, 'committee@example.test');
    await promoted.a.get(url()).expect(200);
    // Demote back: allowed because another admin remains.
    await admin.a.patch(url(`/${committee.id}`)).set('X-CSRF-Token', admin.csrf).send({ role: 'committee' }).expect(200);
  });

  it('removing access takes effect immediately', async () => {
    const list = (await admin.a.get(url()).expect(200)).body.items as Array<{ id: string; email: string }>;
    const member = list.find((s) => s.email === 'new.member@example.test')!;
    const session = await agent(ctx, 'new.member@example.test', 'my-own-strong-passphrase');
    await session.a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(200);
    await admin.a.post(url(`/${member.id}/remove`)).set('X-CSRF-Token', admin.csrf).expect(200);
    await session.a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(401);
  });

  it('resets a password, signing out the old session and forcing a change', async () => {
    const list = (await admin.a.get(url()).expect(200)).body.items as Array<{ id: string; email: string }>;
    const committee = list.find((s) => s.email === 'committee@example.test')!;
    const old = await agent(ctx, 'committee@example.test');
    const r = await admin.a.post(url(`/${committee.id}/reset-password`)).set('X-CSRF-Token', admin.csrf).expect(200);
    await old.a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(401);
    const fresh = await agent(ctx, 'committee@example.test', r.body.tempPassword);
    expect((await fresh.a.get('/api/v1/auth/session').expect(200)).body.user.mustChangePassword).toBe(true);
  });

  it('cannot reset the password of someone with access in another organization', async () => {
    const list = (await admin.a.get(url()).expect(200)).body.items as Array<{ id: string; email: string }>;
    const committee = list.find((s) => s.email === 'committee@example.test')!;
    const user = await AdminUser.findOne({ publicId: committee.id }).lean();
    const other = await Organization.findOne({ slug: 'other-org' }).lean();
    await Membership.create({ userId: user!._id, organizationId: other!._id, eventId: null, role: 'committee' });
    await admin.a.post(url(`/${committee.id}/reset-password`)).set('X-CSRF-Token', admin.csrf).expect(403);
  });

  it('cannot see or manage staff of another event', async () => {
    const outsider = await agent(ctx, 'outsider@example.test');
    await outsider.a.get(url()).expect(404);
    await request(ctx.app).get(url()).expect(401);
  });
});
