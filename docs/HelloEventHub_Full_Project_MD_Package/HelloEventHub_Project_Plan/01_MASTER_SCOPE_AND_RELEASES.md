# 01 | Master scope, roles and release boundaries

## Product statement
HelloEventHub is a scalable event-registration and management platform. The first use case is the Menay Bugtong–Wakat Alsem clan reunion. Product branding remains HelloEventHub; each event can later have its own branding. The domain is `helloeventhub.online` (domain control, DNS and certificates require verification).

## Fixed dates (Asia/Manila)
- October 15: **target**, not guaranteed, public registration launch; ship earlier if verified.
- October 20: capture headcount planning snapshot. Exact cutoff hour TBD. Snapshot does not intrinsically imply registration closure.
- October 23: complete onsite committee rehearsal, exports and backups.
- October 24: onsite registration starts 08:00; program 09:00–15:00; late check-ins supported as organizer permits.

## Roles
- **Public/participant:** View unlisted event URL, register without account, receive reference, request legitimate updates.
- **Committee:** Authenticated, event-scoped attendee search, manual updates and check-in, limited export only when permitted.
- **Event admin:** Event configuration, approvals, dashboard, exports, snapshots, access grants.
- **Platform admin:** Organization provisioning, overall operational controls; strictly separate from event data access.

## P0 online preregistration | Critical
- Event detail page with date/time and editable venue and details.
- Household or individual registration; representative contact via email, mobile or Messenger; **at least one** required.
- Per-person name, adult/child category and RSVP (`confirmed`, `tentative`, `declined`). Representative not implicitly included.
- Optional event-specific family branch: the organizer-supplied numbered Albin–Denio branch/couple labels, plus Other/Unsure. These labels are stored per event and remain admin-editable.
- Privacy acknowledgment, backend validation, spam protection and idempotent submission.
- Persist data; display non-secret reference and brief summary. Send email via Resend only where verified/supplied as appropriate; never block successful submission on email availability.
- Verified email-based self-service management or authorized committee-assisted edits for other contacts. No insecure lookup by reference alone.
- Restricted admin login, search, view, edit/cancel, core headcount. Log changes.

## P0.5 before Oct 20 | Required for logistics
- CSV/XLSX exports, branch breakdown, adult/child totals, duplicate review queue.
- Immutable headcount snapshots storing filter criteria, totals, created-by and cutoff time. Late changes appear in live counts, not historical snapshot.
- Delivery-failure view and resend action for authorized staff.

## P1 by Oct 23 rehearsal | Event critical
- Prefer tested local Node.js + SQLite venue server and shared Wi-Fi for up to 5 committee devices, usable without upstream internet.
- Search and check in attendees, register walk-ins, local backup, sync log. QR scanning optional after manual lookup reliably works.
- Printed lists and manual paper check-in as last-resort fallback.
- Device-only IndexedDB queue is **stretch** unless fully implemented and tested; don't claim it automatically follows from installable PWA.

## Deliberately deferred
Payment tracking, genealogical tree, photo gallery, subscriptions, organization self-onboarding, ticket purchasing, SMS/Messenger automation, custom registration form builder, advanced event discovery, full public SaaS.

## Definition of done
P0: verified live form and headcount + email fallback + secure admin. P0.5: trusted export and Oct 20 snapshot. P1: committee can record attendance at the venue with no public internet and recover after interruptions.
