import { Router, type RequestHandler } from 'express';
import type { Types } from 'mongoose';
import {
  cleanDisplayName,
  normalizeName,
  rosterChecksumInput,
  syncPushSchema,
  UNCATEGORIZED_LABEL,
  type RosterSummary,
  type SyncOp,
  type SyncOpResult,
  type SyncPullResponse,
  type SyncPushResponse,
  type VenueRosterItem,
} from '@heh/contracts';
import type { AppDeps } from '../app-deps.js';
import { withTransaction } from '../db/connect.js';
import {
  Attendee,
  Checkin,
  Event,
  EventCategory,
  Registration,
  SyncOperation,
  VenueDevice,
  type EventDoc,
} from '../db/models.js';
import { newReference, sha256 } from '../lib/crypto.js';
import { HttpError, notFound } from '../lib/errors.js';
import { ah, parse } from '../middleware/core.js';
import { limiter } from '../middleware/rateLimit.js';
import { audit } from '../services/audit.js';
import { flagPossibleDuplicates } from '../services/registrations.js';

const PAGE = 500;

type DeviceCtx = { id: Types.ObjectId; publicId: string; label: string; event: EventDoc };
declare module 'express-serve-static-core' {
  interface Request {
    device?: DeviceCtx;
  }
}

/** Bearer device token, scoped to one event; revocable by event admins. */
const requireDevice: RequestHandler = ah(async (req, _res, next) => {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('authorization') ?? '');
  if (!m) throw new HttpError(401, 'device_unauthenticated', 'Missing device token');
  const device = await VenueDevice.findOneAndUpdate({ tokenHash: sha256(m[1]!), status: 'active' }, { $set: { lastSeenAt: new Date() } }, { new: true }).lean();
  if (!device) throw new HttpError(401, 'device_unauthenticated', 'Invalid or revoked device token');
  const event = await Event.findOne({ _id: device.eventId, publicId: req.params.eventId }).lean();
  if (!event) throw notFound('Event');
  req.device = { id: device._id, publicId: device.publicId, label: device.label, event };
  next();
});

function encodeCursor(t: Date, id: Types.ObjectId) {
  return Buffer.from(`${t.getTime()}:${String(id)}`).toString('base64url');
}
function decodeCursor(c: string | undefined): { t: Date; id: string } | null {
  if (!c) return null;
  const [t, id] = Buffer.from(c, 'base64url').toString().split(':');
  if (!t || !id || !/^\d+$/.test(t) || !/^[0-9a-f]{24}$/.test(id)) throw new HttpError(400, 'bad_cursor', 'Invalid cursor');
  return { t: new Date(Number(t)), id };
}

async function rosterItems(event: EventDoc, attendees: Awaited<ReturnType<typeof loadAttendees>>): Promise<VenueRosterItem[]> {
  const regs = await Registration.find({ _id: { $in: attendees.map((a) => a.registrationId) } }).select('publicId reference status eventCategoryId representativeName').lean();
  const regMap = new Map(regs.map((r) => [String(r._id), r]));
  const cats = await EventCategory.find({ eventId: event._id }).select('label').lean();
  const catMap = new Map(cats.map((c) => [String(c._id), c.label]));
  return attendees.map((a) => {
    const r = regMap.get(String(a.registrationId));
    const cat = a.categoryId ?? r?.eventCategoryId;
    return {
      attendeeId: a.publicId,
      registrationId: r?.publicId ?? '',
      reference: r?.reference ?? '',
      fullName: a.fullName,
      ageCategory: a.ageCategory,
      branch: cat ? (catMap.get(String(cat)) ?? UNCATEGORIZED_LABEL) : UNCATEGORIZED_LABEL,
      rsvp: a.rsvp,
      representativeName: r?.representativeName ?? '',
      active: a.status === 'active' && a.registrationActive && r?.status === 'active',
      walkIn: !!a.walkIn,
      revision: a.revision,
      checkedInAt: a.checkedInAt ? a.checkedInAt.toISOString() : null,
    };
  });
}

