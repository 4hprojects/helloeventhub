import type { SnapshotDto } from '@heh/contracts';
import { DuplicateFlag, HeadcountSnapshot, type EventDoc, type SnapshotDoc } from '../db/models.js';
import { HttpError } from '../lib/errors.js';
import { audit, type Actor } from './audit.js';
import { computeHeadcount } from './headcount.js';

export const SNAPSHOT_POLICY =
  'v1: attendees listed on active registrations created at or before the cutoff; reflects edits made up to the capture time. Representatives count only if listed.';

export interface CaptureInput {
  event: EventDoc;
  cutoffAt: Date;
  idempotencyKey: string;
  label: string;
  capturedBy: string;
  actor: Actor;
  amendsSnapshotId?: string;
  amendmentReason?: string;
  requestId?: string;
  now: Date;
}

/** Append-only, idempotent capture. Re-sending the same key returns the original snapshot unchanged. */
export async function captureSnapshot(input: CaptureInput): Promise<{ snapshot: SnapshotDoc; created: boolean }> {
  const { event } = input;
  const existing = await HeadcountSnapshot.findOne({ eventId: event._id, idempotencyKey: input.idempotencyKey }).lean();
  if (existing) return { snapshot: existing as SnapshotDoc, created: false };
  if (input.amendsSnapshotId) {
    const original = await HeadcountSnapshot.exists({ eventId: event._id, publicId: input.amendsSnapshotId });
    if (!original) throw new HttpError(422, 'validation_failed', 'The snapshot being amended was not found.', { amendsSnapshotId: ['Not found'] });
    if (!input.amendmentReason) throw new HttpError(422, 'validation_failed', 'Explain why this snapshot amends the earlier one.', { amendmentReason: ['Required for an amendment'] });
  }
  if (input.cutoffAt > input.now) throw new HttpError(422, 'validation_failed', 'The cutoff cannot be in the future.', { cutoffAt: ['Must not be in the future'] });
  const [{ totals, byCategory }, unresolvedDuplicateFlags] = await Promise.all([
    computeHeadcount(event._id, { createdAtOrBefore: input.cutoffAt }),
    DuplicateFlag.countDocuments({ eventId: event._id, status: 'open' }),
  ]);
  try {
    const [doc] = await HeadcountSnapshot.create([
      {
        organizationId: event.organizationId,
        eventId: event._id,
        label: input.label,
        cutoffAt: input.cutoffAt,
        capturedAt: input.now,
        capturedBy: input.capturedBy,
        totals,
        byCategory,
        unresolvedDuplicateFlags,
        policy: SNAPSHOT_POLICY,
        filters: { createdAtOrBefore: input.cutoffAt.toISOString(), registrationStatus: 'active' },
        schemaVersion: 1,
        idempotencyKey: input.idempotencyKey,
        amendsSnapshotId: input.amendsSnapshotId,
        amendmentReason: input.amendmentReason,
      },
    ]);
    await audit({
      organizationId: event.organizationId,
      eventId: event._id,
      actor: input.actor,
      action: input.amendsSnapshotId ? 'snapshot.amended' : 'snapshot.captured',
      subjectType: 'snapshot',
      subjectId: doc!.publicId,
      metadata: { cutoffAt: input.cutoffAt.toISOString(), potential: totals.potential },
      requestId: input.requestId,
    });
    return { snapshot: doc!.toObject() as SnapshotDoc, created: true };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const again = await HeadcountSnapshot.findOne({ eventId: event._id, idempotencyKey: input.idempotencyKey }).lean();
      if (again) return { snapshot: again as SnapshotDoc, created: false };
    }
    throw err;
  }
}

export function snapshotDto(s: SnapshotDoc): SnapshotDto {
  return {
    id: s.publicId,
    label: s.label,
    cutoffAt: s.cutoffAt.toISOString(),
    capturedAt: s.capturedAt.toISOString(),
    capturedBy: s.capturedBy,
    totals: s.totals as SnapshotDto['totals'],
    byCategory: (s.byCategory ?? []).map((c) => ({
      categoryId: c.categoryId ?? null,
      label: c.label ?? '',
      confirmed: c.confirmed ?? 0,
      tentative: c.tentative ?? 0,
      declined: c.declined ?? 0,
      potential: c.potential ?? 0,
    })),
    unresolvedDuplicateFlags: s.unresolvedDuplicateFlags,
    policy: s.policy,
    schemaVersion: s.schemaVersion,
    amendsSnapshotId: s.amendsSnapshotId ?? null,
    amendmentReason: s.amendmentReason ?? null,
  };
}

export const autoSnapshotKey = (event: EventDoc) => `auto:${event.preregSnapshotAt!.toISOString()}`;
