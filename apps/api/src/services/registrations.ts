import type { ClientSession, Types } from 'mongoose';
import {
  cleanDisplayName,
  normalizeEmail,
  normalizeName,
  normalizePhMobile,
  type AdminRegistrationDto,
  type AttendeeDto,
  type ContactsDto,
  type CountSummary,
  type NameParts,
  type OwnerRegistrationDto,
  type RegistrationSource,
  type registrationUpdateSchema,
} from '@heh/contracts';
import type { z } from 'zod';
import {
  Attendee,
  DuplicateFlag,
  EventCategory,
  Registration,
  type AttendeeDoc,
  type CategoryDoc,
  type EventDoc,
  type RegistrationDoc,
} from '../db/models.js';
import { newReference } from '../lib/crypto.js';
import { HttpError, revisionConflict, unprocessable } from '../lib/errors.js';
import { audit, type Actor } from './audit.js';
import { enqueueEmail } from './emailOutbox.js';

type ContactsOut = {
  email?: string;
  mobile?: string;
  messengerDisplayName?: string;
  messengerProfileUrl?: string;
  preferred: 'email' | 'mobile' | 'messenger';
};

/** Shape shared by public create, staff create and updates (after Zod parsing). */
export interface RegistrationBody {
  representative: { name: string; nameParts?: NameParts; contacts: ContactsOut };
  eventCategoryId?: string | null;
  attendees: Array<{ publicId?: string; fullName: string; nameParts?: NameParts; ageCategory: 'adult' | 'child'; rsvp: 'confirmed' | 'tentative' | 'declined'; categoryId?: string | null }>;
  noAttendeesReason?: string;
  notes?: string;
}

function cleanParts(p: NameParts | undefined) {
  if (!p) return undefined;
  const middleName = p.middleName ? cleanDisplayName(p.middleName) : undefined;
  return { lastName: cleanDisplayName(p.lastName), firstName: cleanDisplayName(p.firstName), ...(middleName ? { middleName } : {}) };
}

// ---------------------------------------------------------------- registration window

export interface RegistrationWindow {
  open: boolean;
  late: boolean;
  message: string | null;
}

export function registrationWindow(event: EventDoc, now = new Date()): RegistrationWindow {
  const closed = (message: string): RegistrationWindow => ({ open: false, late: false, message });
  if (event.status !== 'published' || event.registrationStatus === 'draft') return closed('Online registration is not open yet.');
  if (event.registrationStatus === 'closed') return closed('Online registration is closed. Please contact the organizers.');
  if (event.registrationOpensAt && now < event.registrationOpensAt) return closed('Online registration is not open yet.');
  if (event.registrationClosesAt && now >= event.registrationClosesAt) return closed('Online registration is closed. Please contact the organizers.');
  if (now >= event.endsAt) return closed('This event has ended.');
  const late = !!event.preregSnapshotAt && now >= event.preregSnapshotAt;
  if (late && !event.allowLateRegistration) return closed('Pre-registration is closed. Please register on-site or contact the organizers.');
  return { open: true, late, message: late ? 'Pre-registration headcount has been taken; new registrations are recorded as late.' : null };
}

export function ownerEditDeadline(event: EventDoc): Date {
  return event.selfServiceEditUntil ?? event.startsAt;
}

// ---------------------------------------------------------------- helpers

export function normalizeContacts(c: ContactsOut) {
  return {
    email: c.email,
    emailNormalized: c.email ? normalizeEmail(c.email) : undefined,
    mobile: c.mobile ? (normalizePhMobile(c.mobile) ?? undefined) : undefined,
    messengerDisplayName: c.messengerDisplayName,
    messengerProfileUrl: c.messengerProfileUrl,
    preferred: c.preferred,
  };
}

async function resolveCategoryIds(event: EventDoc, body: RegistrationBody, session?: ClientSession) {
  const wanted = new Set<string>();
  if (body.eventCategoryId) wanted.add(body.eventCategoryId);
  for (const a of body.attendees) if (a.categoryId) wanted.add(a.categoryId);
  if (wanted.size === 0) return new Map<string, Types.ObjectId>();
  const cats = await EventCategory.find({ eventId: event._id, publicId: { $in: [...wanted] }, active: true }, null, { session }).lean();
  const map = new Map(cats.map((c) => [c.publicId, c._id]));
  for (const id of wanted) if (!map.has(id)) throw unprocessable('validation_failed', 'Please choose a family branch from the list.', { eventCategoryId: ['Unknown or inactive branch'] });
  return map;
}