function loadAttendees(filter: Record<string, unknown>, limit?: number) {
  const q = Attendee.find(filter).sort({ updatedAt: 1, _id: 1 });
  if (limit) q.limit(limit);
  return q.lean();
}

export function syncRoutes(deps: AppDeps): Router {
  const r = Router();
  // Pull lag: only serve changes older than this, so writes from transactions still in flight
  // (Mongo's limit is 60s) are never skipped by the cursor. The venue also verifies a checksum.
  const PULL_SETTLE_MS = deps.config.SYNC_SETTLE_MS;
  r.use('/events/:eventId', limiter('sync-ip', 60 * 1000, 120));

  r.get(
    '/events/:eventId/pull',
    requireDevice,
    ah(async (req, res) => {
      const event = req.device!.event;
      const now = deps.now();
      const settled = new Date(now.getTime() - PULL_SETTLE_MS);
      const cur = decodeCursor(typeof req.query.cursor === 'string' ? req.query.cursor : undefined);
      const filter: Record<string, unknown> = { eventId: event._id, updatedAt: { $lte: settled } };
      if (cur) {
        filter.$or = [{ updatedAt: { $gt: cur.t, $lte: settled } }, { updatedAt: cur.t, _id: { $gt: cur.id } }];
        delete filter.updatedAt;
      }
      const rows = await loadAttendees(filter, PAGE + 1);
      const page = rows.slice(0, PAGE);
      const last = page[page.length - 1];
      const body: SyncPullResponse = {
        items: await rosterItems(event, page),
        nextCursor: last ? encodeCursor(last.updatedAt, last._id) : (typeof req.query.cursor === 'string' ? req.query.cursor : ''),
        hasMore: rows.length > PAGE,
        serverTime: now.toISOString(),
      };
      res.json(body);
    }),
  );

  r.get(
    '/events/:eventId/roster-summary',
    requireDevice,
    ah(async (req, res) => {
      const event = req.device!.event;
      const now = deps.now();
      const attendees = await loadAttendees({ eventId: event._id, updatedAt: { $lte: new Date(now.getTime() - PULL_SETTLE_MS) } });
      const items = (await rosterItems(event, attendees)).filter((i) => i.active);
      const body: RosterSummary = { activeCount: items.length, checksum: sha256(rosterChecksumInput(items)), serverTime: now.toISOString() };
      res.json(body);
    }),
  );

  r.post(
    '/events/:eventId/push',
    requireDevice,
    ah(async (req, res) => {
      const { ops } = parse(syncPushSchema, req.body);
      const device = req.device!;
      const results: SyncOpResult[] = [];
      for (const op of ops) results.push(await applyOp(device, op, deps.now()));
      const body: SyncPushResponse = { results, serverTime: deps.now().toISOString() };
      res.json(body);
    }),
  );

  return r;
}

async function applyOp(device: DeviceCtx, op: SyncOp, now: Date): Promise<SyncOpResult> {
  const event = device.event;
  const prior = await SyncOperation.findOne({ eventId: event._id, opId: op.opId }).lean();
  if (prior) return { ...(prior.detail as object), opId: op.opId, result: prior.result === 'accepted' ? 'already_applied' : prior.result } as SyncOpResult;

  let result: SyncOpResult;
  try {
    switch (op.type) {
      case 'checkin':
        result = await applyCheckin(device, op, now);
        break;
      case 'walkin':
        result = await applyWalkin(device, op, now);
        break;
      case 'attendee_update':
        result = await applyAttendeeUpdate(device, op);
        break;
      case 'attendee_add':
        result = await applyAttendeeAdd(device, op, now);
        break;
      case 'checkin_undo':
        result = await applyCheckinUndo(device, op);
        break;
    }
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      // Concurrent replay of the same op from a retry: report the stored outcome.
      const again = await SyncOperation.findOne({ eventId: event._id, opId: op.opId }).lean();
      if (again) return { ...(again.detail as object), opId: op.opId, result: 'already_applied' } as SyncOpResult;
    }
    throw err;
  }
  return result;
}

