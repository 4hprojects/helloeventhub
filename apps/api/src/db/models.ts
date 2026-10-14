import mongoose, { Schema, type FlattenMaps, type InferSchemaType, type Types } from 'mongoose';
import {
  AGE_CATEGORIES,
  ATTENDEE_STATUSES,
  CONTACT_METHODS,
  DUPLICATE_FLAG_STATUSES,
  EMAIL_JOB_STATUSES,
  EMAIL_JOB_TYPES,
  EVENT_REGISTRATION_STATUSES,
  REGISTRATION_SOURCES,
  REGISTRATION_STATUSES,
  ROLES,
  RSVP_VALUES,
} from '@heh/contracts';
import { newPublicId } from '../lib/crypto.js';

const { ObjectId } = Schema.Types;
const publicId = { type: String, required: true, unique: true, default: newPublicId, immutable: true };
const revision = { type: Number, required: true, default: 0, min: 0 };
const opts = { timestamps: true, strict: 'throw' } as const;

// ---------------------------------------------------------------- organizations
const organizationSchema = new Schema(
  {
    publicId,
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    settings: { type: Schema.Types.Mixed, default: {} },
  },
  opts,
);

// ---------------------------------------------------------------- events
const eventSchema = new Schema(
  {
    publicId,
    organizationId: { type: ObjectId, required: true, ref: 'Organization' },
    slug: { type: String, required: true },
    title: { type: String, required: true },
    tagline: { type: String, default: '' },
    description: { type: String, default: '' },
    venueName: { type: String },
    venueAddress: { type: String },
    venueMapUrl: { type: String },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    onsiteRegistrationStartsAt: { type: Date, required: true },
    timezone: { type: String, required: true, default: 'Asia/Manila' },
    preregSnapshotAt: { type: Date },
    preregistrationDeadlineDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    registrationOpensAt: { type: Date },
    registrationClosesAt: { type: Date },
    selfServiceEditUntil: { type: Date },
    allowLateRegistration: { type: Boolean, default: true },
    registrationStatus: { type: String, enum: EVENT_REGISTRATION_STATUSES, default: 'draft' },
    capacity: { type: Number },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    contactInfo: {
      email: String,
      phone: String,
      messenger: String,
      note: String,
    },
    ageCategoryNote: { type: String, default: '' },
    privacyNotice: { type: String, default: '' },
    privacyNoticeApproved: { type: Boolean, default: false },
    consentVersion: { type: String, required: true, default: '2026-10-v2' },
    revision,
  },
  opts,
);
eventSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
// Public URLs are /events/:slug, so slugs are also globally unique.
eventSchema.index({ slug: 1 }, { unique: true });

// ---------------------------------------------------------------- event_categories
const eventCategorySchema = new Schema(
  {
    publicId,
    organizationId: { type: ObjectId, required: true },
    eventId: { type: ObjectId, required: true, ref: 'Event' },
    label: { type: String, required: true },
    labelNormalized: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    provisional: { type: Boolean, default: true },
  },
  opts,
);
eventCategorySchema.index({ eventId: 1, labelNormalized: 1 }, { unique: true });

