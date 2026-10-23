import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminUser, AuditLog, RateLimit } from '../src/db/models.js';
import {
  agent,
  registrationPayload,
  setupTestApp,
  submit,
  teardownTestApp,
  type TestCtx,
} from './helpers.js';

let ctx: TestCtx;
let reference: string;
let regId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  const res = await submit(
    ctx,
    registrationPayload({
      representative: {
        name: 'Searchable Rep',
        contacts: { email: 'search@example.test', mobile: '0917 222 3333', preferred: 'mobile' },
      },
      attendees: [{ fullName: 'Findme Attendee', ageCategory: 'adult', rsvp: 'confirmed' }],
    }),
  ).expect(201);
  reference = res.body.reference;
  regId = res.body.registrationPublicId;
});
afterAll(teardownTestApp);
beforeEach(async () => {
  await RateLimit.deleteMany({});
});

describe('authentication', () => {
  it('rejects unauthenticated admin requests with 401', async () => {
    const { a, csrf } = await agent(ctx);
    await a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(401);
    await a.get('/api/v1/admin/events').set('X-CSRF-Token', csrf).expect(401);
  });

  it('requires a CSRF token to log in and for admin mutations', async () => {
    const a = request.agent(ctx.app);
    await a.get('/api/v1/auth/session');
    const r = await a
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.test', password: 'x' })
      .expect(403);
    expect(r.body.error.code).toBe('csrf_failed');
    const { a: signed } = await agent(ctx, 'admin@example.test');
    await signed.post(`/api/v1/admin/events/${ctx.eventId}/categories`).send({ label: 'Nope' }).expect(403);
  });

  it('uses a generic error for unknown users and wrong passwords', async () => {
    const { a, csrf } = await agent(ctx);
    const r1 = await a
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'nobody@example.test', password: 'whatever-pass' })
      .expect(401);
    const r2 = await a
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'admin@example.test', password: 'wrong-password' })
      .expect(401);
    expect(r1.body.error.message).toBe(r2.body.error.message);
  });

  it('locks an account after 5 failed attempts', async () => {
    const { a, csrf } = await agent(ctx);
    for (let i = 0; i < 5; i++) {
      await a
        .post('/api/v1/auth/login')
        .set('X-CSRF-Token', csrf)
        .send({ email: 'outsider@example.test', password: 'wrong-password' })
        .expect(401);
    }
    const locked = await a
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: 'outsider@example.test', password: 'correct-horse-battery-staple' })
      .expect(429);
    expect(locked.body.error.code).toBe('account_locked');
    expect(await AuditLog.countDocuments({ action: 'auth.locked' })).toBe(1);
    await AdminUser.updateOne({ email: 'outsider@example.test' }, { $unset: { lockedUntil: 1 } });
  });

  it('logs out and invalidates the session', async () => {
    const { a, csrf } = await agent(ctx, 'committee@example.test');
    await a.get('/api/v1/admin/events').expect(200);
    await a.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf).expect(204);
    await a.get('/api/v1/admin/events').expect(401);
  });
});

