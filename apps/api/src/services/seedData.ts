import { normalizeName } from '@heh/contracts';
import { Event, EventCategory, Organization } from '../db/models.js';

export const PRIMARY_EVENT_SLUG = 'alsem-reunion-2026';

export const FAMILY_BRANCHES = [
  'Albina',
  'Magdalena',
  'Mary',
  'Toribio',
  'Ganzon',
  'Onofre',
  'Mistihil',
  'Denio',
  'Other/Unsure',
];

export const DRAFT_PRIVACY_NOTICE = `PENDING ORGANIZER APPROVAL — a public contact channel must be added before registration opens.

Who is responsible: Ruby Sagorsor, event organizer, acts as the personal information controller for registration data collected for the Menay Bugtong–Wakat Alsem Clan Reunion 2026. Contact Ruby using the details published on this site's Help & contact page.

What we collect: the household representative's name and the contact method(s) they choose (email, mobile number and/or Messenger name or link); each attendee's name, adult/child category and attendance response; the optional family branch; and operational records needed to manage changes and event-day check-in. A parent, guardian or household representative should submit information for children and other household members.

Why and how we use it: with the representative's consent, authorized organizers use the information only to manage registration, plan headcount, food, seating and materials, contact the household about its registration, prepare event reports, and check attendees in on the event day. We do not use automated decision-making, sell the information or use it for advertising.

Who receives it: access is limited to authorized organizers and committee members. MongoDB Atlas provides database hosting, Resend provides email delivery, Cloudflare provides security and spam protection, and the event's hosting provider runs the application. These providers process information on the organizers' behalf and some processing may occur outside the Philippines. Attendance reports are shared only with authorized organizers and must be stored securely.

Retention and disposal: identifiable registration and attendance data will be deleted or anonymized no later than January 22, 2027, 90 days after the event, unless a longer period is required to resolve a specific request, incident or legal claim. Aggregated counts that no longer identify a person may be retained. Digital and paper copies must be disposed of securely.

Your choices and rights: you may withdraw consent before the event or ask to access, correct, object to processing of, or delete your information, subject to applicable law and information still needed to run the event. Use the registration management link when available or contact Ruby through the Help & contact page. You may also lodge a complaint with the Philippine National Privacy Commission.

Security and changes: access controls, audit records, encryption in transit, backups and limited staff access are used to protect the information. If this notice changes materially, its version will be updated and affected participants will be informed when practicable.`;

/** Idempotent seed: creates the organization, first event and editable family branches if missing. */
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
      // Approved first-event title.
      title: 'Menay Bugtong–Wakat Alsem Clan Reunion 2026',
      description:
        'Join the Menay Bugtong–Wakat Alsem Clan Reunion 2026 for a day of family, stories and connection. Please register your household so the organizers can plan food, seating and event materials.',
      // Intentionally unset: the approved public status is "Venue to be announced".
      startsAt: new Date('2026-10-24T09:00:00+08:00'),
      endsAt: new Date('2026-10-24T15:00:00+08:00'),
      onsiteRegistrationStartsAt: new Date('2026-10-24T08:00:00+08:00'),
      timezone: 'Asia/Manila',
      // Approved planning cutoff: October 20 at 23:59 Asia/Manila.
      preregSnapshotAt: new Date('2026-10-20T23:59:00+08:00'),
      registrationClosesAt: null,
      selfServiceEditUntil: new Date('2026-10-24T09:00:00+08:00'),
      allowLateRegistration: true,
      registrationStatus: 'draft',
      status: 'published',
      contactInfo: { note: 'Organizer: Ruby Sagorsor. Contact details will be added soon.' },
      ageCategoryNote: 'Child: 12 years old or younger on October 24, 2026. Adult: 13 years old or older.',
      privacyNotice: DRAFT_PRIVACY_NOTICE,
      privacyNoticeApproved: false,
      consentVersion: '2026-10-v2',
    });
  }
  let createdCategories = 0;
  for (const [i, label] of FAMILY_BRANCHES.entries()) {
    const labelNormalized = normalizeName(label);
    const exists = await EventCategory.exists({ eventId: event._id, labelNormalized });
    if (!exists) {
      await EventCategory.create({
        organizationId: org._id,
        eventId: event._id,
        label,
        labelNormalized,
        sortOrder: i * 10,
        provisional: false,
      });
      createdCategories++;
    }
  }
  return { org, event, createdEvent, createdCategories };
}
