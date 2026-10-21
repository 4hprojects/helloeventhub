import { normalizeName } from '@heh/contracts';
import { Attendee, Event, EventCategory, Registration } from '../db/models.js';
import { withTransaction } from '../db/connect.js';
import { FAMILY_BRANCHES, PRIMARY_EVENT_SLUG } from './seedData.js';

export const REUNION_EVENT_VALUES = {
  title: '1st Menay Bugtong - Wakat Alsem Clan Reunion',
  tagline: 'One Family, Many Faces, New Connections',
  description:
    "You're invited to our first clan reunion! Come meet relatives, discover family connections, and celebrate our shared heritage. Let's build new relationships and make memories together.",
  venueName: 'Veterans Building',
  venueAddress: 'Puguis, La Trinidad, Benguet',
  venueMapUrl: 'https://maps.app.goo.gl/6NLwRQT4iLkmXosD6',
  startsAt: new Date('2026-10-24T09:00:00+08:00'),
  endsAt: new Date('2026-10-24T15:00:00+08:00'),
  onsiteRegistrationStartsAt: new Date('2026-10-24T08:00:00+08:00'),
  timezone: 'Asia/Manila',
  preregistrationDeadlineDate: '2026-10-20',
  registrationClosesAt: null,
  allowLateRegistration: true,
} as const;

/**
 * Set only when the event has no value. An existing cutoff is kept: moving it would shift which
 * registrations count as late and trigger a second automatic headcount snapshot.
 */
export const REUNION_DEFAULT_IF_MISSING = {
  // End of the deadline day in Manila.
  preregSnapshotAt: new Date('2026-10-20T23:59:00+08:00'),
} as const;

export interface EventFieldChange {
  field: string;
  from: unknown;
  to: unknown;
  action: 'set' | 'kept';
}

const aliases: string[][] = [
  ['1a. Albin – Baon Tinay', '1b. Albin – Magastino', 'Albina', '2b. Albin – Magastino'],
  [
    '2. Magdalena – Palaez Mat-an',
    '2. Magdalena — Palag Mat-an',
    '2. Madalena — Palaez Mat-an',
    '2. Madalena – Palag Mat-an',
    'Magdalena',
    'Madalena',
  ],
  ['Mary'],
  ['5. Ganzon — Pilar Licdan', 'Ganzon'],
  ['6. Onofre — Belen Wagsi', 'Onofre'],
  ['4. Toribio — Virginia Villanueva', 'Toribio'],
  ['Mistihil'],
  ['Denio'],
  [],
];

export interface ReunionMigrationReport {
  dryRun: boolean;
  eventId: string;
  registrationsBefore: number;
  attendeesBefore: number;
  householdReferencesRemapped: number;
  attendeeReferencesRemapped: number;
  categoriesMerged: number;
  categoriesCreated: number;
  /** Event fields the apply step sets, plus defaults it keeps because a value already exists. */
  eventFieldChanges: EventFieldChange[];
  /** Branch relabels and reorders, as "old label" -> "new label". */
  branchLabelChanges: Array<{ from: string; to: string }>;
  registrationsAfter: number;
  attendeesAfter: number;
}

function sameValue(a: unknown, b: unknown) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

