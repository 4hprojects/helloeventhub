import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Role } from '@heh/contracts';
import { AdminUser, Event, Membership } from '../db/models.js';
import { forbidden, HttpError, notFound, unauthorized } from '../lib/errors.js';
import { ah } from './core.js';

export const ADMIN_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export function ensureCsrfToken(session: { csrfToken?: string }): string {
  if (!session.csrfToken) session.csrfToken = randomBytes(32).toString('base64url');
  return session.csrfToken;
}

/** Synchronizer-token CSRF check for session-authenticated mutations. */
export const requireCsrf: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const expected = req.session?.csrfToken;
  const got = req.get('x-csrf-token');
  if (!expected || !got || expected.length !== got.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(got))) {
    return next(new HttpError(403, 'csrf_failed', 'Your session expired. Reload the page and try again.'));
  }
  next();
};

function adminAuth(allowPendingPasswordChange: boolean): RequestHandler {
  return ah(async (req, _res, next) => {
    const userId = req.session.userId;
    if (!userId || !req.session.authAt || Date.now() - req.session.authAt > ADMIN_SESSION_MAX_AGE_MS) throw unauthorized();
    const user = await AdminUser.findOne({ publicId: userId, status: 'active' }).lean();
    if (!user) throw unauthorized();
    if (user.passwordChangedAt && user.passwordChangedAt.getTime() > req.session.authAt) throw unauthorized();
    req.admin = { userId: user._id, publicId: user.publicId, email: user.email, name: user.name };
    // Accounts with a temporary password must set their own before doing anything else.
    if (user.mustChangePassword && !allowPendingPasswordChange) {
      throw new HttpError(403, 'password_change_required', 'Please set a new password first (Account page).');
    }
    next();
  });
}

export const requireAdmin = adminAuth(false);
/** Only for the change-password endpoint: works while a temporary password is still in use. */
export const requireAdminForPasswordChange = adminAuth(true);

const ROLE_RANK: Record<Role, number> = { committee: 1, event_admin: 2, platform_admin: 0 };

/**
 * Resolve :eventId (public id) and assert the signed-in user has an event-scoped role.
 * platform_admin does NOT implicitly grant event data access (doc 08).
 * Missing access returns 404 so event IDs cannot be probed.
 */
export function requireEventRole(minRole: 'committee' | 'event_admin'): RequestHandler {
  return ah(async (req, _res, next) => {
    if (!req.admin) throw unauthorized();
    const event = await Event.findOne({ publicId: req.params.eventId }).lean();
    if (!event) throw notFound('Event');
    const memberships = await Membership.find({
      userId: req.admin.userId,
      organizationId: event.organizationId,
      $or: [{ eventId: event._id }, { eventId: null }],
      role: { $in: ['committee', 'event_admin'] },
    }).lean();
    if (memberships.length === 0) throw notFound('Event');
    const best = memberships.reduce((a, b) => (ROLE_RANK[b.role] > ROLE_RANK[a.role] ? b : a));
    if (ROLE_RANK[best.role] < ROLE_RANK[minRole]) throw forbidden();
    req.eventAccess = { event, role: best.role };
    next();
  });
}