export function countSummary(attendees: Array<{ rsvp: string; status?: string }>): CountSummary {
  const s = { confirmed: 0, tentative: 0, declined: 0, total: 0 };
  for (const a of attendees) {
    if (a.status && a.status !== 'active') continue;
    if (a.rsvp === 'confirmed' || a.rsvp === 'tentative' || a.rsvp === 'declined') s[a.rsvp] += 1;
    s.total += 1;
  }
  return s;
}

async function assertCapacity(event: EventDoc, additionalPotential: number, session?: ClientSession) {
  if (!event.capacity || additionalPotential <= 0) return;
  const current = await Attendee.countDocuments(
    { eventId: event._id, status: 'active', registrationActive: true, rsvp: { $in: ['confirmed', 'tentative'] } },
    { session },
  );
  if (current + additionalPotential > event.capacity) {
    throw new HttpError(422, 'capacity_reached', 'This event has reached its capacity. Please contact the organizers.');
  }
}

// ---------------------------------------------------------------- create

export interface CreateOptions {
  event: EventDoc;
  body: RegistrationBody;
  source: RegistrationSource;
  botCheck: 'passed' | 'unverified' | 'staff' | 'disabled';
  consent: { version: string; method: 'checkbox' | 'staff_explained' };
  late: boolean;
  actor: Actor;
  requestId?: string;
  createdByUserId?: Types.ObjectId;
  sessionSecret: string;
}

export async function createRegistration(opts: CreateOptions, session: ClientSession) {
  const { event, body } = opts;
  const cats = await resolveCategoryIds(event, body, session);
  await assertCapacity(event, body.attendees.filter((a) => a.rsvp !== 'declined').length, session);
  const contacts = normalizeContacts(body.representative.contacts);
  const now = new Date();

  let reg: RegistrationDoc | undefined;
  for (let attempt = 0; attempt < 5 && !reg; attempt++) {
    try {
      const [doc] = await Registration.create(
        [
          {
            reference: newReference(),
            organizationId: event.organizationId,
            eventId: event._id,
            representativeName: cleanDisplayName(body.representative.name),
            representativeNameNormalized: normalizeName(body.representative.name),
            representativeNameParts: cleanParts(body.representative.nameParts),
            contacts,
            eventCategoryId: body.eventCategoryId ? cats.get(body.eventCategoryId) : undefined,
            noAttendeesReason: body.attendees.length === 0 ? body.noAttendeesReason : undefined,
            notes: body.notes,
            source: opts.source,
            lateRegistration: opts.late,
            botCheck: opts.botCheck,
            consent: { version: opts.consent.version, acceptedAt: now, purpose: 'event_registration', method: opts.consent.method },
            createdByUserId: opts.createdByUserId,
          },
        ],
        { session },
      );
      reg = doc!.toObject() as RegistrationDoc;
    } catch (err) {
      const e = err as { code?: number; keyPattern?: Record<string, unknown> };
      if (e.code === 11000 && e.keyPattern?.reference) continue; // reference collision: retry
      throw err;
    }
  }
  if (!reg) throw new Error('Could not allocate a unique reference');

  const attendeeDocs = await Attendee.insertMany(
    body.attendees.map((a, i) => ({
      organizationId: event.organizationId,
      eventId: event._id,
      registrationId: reg!._id,
      fullName: cleanDisplayName(a.fullName),
      normalizedName: normalizeName(a.fullName),
      nameParts: cleanParts(a.nameParts),
      ageCategory: a.ageCategory,
      rsvp: a.rsvp,
      categoryId: a.categoryId ? cats.get(a.categoryId) : undefined,
      registrationActive: true,
      walkIn: opts.source === 'venue',
      sortOrder: i,
    })),
    { session },
  );
  const attendees = attendeeDocs.map((d) => d.toObject() as AttendeeDoc);

  let emailQueued = false;
  if (contacts.email) {
    emailQueued = await enqueueEmail(
      { eventId: event._id, registrationId: reg._id, type: 'registration_confirmation', recipient: contacts.email, dedupe: '0' },
      session,
    );
  }
  await audit(
    {
      organizationId: event.organizationId,
      eventId: event._id,
      actor: opts.actor,
      action: 'registration.created',
      subjectType: 'registration',
      subjectId: reg.publicId,
      metadata: { source: opts.source, attendeeCount: attendees.length, late: opts.late, botCheck: opts.botCheck },
      requestId: opts.requestId,
    },
    session,
  );
  return { registration: reg, attendees, emailQueued };
}

// ---------------------------------------------------------------- update / cancel

export type UpdateBody = z.output<typeof registrationUpdateSchema>;