// ---------------------------------------------------------------- registrations
const registrationSchema = new Schema(
  {
    publicId,
    reference: { type: String, required: true, immutable: true },
    organizationId: { type: ObjectId, required: true },
    eventId: { type: ObjectId, required: true, ref: 'Event' },
    representativeName: { type: String, required: true },
    representativeNameNormalized: { type: String, required: true },
    contacts: {
      email: String,
      emailNormalized: String,
      mobile: String, // E.164
      messengerDisplayName: String,
      messengerProfileUrl: String,
      // Venue walk-ins may have no contact at all (doc 12: minimize PII at the venue).
      preferred: {
        type: String,
        enum: CONTACT_METHODS,
        required: function (this: { source?: string }) {
          return this.source !== 'venue';
        },
      },
    },
    eventCategoryId: { type: ObjectId },
    /** Temporary venue group id for walk-in households (maps venue G-… ids to one registration). */
    venueGroupId: { type: String },
    noAttendeesReason: { type: String },
    notes: { type: String },
    status: { type: String, enum: REGISTRATION_STATUSES, default: 'active' },
    source: { type: String, enum: REGISTRATION_SOURCES, required: true },
    lateRegistration: { type: Boolean, default: false },
    botCheck: { type: String, enum: ['passed', 'unverified', 'staff', 'disabled'], required: true },
    consent: {
      version: { type: String, required: true },
      acceptedAt: { type: Date, required: true },
      purpose: { type: String, required: true },
      method: { type: String, enum: ['checkbox', 'staff_explained'], required: true },
    },
    manageTokenHash: { type: String },
    manageTokenExpiry: { type: Date },
    emailVerifiedAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
    createdByUserId: { type: ObjectId },
    revision,
  },
  opts,
);
registrationSchema.index({ eventId: 1, reference: 1 }, { unique: true });
registrationSchema.index({ eventId: 1, status: 1, createdAt: -1 });
registrationSchema.index({ eventId: 1, representativeNameNormalized: 1 });
registrationSchema.index({ eventId: 1, 'contacts.emailNormalized': 1 });
registrationSchema.index({ eventId: 1, 'contacts.mobile': 1 });
registrationSchema.index({ manageTokenHash: 1 }, { sparse: true });
registrationSchema.index(
  { eventId: 1, venueGroupId: 1 },
  { unique: true, partialFilterExpression: { venueGroupId: { $type: 'string' } } },
);

// ---------------------------------------------------------------- attendees
const attendeeSchema = new Schema(
  {
    publicId,
    organizationId: { type: ObjectId, required: true },
    eventId: { type: ObjectId, required: true },
    registrationId: { type: ObjectId, required: true, ref: 'Registration' },
    fullName: { type: String, required: true },
    normalizedName: { type: String, required: true },
    ageCategory: { type: String, enum: AGE_CATEGORIES, required: true },
    rsvp: { type: String, enum: RSVP_VALUES, required: true },
    categoryId: { type: ObjectId },
    notes: { type: String },
    status: { type: String, enum: ATTENDEE_STATUSES, default: 'active' },
    /** Denormalized for fast counts/sync; kept in step with the registration in the same transaction. */
    registrationActive: { type: Boolean, required: true, default: true },
    walkIn: { type: Boolean, default: false },
    /** Venue temporary id for walk-ins (W-…), kept for reconciliation. */
    venueTempId: { type: String },
    checkedInAt: { type: Date },
    sortOrder: { type: Number, default: 0 },
    revision,
  },
  opts,
);
attendeeSchema.index({ eventId: 1, registrationId: 1 });
attendeeSchema.index({ eventId: 1, normalizedName: 1 });
attendeeSchema.index({ eventId: 1, status: 1, registrationActive: 1 });
attendeeSchema.index({ eventId: 1, updatedAt: 1, _id: 1 });
attendeeSchema.index(
  { eventId: 1, venueTempId: 1 },
  { unique: true, partialFilterExpression: { venueTempId: { $type: 'string' } } },
);

// ---------------------------------------------------------------- admin_users / memberships
const adminUserSchema = new Schema(
  {
    publicId,
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
    /** Set for accounts created or reset with a temporary password; cleared on change. */
    mustChangePassword: { type: Boolean, default: false },
  },
  opts,
);

const membershipSchema = new Schema(
  {
    userId: { type: ObjectId, required: true, ref: 'AdminUser' },
    organizationId: { type: ObjectId, required: true },
    /** Null = organization-wide grant. */
    eventId: { type: ObjectId, default: null },
    role: { type: String, enum: ROLES, required: true },
    grantedBy: { type: String },
  },
  opts,
);
membershipSchema.index({ userId: 1, organizationId: 1, eventId: 1 }, { unique: true });

// ---------------------------------------------------------------- email_jobs
const emailJobSchema = new Schema(
  {
    publicId,
    eventId: { type: ObjectId, required: true },
    registrationId: { type: ObjectId },
    type: { type: String, enum: EMAIL_JOB_TYPES, required: true },
    recipient: { type: String, required: true },
    status: { type: String, enum: EMAIL_JOB_STATUSES, default: 'queued' },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: () => new Date() },
    lockedUntil: { type: Date },
    providerMessageId: { type: String },
    lastErrorCode: { type: String },
    /** Unique per (event, registration, type, revision) — or per resend request. */
    dedupeKey: { type: String, required: true, unique: true },
    /** Sealed short-lived secret (manage-link token). Removed once sent or failed. */
    sealedSecret: { type: String },
    requestedBy: { type: String },
  },
  opts,
);
emailJobSchema.index({ status: 1, nextAttemptAt: 1 });
emailJobSchema.index({ eventId: 1, status: 1, createdAt: -1 });

