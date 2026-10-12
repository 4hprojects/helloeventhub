import type { AppDeps } from '../app-deps.js';
import { Event, HeadcountSnapshot } from '../db/models.js';
import { autoSnapshotKey, captureSnapshot } from './snapshots.js';

export const schedulerStatus: { lastRunAt: Date | null; lastError: string | null } = { lastRunAt: null, lastError: null };

/** Capture the planning headcount automatically once an event's cutoff passes (idempotent across instances). */
export async function runAutoSnapshots(deps: Pick<AppDeps, 'logger' | 'now'>): Promise<number> {
  const now = deps.now();
  const due = await Event.find({ status: 'published', preregSnapshotAt: { $lte: now } }).lean();
  let captured = 0;
  for (const event of due) {
    const key = autoSnapshotKey(event);
    if (await HeadcountSnapshot.exists({ eventId: event._id, idempotencyKey: key })) continue;
    const { created } = await captureSnapshot({
      event,
      cutoffAt: event.preregSnapshotAt!,
      idempotencyKey: key,
      label: 'Planning headcount (automatic at cutoff)',
      capturedBy: 'system',
      actor: { type: 'system' },
      now,
    });
    if (created) {
      captured++;
      deps.logger.info({ eventId: event.publicId }, 'automatic headcount snapshot captured');
    }
  }
  return captured;
}

export function startScheduler(deps: AppDeps, intervalMs = 60_000): () => void {
  const tick = () =>
    runAutoSnapshots(deps)
      .then(() => {
        schedulerStatus.lastRunAt = deps.now();
        schedulerStatus.lastError = null;
      })
      .catch((err) => {
        schedulerStatus.lastError = (err as Error).message;
        deps.logger.error({ err: { message: (err as Error).message } }, 'scheduler tick failed');
      });
  const handle = setInterval(tick, intervalMs);
  void tick();
  return () => clearInterval(handle);
}
