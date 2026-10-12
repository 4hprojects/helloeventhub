import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { inject } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppDeps } from '../src/app-deps.js';
import { loadConfig } from '../src/config.js';
import { ensureIndexes } from '../src/db/connect.js';
import { AdminUser, Event, EventCategory, Membership, Organization } from '../src/db/models.js';
import { createLogger } from '../src/lib/logger.js';
import { hashPassword } from '../src/routes/auth.js';
import type { OutgoingEmail } from '../src/services/emailTransport.js';
import { seedPrimaryEvent } from '../src/services/seedData.js';
import type { BotCheckResult } from '../src/services/turnstile.js';

export const PASSWORD = 'correct-horse-battery-staple';

export interface TestCtx {
  app: ReturnType<typeof createApp>;
  deps: AppDeps;
  sent: OutgoingEmail[];
  setTurnstile: (r: BotCheckResult) => void;
  setNow: (d: Date) => void;
  eventId: string;
  eventSlug: string;
  categoryIds: string[];
  otherEventId: string;
}

let fileDb = 0;

export async function setupTestApp(): Promise<TestCtx> {
  const uri = inject('mongoUri');
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri, { dbName: `heh_test_${process.pid}_${Date.now()}_${fileDb++}` });
  }
  await mongoose.connection.db!.dropDatabase();
  await ensureIndexes();

  const { event } = await seedPrimaryEvent();
  // Make the seeded event open and in the future relative to "now" in tests.
  await Event.updateOne({ _id: event._id }, { $set: { registrationStatus: 'open' } });
  const cats = await EventCategory.find({ eventId: event._id }).sort({ sortOrder: 1 }).lean();

  // A second organization/event to verify cross-event isolation.
  const org2 = await Organization.create({ slug: 'other-org', name: 'Other Org' });
  const other = await Event.create({
    organizationId: org2._id,
    slug: 'other-event',
    title: 'Other Event',
    startsAt: new Date('2026-12-01T09:00:00+08:00'),
    endsAt: new Date('2026-12-01T15:00:00+08:00'),
    onsiteRegistrationStartsAt: new Date('2026-12-01T08:00:00+08:00'),
    registrationStatus: 'open',
    status: 'published',
  });

  const passwordHash = await hashPassword(PASSWORD);
  const admin = await AdminUser.create({ email: 'admin@example.test', name: 'Event Admin', passwordHash });
  const committee = await AdminUser.create({ email: 'committee@example.test', name: 'Committee', passwordHash });
  const outsider = await AdminUser.create({ email: 'outsider@example.test', name: 'Outsider', passwordHash });
  await Membership.create([
    { userId: admin._id, organizationId: event.organizationId, eventId: event._id, role: 'event_admin' },
    { userId: committee._id, organizationId: event.organizationId, eventId: event._id, role: 'committee' },
    { userId: outsider._id, organizationId: org2._id, eventId: other._id, role: 'event_admin' },
  ]);

  const sent: OutgoingEmail[] = [];
  let turnstile: BotCheckResult = 'passed';
  let now = new Date('2026-10-12T10:00:00+08:00');
  const config = loadConfig({ ...process.env, MONGODB_URI: uri });
  const deps: AppDeps = {
    config,
    logger: createLogger('silent'),
    turnstile: { verify: async () => turnstile },
    emailTransport: {
      send: async (msg) => {
        sent.push(msg);
        return { id: `test-${sent.length}` };
      },
    },
    now: () => now,
  };
  return {
    app: createApp(deps),
    deps,
    sent,
    setTurnstile: (r) => (turnstile = r),
    setNow: (d) => (now = d),
    eventId: event.publicId,
    eventSlug: event.slug,
    categoryIds: cats.map((c) => c.publicId),
    otherEventId: other.publicId,
  };
}

export async function teardownTestApp() {
  await mongoose.connection.db?.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
}

export function registrationPayload(overrides: Record<string, unknown> = {}) {
  return {
    representative: { name: 'Example Representative', contacts: { email: 'rep@example.test', preferred: 'email' } },
    attendees: [
      { fullName: 'Example Adult One', ageCategory: 'adult', rsvp: 'confirmed' },
      { fullName: 'Example Child Two', ageCategory: 'child', rsvp: 'tentative' },
    ],
    acceptedPrivacy: true,
    consentVersion: '2026-10-v1',
    turnstileToken: 'tok',
    ...overrides,
  };
}

export function submit(ctx: TestCtx, body: unknown, key = randomUUID()) {
  return request(ctx.app).post(`/api/v1/events/${ctx.eventId}/registrations`).set('Idempotency-Key', key).send(body as object);
}

/** Agent with a CSRF token; optionally signed in. */
export async function agent(ctx: TestCtx, email?: string, password = PASSWORD) {
  const a = request.agent(ctx.app);
  const s = await a.get('/api/v1/auth/session').expect(200);
  let csrf: string = s.body.csrfToken;
  if (email) {
    const r = await a.post('/api/v1/auth/login').set('X-CSRF-Token', csrf).send({ email, password });
    if (r.status !== 200) throw new Error(`login failed: ${r.status} ${JSON.stringify(r.body)}`);
    csrf = r.body.csrfToken;
  }
  return { a, csrf };
}

export const uid = () => randomUUID();
