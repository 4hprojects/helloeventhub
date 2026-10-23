import { Router, type Request } from 'express';
import type { Types } from 'mongoose';
import {
  adminAttendeeQuerySchema,
  adminRegistrationCreateSchema,
  adminRegistrationQuerySchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  normalizeEmail,
  normalizeName,
  normalizePhMobile,
  registrationCancelSchema,
  registrationUpdateSchema,
  eventUpdateSchema,
  type AdminEventDto,
  type AdminAttendeeList,
  type AdminAttendeeListItem,
  type AdminEventSummary,
  type AdminRegistrationList,
  type AdminRegistrationListItem,
  type DashboardDto,
  type SignupSummary,
} from '@heh/contracts';
import type { AppDeps } from '../app-deps.js';
import { withTransaction } from '../db/connect.js';
import {
  Attendee,
  AuditLog,
  Checkin,
  DuplicateFlag,
  EmailJob,
  Event,
  EventCategory,
  Membership,
  Registration,
  VenueDevice,
  type EventDoc,
} from '../db/models.js';
import { HttpError, notFound, revisionConflict } from '../lib/errors.js';
import { requireEventRole } from '../middleware/auth.js';
import { ah, parse } from '../middleware/core.js';
import { audit, type Actor } from '../services/audit.js';
import { computeHeadcount } from '../services/headcount.js';
import {
  adminDto,
  cancelRegistration,
  countSummary,
  createRegistration,
  flagPossibleDuplicates,
  updateRegistration,
} from '../services/registrations.js';

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function actorOf(req: Request): Actor {
  return { type: 'admin', id: req.admin!.publicId };
}

export function ev(req: Request): EventDoc {
  return req.eventAccess!.event;
}

/** Totals for a set of attendees (callers pass active attendees only). */
export function signupSummary(households: number, people: Array<{ rsvp: string; ageCategory: string }>): SignupSummary {
  const s: SignupSummary = { households, people: people.length, confirmed: 0, tentative: 0, declined: 0, adults: 0, children: 0 };
  for (const p of people) {
    if (p.rsvp === 'confirmed' || p.rsvp === 'tentative' || p.rsvp === 'declined') s[p.rsvp] += 1;
    s[p.ageCategory === 'child' ? 'children' : 'adults'] += 1;
  }
  return s;
}

export async function loadRegistration(req: Request) {
  const reg = await Registration.findOne({
    eventId: ev(req)._id,
    publicId: req.params.registrationId,
  }).lean();
  if (!reg) throw notFound('Registration');
  return reg;
}

async function adminEventDto(event: EventDoc, role: AdminEventDto['role']): Promise<AdminEventDto> {
  const categories = await EventCategory.find({ eventId: event._id }).sort({ sortOrder: 1 }).lean();
  const iso = (d?: Date | null) => (d ? d.toISOString() : null);
  return {
    id: event.publicId,
    slug: event.slug,
    revision: event.revision,
    title: event.title,
    tagline: event.tagline ?? '',
    description: event.description ?? '',
    venueName: event.venueName ?? null,
    venueAddress: event.venueAddress ?? null,
    venueMapUrl: event.venueMapUrl ?? null,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    onsiteRegistrationStartsAt: event.onsiteRegistrationStartsAt.toISOString(),
    timezone: event.timezone,
    registrationStatus: event.registrationStatus,
    registrationClosesAt: iso(event.registrationClosesAt),
    selfServiceEditUntil: iso(event.selfServiceEditUntil),
    preregSnapshotAt: iso(event.preregSnapshotAt),
    preregistrationDeadlineDate: event.preregistrationDeadlineDate ?? null,
    allowLateRegistration: event.allowLateRegistration,
    capacity: event.capacity ?? null,
    contactInfo: {
      ...(event.contactInfo?.email ? { email: event.contactInfo.email } : {}),
      ...(event.contactInfo?.phone ? { phone: event.contactInfo.phone } : {}),
      ...(event.contactInfo?.messenger ? { messenger: event.contactInfo.messenger } : {}),
      ...(event.contactInfo?.note ? { note: event.contactInfo.note } : {}),
    },
    ageCategoryNote: event.ageCategoryNote ?? '',
    privacyNotice: event.privacyNotice ?? '',
    privacyNoticeApproved: !!event.privacyNoticeApproved,
    consentVersion: event.consentVersion,
    role,
    categories: categories.map((c) => ({
      id: c.publicId,
      label: c.label,
      sortOrder: c.sortOrder,
      active: c.active,
      provisional: c.provisional,
    })),
  };
}