export interface UpdateOptions {
  event: EventDoc;
  registrationId: Types.ObjectId;
  body: UpdateBody;
  actor: Actor;
  requestId?: string;
  /** Owners can't change contacts used for verification without staff; staff can. */
  allowContactChange: boolean;
  notify: boolean;
}

export async function updateRegistration(opts: UpdateOptions, session: ClientSession) {
  const { event, body } = opts;
  const current = await Registration.findOne({ _id: opts.registrationId, eventId: event._id }, null, { session }).lean();
  if (!current) throw new HttpError(404, 'not_found', 'Registration not found');
  if (current.status !== 'active') throw new HttpError(409, 'registration_cancelled', 'This registration has been cancelled.');
  if (current.revision !== body.revision) throw revisionConflict();

  const cats = await resolveCategoryIds(event, body, session);
  const existing = await Attendee.find({ registrationId: current._id, status: 'active' }, null, { session }).lean();
  const byPublicId = new Map(existing.map((a) => [a.publicId, a]));
  for (const a of body.attendees) {
    if (a.publicId && !byPublicId.has(a.publicId)) throw unprocessable('validation_failed', 'An attendee in this form no longer exists. Reload and try again.');
  }
  const prevPotential = existing.filter((a) => a.rsvp !== 'declined').length;
  const nextPotential = body.attendees.filter((a) => a.rsvp !== 'declined').length;
  await assertCapacity(event, nextPotential - prevPotential, session);

  const contacts = normalizeContacts(body.representative.contacts);
  const contactsChanged =
    (current.contacts?.emailNormalized ?? null) !== (contacts.emailNormalized ?? null) ||
    (current.contacts?.mobile ?? null) !== (contacts.mobile ?? null) ||
    (current.contacts?.messengerDisplayName ?? null) !== (contacts.messengerDisplayName ?? null) ||
    (current.contacts?.messengerProfileUrl ?? null) !== (contacts.messengerProfileUrl ?? null) ||
    current.contacts?.preferred !== contacts.preferred;
  if (contactsChanged && !opts.allowContactChange) {
    throw new HttpError(403, 'contact_change_requires_staff', 'To change your contact details, please contact the organizers.');
  }

  const updated = await Registration.findOneAndUpdate(
    { _id: current._id, revision: body.revision, status: 'active' },
    {
      $set: {
        representativeName: cleanDisplayName(body.representative.name),
        representativeNameNormalized: normalizeName(body.representative.name),
        representativeNameParts: cleanParts(body.representative.nameParts) ?? null,
        contacts,
        eventCategoryId: body.eventCategoryId ? cats.get(body.eventCategoryId) : null,
        noAttendeesReason: body.attendees.length === 0 ? body.noAttendeesReason : null,
        notes: body.notes ?? null,
        ...(contactsChanged && current.contacts?.emailNormalized !== contacts.emailNormalized ? { emailVerifiedAt: null } : {}),
      },
      $inc: { revision: 1 },
    },
    { session, new: true },
  ).lean();
  if (!updated) throw revisionConflict();

  const keep = new Set<string>();
  const changes: Record<string, number> = { added: 0, updated: 0, removed: 0 };
  for (const [i, a] of body.attendees.entries()) {
    const fields = {
      fullName: cleanDisplayName(a.fullName),
      normalizedName: normalizeName(a.fullName),
      nameParts: cleanParts(a.nameParts) ?? null,
      ageCategory: a.ageCategory,
      rsvp: a.rsvp,
      categoryId: a.categoryId ? cats.get(a.categoryId) : null,
      sortOrder: i,
    };
    if (a.publicId) {
      keep.add(a.publicId);
      const prev = byPublicId.get(a.publicId)!;
      const differs =
        prev.fullName !== fields.fullName || !sameParts(prev.nameParts, fields.nameParts) || prev.ageCategory !== fields.ageCategory || prev.rsvp !== fields.rsvp ||
        String(prev.categoryId ?? '') !== String(fields.categoryId ?? '') || prev.sortOrder !== i;
      if (differs) {
        await Attendee.updateOne({ _id: prev._id }, { $set: fields, $inc: { revision: 1 } }, { session });
        changes.updated! += 1;
      }
    } else {
      await Attendee.create(
        [{ ...fields, organizationId: event.organizationId, eventId: event._id, registrationId: current._id, registrationActive: true }],
        { session },
      );
      changes.added! += 1;
    }
  }
  for (const a of existing) {
    if (!keep.has(a.publicId)) {
      await Attendee.updateOne({ _id: a._id }, { $set: { status: 'removed' }, $inc: { revision: 1 } }, { session });
      changes.removed! += 1;
    }
  }

  // Bump every attendee's updatedAt so venue roster pulls see household-level changes (e.g. branch).
  await Attendee.updateMany({ registrationId: current._id }, { $currentDate: { updatedAt: true } }, { session, timestamps: false });

  if (opts.notify && updated.contacts?.email) {
    await enqueueEmail(
      { eventId: event._id, registrationId: updated._id, type: 'registration_updated', recipient: updated.contacts.email, dedupe: String(updated.revision) },
      session,
    );
  }
  await audit(
    {
      organizationId: event.organizationId,
      eventId: event._id,
      actor: opts.actor,
      action: 'registration.updated',
      subjectType: 'registration',
      subjectId: updated.publicId,
      metadata: { fromRevision: body.revision, toRevision: updated.revision, contactsChanged, ...changes },
      requestId: opts.requestId,
    },
    session,
  );
  return updated as RegistrationDoc;
}

