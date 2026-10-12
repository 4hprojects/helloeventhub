import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Attendee, AuditLog, EmailJob, Event, HeadcountSnapshot, Registration, type EventDoc } from '../src/db/models.js';
import { computeHeadcount } from '../src/services/headcount.js';
import { applyRetention } from '../src/services/retention.js';
import { captureSnapshot } from '../src/services/snapshots.js';
import { registrationPayload, setupTestApp, submit, teardownTestApp, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let event: EventDoc;

beforeAll(async () => {
  ctx = await setupTestApp();
  await submit(ctx, registrationPayload({ representative: { name: 'Private Person', contacts: { email: 'private@example.test', mobile: '09171112222', preferred: 'email' } }, notes: 'Allergic to shrimp' })).expect(201);
  await submit(ctx, registrationPayload({ attendees: [{ fullName: 'Another Secret', ageCategory: 'child', rsvp: 'confirmed' }] })).expect(201);
  event = (await Event.findOne({ publicId: ctx.eventId }).lean())!;
  await captureSnapshot({ event, cutoffAt: new Date(), idempotencyKey: 'retention-test-1', label: 'Before retention', capturedBy: 'test', actor: { type: 'system' }, now: new Date(Date.now() + 1000) });
});
afterAll(teardownTestApp);

describe('post-event retention', () => {
  it('dry run reports counts and changes nothing', async () => {
    const r = await applyRetention(event, 'anonymize', { dryRun: true, actorId: 'test' });
    expect(r).toMatchObject({ dryRun: true, registrations: 2, attendees: 3, emailJobs: 2 });
    expect(await Registration.countDocuments({ representativeName: 'Private Person' })).toBe(1);
  });

  it('anonymize removes every name, contact and free-text field but keeps the headcount', async () => {
    const before = await computeHeadcount(event._id);
    await applyRetention(event, 'anonymize', { dryRun: false, actorId: 'test' });
    const after = await computeHeadcount(event._id);
    expect(after.totals).toEqual(before.totals);
    const dump = JSON.stringify([await Registration.find({}).lean(), await Attendee.find({}).lean(), await EmailJob.find({}).lean()]);
    for (const secret of ['Private Person', 'private@example.test', '+639171112222', 'Allergic', 'Another Secret', 'Example Adult One']) {
      expect(dump).not.toContain(secret);
    }
    expect(await EmailJob.countDocuments({})).toBe(0);
    expect(await HeadcountSnapshot.countDocuments({})).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'retention.anonymize' })).toBe(1);
  });

  it('delete removes registrations but keeps snapshots', async () => {
    await applyRetention(event, 'delete', { dryRun: false, actorId: 'test' });
    expect(await Registration.countDocuments({})).toBe(0);
    expect(await Attendee.countDocuments({})).toBe(0);
    const snap = await HeadcountSnapshot.findOne({}).lean();
    expect(snap?.totals?.potential).toBeGreaterThan(0);
  });
});
