# 06 | Admin dashboard, exports and headcount snapshots

## Role-specific views
Committee: attendee search, registration inspection, allowed edits, support requests; event admin: complete dashboard, export, review duplicates, settings, snapshots. Restrict exports to designated roles to minimize exposure. Event-scoped query on every action.

## Dashboard tiles
- Active household registrations (forms)
- Confirmed individuals
- Tentative individuals
- Declined individuals
- Potential = confirmed + tentative
- Confirmed adults and children
- Counts by selected branch and Other/Unsure
- Recent submissions, registration updates, registrations flagged for possible duplicates
P1 adds check-ins, actual arrivals, walk-ins, last sync state.

## Count logic
Use aggregation over active attendee documents joined to active registrations, filtered by event. Count by **attendee** and status; never count representative unless attendee exists. Attendance is independently tracked from RSVP. Apply deterministic category fallback to avoid losing uncategorized attendees. Always display `asOf` timestamp in event timezone.

## Search and review
Search by normalized name, registration reference and representative (not a public endpoint). Filter by branch, RSVP, created date. Search results show minimal contact details by default. Provide edit history and explicit 'possible duplicate' flags. Same names are not sufficient to merge automatically.

## CSV export
Separate `registrations`, `attendees`, and `summary` reports with UTF-8 BOM if needed for Excel compatibility. Quote delimiters correctly. Defang formula-leading cells (`=`, `+`, `-`, `@`, tabs and line breaks as applicable) before spreadsheet rendering, preserving original data in database.

## XLSX export
Excel workbook: `Summary`, `Registrations`, `Attendees`, `Branches`, `RSVP Statistics`. Include official event title, generated timestamp, timezone, filters and count definitions. Auto-filters, frozen headers, appropriate widths, no unnecessary sensitive fields. Explicit date formatting. Validate count totals against dashboard fixtures.

## October 20 snapshot
Generate an append-only event-scoped snapshot at organizer-approved local cutoff time. Store aggregate totals, by-branch data, unresolved duplicate flag count, user, capture timestamp, schema/policy version. Should remain retrievable even if later registration edits change live numbers. If a correction to the planning snapshot is required, append an amended snapshot with reason, never overwrite.

## Operational exports
Allow a limited list for venue preloading (opaque attendee ID, name, branch, RSVP, status, reference) excluding email/mobile/Messenger unless justified. Encrypt and tightly control transfers. Record who exported what and when.

## Acceptance examples
- 2 registrations containing 6 attendees produce registrations=2, attendee count=6.
- Representative absent from attendee list does not count.
- After cancellation, associated active attendees excluded from live totals.
- Declined persons excluded from potential.
- Late changes after Oct 20 do not alter saved snapshot.
- CSV/XLSX exports reconcile to same filtered DB records.