// ---------------------------------------------------------------- audit_logs
const auditLogSchema = new Schema(
  {
    organizationId: { type: ObjectId },
    eventId: { type: ObjectId },
    actorType: { type: String, enum: ['public', 'owner', 'admin', 'system', 'device'], required: true },
    actorId: { type: String },
    action: { type: String, required: true },
    subjectType: { type: String, required: true },
    subjectId: { type: String, required: true },
    timestamp: { type: Date, default: () => new Date(), immutable: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    requestId: { type: String },
  },
  { strict: 'throw' },
);
auditLogSchema.index({ eventId: 1, subjectId: 1, timestamp: -1 });
auditLogSchema.index({ eventId: 1, timestamp: -1 });

// ---------------------------------------------------------------- headcount_snapshots
const countBlock = {
  activeRegistrations: Number,
  confirmed: Number,
  tentative: Number,
  declined: Number,
  confirmedAdults: Number,
  confirmedChildren: Number,
  tentativeAdults: Number,
  tentativeChildren: Number,
  potential: Number,
};
const headcountSnapshotSchema = new Schema(
  {
    publicId,
    organizationId: { type: ObjectId, required: true },
    eventId: { type: ObjectId, required: true },
    label: { type: String, required: true },
    cutoffAt: { type: Date, required: true },
    capturedAt: { type: Date, required: true },
    capturedBy: { type: String, required: true },
    totals: countBlock,
    byCategory: [
      {
        _id: false,
        categoryId: String,
        label: String,
        confirmed: Number,
        tentative: Number,
        declined: Number,
        potential: Number,
      },
    ],
    unresolvedDuplicateFlags: { type: Number, required: true },
    policy: { type: String, required: true },
    filters: { type: Schema.Types.Mixed, default: {} },
    schemaVersion: { type: Number, required: true, default: 1 },
    idempotencyKey: { type: String, required: true },
    amendsSnapshotId: { type: String },
    amendmentReason: { type: String },
  },
  { strict: 'throw' },
);
headcountSnapshotSchema.index({ eventId: 1, idempotencyKey: 1 }, { unique: true });
headcountSnapshotSchema.index({ eventId: 1, capturedAt: -1 });
// Append-only: block every update path at the model layer.
for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const) {
  headcountSnapshotSchema.pre(op, function () {
    throw new Error('headcount_snapshots are append-only');
  });
}

// ---------------------------------------------------------------- duplicate_review_flags
const duplicateFlagSchema = new Schema(
  {
    publicId,
    organizationId: { type: ObjectId, required: true },
    eventId: { type: ObjectId, required: true },
    attendeeIds: [{ type: ObjectId }],
    registrationIds: [{ type: ObjectId }],
    reason: { type: String, required: true },
    matchKey: { type: String, required: true },
    status: { type: String, enum: DUPLICATE_FLAG_STATUSES, default: 'open' },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    resolution: { type: String },
  },
  opts,
);
duplicateFlagSchema.index({ eventId: 1, status: 1, createdAt: -1 });
duplicateFlagSchema.index({ eventId: 1, matchKey: 1 }, { unique: true });

