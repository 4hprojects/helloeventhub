import { randomInt } from 'node:crypto';
import { Router } from 'express';
import type { Types } from 'mongoose';
import { normalizeEmail, staffInviteSchema, staffRoleSchema, type StaffMemberDto } from '@heh/contracts';
import type { AppDeps } from '../app-deps.js';
import { AdminUser, Membership, type EventDoc } from '../db/models.js';
import { HttpError, notFound } from '../lib/errors.js';
import { requireEventRole } from '../middleware/auth.js';
import { ah, parse } from '../middleware/core.js';
import { audit } from '../services/audit.js';
import { actorOf, ev } from './admin.js';
import { hashPassword } from './auth.js';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
/** Readable one-time password, e.g. "k7mq-xp3d-9fhw-t2nb" (16 random chars ≈ 79 bits). */
export function temporaryPassword(): string {
  const groups = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''));
  return groups.join('-');
}

/**
 * Event admins manage who can access THEIR event (doc 06 "access grants").
 * Organization-wide grants are shown read-only; they're managed with the CLI by the platform owner.
 */
export function staffRoutes(_deps: AppDeps): Router {
  const r = Router();
  const eventAdmin = requireEventRole('event_admin');

  const eventMembership = (event: EventDoc, userId: Types.ObjectId) =>
    Membership.findOne({ userId, organizationId: event.organizationId, eventId: event._id });

  /** A target user may only be managed here if all their access is inside this event's organization. */
  async function assertManageable(event: EventDoc, userId: Types.ObjectId) {
    const outside = await Membership.exists({ userId, $or: [{ organizationId: { $ne: event.organizationId } }, { role: 'platform_admin' }] });
    if (outside) throw new HttpError(403, 'forbidden', 'This person also has access elsewhere; ask the platform owner to change their account.');
  }

  async function assertAnotherAdminRemains(event: EventDoc, excludingUserId: Types.ObjectId) {
    const others = await Membership.countDocuments({
      organizationId: event.organizationId,
      $or: [{ eventId: event._id }, { eventId: null }],
      role: 'event_admin',
      userId: { $ne: excludingUserId },
    });
    if (others === 0) throw new HttpError(409, 'last_admin', 'At least one other event admin must remain.');
  }

  r.get(
    '/events/:eventId/staff',
    eventAdmin,
    ah(async (req, res) => {
      const event = ev(req);
      const ms = await Membership.find({ organizationId: event.organizationId, $or: [{ eventId: event._id }, { eventId: null }], role: { $in: ['event_admin', 'committee'] } }).lean();
      const users = await AdminUser.find({ _id: { $in: ms.map((m) => m.userId) } }).lean();
      const byId = new Map(users.map((u) => [String(u._id), u]));
      const items: StaffMemberDto[] = ms
        .map((m) => {
          const u = byId.get(String(m.userId));
          if (!u) return null;
          return {
            id: u.publicId,
            name: u.name,
            email: u.email,
            role: m.role as 'event_admin' | 'committee',
            scope: m.eventId ? 'event' : 'organization',
            status: u.status,
            lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
            mustChangePassword: !!u.mustChangePassword,
            isYou: u.publicId === req.admin!.publicId,
          } satisfies StaffMemberDto;
        })
        .filter((x): x is StaffMemberDto => !!x)
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({ items });
    }),
  );

  r.post(
    '/events/:eventId/staff',
    eventAdmin,
    ah(async (req, res) => {
      const event = ev(req);
      const body = parse(staffInviteSchema, req.body);
      const email = normalizeEmail(body.email);
      let user = await AdminUser.findOne({ email });
      let tempPassword: string | undefined;
      if (!user) {
        tempPassword = temporaryPassword();
        user = await AdminUser.create({ email, name: body.name, passwordHash: await hashPassword(tempPassword), mustChangePassword: true });
      }
      if (await eventMembership(event, user._id)) throw new HttpError(409, 'already_staff', 'This person already has access to this event.');
      await Membership.create({ userId: user._id, organizationId: event.organizationId, eventId: event._id, role: body.role, grantedBy: req.admin!.publicId });
      await audit({ organizationId: event.organizationId, eventId: event._id, actor: actorOf(req), action: 'staff.granted', subjectType: 'admin_user', subjectId: user.publicId, metadata: { role: body.role, newAccount: !!tempPassword }, requestId: req.requestId });
      // The temporary password is returned exactly once; it is never stored in plaintext or logged.
      res.status(201).json({ id: user.publicId, email, tempPassword: tempPassword ?? null });
    }),
  );

  const loadTarget = async (event: EventDoc, publicId: string) => {
    const user = await AdminUser.findOne({ publicId });
    if (!user) throw notFound('Staff member');
    const m = await eventMembership(event, user._id);
    if (!m) throw notFound('Staff member');
    return { user, m };
  };

  r.patch(
    '/events/:eventId/staff/:userId',
    eventAdmin,
    ah(async (req, res) => {
      const event = ev(req);
      const { role } = parse(staffRoleSchema, req.body);
      const { user, m } = await loadTarget(event, String(req.params.userId));
      if (user.publicId === req.admin!.publicId) throw new HttpError(409, 'self_change', "You can't change your own role.");
      if (m.role === 'event_admin' && role !== 'event_admin') await assertAnotherAdminRemains(event, user._id);
      m.role = role;
      await m.save();
      await audit({ organizationId: event.organizationId, eventId: event._id, actor: actorOf(req), action: 'staff.role_changed', subjectType: 'admin_user', subjectId: user.publicId, metadata: { role }, requestId: req.requestId });
      res.json({ id: user.publicId, role });
    }),
  );

  r.post(
    '/events/:eventId/staff/:userId/remove',
    eventAdmin,
    ah(async (req, res) => {
      const event = ev(req);
      const { user, m } = await loadTarget(event, String(req.params.userId));
      if (user.publicId === req.admin!.publicId) throw new HttpError(409, 'self_change', "You can't remove your own access.");
      if (m.role === 'event_admin') await assertAnotherAdminRemains(event, user._id);
      await m.deleteOne();
      // Signing out: bump passwordChangedAt only when this was their last grant, so other access is unaffected.
      if (!(await Membership.exists({ userId: user._id }))) {
        user.passwordChangedAt = new Date();
        await user.save();
      }
      await audit({ organizationId: event.organizationId, eventId: event._id, actor: actorOf(req), action: 'staff.removed', subjectType: 'admin_user', subjectId: user.publicId, requestId: req.requestId });
      res.json({ id: user.publicId, removed: true });
    }),
  );

  r.post(
    '/events/:eventId/staff/:userId/reset-password',
    eventAdmin,
    ah(async (req, res) => {
      const event = ev(req);
      const { user } = await loadTarget(event, String(req.params.userId));
      if (user.publicId === req.admin!.publicId) throw new HttpError(409, 'self_change', 'Use the Account page to change your own password.');
      await assertManageable(event, user._id);
      const tempPassword = temporaryPassword();
      user.passwordHash = await hashPassword(tempPassword);
      user.passwordChangedAt = new Date(); // signs out their existing sessions
      user.mustChangePassword = true;
      user.failedLoginCount = 0;
      user.lockedUntil = undefined;
      await user.save();
      await audit({ organizationId: event.organizationId, eventId: event._id, actor: actorOf(req), action: 'staff.password_reset', subjectType: 'admin_user', subjectId: user.publicId, requestId: req.requestId });
      res.json({ id: user.publicId, tempPassword });
    }),
  );

  return r;
}
