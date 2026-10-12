import { z } from 'zod';
import { AGE_CATEGORIES } from './enums.js';

/** Venue <-> cloud sync contracts (doc 12). */

export const SYNC_RESULTS = ['accepted', 'already_applied', 'rejected', 'needs_review'] as const;
export type SyncResult = (typeof SYNC_RESULTS)[number];

const opId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const isoTime = z.string().datetime({ offset: true });

export const syncCheckinOpSchema = z.object({
  opId,
  type: z.literal('checkin'),
  attendeeId: z.string().min(1).max(64),
  operatorId: z.string().min(1).max(64),
  deviceTime: isoTime,
});

export const syncWalkinOpSchema = z.object({
  opId,
  type: z.literal('walkin'),
  tempAttendeeId: z.string().regex(/^W-[0-9A-Z]{26}$/),
  groupId: z.string().regex(/^G-[0-9A-Z]{26}$/),
  groupName: z.string().trim().min(2).max(120),
  fullName: z.string().trim().min(2).max(120),
  ageCategory: z.enum(AGE_CATEGORIES),
  branchLabel: z.string().trim().max(80).optional(),
  contact: z.string().trim().max(120).optional(),
  checkedIn: z.boolean(),
  operatorId: z.string().min(1).max(64),
  deviceTime: isoTime,
});

/** Correct a preregistered person at the venue. Applied only if the cloud revision is unchanged. */
export const syncAttendeeUpdateOpSchema = z.object({
  opId,
  type: z.literal('attendee_update'),
  attendeeId: z.string().min(1).max(64),
  baseRevision: z.number().int().min(0),
  fullName: z.string().trim().min(2).max(120).optional(),
  ageCategory: z.enum(AGE_CATEGORIES).optional(),
  rsvp: z.enum(['confirmed', 'tentative', 'declined']).optional(),
  operatorId: z.string().min(1).max(64),
  deviceTime: isoTime,
});

/** Add an extra person to an existing (preregistered) household at the venue. */
export const syncAttendeeAddOpSchema = z.object({
  opId,
  type: z.literal('attendee_add'),
  tempAttendeeId: z.string().regex(/^W-[0-9A-Z]{26}$/),
  registrationId: z.string().min(1).max(64),
  fullName: z.string().trim().min(2).max(120),
  ageCategory: z.enum(AGE_CATEGORIES),
  checkedIn: z.boolean(),
  operatorId: z.string().min(1).max(64),
  deviceTime: isoTime,
});

/** Reverse a mistaken check-in that was already synced. */
export const syncCheckinUndoOpSchema = z.object({
  opId,
  type: z.literal('checkin_undo'),
  attendeeId: z.string().min(1).max(64),
  checkinOpId: z.string().min(1).max(80),
  reason: z.string().trim().max(200).optional(),
  operatorId: z.string().min(1).max(64),
  deviceTime: isoTime,
});

export const syncPushSchema = z.object({
  ops: z
    .array(z.discriminatedUnion('type', [syncCheckinOpSchema, syncWalkinOpSchema, syncAttendeeUpdateOpSchema, syncAttendeeAddOpSchema, syncCheckinUndoOpSchema]))
    .min(1)
    .max(200),
});
export type SyncPushInput = z.input<typeof syncPushSchema>;
export type SyncOp = z.output<typeof syncPushSchema>['ops'][number];

export interface SyncOpResult {
  opId: string;
  result: SyncResult;
  code?: string;
  /** For walk-ins: cloud identifiers to replace the temporary ones. */
  attendeeId?: string;
  registrationId?: string;
  reference?: string;
  /** For duplicate check-ins: when the first accepted check-in happened. */
  firstCheckedInAt?: string;
}

export interface SyncPushResponse {
  results: SyncOpResult[];
  serverTime: string;
}

export interface VenueRosterItem {
  attendeeId: string;
  registrationId: string;
  reference: string;
  fullName: string;
  ageCategory: 'adult' | 'child';
  branch: string;
  rsvp: 'confirmed' | 'tentative' | 'declined';
  representativeName: string;
  active: boolean;
  walkIn: boolean;
  revision: number;
  checkedInAt: string | null;
}

export interface SyncPullResponse {
  items: VenueRosterItem[];
  nextCursor: string;
  hasMore: boolean;
  serverTime: string;
}

export interface RosterSummary {
  activeCount: number;
  /** sha256 over sorted "attendeeId:revision" lines of active attendees. */
  checksum: string;
  serverTime: string;
}

/** Shared by cloud and venue so both compute the identical roster checksum input. */
export function rosterChecksumInput(items: Array<{ attendeeId: string; revision: number }>): string {
  return items
    .map((i) => `${i.attendeeId}:${i.revision}`)
    .sort()
    .join('\n');
}