export async function cancelRegistration(
  opts: { event: EventDoc; registrationId: Types.ObjectId; revision: number; reason?: string; actor: Actor; requestId?: string; notify: boolean },
  session: ClientSession,
) {
  const updated = await Registration.findOneAndUpdate(
    { _id: opts.registrationId, eventId: opts.event._id, revision: opts.revision, status: 'active' },
    { $set: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: opts.reason }, $inc: { revision: 1 }, $unset: { manageTokenHash: 1, manageTokenExpiry: 1 } },
    { session, new: true },
  ).lean();
  if (!updated) {
    const exists = await Registration.exists({ _id: opts.registrationId, eventId: opts.event._id }).session(session);
    if (!exists) throw new HttpError(404, 'not_found', 'Registration not found');
    throw revisionConflict();
  }
  await Attendee.updateMany({ registrationId: updated._id }, { $set: { registrationActive: false }, $inc: { revision: 1 } }, { session });
  if (opts.notify && updated.contacts?.email) {
    await enqueueEmail(
      { eventId: opts.event._id, registrationId: updated._id, type: 'registration_cancelled', recipient: updated.contacts.email, dedupe: String(updated.revision) },
      session,
    );
  }
  await audit(
    {
      organizationId: opts.event.organizationId,
      eventId: opts.event._id,
      actor: opts.actor,
      action: 'registration.cancelled',
      subjectType: 'registration',
      subjectId: updated.publicId,
      metadata: { revision: updated.revision, hasReason: !!opts.reason },
      requestId: opts.requestId,
    },
    session,
  );
  return updated as RegistrationDoc;
}

// ---------------------------------------------------------------- duplicate flags (never merges)