// ---------------------------------------------------------------- submission_keys
const submissionKeySchema = new Schema(
  {
    eventId: { type: ObjectId, required: true },
    idempotencyKeyHash: { type: String, required: true },
    requestHash: { type: String, required: true },
    registrationId: { type: ObjectId, required: true },
    response: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { strict: 'throw', timestamps: true },
);
submissionKeySchema.index({ eventId: 1, idempotencyKeyHash: 1 }, { unique: true });
submissionKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ---------------------------------------------------------------- rate_limits (shared limiter store)
const rateLimitSchema = new Schema(
  {
    _id: { type: String },
    hits: { type: Number, required: true },
    resetAt: { type: Date, required: true },
  },
  { strict: 'throw', versionKey: false },
);
rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

// ---------------------------------------------------------------- P1: venue devices, check-ins, sync log
const venueDeviceSchema = new Schema(
  {
    publicId,
    organizationId: { type: ObjectId, required: true },
    eventId: { type: ObjectId, required: true },
    label: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    createdBy: { type: String, required: true },
    lastSeenAt: { type: Date },
  },
  opts,
);

const checkinSchema = new Schema(
  {
    publicId,
    organizationId: { type: ObjectId, required: true },
    eventId: { type: ObjectId, required: true },
    attendeeId: { type: ObjectId, required: true },
    /** Venue op id that produced this check-in (idempotency across retries). */
    opId: { type: String, required: true },
    deviceId: { type: String, required: true },
    operatorId: { type: String, required: true },
    deviceTime: { type: Date, required: true },
    acceptedAt: { type: Date, required: true },
  },
  { strict: 'throw', timestamps: true },
);
checkinSchema.index({ eventId: 1, attendeeId: 1 }, { unique: true });
checkinSchema.index({ eventId: 1, opId: 1 }, { unique: true });

const syncOperationSchema = new Schema(
  {
    eventId: { type: ObjectId, required: true },
    opId: { type: String, required: true },
    deviceId: { type: String, required: true },
    type: { type: String, required: true },
    result: {
      type: String,
      enum: ['accepted', 'already_applied', 'rejected', 'needs_review'],
      required: true,
    },
    detail: { type: Schema.Types.Mixed },
  },
  { strict: 'throw', timestamps: true },
);
syncOperationSchema.index({ eventId: 1, opId: 1 }, { unique: true });

// ---------------------------------------------------------------- models
export const Organization = mongoose.model('Organization', organizationSchema, 'organizations');
export const Event = mongoose.model('Event', eventSchema, 'events');
export const EventCategory = mongoose.model('EventCategory', eventCategorySchema, 'event_categories');
export const Registration = mongoose.model('Registration', registrationSchema, 'registrations');
export const Attendee = mongoose.model('Attendee', attendeeSchema, 'attendees');
export const AdminUser = mongoose.model('AdminUser', adminUserSchema, 'admin_users');
export const Membership = mongoose.model('Membership', membershipSchema, 'memberships');
export const EmailJob = mongoose.model('EmailJob', emailJobSchema, 'email_jobs');
export const AuditLog = mongoose.model('AuditLog', auditLogSchema, 'audit_logs');
export const HeadcountSnapshot = mongoose.model(
  'HeadcountSnapshot',
  headcountSnapshotSchema,
  'headcount_snapshots',
);
export const DuplicateFlag = mongoose.model('DuplicateFlag', duplicateFlagSchema, 'duplicate_review_flags');
export const SubmissionKey = mongoose.model('SubmissionKey', submissionKeySchema, 'submission_keys');
export const RateLimit = mongoose.model('RateLimit', rateLimitSchema, 'rate_limits');
export const VenueDevice = mongoose.model('VenueDevice', venueDeviceSchema, 'venue_devices');
export const Checkin = mongoose.model('Checkin', checkinSchema, 'checkins');
export const SyncOperation = mongoose.model('SyncOperation', syncOperationSchema, 'sync_operations');

export const ALL_MODELS = [
  Organization,
  Event,
  EventCategory,
  Registration,
  Attendee,
  AdminUser,
  Membership,
  EmailJob,
  AuditLog,
  HeadcountSnapshot,
  DuplicateFlag,
  SubmissionKey,
  RateLimit,
  VenueDevice,
  Checkin,
  SyncOperation,
];

type WithId<T> = FlattenMaps<T> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type EventDoc = WithId<InferSchemaType<typeof eventSchema>>;
export type RegistrationDoc = WithId<InferSchemaType<typeof registrationSchema>>;
export type AttendeeDoc = WithId<InferSchemaType<typeof attendeeSchema>>;
export type CategoryDoc = WithId<InferSchemaType<typeof eventCategorySchema>>;
export type AdminUserDoc = WithId<InferSchemaType<typeof adminUserSchema>>;
export type MembershipDoc = WithId<InferSchemaType<typeof membershipSchema>>;
export type EmailJobDoc = WithId<InferSchemaType<typeof emailJobSchema>>;
export type SnapshotDoc = FlattenMaps<InferSchemaType<typeof headcountSnapshotSchema>> & {
  _id: Types.ObjectId;
};
export type DuplicateFlagDoc = WithId<InferSchemaType<typeof duplicateFlagSchema>>;