async function record(eventId: Types.ObjectId, deviceId: string, op: SyncOp, result: SyncOpResult) {
  const { opId: _o, result: res, ...detail } = result;
  await SyncOperation.create({ eventId, opId: op.opId, deviceId, type: op.type, result: res, detail });
}

async function applyCheckin(device: DeviceCtx, op: Extract<SyncOp, { type: 'checkin' }>, now: Date): Promise<SyncOpResult> {
  const event = device.event;
  const attendee = await Attendee.findOne({ eventId: event._id, publicId: op.attendeeId }).lean();
  let result: SyncOpResult;
  if (!attendee) {
    result = { opId: op.opId, result: 'rejected', code: 'unknown_attendee' };
  } else if (attendee.status !== 'active' || !attendee.registrationActive) {
    // Removed/cancelled after the roster was pulled: never silently count; ask a human.
    result = { opId: op.opId, result: 'needs_review', code: 'attendee_not_active' };
  } else {
    const existing = await Checkin.findOne({ eventId: event._id, attendeeId: attendee._id }).lean();
    if (existing) {
      result = { opId: op.opId, result: 'already_applied', code: 'already_checked_in', firstCheckedInAt: existing.deviceTime.toISOString() };
    } else {
      try {
        await withTransaction(async (session) => {
          await Checkin.create(
            [{ organizationId: event.organizationId, eventId: event._id, attendeeId: attendee._id, opId: op.opId, deviceId: device.publicId, operatorId: op.operatorId, deviceTime: new Date(op.deviceTime), acceptedAt: now }],
            { session },
          );
          await Attendee.updateOne({ _id: attendee._id }, { $set: { checkedInAt: new Date(op.deviceTime) }, $inc: { revision: 1 } }, { session });
        });
        result = { opId: op.opId, result: 'accepted' };
      } catch (err) {
        if ((err as { code?: number; keyPattern?: Record<string, unknown> }).code === 11000 && (err as { keyPattern?: Record<string, unknown> }).keyPattern?.attendeeId) {
          const first = await Checkin.findOne({ eventId: event._id, attendeeId: attendee._id }).lean();
          result = { opId: op.opId, result: 'already_applied', code: 'already_checked_in', firstCheckedInAt: first?.deviceTime.toISOString() };
        } else throw err;
      }
    }
  }
  await record(event._id, device.publicId, op, result);
  return result;
}

async function applyWalkin(device: DeviceCtx, op: Extract<SyncOp, { type: 'walkin' }>, now: Date): Promise<SyncOpResult> {
  const event = device.event;
  const existing = await Attendee.findOne({ eventId: event._id, venueTempId: op.tempAttendeeId }).lean();
  if (existing) {
    const reg = await Registration.findById(existing.registrationId).lean();
    const result: SyncOpResult = { opId: op.opId, result: 'already_applied', attendeeId: existing.publicId, registrationId: reg?.publicId, reference: reg?.reference };
    await record(event._id, device.publicId, op, result);
    return result;
  }
  const cat = op.branchLabel ? await EventCategory.findOne({ eventId: event._id, labelNormalized: normalizeName(op.branchLabel) }).lean() : null;
  const out = await withTransaction(async (session) => {
    let reg = await Registration.findOne({ eventId: event._id, venueGroupId: op.groupId }, null, { session }).lean();
    if (!reg) {
      const [doc] = await Registration.create(
        [
          {
            reference: newReference(),
            organizationId: event.organizationId,
            eventId: event._id,
            representativeName: cleanDisplayName(op.groupName),
            representativeNameNormalized: normalizeName(op.groupName),
            contacts: {},
            eventCategoryId: cat?._id,
            notes: op.contact ? `Venue contact: ${op.contact}` : undefined,
            source: 'venue',
            lateRegistration: true,
            botCheck: 'staff',
            consent: { version: event.consentVersion, acceptedAt: new Date(op.deviceTime), purpose: 'event_registration', method: 'staff_explained' },
            venueGroupId: op.groupId,
          },
        ],
        { session },
      );
      reg = doc!.toObject();
    }
    const count = await Attendee.countDocuments({ registrationId: reg!._id }, { session });
    const [att] = await Attendee.create(
      [
        {
          organizationId: event.organizationId,
          eventId: event._id,
          registrationId: reg!._id,
          fullName: cleanDisplayName(op.fullName),
          normalizedName: normalizeName(op.fullName),
          ageCategory: op.ageCategory,
          rsvp: 'confirmed',
          categoryId: cat?._id,
          registrationActive: true,
          walkIn: true,
          venueTempId: op.tempAttendeeId,
          sortOrder: count,
          checkedInAt: op.checkedIn ? new Date(op.deviceTime) : undefined,
        },
      ],
      { session },
    );
    if (op.checkedIn) {
      await Checkin.create(
        [{ organizationId: event.organizationId, eventId: event._id, attendeeId: att!._id, opId: op.opId, deviceId: device.publicId, operatorId: op.operatorId, deviceTime: new Date(op.deviceTime), acceptedAt: now }],
        { session },
      );
    }
    await audit(
      { organizationId: event.organizationId, eventId: event._id, actor: { type: 'device', id: device.publicId }, action: 'venue.walkin_synced', subjectType: 'registration', subjectId: reg!.publicId, metadata: { tempAttendeeId: op.tempAttendeeId } },
      session,
    );
    return { reg: reg!, att: att!.toObject() };
  });
  flagPossibleDuplicates(event, out.reg as never, [out.att as never]).catch(() => undefined);
  const result: SyncOpResult = { opId: op.opId, result: 'accepted', attendeeId: out.att.publicId, registrationId: out.reg.publicId, reference: out.reg.reference };
  await record(event._id, device.publicId, op, result);
  return result;
}

