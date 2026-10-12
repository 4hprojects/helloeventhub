import { Router, type Request } from 'express';
import type { Types } from 'mongoose';
import {
  accessRequestSchema,
  manageExchangeSchema,
  normalizeEmail,
  registrationCancelSchema,
  registrationCreateSchema,
  registrationUpdateSchema,
  type PublicConfig,
  type PublicEvent,
  type RegistrationCreatedResponse,
} from '@heh/contracts';
import type { AppDeps } from '../app-deps.js';
import { dbState, withTransaction } from '../db/connect.js';
import { Attendee, Event, EventCategory, Registration, SubmissionKey, type EventDoc } from '../db/models.js';
import { randomToken, sha256, stableStringify } from '../lib/crypto.js';
import { HttpError, notFound, unauthorized } from '../lib/errors.js';
import { ensureCsrfToken, requireCsrf } from '../middleware/auth.js';
import { ah, parse } from '../middleware/core.js';
import { hitLimit, limiter } from '../middleware/rateLimit.js';
import { audit } from '../services/audit.js';
import { enqueueEmail } from '../services/emailOutbox.js';
import {
  cancelRegistration,
  countSummary,
  createRegistration,
  flagPossibleDuplicates,
  ownerDto,
  ownerEditDeadline,
  registrationWindow,
  updateRegistration,
} from '../services/registrations.js';

const MANAGE_TOKEN_TTL_MS = 30 * 60 * 1000;
const OWNER_SESSION_TTL_MS = 60 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GENERIC_ACCESS_MESSAGE =
  'If the email and reference match an active registration, we sent a link to manage it. Please check your inbox (and spam folder) in a few minutes.';

export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

async function loadPublicEvent(slug: string): Promise<EventDoc> {
  const event = await Event.findOne({ slug, status: 'published' }).lean();
  if (!event) throw notFound('Event');
  return event;
}

