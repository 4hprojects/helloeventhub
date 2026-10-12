import { Router } from 'express';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
import { loginSchema, normalizeEmail, type SessionDto } from '@heh/contracts';
import type { AppDeps } from '../app-deps.js';
import { AdminUser, Event, Membership } from '../db/models.js';
import { HttpError, unauthorized } from '../lib/errors.js';
import { ensureCsrfToken, requireAdminForPasswordChange, requireCsrf } from '../middleware/auth.js';
import { ah, parse } from '../middleware/core.js';
import { limiter } from '../middleware/rateLimit.js';
import { audit } from '../services/audit.js';
import { regenerateSession } from './public.js';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
export const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => hash(pw, ARGON_OPTS);

// Verified against when the email is unknown, so response time doesn't reveal valid accounts.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hash('not-a-real-password-placeholder', ARGON_OPTS));

export const passwordPolicy = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(256)
  .refine((p) => new Set(p).size >= 6, 'Password is too repetitive');

async function sessionUser(userPublicId: string | undefined): Promise<SessionDto['user']> {
  if (!userPublicId) return null;
  const user = await AdminUser.findOne({ publicId: userPublicId, status: 'active' }).lean();
  if (!user) return null;
  const memberships = await Membership.find({ userId: user._id }).populate<{ organizationId: { publicId: string } }>('organizationId', 'publicId').lean();
  const eventIds = memberships.map((m) => m.eventId).filter(Boolean);
  const events = await Event.find({ _id: { $in: eventIds } }).select('publicId').lean();
  const evMap = new Map(events.map((e) => [String(e._id), e.publicId]));
  return {
    id: user.publicId,
    email: user.email,
    name: user.name,
    mustChangePassword: !!user.mustChangePassword,
    memberships: memberships.map((m) => ({
      role: m.role,
      organizationId: (m.organizationId as unknown as { publicId?: string })?.publicId ?? '',
      eventId: m.eventId ? (evMap.get(String(m.eventId)) ?? null) : null,
    })),
  };
}

export function authRoutes(_deps: AppDeps): Router {
  const r = Router();

  r.get(
    '/session',
    ah(async (req, res) => {
      const csrfToken = ensureCsrfToken(req.session);
      const user = req.session.authAt ? await sessionUser(req.session.userId) : null;
      const body: SessionDto = { user, csrfToken };
      res.set('Cache-Control', 'no-store').json(body);
    }),
  );

  r.post(
    '/login',
    limiter('login-ip', 15 * 60 * 1000, 30),
    requireCsrf,
    ah(async (req, res) => {
      const { email, password } = parse(loginSchema, req.body);
      const user = await AdminUser.findOne({ email: normalizeEmail(email) });
      const invalid = new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.');
      if (!user || user.status !== 'active') {
        await verify(await getDummyHash(), password).catch(() => false);
        throw invalid;
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new HttpError(429, 'account_locked', 'Too many failed attempts. Try again in 15 minutes.');
      }
      const ok = await verify(user.passwordHash, password).catch(() => false);
      if (!ok) {
        const failed = user.failedLoginCount + 1;
        await AdminUser.updateOne(
          { _id: user._id },
          failed >= MAX_FAILED_LOGINS
            ? { $set: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) } }
            : { $set: { failedLoginCount: failed } },
        );
        await audit({ actor: { type: 'admin', id: user.publicId }, action: failed >= MAX_FAILED_LOGINS ? 'auth.locked' : 'auth.login_failed', subjectType: 'admin_user', subjectId: user.publicId, requestId: req.requestId });
        throw invalid;
      }
      await AdminUser.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: 1 } });
      await regenerateSession(req);
      req.session.userId = user.publicId;
      req.session.authAt = Date.now();
      const csrfToken = ensureCsrfToken(req.session);
      await audit({ actor: { type: 'admin', id: user.publicId }, action: 'auth.login', subjectType: 'admin_user', subjectId: user.publicId, requestId: req.requestId });
      const body: SessionDto = { user: await sessionUser(user.publicId), csrfToken };
      res.json(body);
    }),
  );

  r.post('/logout', requireCsrf, (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('heh.sid').status(204).end();
    });
  });

  r.post(
    '/password',
    requireCsrf,
    requireAdminForPasswordChange,
    ah(async (req, res) => {
      const body = parse(z.object({ currentPassword: z.string().min(1).max(256), newPassword: passwordPolicy }), req.body);
      const user = await AdminUser.findById(req.admin!.userId);
      if (!user) throw unauthorized();
      if (!(await verify(user.passwordHash, body.currentPassword).catch(() => false))) {
        throw new HttpError(422, 'validation_failed', 'Current password is incorrect.', { currentPassword: ['Incorrect password'] });
      }
      user.passwordHash = await hashPassword(body.newPassword);
      user.passwordChangedAt = new Date();
      user.mustChangePassword = false;
      await user.save();
      await regenerateSession(req);
      req.session.userId = user.publicId;
      req.session.authAt = Date.now() + 1;
      await audit({ actor: { type: 'admin', id: user.publicId }, action: 'auth.password_changed', subjectType: 'admin_user', subjectId: user.publicId, requestId: req.requestId });
      res.json({ csrfToken: ensureCsrfToken(req.session) });
    }),
  );

  return r;
}
