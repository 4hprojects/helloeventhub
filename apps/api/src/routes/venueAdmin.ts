import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app-deps.js';
import { VenueDevice } from '../db/models.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { notFound } from '../lib/errors.js';
import { requireEventRole } from '../middleware/auth.js';
import { ah, parse } from '../middleware/core.js';
import { audit } from '../services/audit.js';
import { actorOf, ev } from './admin.js';

/** Event admins issue and revoke venue-server device tokens. Tokens are shown once and stored hashed. */
export function venueAdminRoutes(_deps: AppDeps): Router {
  const r = Router();
  // requireCsrf + requireAdmin are applied once where the /admin routers are mounted (app.ts).
  const eventAdmin = requireEventRole('event_admin');

  r.get(
    '/events/:eventId/venue-devices',
    eventAdmin,
    ah(async (req, res) => {
      const devices = await VenueDevice.find({ eventId: ev(req)._id }).sort({ createdAt: -1 }).lean();
      res.json({
        items: devices.map((d) => ({ id: d.publicId, label: d.label, status: d.status, createdAt: d.createdAt.toISOString(), lastSeenAt: d.lastSeenAt?.toISOString() ?? null })),
      });
    }),
  );

  r.post(
    '/events/:eventId/venue-devices',
    eventAdmin,
    ah(async (req, res) => {
      const { label } = parse(z.object({ label: z.string().trim().min(2).max(60) }), req.body);
      const event = ev(req);
      const token = randomToken();
      const [d] = await VenueDevice.create([{ organizationId: event.organizationId, eventId: event._id, label, tokenHash: sha256(token), createdBy: req.admin!.publicId }]);
      await audit({ organizationId: event.organizationId, eventId: event._id, actor: actorOf(req), action: 'venue.device_created', subjectType: 'venue_device', subjectId: d!.publicId, requestId: req.requestId });
      res.status(201).json({ id: d!.publicId, label, token, eventId: event.publicId });
    }),
  );

  r.post(
    '/events/:eventId/venue-devices/:deviceId/revoke',
    eventAdmin,
    ah(async (req, res) => {
      const event = ev(req);
      const d = await VenueDevice.findOneAndUpdate({ eventId: event._id, publicId: req.params.deviceId }, { $set: { status: 'revoked' } }, { new: true }).lean();
      if (!d) throw notFound('Device');
      await audit({ organizationId: event.organizationId, eventId: event._id, actor: actorOf(req), action: 'venue.device_revoked', subjectType: 'venue_device', subjectId: d.publicId, requestId: req.requestId });
      res.json({ id: d.publicId, status: d.status });
    }),
  );

  return r;
}