/** Venue correction: applied only if nobody changed the person online since the venue pulled it. */
async function applyAttendeeUpdate(device: DeviceCtx, op: Extract<SyncOp, { type: 'attendee_update' }>): Promise<SyncOpResult> {
  const event = device.event;
  const set: Record<string, unknown> = {};
  // A venue correction replaces the whole name, so any separately entered parts no longer apply.
  if (op.fullName) Object.assign(set, { fullName: cleanDisplayName(op.fullName), normalizedName: normalizeName(op.fullName), nameParts: null });
  if (op.ageCategory) set.ageCategory = op.ageCategory;
  if (op.rsvp) set.rsvp = op.rsvp;
  let result: SyncOpResult;
  const updated = await Attendee.findOneAndUpdate(
    { eventId: event._id, publicId: op.attendeeId, revision: op.baseRevision, status: 'active', registrationActive: true },
    { $set: set, $inc: { revision: 1 } },
    { new: true },
  ).lean();
  if (updated) {
    await audit({
      organizationId: event.organizationId,
      eventId: event._id,
      actor: { type: 'device', id: device.publicId },
      action: 'venue.attendee_updated',
      subjectType: 'attendee',
      subjectId: updated.publicId,
      metadata: { fields: Object.keys(set).filter((k) => k !== 'normalizedName'), toRevision: updated.revision },
    });
    result = { opId: op.opId, result: 'accepted', attendeeId: updated.publicId };
  } else {
    const current = await Attendee.findOne({ eventId: event._id, publicId: op.attendeeId }).lean();
    if (!current) result = { opId: op.opId, result: 'rejected', code: 'unknown_attendee' };
    else if (current.status !== 'active' || !current.registrationActive) result = { opId: op.opId, result: 'needs_review', code: 'attendee_not_active' };
    // Changed online after the venue's copy: never overwrite blindly.
    else result = { opId: op.opId, result: 'needs_review', code: 'changed_online' };
  }
  await record(event._id, device.publicId, op, result);
  return result;
}