export function publicRoutes(deps: AppDeps): Router {
  const r = Router();
  const { config, logger } = deps;

  r.get('/health', (_req, res) => {
    const db = dbState();
    res.status(db === 'connected' ? 200 : 503).json({ status: db === 'connected' ? 'ok' : 'degraded', version: config.version, db });
  });

  r.get('/public-config', (_req, res) => {
    const body: PublicConfig = {
      appName: 'HelloEventHub',
      turnstileSiteKey: config.TURNSTILE_DISABLED ? null : config.TURNSTILE_SITE_KEY || null,
      timezone: config.EVENT_TIMEZONE,
      primaryEventSlug: config.PRIMARY_EVENT_SLUG,
    };
    res.set('Cache-Control', 'public, max-age=300').json(body);
  });

  r.get(
    '/events/:slug',
    ah(async (req, res) => {
      const event = await loadPublicEvent(String(req.params.slug));
      const categories = await EventCategory.find({ eventId: event._id, active: true }).sort({ sortOrder: 1 }).lean();
      const win = registrationWindow(event, deps.now());
      const body: PublicEvent = {
        id: event.publicId,
        slug: event.slug,
        title: event.title,
        description: event.description ?? '',
        venueName: event.venueName ?? null,
        venueAddress: event.venueAddress ?? null,
        venueMapUrl: event.venueMapUrl ?? null,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        onsiteRegistrationStartsAt: event.onsiteRegistrationStartsAt.toISOString(),
        timezone: event.timezone,
        registrationOpen: win.open,
        registrationMessage: win.message,
        lateRegistration: win.late,
        contactInfo: {
          ...(event.contactInfo?.email ? { email: event.contactInfo.email } : {}),
          ...(event.contactInfo?.phone ? { phone: event.contactInfo.phone } : {}),
          ...(event.contactInfo?.messenger ? { messenger: event.contactInfo.messenger } : {}),
          ...(event.contactInfo?.note ? { note: event.contactInfo.note } : {}),
        },
        ageCategoryNote: event.ageCategoryNote ?? '',
        consentVersion: event.consentVersion,
        privacyNotice: event.privacyNotice ?? '',
        privacyNoticeApproved: !!event.privacyNoticeApproved,
        categories: categories.map((c) => ({ id: c.publicId, label: c.label })),
      };
      res.set('Cache-Control', 'no-store').json(body);
    }),
  );

  // ------------------------------------------------------------ public registration
  r.post(
    '/events/:eventPublicId/registrations',
    limiter('reg-ip', 10 * 60 * 1000, 20),
    ah(async (req, res) => {
      const idemKey = req.get('idempotency-key') ?? '';
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(idemKey)) {
        throw new HttpError(400, 'idempotency_key_required', 'Missing or invalid Idempotency-Key header');
      }
      const event = await Event.findOne({ publicId: req.params.eventPublicId, status: 'published' }).lean();
      if (!event) throw notFound('Event');
      const body = parse(registrationCreateSchema, req.body);
      const { turnstileToken, ...hashed } = body;
      const idempotencyKeyHash = sha256(idemKey);
      const requestHash = sha256(stableStringify(hashed));

      const replay = async () => {
        const prior = await SubmissionKey.findOne({ eventId: event._id, idempotencyKeyHash }).lean();
        if (!prior) return false;
        if (prior.requestHash !== requestHash) {
          throw new HttpError(409, 'idempotency_conflict', 'This form was already submitted with different details. Please reload the page to start a new registration.');
        }
        res.status(201).set('Idempotent-Replayed', 'true').json(prior.response);
        return true;
      };
      if (await replay()) return;

      const win = registrationWindow(event, deps.now());
      if (!win.open) throw new HttpError(422, 'registration_closed', win.message ?? 'Registration is closed');
      if (body.consentVersion !== event.consentVersion) {
        throw new HttpError(422, 'consent_outdated', 'The privacy notice was updated. Please reload the page and review it again.');
      }

      const check = await deps.turnstile.verify(turnstileToken, req.clientIp);
      let botCheck: 'passed' | 'unverified' | 'disabled';
      if (check === 'passed' || check === 'disabled') botCheck = check;
      else if (check === 'unavailable' && config.TURNSTILE_FAIL_OPEN) {
        // Fallback when Cloudflare is unreachable: accept, flag, and apply a much stricter per-IP limit.
        if (await hitLimit('reg-unverified', req.clientIp, 60 * 60 * 1000, 3)) {
          throw new HttpError(429, 'rate_limited', 'Too many requests. Please wait and try again.');
        }
        botCheck = 'unverified';
        logger.warn({ requestId: req.requestId }, 'turnstile unavailable; accepting with fail-open');
      } else {
        throw new HttpError(422, 'bot_check_failed', 'Verification failed. Please complete the security check and try again.');
      }

      let created: Awaited<ReturnType<typeof createRegistration>>;
      let response: RegistrationCreatedResponse;
      try {
        ({ created, response } = await withTransaction(async (session) => {
          const c = await createRegistration(
            {
              event,
              body,
              source: 'public',
              botCheck,
              consent: { version: body.consentVersion, method: 'checkbox' },
              late: win.late,
              actor: { type: 'public' },
              requestId: req.requestId,
              sessionSecret: config.SESSION_SECRET,
            },
            session,
          );
          const resp: RegistrationCreatedResponse = {
            reference: c.registration.reference,
            registrationPublicId: c.registration.publicId,
            countSummary: countSummary(c.attendees),
            confirmationEmailQueued: c.emailQueued,
            lateRegistration: win.late,
          };
          await SubmissionKey.create(
            [{ eventId: event._id, idempotencyKeyHash, requestHash, registrationId: c.registration._id, response: resp, expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS) }],
            { session },
          );
          return { created: c, response: resp };
        }));
      } catch (err) {
        // A concurrent request with the same key won the race: replay its result.
        if ((err as { code?: number }).code === 11000 && (await replay())) return;
        throw err;
      }
      flagPossibleDuplicates(event, created.registration, created.attendees).catch((err) =>
        logger.error({ err: { message: (err as Error).message }, requestId: req.requestId }, 'duplicate flagging failed'),
      );
      res.status(201).json(response);
    }),
  );

  // ------------------------------------------------------------ verified owner access
  r.post(
    '/registrations/access/request',
    limiter('access-ip', 15 * 60 * 1000, 10),
    ah(async (req, res) => {
      const body = parse(accessRequestSchema, req.body);
      const respond = () => res.status(202).json({ message: GENERIC_ACCESS_MESSAGE });
      if (await hitLimit('access-target', sha256(`${body.eventSlug}:${normalizeEmail(body.email)}`), 60 * 60 * 1000, 3)) return respond();
      const event = await Event.findOne({ slug: body.eventSlug, status: 'published' }).lean();
      if (!event) return respond();
      const reg = await Registration.findOne({
        eventId: event._id,
        reference: body.reference,
        status: 'active',
        'contacts.emailNormalized': normalizeEmail(body.email),
      }).lean();
      if (!reg || !reg.contacts?.email) return respond();
      const token = randomToken();
      await withTransaction(async (session) => {
        await Registration.updateOne(
          { _id: reg._id },
          { $set: { manageTokenHash: sha256(token), manageTokenExpiry: new Date(Date.now() + MANAGE_TOKEN_TTL_MS) } },
          { session },
        );
        await enqueueEmail(
          {
            eventId: event._id,
            registrationId: reg._id,
            type: 'access_link',
            recipient: reg.contacts!.email!,
            dedupe: sha256(token).slice(0, 16),
            secret: { sessionSecret: config.SESSION_SECRET, value: token },
          },
          session,
        );
        await audit(
          { organizationId: event.organizationId, eventId: event._id, actor: { type: 'public' }, action: 'registration.access_requested', subjectType: 'registration', subjectId: reg.publicId, requestId: req.requestId },
          session,
        );
      });
      respond();
    }),
  );

  r.post(
    '/registrations/manage/exchange',
    limiter('exchange-ip', 15 * 60 * 1000, 20),
    ah(async (req, res) => {
      const { token } = parse(manageExchangeSchema, req.body);
      // Single use: the token hash is removed atomically when exchanged.
      const reg = await Registration.findOneAndUpdate(
        { manageTokenHash: sha256(token), manageTokenExpiry: { $gt: new Date() }, status: 'active' },
        { $unset: { manageTokenHash: 1, manageTokenExpiry: 1 }, $set: { emailVerifiedAt: new Date() } },
        { new: true },
      ).lean();
      if (!reg) throw new HttpError(401, 'invalid_link', 'This link is invalid or has expired. Please request a new one.');
      // New session id (fixation protection), but keep an admin who is signed in on this browser signed in.
      const { userId, authAt } = req.session;
      await regenerateSession(req);
      if (userId && authAt) Object.assign(req.session, { userId, authAt });
      req.session.owner = { registrationId: reg.publicId, eventId: String(reg.eventId), expiresAt: Date.now() + OWNER_SESSION_TTL_MS };
      const csrfToken = ensureCsrfToken(req.session);
      await audit({ organizationId: reg.organizationId, eventId: reg.eventId, actor: { type: 'owner', id: reg.publicId }, action: 'registration.owner_verified', subjectType: 'registration', subjectId: reg.publicId, requestId: req.requestId });
      res.json({ csrfToken });
    }),
  );

  const loadOwned = async (req: Request) => {
    const owner = req.session.owner;
    if (!owner || owner.expiresAt < Date.now()) throw unauthorized();
    const reg = await Registration.findOne({ publicId: owner.registrationId }).lean();
    if (!reg) throw unauthorized();
    const event = await Event.findById(reg.eventId).lean();
    if (!event) throw unauthorized();
    return { reg, event };
  };

  const ownerView = async (event: EventDoc, regId: Types.ObjectId) => {
    const [reg, attendees, categories] = await Promise.all([
      Registration.findById(regId).lean(),
      Attendee.find({ registrationId: regId }).lean(),
      EventCategory.find({ eventId: event._id }).lean(),
    ]);
    return ownerDto(event, reg!, attendees, categories, deps.now());
  };

  r.get(
    '/registrations/manage',
    ah(async (req, res) => {
      const { reg, event } = await loadOwned(req);
      res.set('Cache-Control', 'no-store').json({ registration: await ownerView(event, reg._id), csrfToken: ensureCsrfToken(req.session) });
    }),
  );

  r.post('/registrations/manage/logout', requireCsrf, (req, res) => {
    delete req.session.owner;
    res.status(204).end();
  });

  const assertOwnerCanEdit = (event: EventDoc, publicId: string, ownedId: string) => {
    if (publicId !== ownedId) throw notFound('Registration');
    if (deps.now() >= ownerEditDeadline(event)) {
      throw new HttpError(422, 'edit_window_closed', 'Online changes are closed. Please contact the organizers.');
    }
  };

  r.patch(
    '/registrations/:publicId',
    requireCsrf,
    ah(async (req, res) => {
      const { reg, event } = await loadOwned(req);
      assertOwnerCanEdit(event, String(req.params.publicId), reg.publicId);
      const body = parse(registrationUpdateSchema, req.body);
      await withTransaction((session) =>
        updateRegistration(
          { event, registrationId: reg._id, body, actor: { type: 'owner', id: reg.publicId }, requestId: req.requestId, allowContactChange: false, notify: true },
          session,
        ),
      );
      const view = await ownerView(event, reg._id);
      const attendees = await Attendee.find({ registrationId: reg._id, status: 'active' }).lean();
      flagPossibleDuplicates(event, (await Registration.findById(reg._id).lean())!, attendees).catch(() => undefined);
      res.json({ registration: view });
    }),
  );

  r.post(
    '/registrations/:publicId/cancel',
    requireCsrf,
    ah(async (req, res) => {
      const { reg, event } = await loadOwned(req);
      assertOwnerCanEdit(event, String(req.params.publicId), reg.publicId);
      const body = parse(registrationCancelSchema, req.body);
      await withTransaction((session) =>
        cancelRegistration(
          { event, registrationId: reg._id, revision: body.revision, reason: body.reason, actor: { type: 'owner', id: reg.publicId }, requestId: req.requestId, notify: true },
          session,
        ),
      );
      res.json({ registration: await ownerView(event, reg._id) });
    }),
  );

  return r;
}