async function upsertFlag(
  event: EventDoc,
  matchKey: string,
  reason: string,
  attendeeIds: Types.ObjectId[],
  registrationIds: Types.ObjectId[],
) {
  const existing = await DuplicateFlag.findOne({ eventId: event._id, matchKey }).lean();
  if (!existing) {
    try {
      await DuplicateFlag.create({ organizationId: event.organizationId, eventId: event._id, matchKey, reason, attendeeIds, registrationIds });
      return;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  const prev = existing ?? (await DuplicateFlag.findOne({ eventId: event._id, matchKey }).lean());
  if (!prev) return;
  const known = new Set([...prev.attendeeIds, ...prev.registrationIds].map(String));
  const hasNew = [...attendeeIds, ...registrationIds].some((id) => !known.has(String(id)));
  if (!hasNew) return;
  await DuplicateFlag.updateOne(
    { _id: prev._id },
    { $addToSet: { attendeeIds: { $each: attendeeIds }, registrationIds: { $each: registrationIds } }, $set: { status: 'open' } },
  );
}

/** Flag possible duplicates by normalized attendee name and by shared contact. Best-effort, after commit. */
export async function flagPossibleDuplicates(event: EventDoc, reg: RegistrationDoc, attendees: AttendeeDoc[]) {
  for (const a of attendees) {
    if (a.status !== 'active') continue;
    const matches = await Attendee.find({
      eventId: event._id,
      normalizedName: a.normalizedName,
      status: 'active',
      registrationActive: true,
      registrationId: { $ne: reg._id },
    })
      .select('_id registrationId')
      .limit(50)
      .lean();
    if (matches.length === 0) continue;
    await upsertFlag(
      event,
      `name:${a.normalizedName}`,
      'same_attendee_name',
      [a._id, ...matches.map((m) => m._id)],
      [reg._id, ...matches.map((m) => m.registrationId)],
    );
  }
  const contactKeys: Array<[string, string, Record<string, unknown>]> = [];
  if (reg.contacts?.emailNormalized) contactKeys.push([`email:${reg.contacts.emailNormalized}`, 'same_contact_email', { 'contacts.emailNormalized': reg.contacts.emailNormalized }]);
  if (reg.contacts?.mobile) contactKeys.push([`mobile:${reg.contacts.mobile}`, 'same_contact_mobile', { 'contacts.mobile': reg.contacts.mobile }]);
  for (const [key, reason, filter] of contactKeys) {
    const others = await Registration.find({ eventId: event._id, status: 'active', _id: { $ne: reg._id }, ...filter })
      .select('_id')
      .limit(50)
      .lean();
    if (others.length) await upsertFlag(event, key, reason, [], [reg._id, ...others.map((o) => o._id)]);
  }
}

// ---------------------------------------------------------------- DTO mapping

type StoredParts = { lastName: string; firstName: string; middleName?: string | null } | null | undefined;

function partsDto(p: StoredParts): NameParts | null {
  return p ? { lastName: p.lastName, firstName: p.firstName, middleName: p.middleName ?? null } : null;
}

function sameParts(a: StoredParts, b: StoredParts) {
  return JSON.stringify(partsDto(a)) === JSON.stringify(partsDto(b));
}

export function categoryPublicIdMap(categories: CategoryDoc[]) {
  return new Map(categories.map((c) => [String(c._id), c.publicId]));
}

export function attendeeDto(a: AttendeeDoc, catMap: Map<string, string>): AttendeeDto {
  return {
    id: a.publicId,
    fullName: a.fullName,
    nameParts: partsDto(a.nameParts),
    ageCategory: a.ageCategory,
    rsvp: a.rsvp,
    categoryId: a.categoryId ? (catMap.get(String(a.categoryId)) ?? null) : null,
    checkedInAt: a.checkedInAt ? a.checkedInAt.toISOString() : null,
  };
}

function contactsDto(c: RegistrationDoc['contacts']): ContactsDto {
  return {
    ...(c?.email ? { email: c.email } : {}),
    ...(c?.mobile ? { mobile: c.mobile } : {}),
    ...(c?.messengerDisplayName ? { messengerDisplayName: c.messengerDisplayName } : {}),
    ...(c?.messengerProfileUrl ? { messengerProfileUrl: c.messengerProfileUrl } : {}),
    preferred: c?.preferred ?? 'email',
  };
}

function baseDto(reg: RegistrationDoc, attendees: AttendeeDoc[], catMap: Map<string, string>) {
  return {
    id: reg.publicId,
    reference: reg.reference,
    status: reg.status,
    revision: reg.revision,
    representativeName: reg.representativeName,
    representativeNameParts: partsDto(reg.representativeNameParts),
    contacts: contactsDto(reg.contacts),
    eventCategoryId: reg.eventCategoryId ? (catMap.get(String(reg.eventCategoryId)) ?? null) : null,
    noAttendeesReason: reg.noAttendeesReason ?? null,
    notes: reg.notes ?? null,
    attendees: attendees.filter((a) => a.status === 'active').sort((x, y) => x.sortOrder - y.sortOrder).map((a) => attendeeDto(a, catMap)),
    createdAt: reg.createdAt.toISOString(),
    updatedAt: reg.updatedAt.toISOString(),
  };
}

export function ownerDto(event: EventDoc, reg: RegistrationDoc, attendees: AttendeeDoc[], categories: CategoryDoc[], now = new Date()): OwnerRegistrationDto {
  const catMap = categoryPublicIdMap(categories);
  const deadline = ownerEditDeadline(event);
  return {
    ...baseDto(reg, attendees, catMap),
    canEdit: reg.status === 'active' && now < deadline,
    editDeadline: deadline.toISOString(),
    event: {
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      timezone: event.timezone,
      categories: categories.filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ id: c.publicId, label: c.label })),
    },
  };
}

export function adminDto(reg: RegistrationDoc, attendees: AttendeeDoc[], categories: CategoryDoc[]): AdminRegistrationDto {
  return {
    ...baseDto(reg, attendees, categoryPublicIdMap(categories)),
    source: reg.source,
    lateRegistration: reg.lateRegistration,
    botCheck: reg.botCheck,
    emailVerifiedAt: reg.emailVerifiedAt?.toISOString() ?? null,
    cancelledAt: reg.cancelledAt?.toISOString() ?? null,
    cancellationReason: reg.cancellationReason ?? null,
  };
}
