# 03 | MongoDB schema design and invariants

## Conventions
Use MongoDB `_id` internally and externally stable opaque UUID/ULID (`publicId`), indexed unique. All mutable records have `createdAt`, `updatedAt`, integer `revision`, and event/org scoping. Times in UTC with event timezone `Asia/Manila`. Use ISO timestamps, no bare local clock strings for storage.

## Collections

### organizations
`_id`, `publicId`, `slug` (unique), `name`, `status`, `settings`, timestamps.

### events
`_id`, `publicId`, `organizationId`, `slug`, `title`, `description`, `venueName?`, `venueAddress?`, `startsAt`, `endsAt`, `onsiteRegistrationStartsAt`, `timezone`, `preregSnapshotAt?`, `registrationOpensAt?`, `registrationClosesAt?`, `allowLateRegistration` (policy TBD), `registrationStatus`, `capacity?`, `status`, `contactInfo`, timestamps, `revision`. Unique `{organizationId, slug}`.

### event_categories
`_id`, `eventId`, `organizationId`, `label`, `sortOrder`, `active`, `provisional`, timestamps. Unique `{eventId, labelNormalized}`. Seed historical branches and `Other/Unsure` as editable, not permanently hardcoded.

### registrations
`_id`, `publicId`, `reference` (unique per event and random or non-enumerable), `organizationId`, `eventId`, `representativeName`, `contacts: {email?, mobile?, messengerDisplayName?, messengerProfileUrl?, preferred}`, `eventCategoryId?`, `notes?`, `status: active|cancelled`, `source: public|committee|venue`, `consent: {version, acceptedAt, purpose}`, `manageTokenHash?`, `manageTokenExpiry?`, `emailVerifiedAt?`, `createdAt`, `updatedAt`, `revision`. Never store tokens in plaintext. Normalized contact search fields restricted and encrypted/hashed where useful.

### attendees
`_id`, `publicId`, `organizationId`, `eventId`, `registrationId`, `fullName`, `normalizedName`, `ageCategory: adult|child`, `rsvp: confirmed|tentative|declined`, `categoryId?`, `notes?`, `status: active|removed`, `checkedInAt?` (derived from check-ins in P1), `createdAt`, `updatedAt`, `revision`. Do not require birthdate; age boundary must be organizer-configurable or clearly disclosed.

### admin_users / memberships
Users: `email`, passwordHash or SSO ID, status, credential metadata, timestamps. Memberships: `userId`, `organizationId`, `eventId?`, `role: platform_admin|event_admin|committee`, capabilities. Enforce event scoping on every query.

### email_jobs
`_id`, `eventId`, `registrationId`, `type`, `recipient`, `status: queued|sending|sent|failed|suppressed`, `attempts`, `nextAttemptAt`, `providerMessageId?`, `lastErrorCode?`, `createdAt`, `updatedAt`. Do not place secret manage links in generic logs.

### audit_logs
`_id`, `organizationId`, `eventId`, `actorType`, `actorId?`, `action`, `subjectType`, `subjectId`, `timestamp`, `metadata` (redacted/minimized), `requestId`.

### headcount_snapshots
`_id`, `eventId`, `organizationId`, `cutoffAt`, `capturedAt`, `capturedBy`, `totals: {confirmed, tentative, declined, adultsConfirmed, childrenConfirmed, activeRegistrations, potential}`, `byCategory`, `unresolvedDuplicateFlags`, `policy`, `schemaVersion`. Append-only; corrections create a separate adjusted snapshot, never overwrite original.

### duplicate_review_flags
`_id`, `eventId`, `attendeeIds`, `reason`, `status: open|not_duplicate|resolved`, `reviewedBy?`, `resolution?`. Never auto-merge by same name.

### submission_keys
`_id`, `eventId`, `idempotencyKeyHash`, `requestHash`, `registrationId`, `expiresAt`. TTL cleanup. Repeating same key/request returns prior result; different payload with same key yields conflict.

## Invariants
- Representative does not count unless a separate attendee record exists.
- Active counted attendee belongs to exactly one active registration for counts; duplicate *possibilities* remain flagged, not silently merged.
- Count confirmed/tentative/declined only from active attendee records in active registrations; invalid/cancelled/removed excluded.
- `potential = confirmed + tentative` only.
- No public attendee listing or contact leakage.
- Count endpoint uses DB aggregation, never client-submitted household total.
- Update/cancel uses revision checks (`If-Match` or expected revision) and atomic validation.
- Event-scoped unique indexes for `{eventId, publicId}`, registration references and efficient filtered pagination.
- Keep personal data separate from future `persons` genealogy collection; linkage is optional and verified.

## Backups and retention
Encrypted automated Atlas backups where available, tested restoration, limited operational staff access. Define retention/deletion policy before go-live; preserve only minimally necessary audit and financial-free data. Do not delete registration records from the database simply because a public link was canceled; use policy-driven retention and restricted access.