export function adminRoutes(deps: AppDeps): Router {
  const r = Router();
  // requireCsrf + requireAdmin are applied once where the /admin routers are mounted (app.ts).
  const committee = requireEventRole('committee');
  const eventAdmin = requireEventRole('event_admin');

  // ------------------------------------------------------------ events
  r.get(
    '/events',
    ah(async (req, res) => {
      const memberships = await Membership.find({
        userId: req.admin!.userId,
        role: { $in: ['committee', 'event_admin'] },
      }).lean();
      const orgWide = memberships.filter((m) => !m.eventId).map((m) => m.organizationId);
      const direct = memberships.filter((m) => m.eventId).map((m) => m.eventId!);
      const events = await Event.find({
        $or: [{ _id: { $in: direct } }, { organizationId: { $in: orgWide } }],
        status: { $ne: 'archived' },
      })
        .sort({ startsAt: 1 })
        .lean();
      const roleFor = (e: EventDoc) =>
        memberships
          .filter(
            (m) =>
              String(m.organizationId) === String(e.organizationId) &&
              (!m.eventId || String(m.eventId) === String(e._id)),
          )
          .some((m) => m.role === 'event_admin')
          ? 'event_admin'
          : 'committee';
      const items: AdminEventSummary[] = events.map((e) => ({
        id: e.publicId,
        slug: e.slug,
        title: e.title,
        startsAt: e.startsAt.toISOString(),
        role: roleFor(e),
      }));
      res.json({ items });
    }),
  );

  r.get(
    '/events/:eventId',
    committee,
    ah(async (req, res) => res.json(await adminEventDto(ev(req), req.eventAccess!.role))),
  );

  r.patch(
    '/events/:eventId',
    eventAdmin,
    ah(async (req, res) => {
      const body = parse(eventUpdateSchema, req.body);
      const d = (s?: string | null) => (s ? new Date(s) : null);
      const startsAt = new Date(body.startsAt);
      const endsAt = new Date(body.endsAt);
      if (endsAt <= startsAt)
        throw new HttpError(422, 'validation_failed', 'End time must be after start time.', {
          endsAt: ['Must be after start'],
        });
      if (body.registrationStatus === 'open') {
        const fieldErrors: Record<string, string[]> = {};
        const hasPublicContact = Boolean(
          body.contactInfo.email || body.contactInfo.phone || body.contactInfo.messenger,
        );
        if (!hasPublicContact)
          fieldErrors['contactInfo.email'] = [
            'Add an organizer email, phone or Messenger contact before opening registration',
          ];
        if (!body.privacyNoticeApproved)
          fieldErrors.privacyNoticeApproved = ['Approve the privacy notice before opening registration'];
        if (Object.keys(fieldErrors).length) {
          throw new HttpError(
            422,
            'validation_failed',
            'Complete the public contact and privacy requirements before opening registration.',
            fieldErrors,
          );
        }
      }
      const updated = await Event.findOneAndUpdate(
        { _id: ev(req)._id, revision: body.revision },
        {
          $set: {
            title: body.title,
            tagline: body.tagline,
            description: body.description,
            venueName: body.venueName ?? null,
            venueAddress: body.venueAddress ?? null,
            venueMapUrl: body.venueMapUrl ?? null,
            startsAt,
            endsAt,
            onsiteRegistrationStartsAt: new Date(body.onsiteRegistrationStartsAt),
            registrationStatus: body.registrationStatus,
            registrationClosesAt: d(body.registrationClosesAt),
            selfServiceEditUntil: d(body.selfServiceEditUntil),
            preregSnapshotAt: d(body.preregSnapshotAt),
            preregistrationDeadlineDate: body.preregistrationDeadlineDate ?? null,
            allowLateRegistration: body.allowLateRegistration,
            capacity: body.capacity ?? null,
            contactInfo: body.contactInfo,
            ageCategoryNote: body.ageCategoryNote,
            privacyNotice: body.privacyNotice,
            privacyNoticeApproved: body.privacyNoticeApproved,
            consentVersion: body.consentVersion,
          },
          $inc: { revision: 1 },
        },
        { new: true },
      ).lean();
      if (!updated) throw revisionConflict();
      await audit({
        organizationId: updated.organizationId,
        eventId: updated._id,
        actor: actorOf(req),
        action: 'event.updated',
        subjectType: 'event',
        subjectId: updated.publicId,
        metadata: { revision: updated.revision },
        requestId: req.requestId,
      });
      res.json(await adminEventDto(updated, req.eventAccess!.role));
    }),
  );

  // ------------------------------------------------------------ categories (branches)
  r.post(
    '/events/:eventId/categories',
    eventAdmin,
    ah(async (req, res) => {
      const body = parse(categoryCreateSchema, req.body);
      const event = ev(req);
      const count = await EventCategory.countDocuments({ eventId: event._id });
      try {
        const [cat] = await EventCategory.create([
          {
            organizationId: event.organizationId,
            eventId: event._id,
            label: body.label,
            labelNormalized: normalizeName(body.label),
            sortOrder: body.sortOrder ?? count * 10,
            provisional: false,
          },
        ]);
        await audit({
          organizationId: event.organizationId,
          eventId: event._id,
          actor: actorOf(req),
          action: 'category.created',
          subjectType: 'category',
          subjectId: cat!.publicId,
          requestId: req.requestId,
        });
      } catch (err) {
        if ((err as { code?: number }).code === 11000)
          throw new HttpError(409, 'duplicate_label', 'A branch with that name already exists.');
        throw err;
      }
      res
        .status(201)
        .json(await adminEventDto((await Event.findById(event._id).lean())!, req.eventAccess!.role));
    }),
  );

  r.patch(
    '/events/:eventId/categories/:categoryId',
    eventAdmin,
    ah(async (req, res) => {
      const body = parse(categoryUpdateSchema, req.body);
      const event = ev(req);
      const set: Record<string, unknown> = {};
      if (body.label !== undefined)
        Object.assign(set, {
          label: body.label,
          labelNormalized: normalizeName(body.label),
          provisional: false,
        });
      if (body.sortOrder !== undefined) set.sortOrder = body.sortOrder;
      if (body.active !== undefined) set.active = body.active;
      try {
        const cat = await EventCategory.findOneAndUpdate(
          { eventId: event._id, publicId: req.params.categoryId },
          { $set: set },
          { new: true },
        ).lean();
        if (!cat) throw notFound('Branch');
        await audit({
          organizationId: event.organizationId,
          eventId: event._id,
          actor: actorOf(req),
          action: 'category.updated',
          subjectType: 'category',
          subjectId: cat.publicId,
          metadata: { fields: Object.keys(set) },
          requestId: req.requestId,
        });
      } catch (err) {
        if ((err as { code?: number }).code === 11000)
          throw new HttpError(409, 'duplicate_label', 'A branch with that name already exists.');
        throw err;
      }
      res.json(await adminEventDto(event, req.eventAccess!.role));
    }),
  );

  // ------------------------------------------------------------ dashboard
  r.get(
    '/events/:eventId/dashboard',
    committee,
    ah(async (req, res) => {
      const event = ev(req);
      const [
        { totals, byCategory },
        lateRegistrations,
        openDuplicateFlags,
        failedEmails,
        checkedIn,
        recent,
        walkIns,
        lastDevice,
      ] = await Promise.all([
        computeHeadcount(event._id),
        Registration.countDocuments({ eventId: event._id, status: 'active', lateRegistration: true }),
        DuplicateFlag.countDocuments({ eventId: event._id, status: 'open' }),
        EmailJob.countDocuments({ eventId: event._id, status: 'failed' }),
        Checkin.countDocuments({ eventId: event._id }),
        Registration.find({ eventId: event._id, status: 'active' })
          .sort({ createdAt: -1 })
          .limit(8)
          .select('publicId reference representativeName createdAt')
          .lean(),
        Attendee.countDocuments({
          eventId: event._id,
          status: 'active',
          registrationActive: true,
          walkIn: true,
        }),
        VenueDevice.findOne({ eventId: event._id, status: 'active', lastSeenAt: { $ne: null } })
          .sort({ lastSeenAt: -1 })
          .select('lastSeenAt')
          .lean(),
      ]);
      const counts = await Attendee.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { registrationId: { $in: recent.map((x) => x._id) }, status: 'active' } },
        { $group: { _id: '$registrationId', n: { $sum: 1 } } },
      ]);
      const countMap = new Map(counts.map((c) => [String(c._id), c.n]));
      const body: DashboardDto = {
        ...totals,
        byCategory,
        lateRegistrations,
        openDuplicateFlags,
        failedEmails,
        checkedIn,
        walkIns,
        venueLastSyncAt: lastDevice?.lastSeenAt?.toISOString() ?? null,
        recent: recent.map((x) => ({
          id: x.publicId,
          reference: x.reference,
          representativeName: x.representativeName,
          attendeeCount: countMap.get(String(x._id)) ?? 0,
          createdAt: x.createdAt.toISOString(),
        })),
        asOf: deps.now().toISOString(),
        timezone: event.timezone,
      };
      res.set('Cache-Control', 'no-store').json(body);
    }),
  );

  // ------------------------------------------------------------ registrations
  r.get(
    '/events/:eventId/registrations',
    committee,
    ah(async (req, res) => {
      const event = ev(req);
      const q = parse(adminRegistrationQuerySchema, req.query);
      const filter: Record<string, unknown> = { eventId: event._id };
      if (q.status !== 'all') filter.status = q.status;
      if (q.late) filter.lateRegistration = q.late === 'true';
      if (q.createdFrom || q.createdTo) {
        filter.createdAt = {
          ...(q.createdFrom ? { $gte: new Date(q.createdFrom) } : {}),
          ...(q.createdTo ? { $lte: new Date(q.createdTo) } : {}),
        };
      }
      if (q.categoryId === 'none') filter.eventCategoryId = null;
      else if (q.categoryId) {
        const cat = await EventCategory.findOne({ eventId: event._id, publicId: q.categoryId }).lean();
        filter.eventCategoryId = cat?._id ?? null;
      }
      const and: Record<string, unknown>[] = [];
      const matchedByReg = new Map<string, string[]>();
      if (q.q) {
        const term = q.q.trim();
        const upper = term.toUpperCase();
        const phone = normalizePhMobile(term);
        if (/^HEH-[0-9A-Z]{1,8}$/.test(upper)) {
          and.push({ reference: { $regex: `^${escapeRegex(upper)}` } });
        } else if (term.includes('@')) {
          and.push({ 'contacts.emailNormalized': normalizeEmail(term) });
        } else if (phone) {
          and.push({ 'contacts.mobile': phone });
        } else {
          const n = normalizeName(term);
          if (n.length < 2)
            throw new HttpError(422, 'validation_failed', 'Search term too short', {
              q: ['Type at least 2 letters'],
            });
          const rx = { $regex: escapeRegex(n) };
          const hits = await Attendee.find({ eventId: event._id, status: 'active', normalizedName: rx })
            .select('registrationId fullName')
            .limit(500)
            .lean();
          for (const h of hits) {
            const k = String(h.registrationId);
            matchedByReg.set(k, [...(matchedByReg.get(k) ?? []), h.fullName]);
          }
          and.push({
            $or: [{ representativeNameNormalized: rx }, { _id: { $in: hits.map((h) => h.registrationId) } }],
          });
        }
      }
      if (q.rsvp) {
        const ids = await Attendee.distinct('registrationId', {
          eventId: event._id,
          status: 'active',
          rsvp: q.rsvp,
        });
        and.push({ _id: { $in: ids } });
      }
      if (and.length) filter.$and = and;
      const sortField = q.sort.replace('-', '');
      const sort: Record<string, 1 | -1> = {
        [sortField === 'representativeName' ? 'representativeNameNormalized' : sortField]: q.sort.startsWith(
          '-',
        )
          ? -1
          : 1,
        _id: 1,
      };
      const [allIds, regs, categories] = await Promise.all([
        Registration.distinct('_id', filter),
        Registration.find(filter)
          .sort(sort)
          .skip((q.page - 1) * q.limit)
          .limit(q.limit)
          .lean(),
        EventCategory.find({ eventId: event._id }).lean(),
      ]);
      const total = allIds.length;
      const catLabel = new Map(categories.map((c) => [String(c._id), c.label]));
      const pageIds = new Set(regs.map((x) => String(x._id)));
      // One pass over every matching household: totals for the whole filter, people for this page.
      const attendees = await Attendee.find({ registrationId: { $in: allIds }, status: 'active' })
        .select('registrationId fullName ageCategory rsvp sortOrder')
        .sort({ sortOrder: 1 })
        .lean();
      const byReg = new Map<string, typeof attendees>();
      for (const a of attendees) {
        const k = String(a.registrationId);
        if (pageIds.has(k)) byReg.set(k, [...(byReg.get(k) ?? []), a]);
      }
      const items: AdminRegistrationListItem[] = regs.map((x) => {
        const s = countSummary(byReg.get(String(x._id)) ?? []);
        return {
          id: x.publicId,
          reference: x.reference,
          status: x.status,
          representativeName: x.representativeName,
          preferredContact: x.contacts?.preferred ?? 'email',
          categoryLabel: x.eventCategoryId ? (catLabel.get(String(x.eventCategoryId)) ?? null) : null,
          attendeeCount: s.total,
          confirmed: s.confirmed,
          tentative: s.tentative,
          declined: s.declined,
          lateRegistration: x.lateRegistration,
          source: x.source,
          createdAt: x.createdAt.toISOString(),
          ...(matchedByReg.has(String(x._id))
            ? { matchedAttendees: matchedByReg.get(String(x._id))!.slice(0, 5) }
            : {}),
          people: (byReg.get(String(x._id)) ?? []).map((a) => ({
            fullName: a.fullName,
            ageCategory: a.ageCategory,
            rsvp: a.rsvp,
          })),
        };
      });
      const body: AdminRegistrationList = {
        items,
        page: q.page,
        limit: q.limit,
        total,
        summary: signupSummary(total, attendees),
      };
      res.set('Cache-Control', 'no-store').json(body);
    }),
  );

  // One row per person across all households. Event rosters are a few hundred people, so filter,
  // sort and total in memory; that keeps the branch fallback identical to exports and headcount.
  r.get(
    '/events/:eventId/attendees',
    committee,
    ah(async (req, res) => {
      const event = ev(req);
      const q = parse(adminAttendeeQuerySchema, req.query);
      const regFilter: Record<string, unknown> = { eventId: event._id };
      if (q.status !== 'all') regFilter.status = q.status;
      const [regs, categories] = await Promise.all([
        Registration.find(regFilter)
          .select('publicId reference representativeName status lateRegistration eventCategoryId createdAt')
          .lean(),
        EventCategory.find({ eventId: event._id }).sort({ sortOrder: 1 }).lean(),
      ]);
      const regById = new Map(regs.map((x) => [String(x._id), x]));
      const catLabel = new Map(categories.map((c) => [String(c._id), c.label]));
      const catOrder = new Map(categories.map((c, i) => [String(c._id), i]));
      const attFilter: Record<string, unknown> = {
        eventId: event._id,
        status: 'active',
        registrationId: { $in: regs.map((x) => x._id) },
      };
      if (q.rsvp) attFilter.rsvp = q.rsvp;
      if (q.ageCategory) attFilter.ageCategory = q.ageCategory;
      if (q.q) {
        const upper = q.q.toUpperCase();
        if (/^HEH-[0-9A-Z]{1,8}$/.test(upper)) {
          attFilter.registrationId = {
            $in: regs.filter((x) => x.reference.startsWith(upper)).map((x) => x._id),
          };
        } else {
          const n = normalizeName(q.q);
          if (n.length < 2)
            throw new HttpError(422, 'validation_failed', 'Search term too short', {
              q: ['Type at least 2 letters'],
            });
          attFilter.normalizedName = { $regex: escapeRegex(n) };
        }
      }
      const found = await Attendee.find(attFilter)
        .select('publicId registrationId fullName normalizedName ageCategory rsvp categoryId walkIn checkedInAt sortOrder')
        .lean();
      const branchOf = (a: (typeof found)[number]) => {
        const c = a.categoryId ?? regById.get(String(a.registrationId))?.eventCategoryId;
        return c ? String(c) : null;
      };
      let wantCat: string | null | undefined;
      if (q.categoryId === 'none') wantCat = null;
      else if (q.categoryId) {
        const cat = categories.find((c) => c.publicId === q.categoryId);
        wantCat = cat ? String(cat._id) : 'missing';
      }
      const rows = wantCat === undefined ? found : found.filter((a) => branchOf(a) === wantCat);

      const reg = (a: (typeof rows)[number]) => regById.get(String(a.registrationId))!;
      const byName = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
        a.normalizedName.localeCompare(b.normalizedName);
      const byHousehold = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
        reg(a).representativeName.localeCompare(reg(b).representativeName) ||
        String(a.registrationId).localeCompare(String(b.registrationId)) ||
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      const branchRank = (a: (typeof rows)[number]) => {
        const c = branchOf(a);
        return c === null ? Number.MAX_SAFE_INTEGER : (catOrder.get(c) ?? Number.MAX_SAFE_INTEGER - 1);
      };
      const compare: Record<typeof q.sort, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
        fullName: byName,
        '-fullName': (a, b) => byName(b, a),
        household: byHousehold,
        branch: (a, b) => branchRank(a) - branchRank(b) || byHousehold(a, b),
        createdAt: (a, b) => reg(a).createdAt.getTime() - reg(b).createdAt.getTime() || byHousehold(a, b),
        '-createdAt': (a, b) => reg(b).createdAt.getTime() - reg(a).createdAt.getTime() || byHousehold(a, b),
      };
      rows.sort(compare[q.sort]);

      const items: AdminAttendeeListItem[] = rows.slice((q.page - 1) * q.limit, q.page * q.limit).map((a) => {
        const x = reg(a);
        const cat = branchOf(a);
        return {
          id: a.publicId,
          fullName: a.fullName,
          ageCategory: a.ageCategory,
          rsvp: a.rsvp,
          branchLabel: cat ? (catLabel.get(cat) ?? null) : null,
          registrationId: x.publicId,
          reference: x.reference,
          representativeName: x.representativeName,
          registrationStatus: x.status,
          lateRegistration: x.lateRegistration,
          walkIn: !!a.walkIn,
          checkedInAt: a.checkedInAt ? a.checkedInAt.toISOString() : null,
          registeredAt: x.createdAt.toISOString(),
        };
      });
      const households = new Set(rows.map((a) => String(a.registrationId))).size;
      const body: AdminAttendeeList = {
        items,
        page: q.page,
        limit: q.limit,
        total: rows.length,
        summary: signupSummary(households, rows),
      };
      res.set('Cache-Control', 'no-store').json(body);
    }),
  );

  r.post(
    '/events/:eventId/registrations',
    committee,
    ah(async (req, res) => {
      const event = ev(req);
      const body = parse(adminRegistrationCreateSchema, req.body);
      const late = !!event.preregSnapshotAt && deps.now() >= event.preregSnapshotAt;
      const created = await withTransaction((session) =>
        createRegistration(
          {
            event,
            body,
            source: 'committee',
            botCheck: 'staff',
            consent: { version: event.consentVersion, method: 'staff_explained' },
            late,
            actor: actorOf(req),
            requestId: req.requestId,
            createdByUserId: req.admin!.userId,
            sessionSecret: deps.config.SESSION_SECRET,
          },
          session,
        ),
      );
      flagPossibleDuplicates(event, created.registration, created.attendees).catch(() => undefined);
      const categories = await EventCategory.find({ eventId: event._id }).lean();
      res
        .status(201)
        .json({
          registration: adminDto(created.registration, created.attendees, categories),
          confirmationEmailQueued: created.emailQueued,
        });
    }),
  );

  const detail = async (event: EventDoc, regId: Types.ObjectId) => {
    const [reg, attendees, categories] = await Promise.all([
      Registration.findById(regId).lean(),
      Attendee.find({ registrationId: regId }).lean(),
      EventCategory.find({ eventId: event._id }).lean(),
    ]);
    return adminDto(reg!, attendees, categories);
  };

  r.get(
    '/events/:eventId/registrations/:registrationId',
    committee,
    ah(async (req, res) => {
      const reg = await loadRegistration(req);
      await audit({
        organizationId: reg.organizationId,
        eventId: reg.eventId,
        actor: actorOf(req),
        action: 'registration.viewed',
        subjectType: 'registration',
        subjectId: reg.publicId,
        requestId: req.requestId,
      });
      res.set('Cache-Control', 'no-store').json({ registration: await detail(ev(req), reg._id) });
    }),
  );

  r.get(
    '/events/:eventId/registrations/:registrationId/history',
    committee,
    ah(async (req, res) => {
      const reg = await loadRegistration(req);
      const logs = await AuditLog.find({
        eventId: reg.eventId,
        subjectId: reg.publicId,
        action: { $ne: 'registration.viewed' },
      })
        .sort({ timestamp: -1 })
        .limit(100)
        .lean();
      res.json({
        items: logs.map((l) => ({
          action: l.action,
          actorType: l.actorType,
          actorId: l.actorId ?? null,
          timestamp: l.timestamp.toISOString(),
          metadata: l.metadata,
        })),
      });
    }),
  );

  r.patch(
    '/events/:eventId/registrations/:registrationId',
    committee,
    ah(async (req, res) => {
      const reg = await loadRegistration(req);
      const body = parse(registrationUpdateSchema, req.body);
      const notify = req.query.notify !== 'false';
      await withTransaction((session) =>
        updateRegistration(
          {
            event: ev(req),
            registrationId: reg._id,
            body,
            actor: actorOf(req),
            requestId: req.requestId,
            allowContactChange: true,
            notify,
          },
          session,
        ),
      );
      const updated = (await Registration.findById(reg._id).lean())!;
      flagPossibleDuplicates(
        ev(req),
        updated,
        await Attendee.find({ registrationId: reg._id, status: 'active' }).lean(),
      ).catch(() => undefined);
      res.json({ registration: await detail(ev(req), reg._id) });
    }),
  );

  r.post(
    '/events/:eventId/registrations/:registrationId/cancel',
    committee,
    ah(async (req, res) => {
      const reg = await loadRegistration(req);
      const body = parse(registrationCancelSchema, req.body);
      await withTransaction((session) =>
        cancelRegistration(
          {
            event: ev(req),
            registrationId: reg._id,
            revision: body.revision,
            reason: body.reason,
            actor: actorOf(req),
            requestId: req.requestId,
            notify: req.query.notify !== 'false',
          },
          session,
        ),
      );
      res.json({ registration: await detail(ev(req), reg._id) });
    }),
  );

  return r;
}
