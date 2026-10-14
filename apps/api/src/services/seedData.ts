import { normalizeName } from '@heh/contracts';
import { Event, EventCategory, Organization } from '../db/models.js';

export const PRIMARY_EVENT_SLUG = 'mb-wa-reunion-2026';
const LEGACY_PRIMARY_EVENT_SLUG = 'alsem-reunion-2026';

export const FAMILY_BRANCHES = [
  '1. Albina — Baon Tinay / Magastino',
  '2. Magdalena — Palag Mat-an',
  '3. Mary — Francisco Marino',
  '4. Toribio — Virginia Villanueva',
  '5. Ganzon — Pilar Licdan',
  '6. Onofre — Belen Wagsi',
  '7. Mistihil — Zenaida Calado',
  '8. Denio — Pacita Guzman',
  'Other/Unsure',
];

export const PRIVACY_NOTICE_V2 = `Who is responsible: Ruby Sagorsor, event organizer, acts as the personal information controller for registration data collected for the Menay Bugtong–Wakat Alsem Clan Reunion 2026. Contact Ruby using the details published on this site's Help & contact page.

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
  if (!event) {
    event = await Event.findOne({ slug: LEGACY_PRIMARY_EVENT_SLUG });
    if (event) {
      event.slug = PRIMARY_EVENT_SLUG;
      event.revision += 1;
      await event.save();
    }
  }
  const createdEvent = !event;
  if (!event) {
    event = await Event.create({
      organizationId: org._id,
      slug: PRIMARY_EVENT_SLUG,
      // Approved first-event title.
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
      // Approved planning cutoff: October 20 at 23:59 Asia/Manila.
      preregSnapshotAt: new Date('2026-10-20T23:59:00+08:00'),
      preregistrationDeadlineDate: '2026-10-20',
      registrationClosesAt: null,
      selfServiceEditUntil: new Date('2026-10-24T09:00:00+08:00'),
      allowLateRegistration: true,
      registrationStatus: 'open',
      status: 'published',
      contactInfo: { phone: '09618085084', note: 'Organizer: Ruby Sagorsor.' },
      ageCategoryNote: 'Child: 12 years old or younger on October 24, 2026. Adult: 13 years old or older.',
      privacyNotice: PRIVACY_NOTICE_V2,
      privacyNoticeApproved: true,
      consentVersion: '2026-10-v2',
    });
  }
  let createdCategories = 0;
  // Existing installations are upgraded only by the guarded event migration;
  // a routine seed must never create duplicate branches beside legacy records.
  if (!createdEvent) return { org, event, createdEvent, createdCategories };
  for (const [i, label] of FAMILY_BRANCHES.entries()) {
    const labelNormalized = normalizeName(label);
    const existing = await EventCategory.findOne({ eventId: event._id, labelNormalized });
    if (!existing) {
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
