import { normalizeName } from '@heh/contracts';
import { Event, EventCategory, Organization } from '../db/models.js';

export const PRIMARY_EVENT_SLUG = 'alsem-reunion-2026';

export const PROVISIONAL_BRANCHES = ['Albina', 'Magdalena', 'Mary', 'Toribio', 'Ganzon', 'Onofre', 'Mistihil', 'Denio', 'Other/Unsure'];

export const DRAFT_PRIVACY_NOTICE = `DRAFT — must be reviewed and approved by the event organizers before registration opens.

Who we are: The organizing committee of this event ("organizers") uses HelloEventHub to manage registrations.

What we collect: the representative's name and the contact method(s) you choose (email, mobile number and/or Messenger name/link); each attendee's name, adult/child category and attendance response; and the optional family branch.

Why: to plan the event (headcount, food, seating, materials), to contact you about your registration, and to check attendees in on the event day. We do not sell your data or use it for advertising.

Who can see it: authorized organizers and committee members only. Service providers that process data on our behalf: MongoDB Atlas (database hosting), Resend (email delivery), Cloudflare (spam protection). Some of these may process data outside the Philippines.

How long we keep it: [ORGANIZERS TO CONFIRM — e.g. until 90 days after the event, then deleted or anonymized].

Your rights: Under the Philippine Data Privacy Act of 2012 you may ask to access, correct or delete your data, or object to its processing. Contact: [ORGANIZER CONTACT TO CONFIRM].`;

/** Idempotent seed: creates the organization, first event and provisional branches if missing. */
export async function seedPrimaryEvent() {
  const org =
    (await Organization.findOne({ slug: 'menay-wakat-alsem' })) ??
    (await Organization.create({ slug: 'menay-wakat-alsem', name: 'Menay Bugtong–Wakat Alsem Clan' }));

  let event = await Event.findOne({ slug: PRIMARY_EVENT_SLUG });
  const createdEvent = !event;
  if (!event) {
    event = await Event.create({
      organizationId: org._id,
      slug: PRIMARY_EVENT_SLUG,
      // Working title — official wording pending organizer confirmation (doc 11).
      title: 'Menay Bugtong–Wakat Alsem Clan Reunion 2026',
      description: '',
      // Venue intentionally unset until organizers confirm it.
      startsAt: new Date('2026-10-24T09:00:00+08:00'),
      endsAt: new Date('2026-10-24T15:00:00+08:00'),
      onsiteRegistrationStartsAt: new Date('2026-10-24T08:00:00+08:00'),
      timezone: 'Asia/Manila',
      // Proposed default cutoff 23:59 Asia/Manila on Oct 20 — configurable, pending signoff.
      preregSnapshotAt: new Date('2026-10-20T23:59:00+08:00'),
      allowLateRegistration: true,
      registrationStatus: 'draft',
      status: 'published',
      ageCategoryNote: 'Organizers will confirm the age that counts as a child.',
      privacyNotice: DRAFT_PRIVACY_NOTICE,
      privacyNoticeApproved: false,
      consentVersion: '2026-10-v1',
    });
  }
  let createdCategories = 0;
  for (const [i, label] of PROVISIONAL_BRANCHES.entries()) {
    const labelNormalized = normalizeName(label);
    const exists = await EventCategory.exists({ eventId: event._id, labelNormalized });
    if (!exists) {
      await EventCategory.create({ organizationId: org._id, eventId: event._id, label, labelNormalized, sortOrder: i * 10, provisional: true });
      createdCategories++;
    }
  }
  return { org, event, createdEvent, createdCategories };
}
