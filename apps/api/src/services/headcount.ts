import type { Types } from 'mongoose';
import { UNCATEGORIZED_LABEL, type CategoryCount, type HeadcountTotals } from '@heh/contracts';
import { Attendee, EventCategory, Registration } from '../db/models.js';

export interface HeadcountFilter {
  /** Only include registrations created at or before this instant. */
  createdAtOrBefore?: Date;
}

export interface Headcount {
  totals: HeadcountTotals;
  byCategory: CategoryCount[];
}

/**
 * Authoritative headcount (doc 03 invariants):
 *  - counts ATTENDEE records only (representatives count only if listed as attendees);
 *  - only active attendees in active registrations;
 *  - potential = confirmed + tentative;
 *  - attendee category falls back to the registration's branch, then "Not specified".
 */
export async function computeHeadcount(eventId: Types.ObjectId, filter: HeadcountFilter = {}): Promise<Headcount> {
  const regMatch: Record<string, unknown> = { eventId, status: 'active' };
  if (filter.createdAtOrBefore) regMatch.createdAt = { $lte: filter.createdAtOrBefore };

  // Join in memory instead of a per-attendee $lookup: one small projection of the active registrations,
  // plus attendees pre-grouped by (registration, rsvp, age, category). Same result, far less work.
  const [regs, grouped, categories] = await Promise.all([
    Registration.find(regMatch).select('_id eventCategoryId').lean(),
    Attendee.aggregate<{ _id: { reg: Types.ObjectId; rsvp: string; age: string; cat: Types.ObjectId | null }; n: number }>([
      { $match: { eventId, status: 'active', registrationActive: true } },
      { $group: { _id: { reg: '$registrationId', rsvp: '$rsvp', age: '$ageCategory', cat: { $ifNull: ['$categoryId', null] } }, n: { $sum: 1 } } },
    ]),
    EventCategory.find({ eventId }).sort({ sortOrder: 1 }).lean(),
  ]);
  const regCategory = new Map(regs.map((r) => [String(r._id), r.eventCategoryId ?? null]));
  const activeRegistrations = regs.length;
  const rows: Array<{ _id: { rsvp: string; age: string; cat: Types.ObjectId | null }; n: number }> = [];
  for (const g of grouped) {
    const key = String(g._id.reg);
    if (!regCategory.has(key)) continue; // cancelled, other event, or created after the cutoff
    rows.push({ _id: { rsvp: g._id.rsvp, age: g._id.age, cat: g._id.cat ?? regCategory.get(key) ?? null }, n: g.n });
  }

  const totals: HeadcountTotals = {
    activeRegistrations,
    confirmed: 0,
    tentative: 0,
    declined: 0,
    confirmedAdults: 0,
    confirmedChildren: 0,
    tentativeAdults: 0,
    tentativeChildren: 0,
    potential: 0,
  };
  const byCat = new Map<string, CategoryCount>();
  for (const c of categories) {
    byCat.set(String(c._id), { categoryId: c.publicId, label: c.label, confirmed: 0, tentative: 0, declined: 0, potential: 0 });
  }
  const none: CategoryCount = { categoryId: null, label: UNCATEGORIZED_LABEL, confirmed: 0, tentative: 0, declined: 0, potential: 0 };

  for (const { _id, n } of rows) {
    const rsvp = _id.rsvp as 'confirmed' | 'tentative' | 'declined';
    totals[rsvp] += n;
    if (rsvp === 'confirmed') totals[_id.age === 'child' ? 'confirmedChildren' : 'confirmedAdults'] += n;
    if (rsvp === 'tentative') totals[_id.age === 'child' ? 'tentativeChildren' : 'tentativeAdults'] += n;
    const bucket = (_id.cat && byCat.get(String(_id.cat))) || none;
    bucket[rsvp] += n;
  }
  totals.potential = totals.confirmed + totals.tentative;
  const byCategory = [...byCat.values(), none].map((c) => ({ ...c, potential: c.confirmed + c.tentative }));
  return { totals, byCategory };
}
