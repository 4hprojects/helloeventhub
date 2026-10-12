import type { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Event, Registration } from '../src/db/models.js';
import { computeHeadcount } from '../src/services/headcount.js';
import { agent, registrationPayload, setupTestApp, submit, teardownTestApp, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let eventOid: { _id: Types.ObjectId } | null;
beforeAll(async () => {
  ctx = await setupTestApp();
  eventOid = await Event.findOne({ publicId: ctx.eventId }).select('_id').lean();
});
afterAll(teardownTestApp);

const p = (fullName: string, ageCategory: 'adult' | 'child', rsvp: 'confirmed' | 'tentative' | 'declined', categoryId?: string) => ({
  fullName,
  ageCategory,
  rsvp,
  ...(categoryId ? { categoryId } : {}),
});

describe('headcount invariants (doc 06 acceptance examples)', () => {
  it('2 registrations with 6 attendees -> registrations=2, attendees=6; declined excluded from potential', async () => {
    const [albina, magdalena] = ctx.categoryIds;
    await submit(
      ctx,
      registrationPayload({ eventCategoryId: albina, attendees: [p('A One', 'adult', 'confirmed'), p('A Two', 'child', 'confirmed'), p('A Three', 'adult', 'declined')] }),
    ).expect(201);
    await submit(
      ctx,
      registrationPayload({ eventCategoryId: magdalena, attendees: [p('B One', 'adult', 'tentative'), p('B Two', 'child', 'tentative'), p('B Three', 'adult', 'confirmed', albina)] }),
    ).expect(201);
    const { totals, byCategory } = await computeHeadcount(eventOid!._id);
    expect(totals.activeRegistrations).toBe(2);
    expect(totals.confirmed + totals.tentative + totals.declined).toBe(6);
    expect(totals).toMatchObject({ confirmed: 3, tentative: 2, declined: 1, potential: 5, confirmedAdults: 2, confirmedChildren: 1, tentativeAdults: 1, tentativeChildren: 1 });
    // Attendee-level category overrides the household branch.
    expect(byCategory.find((c) => c.categoryId === albina)).toMatchObject({ confirmed: 3, declined: 1, potential: 3 });
    expect(byCategory.find((c) => c.categoryId === magdalena)).toMatchObject({ confirmed: 0, tentative: 2, potential: 2 });
    expect(byCategory.find((c) => c.categoryId === null)).toMatchObject({ potential: 0 });
  });

  it('uncategorized attendees fall back to "Not specified", never lost', async () => {
    await submit(ctx, registrationPayload({ attendees: [p('C One', 'adult', 'confirmed')] })).expect(201);
    const { totals, byCategory } = await computeHeadcount(eventOid!._id);
    const sum = byCategory.reduce((s, c) => s + c.confirmed + c.tentative + c.declined, 0);
    expect(sum).toBe(totals.confirmed + totals.tentative + totals.declined);
    expect(byCategory.find((c) => c.categoryId === null)?.confirmed).toBe(1);
  });

  it('cancelled registrations are excluded from live totals and the dashboard matches', async () => {
    const before = await computeHeadcount(eventOid!._id);
    const res = await submit(ctx, registrationPayload({ attendees: [p('D One', 'adult', 'confirmed'), p('D Two', 'adult', 'confirmed')] })).expect(201);
    const mid = await computeHeadcount(eventOid!._id);
    expect(mid.totals.confirmed).toBe(before.totals.confirmed + 2);

    const { a, csrf } = await agent(ctx, 'committee@example.test');
    const reg = await Registration.findOne({ reference: res.body.reference }).lean();
    await a.post(`/api/v1/admin/events/${ctx.eventId}/registrations/${reg!.publicId}/cancel`).set('X-CSRF-Token', csrf).send({ revision: reg!.revision }).expect(200);

    const after = await computeHeadcount(eventOid!._id);
    expect(after.totals).toEqual(before.totals);
    const dash = await a.get(`/api/v1/admin/events/${ctx.eventId}/dashboard`).expect(200);
    expect(dash.body).toMatchObject(after.totals);
    expect(dash.body.asOf).toBeTruthy();
    expect(dash.body.timezone).toBe('Asia/Manila');
  });
});