/** Extra person for an existing household, created at the venue. Idempotent on the temporary id. */
async function applyAttendeeAdd(device: DeviceCtx, op: Extract<SyncOp, { type: 'attendee_add' }>, now: Date): Promise<SyncOpResult> {
  const event = device.event;
  const existing = await Attendee.findOne({ eventId: event._id, venueTempId: op.tempAttendeeId }).lean();
  let result: SyncOpResult;
  if (existing) {
    const reg = await Registration.findById(existing.registrationId).select('publicId reference').lean();
    result = { opId: op.opId, result: 'already_applied', attendeeId: existing.publicId, registrationId: reg?.publicId, reference: reg?.reference };
  } else {
    const reg = await Registration.findOne({ eventId: event._id, publicId: op.registrationId }).lean();
    if (!reg) result = { opId: op.opId, result: 'rejected', code: 'unknown_registration' };
    else if (reg.status !== 'active') result = { opId: op.opId, result: 'needs_review', code: 'registration_cancelled' };
    else {
      const att = await withTransaction(async (session) => {
        const count = await Attendee.countDocuments({ registrationId: reg._id }, { session });
        const [doc] = await Attendee.create(
          [
            {
              organizationId: event.organizationId,
              eventId: event._id,
              registrationId: reg._id,
              fullName: cleanDisplayName(op.fullName),
              normalizedName: normalizeName(op.fullName),
              ageCategory: op.ageCategory,
              rsvp: 'confirmed',
              registrationActive: true,
              walkIn: true,
              venueTempId: op.tempAttendeeId,
              sortOrder: count,
              checkedInAt: op.checkedIn ? new Date(op.deviceTime) : undefined,
            },
          ],
          { session },
        );
        if (op.checkedIn) {
          await Checkin.create(
            [{ organizationId: event.organizationId, eventId: event._id, attendeeId: doc!._id, opId: op.opId, deviceId: device.publicId, operatorId: op.operatorId, deviceTime: new Date(op.deviceTime), acceptedAt: now }],
            { session },
          );
        }
        await audit(
          { organizationId: event.organizationId, eventId: event._id, actor: { type: 'device', id: device.publicId }, action: 'venue.attendee_added', subjectType: 'registration', subjectId: reg.publicId, metadata: { tempAttendeeId: op.tempAttendeeId } },
          session,
        );
        return doc!.toObject();
      });
      flagPossibleDuplicates(event, reg as never, [att as never]).catch(() => undefined);
      result = { opId: op.opId, result: 'accepted', attendeeId: att.publicId, registrationId: reg.publicId, reference: reg.reference };
    }
  }
  await record(event._id, device.publicId, op, result);
  return result;
}

/** Reverse a mistaken check-in. Only the check-in created by the named venue op is removed. */
async function applyCheckinUndo(device: DeviceCtx, op: Extract<SyncOp, { type: 'checkin_undo' }>): Promise<SyncOpResult> {
  const event = device.event;
  let result: SyncOpResult;
  const attendee = await Attendee.findOne({ eventId: event._id, publicId: op.attendeeId }).lean();
  if (!attendee) result = { opId: op.opId, result: 'rejected', code: 'unknown_attendee' };
  else {
    const removed = await withTransaction(async (session) => {
      const del = await Checkin.findOneAndDelete({ eventId: event._id, attendeeId: attendee._id, opId: op.checkinOpId }, { session });
      if (!del) return false;
      await Attendee.updateOne({ _id: attendee._id }, { $unset: { checkedInAt: 1 }, $inc: { revision: 1 } }, { session });
      await audit(
        { organizationId: event.organizationId, eventId: event._id, actor: { type: 'device', id: device.publicId }, action: 'venue.checkin_undone', subjectType: 'attendee', subjectId: attendee.publicId, metadata: { checkinOpId: op.checkinOpId, hasReason: !!op.reason } },
        session,
      );
      return true;
    });
    if (removed) result = { opId: op.opId, result: 'accepted' };
    else {
      const other = await Checkin.findOne({ eventId: event._id, attendeeId: attendee._id }).lean();
      // A check-in from another op/device exists: don't delete someone else's record.
      result = other ? { opId: op.opId, result: 'needs_review', code: 'checked_in_by_other_op' } : { opId: op.opId, result: 'already_applied', code: 'not_checked_in' };
    }
  }
  await record(event._id, device.publicId, op, result);
  return result;
}