export async function migrateReunionEvent({
  dryRun = true,
}: { dryRun?: boolean } = {}): Promise<ReunionMigrationReport> {
  const event = await Event.findOne({ slug: PRIMARY_EVENT_SLUG });
  if (!event) throw new Error(`Event "${PRIMARY_EVENT_SLUG}" not found; refusing to create a duplicate.`);
  const registrationsBefore = await Registration.countDocuments({ eventId: event._id });
  const attendeesBefore = await Attendee.countDocuments({ eventId: event._id });
  const categories = await EventCategory.find({ eventId: event._id }).sort({ sortOrder: 1 });
  const byNormalized = new Map(categories.map((category) => [category.labelNormalized, category]));

  const eventFieldChanges: EventFieldChange[] = [];
  const eventSet: Record<string, unknown> = {};
  for (const [field, to] of Object.entries(REUNION_EVENT_VALUES)) {
    const from = event.get(field);
    if (sameValue(from, to)) continue;
    eventFieldChanges.push({ field, from: from ?? null, to, action: 'set' });
    eventSet[field] = to;
  }
  for (const [field, to] of Object.entries(REUNION_DEFAULT_IF_MISSING)) {
    const from = event.get(field);
    if (from == null) {
      eventFieldChanges.push({ field, from: null, to, action: 'set' });
      eventSet[field] = to;
    } else if (!sameValue(from, to)) {
      eventFieldChanges.push({ field, from, to: from, action: 'kept' });
    }
  }
  const branchLabelChanges: Array<{ from: string; to: string }> = [];

  let householdReferencesRemapped = 0;
  let attendeeReferencesRemapped = 0;
  let categoriesMerged = 0;
  let categoriesCreated = 0;

  for (const [index, desired] of FAMILY_BRANCHES.entries()) {
    const keys = [desired, ...(aliases[index] ?? [])].map(normalizeName);
    const matches: typeof categories = [];
    for (const key of keys) {
      const category = byNormalized.get(key);
      if (category && !matches.some((match) => String(match._id) === String(category._id)))
        matches.push(category);
    }
    if (!matches.length) categoriesCreated += 1;
    for (const match of matches) if (match.label !== desired) branchLabelChanges.push({ from: match.label, to: desired });
    if (matches.length > 1) {
      const extras = matches.slice(1);
      categoriesMerged += extras.length;
      for (const extra of extras) {
        householdReferencesRemapped += await Registration.countDocuments({
          eventId: event._id,
          eventCategoryId: extra!._id,
        });
        attendeeReferencesRemapped += await Attendee.countDocuments({
          eventId: event._id,
          categoryId: extra!._id,
        });
      }
    }
  }

  if (!dryRun) {
    await withTransaction(async (session) => {
      if (Object.keys(eventSet).length) {
        await Event.updateOne({ _id: event._id }, { $set: eventSet, $inc: { revision: 1 } }, { session });
      }

      for (const [index, desired] of FAMILY_BRANCHES.entries()) {
        const keys = [desired, ...(aliases[index] ?? [])].map(normalizeName);
        const current = await EventCategory.find({ eventId: event._id, labelNormalized: { $in: keys } })
          .sort({ sortOrder: 1 })
          .session(session);
        let target = current[0];
        if (!target) {
          [target] = await EventCategory.create(
            [
              {
                organizationId: event.organizationId,
                eventId: event._id,
                label: desired,
                labelNormalized: normalizeName(desired),
                sortOrder: index * 10,
                active: true,
                provisional: false,
              },
            ],
            { session },
          );
        }
        for (const extra of current.slice(1)) {
          await Registration.updateMany(
            { eventId: event._id, eventCategoryId: extra._id },
            { $set: { eventCategoryId: target!._id } },
            { session },
          );
          await Attendee.updateMany(
            { eventId: event._id, categoryId: extra._id },
            { $set: { categoryId: target!._id } },
            { session },
          );
          await EventCategory.deleteOne({ _id: extra._id }, { session });
        }
        const desiredNormalized = normalizeName(desired);
        if (
          target!.label !== desired ||
          target!.labelNormalized !== desiredNormalized ||
          target!.sortOrder !== index * 10 ||
          !target!.active ||
          target!.provisional
        ) {
          await EventCategory.updateOne(
            { _id: target!._id },
            {
              $set: {
                label: desired,
                labelNormalized: desiredNormalized,
                sortOrder: index * 10,
                active: true,
                provisional: false,
              },
            },
            { session },
          );
        }
      }
    });
  }

  const registrationsAfter = await Registration.countDocuments({ eventId: event._id });
  const attendeesAfter = await Attendee.countDocuments({ eventId: event._id });
  if (registrationsAfter !== registrationsBefore || attendeesAfter !== attendeesBefore) {
    throw new Error('Registration or attendee counts changed during migration.');
  }
  return {
    dryRun,
    eventId: event.publicId,
    registrationsBefore,
    attendeesBefore,
    householdReferencesRemapped,
    attendeeReferencesRemapped,
    categoriesMerged,
    categoriesCreated,
    eventFieldChanges,
    branchLabelChanges,
    registrationsAfter,
    attendeesAfter,
  };
}
