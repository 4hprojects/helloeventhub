import { Router } from 'express';
import type { Types } from 'mongoose';
import {
  duplicateFlagUpdateSchema,
  emailJobQuerySchema,
  exportQuerySchema,
  maskEmail,
  snapshotCreateSchema,
  type DuplicateFlagDto,
  type EmailJobDto,
} from '@heh/contracts';
import type { AppDeps } from '../app-deps.js';
import { Attendee, DuplicateFlag, EmailJob, HeadcountSnapshot, Registration } from '../db/models.js';
import { randomToken } from '../lib/crypto.js';
import { HttpError, notFound } from '../lib/errors.js';
import { requireEventRole } from '../middleware/auth.js';
import { ah, parse } from '../middleware/core.js';
import { hitLimit } from '../middleware/rateLimit.js';
import { audit } from '../services/audit.js';
import { enqueueEmail } from '../services/emailOutbox.js';
import { workerStatus } from '../services/emailOutbox.js';
import { writeCsv, writeXlsx } from '../services/exports.js';
import { schedulerStatus } from '../services/scheduler.js';
import { dbState } from '../db/connect.js';
import { captureSnapshot, snapshotDto } from '../services/snapshots.js';
import { actorOf, ev, loadRegistration } from './admin.js';

/** P0.5: exports, duplicate review, email delivery status, headcount snapshots. Event admins only. */
export function reportRoutes(deps: AppDeps): Router {
  const r = Router();
  // requireCsrf + requireAdmin are applied once where the /admin routers are mounted (app.ts).
  const eventAdmin = requireEventRole('event_admin');

  // ------------------------------------------------------------ exports
  r.get(
    '/events/:eventId/exports',
    eventAdmin,
    ah(async (req, res) => {
      const event = ev(req);
      const q = parse(exportQuerySchema, req.query);
      const filters = { categoryId: q.categoryId, rsvp: q.rsvp, includeCancelled: q.includeCancelled === 'true' };
      const now = deps.now();
      const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const base = `${event.slug}-${q.format === 'xlsx' && q.view !== 'venue' ? 'report' : q.view}-${stamp}`;
      const filterLabel = [q.categoryId ? `branch=${q.categoryId}` : '', q.rsvp ? `rsvp=${q.rsvp}` : '', filters.includeCancelled ? 'including cancelled' : 'active only'].filter(Boolean).join(', ');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      let rows: number;
      if (q.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
        rows = await writeCsv(res, event, q.view, filters, now);
      } else {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
        rows = await writeXlsx(res, event, q.view, filters, now, filterLabel);
      }
      res.end();
      await audit({
        organizationId: event.organizationId,
        eventId: event._id,
        actor: actorOf(req),
        action: 'export.downloaded',
        subjectType: 'event',
        subjectId: event.publicId,
        metadata: { format: q.format, view: q.view, filters, rows },
        requestId: req.requestId,
      });
    }),
  );

  // ------------------------------------------------------------ duplicate review
  r.get(
    '/events/:eventId/duplicate-flags',
    eventAdmin,
    ah(async (req, res) => {
      const event = ev(req);
      const status = ['open', 'not_duplicate', 'resolved', 'all'].includes(String(req.query.status)) ? String(req.query.status) : 'open';
      const flags = await DuplicateFlag.find({ eventId: event._id, ...(status === 'all' ? {} : { status }) }).sort({ createdAt: -1 }).limit(200).lean();
      const attIds = flags.flatMap((f) => f.attendeeIds);
      const regIds = flags.flatMap((f) => f.registrationIds);
      const [atts, regs] = await Promise.all([
        Attendee.find({ _id: { $in: attIds } }).lean(),
        Registration.find({ _id: { $in: regIds } }).select('publicId reference representativeName status').lean(),
      ]);
      const attMap = new Map(atts.map((a) => [String(a._id), a]));
      const regMap = new Map(regs.map((x) => [String(x._id), x]));
      const items: Array<DuplicateFlagDto & { registrations: Array<{ id: string; reference: string; representativeName: string; status: string }> }> = flags.map((f) => ({
        id: f.publicId,
        reason: f.reason,
        status: f.status,
        createdAt: f.createdAt.toISOString(),
        reviewedBy: f.reviewedBy ?? null,
        resolution: f.resolution ?? null,
        attendees: f.attendeeIds
          .map((id) => attMap.get(String(id)))
          .filter((a): a is NonNullable<typeof a> => !!a)
          .map((a) => {
            const reg = regMap.get(String(a.registrationId));
            return { id: a.publicId, fullName: a.fullName, rsvp: a.rsvp, registrationId: reg?.publicId ?? '', reference: reg?.reference ?? '', representativeName: reg?.representativeName ?? '' };
          }),
        registrations: f.registrationIds
          .map((id) => regMap.get(String(id)))
          .filter((x): x is NonNullable<typeof x> => !!x)
          .map((x) => ({ id: x.publicId, reference: x.reference, representativeName: x.representativeName, status: x.status })),
      }));
      res.json({ items });
    }),
  );

  r.patch(
    '/events/:eventId/duplicate-flags/:flagId',
    eventAdmin,
    ah(async (req, res) => {
      const event = ev(req);
      const body = parse(duplicateFlagUpdateSchema, req.body);
      const flag = await DuplicateFlag.findOneAndUpdate(
        { eventId: event._id, publicId: req.params.flagId },
        { $set: { status: body.status, resolution: body.resolution, reviewedBy: req.admin!.publicId, reviewedAt: new Date() } },
        { new: true },
      ).lean();
      if (!flag) throw notFound('Flag');
      await audit({ organizationId: event.organizationId, eventId: event._id, actor: actorOf(req), action: 'duplicate.reviewed', subjectType: 'duplicate_flag', subjectId: flag.publicId, metadata: { status: body.status }, requestId: req.requestId });
      res.json({ id: flag.publicId, status: flag.status });
    }),
  );

  // ------------------------------------------------------------ email delivery
  r.get(
    '/events/:eventId/email-jobs',
    eventAdmin,
    ah(async (req, res) => {
      const event = ev(req);
      const q = parse(emailJobQuerySchema, req.query);
      const filter = { eventId: event._id, ...(q.status === 'all' ? {} : { status: q.status }) };
      const [total, jobs] = await Promise.all([
        EmailJob.countDocuments(filter),
        EmailJob.find(filter).sort({ updatedAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      ]);
      const regs = await Registration.find({ _id: { $in: jobs.map((j) => j.registrationId).filter(Boolean) } }).select('publicId reference').lean();
      const regMap = new Map(regs.map((x) => [String(x._id), x]));
      const items: EmailJobDto[] = jobs.map((j) => {
        const reg = j.registrationId ? regMap.get(String(j.registrationId)) : undefined;
        return {
          id: j.publicId,
          type: j.type,
          status: j.status,
          attempts: j.attempts,
          recipientMasked: maskEmail(j.recipient),
          registrationId: reg?.publicId ?? null,
          reference: reg?.reference ?? null,
          lastErrorCode: j.lastErrorCode ?? null,
          createdAt: j.createdAt.toISOString(),
          updatedAt: j.updatedAt.toISOString(),
        };
      });
      res.json({ items, total, page: q.page, limit: q.limit });
    }),
  );

  r.post(
    '/events/:eventId/registrations/:registrationId/email/resend',
    eventAdmin,
    ah(async (req, res) => {
      const reg = await loadRegistration(req);
      if (reg.status !== 'active') throw new HttpError(409, 'registration_cancelled', 'This registration is cancelled.');
      if (!reg.contacts?.email) throw new HttpError(422, 'no_email', 'This registration has no email address.');
      if (await hitLimit('resend', reg.publicId, 60 * 60 * 1000, 3)) {
        throw new HttpError(429, 'rate_limited', 'This confirmation was resent recently. Try again later.');
      }
      await enqueueEmail({
        eventId: reg.eventId as Types.ObjectId,
        registrationId: reg._id,
        type: 'registration_confirmation',
        recipient: reg.contacts.email,
        dedupe: `resend-${randomToken().slice(0, 12)}`,
        requestedBy: req.admin!.publicId,
      });
      await audit({ organizationId: reg.organizationId, eventId: reg.eventId, actor: actorOf(req), action: 'email.resend_requested', subjectType: 'registration', subjectId: reg.publicId, requestId: req.requestId });
      res.status(202).json({ queued: true });
    }),
  );

  r.post(
    '/events/:eventId/email-jobs/:jobId/retry',
    eventAdmin,
    ah(async (req, res) => {
      const event = ev(req);
      const job = await EmailJob.findOneAndUpdate(
        { eventId: event._id, publicId: req.params.jobId, status: 'failed', type: { $ne: 'access_link' } },
        { $set: { status: 'queued', attempts: 0, nextAttemptAt: new Date() }, $unset: { lastErrorCode: 1 } },
        { new: true },
      ).lean();
      if (!job) throw new HttpError(404, 'not_found', 'Failed email not found (manage links cannot be retried — ask the person to request a new one).');
      await audit({ organizationId: event.organizationId, eventId: event._id, actor: actorOf(req), action: 'email.retry', subjectType: 'email_job', subjectId: job.publicId, requestId: req.requestId });
      res.status(202).json({ queued: true });
    }),
  );

  // ------------------------------------------------------------ operations status
  r.get(
    '/events/:eventId/ops',
    eventAdmin,
    ah(async (req, res) => {
      const event = ev(req);
      const now = deps.now();
      const [queued, failed, stuck, oldest] = await Promise.all([
        EmailJob.countDocuments({ eventId: event._id, status: 'queued' }),
        EmailJob.countDocuments({ eventId: event._id, status: 'failed' }),
        EmailJob.countDocuments({ eventId: event._id, status: 'sending', lockedUntil: { $lt: now } }),
        EmailJob.findOne({ eventId: event._id, status: 'queued' }).sort({ createdAt: 1 }).select('createdAt').lean(),
      ]);
      res.json({
        version: deps.config.version,
        uptimeSeconds: Math.round(process.uptime()),
        db: dbState(),
        email: {
          configured: !!deps.config.RESEND_API_KEY || !deps.config.isProd,
          workerRunning: workerStatus.running,
          workerLastTickAt: workerStatus.lastTickAt?.toISOString() ?? null,
          workerLastError: workerStatus.lastError,
          queued,
          failed,
          stuck,
          oldestQueuedMinutes: oldest ? Math.round((now.getTime() - oldest.createdAt.getTime()) / 60000) : null,
        },
        scheduler: { lastRunAt: schedulerStatus.lastRunAt?.toISOString() ?? null, lastError: schedulerStatus.lastError },
      });
    }),
  );

  // ------------------------------------------------------------ snapshots
  r.get(
    '/events/:eventId/snapshots',
    eventAdmin,
    ah(async (req, res) => {
      const snaps = await HeadcountSnapshot.find({ eventId: ev(req)._id }).sort({ capturedAt: -1 }).lean();
      res.json({ items: snaps.map((s) => snapshotDto(s as never)) });
    }),
  );

  r.post(
    '/events/:eventId/snapshots',
    eventAdmin,
    ah(async (req, res) => {
      const body = parse(snapshotCreateSchema, req.body);
      const { snapshot, created } = await captureSnapshot({
        event: ev(req),
        cutoffAt: new Date(body.cutoffAt),
        idempotencyKey: `manual:${body.idempotencyKey}`,
        label: body.label,
        capturedBy: `${req.admin!.name} <${req.admin!.publicId}>`,
        actor: actorOf(req),
        amendsSnapshotId: body.amendsSnapshotId,
        amendmentReason: body.amendmentReason,
        requestId: req.requestId,
        now: deps.now(),
      });
      res.status(created ? 201 : 200).json(snapshotDto(snapshot));
    }),
  );

  return r;
}
