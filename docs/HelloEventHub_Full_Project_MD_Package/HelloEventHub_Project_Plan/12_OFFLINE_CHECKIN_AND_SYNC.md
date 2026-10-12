# 12 | P1 offline local operations and synchronization

## Scope
Registration committee of 1–5; Oct 24 onsite check-in at 08:00, event 09:00–15:00. Internet may be unavailable. Objective: **continue critical check-in without public internet**. Build after P0 cloud fundamentals but test architecture early.

## Recommended architecture
Central cloud MongoDB authoritative for registrations before event. Onsite Node.js venue server + SQLite and local Wi-Fi acts as a shared operational authority for attendance when cloud unreachable. Restricted attendee dataset preloaded before event. Committee uses browsers on trusted devices. Optional device-only IndexedDB queue requires separate testing and is not guaranteed by basic PWA caching.

## Preload export
Use secure authorized server-to-server transfer of event-safe attendee data. Include `eventId`, `attendeeId`, `registrationId`, reference, display full name, RSVP, branch, revision, roster snapshot version and checksum. Exclude unneeded mobile, email, Messenger, private genealogy, and exact DOB. Verify the roster corresponds to event and is complete before going offline. Rotate credentials and encrypt local backups.

## SQLite local tables
- `venue_roster` attendee ID, registration ID, name, branch, RSVP, server revision, active flag.
- `checkin_operations` unique op ID, attendee ID, device ID, operator ID, localTime, acceptedServerTime?, status, result, sync metadata.
- `walkin_operations` op ID, synthetic attendee ID, name, category, registration group, status.
- `sync_state` last cloud cursor, last sync time, pending, failed, conflict count.
- `local_operator_sessions` scoped credentials, expiry and role (security design reviewed before implementation).

## Check-in transaction
Validate current registration/attendee active status and event. Use SQLite unique constraint on successful check-in for event + attendee to stop duplicate local acceptance across devices. Return `already_checked_in` with previous accepted time, not a second count. Record all attempts if required for audit. Idempotent op ID prevents double write on retry.

## Walk-ins
Create local temporary unique attendee IDs, associate to temporary registration, flag new records for cloud reconciliation. Avoid matching by name alone. Contact method should be optional at venue based on organizer policy, minimizing PII. Distinguish late preregistration vs physically present walk-in.

## Cloud synchronization
Batch push operations with stable IDs, event and device authorization, signed/validated payloads, sequence/revision, per-op result. Pull delta snapshots with monotonic cursor, handle retries and pagination. Outcomes: `accepted`, `already_applied`, `rejected`, `needs_review`. Store durable pending queue before acknowledging UI success. Reconcile duplicate cloud check-ins deterministically; audit conflicts. Device time is evidence, not source of authoritative order. Never blindly last-write-wins on attendee identity or status.

## Connectivity states
- Cloud connected: current data and sync.
- Venue LAN connected, internet down: local coordinated check-ins.
- Disconnected device: only locally queued operations **if separately implemented, authenticated and tested**; otherwise clear offline unavailable UI and use printed fallback.

## Browser security and limitations
Browsers commonly require secure contexts for camera and service workers. Validate HTTPS local hostname/certificate trust on actual Android/iOS/laptop devices. Plain local HTTP may not support camera/installed PWA. QR codes contain opaque short-lived or revocable identity credentials, not PII. Manual lookup is the acceptance minimum.

## Event-day operating plan
- Before event: sync roster, checksum, export offline backup, power test, label stations, rehearse.
- During: local server as primary if WAN absent; monitor pending sync; duplicate attempts shown clearly.
- Failure: one main laptop or printed lists, log station/time and reconcile later.
- After: cloud sync to zero unresolved pending (or documented exception), produce actual attendance, sign off, then securely remove venue copies according to retention policy.

## P1 exit criteria
Simulated WAN outage with two devices, duplicated operations, restart, local router interruption, cloud recovery, conflict injection and backup restore; documented attendee totals unchanged across replays. If these cannot be completed, operate with tested main-laptop manual check-in and paper fallback and explicitly mark multi-device offline as not shipped.
