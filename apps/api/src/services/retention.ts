import type { Types } from 'mongoose';
import {
  Attendee,
  Checkin,
  DuplicateFlag,
  EmailJob,
  Registration,
  SubmissionKey,
  SyncOperation,
  type EventDoc,
} from '../db/models.js';
import { audit } from './audit.js';

export type RetentionMode = 'anonymize' | 'delete';

export interface RetentionReport {
  mode: RetentionMode;
  dryRun: boolean;
  registrations: number;
  attendees: number;
  emailJobs: number;
  duplicateFlags: number;
  submissionKeys: number;
  checkins: number;
  syncOperations: number;
}

/**
 * Post-event data minimization (doc 08). Headcount snapshots and audit logs (which hold no contact
 * values) are always kept, so historical totals remain available.
 *  - anonymize: keep records and counts, replace names/contacts/free text with placeholders
 *  - delete:    remove registrations, attendees, check-ins and related operational records
 */
export async function applyRetention(event: EventDoc, mode: RetentionMode, opts: { dryRun: boolean; actorId: string; now?: Date }): Promise<RetentionReport> {
  const eventId = event._id as Types.ObjectId;
  const f = { eventId };
  const report: RetentionReport = {
    mode,
    dryRun: opts.dryRun,
    registrations: await Registration.countDocuments(f),
    attendees: await Attendee.countDocuments(f),
    emailJobs: await EmailJob.countDocuments(f),
    duplicateFlags: await DuplicateFlag.countDocuments(f),
    submissionKeys: await SubmissionKey.countDocuments(f),
    checkins: mode === 'delete' ? await Checkin.countDocuments(f) : 0,
    syncOperations: mode === 'delete' ? await SyncOperation.countDocuments(f) : 0,
  };
  if (opts.dryRun) return report;

  // Records that contain contact data or free text are removed in both modes.
  await EmailJob.deleteMany(f);
  await DuplicateFlag.deleteMany(f);
  await SubmissionKey.deleteMany(f);

  if (mode === 'anonymize') {
    await Registration.updateMany(f, {
      $set: { representativeName: 'Anonymized household', representativeNameNormalized: '' },
      $unset: {
        representativeNameParts: 1,
        'contacts.email': 1,
        'contacts.emailNormalized': 1,
        'contacts.mobile': 1,
        'contacts.messengerDisplayName': 1,
        'contacts.messengerProfileUrl': 1,
        notes: 1,
        noAttendeesReason: 1,
        cancellationReason: 1,
        manageTokenHash: 1,
        manageTokenExpiry: 1,
      },
    });
    await Attendee.updateMany(f, { $set: { fullName: 'Attendee', normalizedName: '' }, $unset: { nameParts: 1, notes: 1, venueTempId: 1 } });
  } else {
    await Registration.deleteMany(f);
    await Attendee.deleteMany(f);
    await Checkin.deleteMany(f);
    await SyncOperation.deleteMany(f);
  }
  await audit({
    organizationId: event.organizationId,
    eventId,
    actor: { type: 'admin', id: opts.actorId },
    action: `retention.${mode}`,
    subjectType: 'event',
    subjectId: event.publicId,
    metadata: { ...report, dryRun: false },
  });
  return report;
}
