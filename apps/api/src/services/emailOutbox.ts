import type { ClientSession, Types } from 'mongoose';
import type { EmailJobType } from '@heh/contracts';
import { Attendee, EmailJob, Event, Registration } from '../db/models.js';
import { seal, unseal } from '../lib/crypto.js';
import type { Logger } from '../lib/logger.js';
import { renderEmail } from './emailTemplates.js';
import { EmailSendError, type EmailTransport } from './emailTransport.js';

export const MAX_EMAIL_ATTEMPTS = 6;

export interface EnqueueInput {
  eventId: Types.ObjectId;
  registrationId: Types.ObjectId;
  type: EmailJobType;
  recipient: string;
  /** Dedupe key suffix, e.g. registration revision or a resend nonce. */
  dedupe: string;
  secret?: { sessionSecret: string; value: string };
  requestedBy?: string;
}

/** Insert an outbox job; silently ignores duplicates (same event/registration/type/revision). */
export async function enqueueEmail(input: EnqueueInput, session?: ClientSession): Promise<boolean> {
  const dedupeKey = `${input.eventId}:${input.registrationId}:${input.type}:${input.dedupe}`;
  try {
    await EmailJob.create(
      [
        {
          eventId: input.eventId,
          registrationId: input.registrationId,
          type: input.type,
          recipient: input.recipient,
          dedupeKey,
          sealedSecret: input.secret ? seal(input.secret.sessionSecret, input.secret.value) : undefined,
          requestedBy: input.requestedBy,
        },
      ],
      { session },
    );
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

export interface WorkerDeps {
  transport: EmailTransport;
  logger: Logger;
  appBaseUrl: string;
  sessionSecret: string;
  now?: () => Date;
}

const LOCK_MS = 2 * 60 * 1000;

function backoffMs(attempt: number) {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** (attempt - 1));
}

/** Claim and process up to `batch` due jobs. Safe to run concurrently in multiple processes. */
export async function processEmailBatch(deps: WorkerDeps, batch = 10): Promise<number> {
  const now = deps.now?.() ?? new Date();
  let processed = 0;
  for (let i = 0; i < batch; i++) {
    const job = await EmailJob.findOneAndUpdate(
      {
        $or: [
          { status: 'queued', nextAttemptAt: { $lte: now } },
          { status: 'sending', lockedUntil: { $lte: now } },
        ],
      },
      { $set: { status: 'sending', lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1 }, new: true },
    ).lean();
    if (!job) break;
    processed++;
    const log = deps.logger.child({ emailJobId: job.publicId, type: job.type });
    try {
      const [event, reg] = await Promise.all([Event.findById(job.eventId).lean(), Registration.findById(job.registrationId).lean()]);
      if (!event || !reg) {
        await EmailJob.updateOne({ _id: job._id }, { $set: { status: 'suppressed', lastErrorCode: 'subject_missing' }, $unset: { sealedSecret: 1, lockedUntil: 1 } });
        continue;
      }
      if (reg.status === 'cancelled' && job.type !== 'registration_cancelled') {
        await EmailJob.updateOne({ _id: job._id }, { $set: { status: 'suppressed', lastErrorCode: 'registration_cancelled' }, $unset: { sealedSecret: 1, lockedUntil: 1 } });
        continue;
      }
      const attendees = await Attendee.find({ registrationId: reg._id, status: 'active' }).sort({ sortOrder: 1 }).lean();
      const manageToken = job.sealedSecret ? unseal(deps.sessionSecret, job.sealedSecret) : undefined;
      if (job.type === 'access_link' && !manageToken) {
        await EmailJob.updateOne({ _id: job._id }, { $set: { status: 'suppressed', lastErrorCode: 'secret_missing' }, $unset: { lockedUntil: 1 } });
        continue;
      }
      // Only the inbox owner sees this, so naming their earlier registrations reveals nothing to the submitter.
      const otherReferences =
        job.type === 'registration_confirmation' && reg.contacts?.emailNormalized
          ? (
              await Registration.find({
                eventId: reg.eventId,
                status: 'active',
                _id: { $ne: reg._id },
                createdAt: { $lt: reg.createdAt },
                'contacts.emailNormalized': reg.contacts.emailNormalized,
              })
                .sort({ createdAt: 1 })
                .limit(5)
                .select('reference')
                .lean()
            ).map((r) => r.reference)
          : [];
      const msg = renderEmail({ type: job.type, appBaseUrl: deps.appBaseUrl, event, registration: reg, attendees, manageToken, otherReferences });
      const { id } = await deps.transport.send({ to: job.recipient, ...msg, idempotencyKey: job.dedupeKey });
      await EmailJob.updateOne(
        { _id: job._id },
        { $set: { status: 'sent', providerMessageId: id }, $unset: { sealedSecret: 1, lockedUntil: 1, lastErrorCode: 1 } },
      );
      log.info({ attempts: job.attempts }, 'email sent');
    } catch (err) {
      const code = err instanceof EmailSendError ? err.code : 'internal_error';
      const permanent = err instanceof EmailSendError ? err.permanent : false;
      const giveUp = permanent || job.attempts >= MAX_EMAIL_ATTEMPTS;
      await EmailJob.updateOne(
        { _id: job._id },
        giveUp
          ? { $set: { status: 'failed', lastErrorCode: code }, $unset: { sealedSecret: 1, lockedUntil: 1 } }
          : { $set: { status: 'queued', lastErrorCode: code, nextAttemptAt: new Date(now.getTime() + backoffMs(job.attempts)) }, $unset: { lockedUntil: 1 } },
      );
      log.warn({ code, attempts: job.attempts, giveUp }, 'email send failed');
    }
  }
  return processed;
}

export const workerStatus: { running: boolean; lastTickAt: Date | null; lastError: string | null } = { running: false, lastTickAt: null, lastError: null };

export function startEmailWorker(deps: WorkerDeps, intervalMs = 5000): () => void {
  workerStatus.running = true;
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      while ((await processEmailBatch(deps)) > 0 && !stopped) {
        /* drain */
      }
      workerStatus.lastTickAt = new Date();
      workerStatus.lastError = null;
    } catch (err) {
      workerStatus.lastError = (err as Error).message;
      deps.logger.error({ err: { message: (err as Error).message } }, 'email worker tick failed');
    } finally {
      running = false;
    }
  };
  const handle = setInterval(tick, intervalMs);
  void tick();
  return () => {
    stopped = true;
    workerStatus.running = false;
    clearInterval(handle);
  };
}
