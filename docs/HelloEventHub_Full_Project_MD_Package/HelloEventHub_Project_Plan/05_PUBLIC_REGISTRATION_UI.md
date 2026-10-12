# 05 | Public UX and registration form

## Routes
`/`, `/events/:slug`, `/events/:slug/register`, `/registration/success`, `/registration/manage`, `/privacy`, `/contact`. Landing should link directly to live Alsem event; avoid spending preregistration time on advanced public event discovery.

## Event page
Show verified working title, location when organizer confirms it, Oct 24 date, 8:00 AM onsite registration, 9:00 AM–3:00 PM program, online registration status and help contacts. Never publish made-up venue or organizer numbers. Event slug stable. Link-only access, public form, no participant account. Countdown optional and not essential.

## Responsive registration steps
1. **Representative:** full name, at least one of email/PH mobile/Messenger. Preferred channel. Accessible labels and examples. For Messenger use user-supplied display name or profile URL; do not pretend Meta account is verified.
2. **Family classification:** select one of eight provisional ancestral branches or Other/Unsure; organizer can change labels in admin configuration.
3. **Attendees:** add/remove arbitrary people, full name, adult/child, per-person RSVP confirmed/tentative/declined. Option to explicitly add representative to attendees (unchecked default). If all household members decline, permit zero expected attendees with explicit reason/response.
4. **Review and consent:** display names, statuses, count and privacy link; make invalid fields obvious; provide edit navigation.
5. **Success:** reference, per-status totals, clear message about email only if email supplied, screenshot/print option. Warn that reference alone is not a private-management credential.

## Submission details
- Disable submit during request and use idempotency key to prevent double-click duplicate. Recover form safely after transient error without duplicate submission.
- Use client + server validation, show inline errors, preserve unsent form state only as necessary. Avoid storing PII unencrypted in shared-device localStorage.
- Normalize phone for display/validation, preserve human-readable entered names. Prefer no DOB collection.
- Accessible touch target sizes, keyboard navigation, visible focus, contrast, labels, screen-reader error summary and loading states.
- Avoid unnecessary account/login walls, images, lengthy animated loaders or complicated progress for a short form.

## Registration management
Email link verification for self-service; otherwise committee-assisted changes after appropriate identity check. Show who is attending and allow modifications before organizer-configured cutoff. Revising attendance should update live counts and send confirmation only where contact exists.

## Event-specific open content
Final event name, venue/directions, organizer contact, event description, onsite registration and late-registration policy. Store as event config, not hardcoded. Branding remains HelloEventHub; event banner can be added after P0.

## UI acceptance
Complete representative + 4 attendees on a typical Android device. Handles 1, 10, and 20 attendees without layout break. No horizontal overflow at 320px width. Tab/keyboard-only and screen-reader checks. Never use color alone to communicate status.
