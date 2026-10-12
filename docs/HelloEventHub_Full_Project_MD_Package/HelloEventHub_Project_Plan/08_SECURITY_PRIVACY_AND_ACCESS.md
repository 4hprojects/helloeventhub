# 08 | Security, privacy, authorization and audit requirements

## Threat model
Anonymous form spam, duplicate injection, registration enumeration, brute-force admin login, insecure management links, PII leaked in exports, cross-event data access, MongoDB injection, XSS, CSRF, malicious spreadsheet formulas, local-device theft and offline sync replay.

## Controls required before P0
- TLS/HTTPS; strict server-side Zod validation with lengths, allowlists, limits on attendee count and request sizes.
- Cloudflare Turnstile server verification + IP/account/event-based rate limits, with fallback plan if Turnstile service unavailable.
- Secure server-managed admin sessions, `HttpOnly`, `Secure`, `SameSite` cookies; strong password hashing and account lockout/throttling.
- Event-scoped RBAC enforced in API (not solely UI).
- CSRF controls for session-authenticated mutations, CORS origin allowlist, security headers and content security policy.
- Never use registration reference alone as a bearer credential; short-lived verified email management grants; audit committee changes.
- Restrict enumeration: generic account-recovery response, short error messages, unpredictable IDs and optional rate-limit escalation.
- Sanitize outputs; escape content in emails and UI. Formula neutralization for exported spreadsheet cells.
- Store secrets and MongoDB URI only in backend protected variables. Avoid unnecessary PII in logs, analytics and error reports.

## Personal data and consent
Only collect data necessary for event logistics: name, adult/child category, RSVP, contact route, branch. Avoid collecting exact birthdates for children. Provide privacy notice covering controller/organizer, purposes, recipients, retention, correction/deletion contact and cross-border processors where relevant. Align with Philippine Data Privacy Act and review operational requirements with responsible organizers. Consent logs include notice version and timestamp; avoid describing checkbox consent as the only lawful basis in all situations.

## Admin role matrix
- `committee`: event-scoped search/check-in and limited corrections; no platform settings, no full contact export by default.
- `event_admin`: event setup, reports, staff rights, snapshots, corrections.
- `platform_admin`: provisions organizations, not automatic blanket access to private event details without operational justification and audits.

## Offline privacy P1
Preload minimal event dataset to approved devices. Password/PIN plus authenticated user session or controlled secure operator login; encrypted laptop disk and backups. Revocable device access once connectivity resumes, short session limits, device inventory. Browser IndexedDB isn't automatically encrypted at rest; consider device-level encryption and avoid storing unnecessary contacts on phones. Establish post-event deletion after cloud reconciliation and retention confirmation.

## Incidents
Document incident response owner, disable-access process, backup/restore, breach reporting assessment, and contact path. Keep a safe deployment rollback plan.
