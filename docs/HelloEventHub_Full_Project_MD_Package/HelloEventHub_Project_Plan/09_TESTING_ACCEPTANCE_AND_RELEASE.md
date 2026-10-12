# 09 | Test strategy, acceptance gates and event rehearsal

## Test pyramid
- Unit: validation, status transitions, headcount, reference generation, normalization, formula escaping, email outbox deduplication.
- Integration: MongoDB indexes, transactions/atomic updates, idempotency, access checks, snapshots, export queries, mail queue.
- E2E: Android-like viewport and desktop registration, admin login, report download, update and cancel, error and retry behavior.
- Security: unauthenticated admin endpoints, cross-event access, CSRF, brute-force controls, injection, forbidden export fields.
- Operations: HelloDeploy redeploy, restart, failure injection, MongoDB backup/restore; event-day connectivity failures P1.

## P0 gate checklist
- [ ] Organization + event seed available with editable title and venue; event times correct Asia/Manila.
- [ ] Public registration validates 1-20 attendees and alternative contact methods.
- [ ] Representative not automatically counted; per-person RSVP correct.
- [ ] Idempotent retry never creates duplicate registration.
- [ ] Admin authenticated and event scoping tested.
- [ ] Dashboard totals match attendee fixtures and cancellations.
- [ ] Secure management pathway; reference alone cannot retrieve private data.
- [ ] Resend confirmation when email given, reference always shown, provider failure nonblocking.
- [ ] Turnstile, rate limiting, validation, security headers and privacy page tested.
- [ ] Mobile, keyboard, accessibility, and error flows passed.
- [ ] Backups and recovery procedure tested.

## P0.5 gate
- [ ] Correct XLSX five-sheet export and CSV flattened export.
- [ ] Dangerous spreadsheet strings neutralized.
- [ ] Admin duplicate review available, no auto-merges.
- [ ] Snapshot stores October 20 point-in-time values and remains unchanged by later updates.
- [ ] Export permissions and audit verified.

## P1 event-day rehearsal no later than October 23
- [ ] Onsite router functions with WAN cable/unplugged (no internet).
- [ ] Two committee devices can authenticate/search/check in via local server.
- [ ] Duplicate scan/manual check-in does not add second attendance.
- [ ] Walk-ins and late RSVPs follow a documented workflow.
- [ ] Local server reboot retains data, backup verified.
- [ ] Cloud reconnection sync handles retry and conflict safely.
- [ ] QR scanning works on actual devices and local HTTPS if shipped; else manual lookup designated as primary.
- [ ] Printed attendee list, blank manual forms, reconciliation owner, backup power available.
- [ ] Final training completed, staff roles assigned.

## Release discipline
Feature freeze ahead of event. Capture production backup before releases. Smoke-test against production with non-real test identities, then delete securely. Log release version, responsible person, deployment time, rollback decision and results. Do not ship untested sync features into event-day production.