describe('event scoping and roles', () => {
  it('lists only events the user can access', async () => {
    const { a } = await agent(ctx, 'committee@example.test');
    const res = await a.get('/api/v1/admin/events').expect(200);
    expect(res.body.items.map((e: { id: string }) => e.id)).toEqual([ctx.eventId]);
  });

  it('returns 404 for events in another organization', async () => {
    const { a } = await agent(ctx, 'outsider@example.test');
    await a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(404);
    await a.get(`/api/v1/admin/events/${ctx.eventId}/registrations/${regId}`).expect(404);
    const { a: committee } = await agent(ctx, 'committee@example.test');
    await committee.get(`/api/v1/admin/events/${ctx.otherEventId}/registrations`).expect(404);
  });

  it('committee cannot change event settings or branches', async () => {
    const { a, csrf } = await agent(ctx, 'committee@example.test');
    await a
      .post(`/api/v1/admin/events/${ctx.eventId}/categories`)
      .set('X-CSRF-Token', csrf)
      .send({ label: 'New Branch' })
      .expect(403);
  });

  it('event admin can update event settings with revision checks', async () => {
    const { a, csrf } = await agent(ctx, 'admin@example.test');
    const ev = (await a.get(`/api/v1/admin/events/${ctx.eventId}`).expect(200)).body;
    const body = {
      revision: ev.revision,
      title: ev.title,
      tagline: ev.tagline,
      description: 'Updated description',
      venueName: 'Confirmed Hall',
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      onsiteRegistrationStartsAt: ev.onsiteRegistrationStartsAt,
      registrationStatus: 'open',
      preregSnapshotAt: ev.preregSnapshotAt,
      preregistrationDeadlineDate: ev.preregistrationDeadlineDate,
      allowLateRegistration: true,
      contactInfo: { email: 'organizers@example.test' },
      ageCategoryNote: 'Children are 12 and under',
      privacyNotice: ev.privacyNotice,
      privacyNoticeApproved: true,
      consentVersion: ev.consentVersion,
    };
    const missingApproval = await a
      .patch(`/api/v1/admin/events/${ctx.eventId}`)
      .set('X-CSRF-Token', csrf)
      .send({ ...body, privacyNoticeApproved: false })
      .expect(422);
    expect(missingApproval.body.error.fieldErrors.privacyNoticeApproved).toBeDefined();
    const missingContact = await a
      .patch(`/api/v1/admin/events/${ctx.eventId}`)
      .set('X-CSRF-Token', csrf)
      .send({ ...body, contactInfo: {} })
      .expect(422);
    expect(missingContact.body.error.fieldErrors['contactInfo.email']).toBeDefined();
    const ok = await a
      .patch(`/api/v1/admin/events/${ctx.eventId}`)
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(200);
    expect(ok.body.venueName).toBe('Confirmed Hall');
    await a.patch(`/api/v1/admin/events/${ctx.eventId}`).set('X-CSRF-Token', csrf).send(body).expect(409);
    const pub = await request(ctx.app).get(`/api/v1/events/${ctx.eventSlug}`).expect(200);
    expect(pub.body.venueName).toBe('Confirmed Hall');
  });

  it('event admin can add and rename branches', async () => {
    const { a, csrf } = await agent(ctx, 'admin@example.test');
    const created = await a
      .post(`/api/v1/admin/events/${ctx.eventId}/categories`)
      .set('X-CSRF-Token', csrf)
      .send({ label: 'Extra Branch' })
      .expect(201);
    const cat = created.body.categories.find((c: { label: string }) => c.label === 'Extra Branch');
    await a
      .post(`/api/v1/admin/events/${ctx.eventId}/categories`)
      .set('X-CSRF-Token', csrf)
      .send({ label: 'extra branch' })
      .expect(409);
    const renamed = await a
      .patch(`/api/v1/admin/events/${ctx.eventId}/categories/${cat.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ label: 'Renamed Branch', active: false })
      .expect(200);
    expect(renamed.body.categories.find((c: { id: string }) => c.id === cat.id)).toMatchObject({
      label: 'Renamed Branch',
      active: false,
    });
  });
});

describe('registration search and editing', () => {
  it('finds by attendee name, representative, reference, email and mobile', async () => {
    const { a } = await agent(ctx, 'committee@example.test');
    const base = `/api/v1/admin/events/${ctx.eventId}/registrations`;
    for (const q of [
      'findme',
      'searchable',
      reference,
      reference.slice(0, 7),
      'search@example.test',
      '+63 917 222 3333',
    ]) {
      const res = await a.get(base).query({ q }).expect(200);
      expect(
        res.body.items.map((i: { reference: string }) => i.reference),
        `query ${q}`,
      ).toContain(reference);
    }
    const nameHit = await a.get(base).query({ q: 'findme' }).expect(200);
    expect(nameHit.body.items[0].matchedAttendees).toEqual(['Findme Attendee']);
    const none = await a.get(base).query({ q: 'zzzz-no-match' }).expect(200);
    expect(none.body.total).toBe(0);
  });

  it('bounds pagination and validates sort allowlist', async () => {
    const { a } = await agent(ctx, 'committee@example.test');
    await a.get(`/api/v1/admin/events/${ctx.eventId}/registrations`).query({ limit: 500 }).expect(422);
    await a
      .get(`/api/v1/admin/events/${ctx.eventId}/registrations`)
      .query({ sort: 'contacts.email' })
      .expect(422);
    const ok = await a
      .get(`/api/v1/admin/events/${ctx.eventId}/registrations`)
      .query({ limit: 1, page: 1 })
      .expect(200);
    expect(ok.body.items).toHaveLength(1);
  });

  it('lists the people on each household and totals the whole filter, not just the page', async () => {
    const { a } = await agent(ctx, 'committee@example.test');
    const base = `/api/v1/admin/events/${ctx.eventId}/registrations`;
    const all = (await a.get(base).query({ limit: 100 }).expect(200)).body;
    const hit = all.items.find((i: { reference: string }) => i.reference === reference);
    expect(hit.people).toEqual([{ fullName: 'Findme Attendee', ageCategory: 'adult', rsvp: 'confirmed' }]);
    const people = all.items.flatMap((i: { people: unknown[] }) => i.people);
    expect(all.summary.households).toBe(all.total);
    expect(all.summary.people).toBe(people.length);
    expect(all.summary.confirmed + all.summary.tentative + all.summary.declined).toBe(people.length);
    expect(all.summary.adults + all.summary.children).toBe(people.length);
    const paged = (await a.get(base).query({ limit: 1 }).expect(200)).body;
    expect(paged.items).toHaveLength(1);
    expect(paged.summary).toEqual(all.summary);
  });

  it('lists every person with filters, sorting and totals', async () => {
    const { a } = await agent(ctx, 'committee@example.test');
    const base = `/api/v1/admin/events/${ctx.eventId}/attendees`;
    const all = (await a.get(base).query({ limit: 500 }).expect(200)).body;
    expect(all.total).toBe(all.items.length);
    expect(all.summary.people).toBe(all.total);
    const names = all.items.map((i: { fullName: string }) => i.fullName.toLowerCase());
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
    const me = all.items.find((i: { fullName: string }) => i.fullName === 'Findme Attendee');
    expect(me).toMatchObject({ reference, registrationId: regId, representativeName: 'Searchable Rep', ageCategory: 'adult' });

    const byName = (await a.get(base).query({ q: 'findme' }).expect(200)).body;
    expect(byName.items.map((i: { fullName: string }) => i.fullName)).toEqual(['Findme Attendee']);
    expect(byName.summary).toMatchObject({ households: 1, people: 1, adults: 1 });
    const byRef = (await a.get(base).query({ q: reference }).expect(200)).body;
    expect(byRef.items.every((i: { reference: string }) => i.reference === reference)).toBe(true);

    const children = (await a.get(base).query({ ageCategory: 'child', limit: 500 }).expect(200)).body;
    expect(children.total).toBe(all.summary.children);
    expect(children.items.every((i: { ageCategory: string }) => i.ageCategory === 'child')).toBe(true);
    const maybe = (await a.get(base).query({ rsvp: 'tentative', limit: 500 }).expect(200)).body;
    expect(maybe.total).toBe(all.summary.tentative);

    await a.get(base).query({ q: 'x' }).expect(422);
    await a.get(base).query({ sort: 'contacts.email' }).expect(422);
    await a.get(`/api/v1/admin/events/${ctx.otherEventId}/attendees`).expect(404);
  });

  it('staff can edit contacts; changes are audited with history', async () => {
    const { a, csrf } = await agent(ctx, 'committee@example.test');
    const url = `/api/v1/admin/events/${ctx.eventId}/registrations/${regId}`;
    const r = (await a.get(url).expect(200)).body.registration;
    const res = await a
      .patch(url)
      .set('X-CSRF-Token', csrf)
      .send({
        revision: r.revision,
        representative: {
          name: r.representativeName,
          contacts: { mobile: '09179998888', preferred: 'mobile' },
        },
        attendees: r.attendees.map((x: { id: string; fullName: string; ageCategory: string }) => ({
          publicId: x.id,
          fullName: x.fullName,
          ageCategory: x.ageCategory,
          rsvp: 'tentative',
        })),
      })
      .expect(200);
    expect(res.body.registration.contacts).toEqual({ mobile: '+639179998888', preferred: 'mobile' });
    const hist = await a.get(`${url}/history`).expect(200);
    expect(hist.body.items.map((h: { action: string }) => h.action)).toEqual([
      'registration.updated',
      'registration.created',
    ]);
    expect(JSON.stringify(hist.body)).not.toContain('09179998888');
    expect(
      await AuditLog.countDocuments({ action: 'registration.viewed', subjectId: regId }),
    ).toBeGreaterThan(0);
  });

  it('committee can create an assisted registration', async () => {
    const { a, csrf } = await agent(ctx, 'committee@example.test');
    const res = await a
      .post(`/api/v1/admin/events/${ctx.eventId}/registrations`)
      .set('X-CSRF-Token', csrf)
      .send({
        representative: { name: 'Phone Caller', contacts: { mobile: '09170001111', preferred: 'mobile' } },
        attendees: [{ fullName: 'Phone Caller', ageCategory: 'adult', rsvp: 'confirmed' }],
        consentExplained: true,
      })
      .expect(201);
    expect(res.body.registration.source).toBe('committee');
    expect(res.body.registration.botCheck).toBe('staff');
  });
});
