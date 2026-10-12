# 04 | REST API contracts (`/api/v1`)

## Cross-cutting rules
JSON over HTTPS. Zod validation, consistent error payload `{error:{code,message,requestId,fieldErrors?}}`, pagination with bounded `limit` (e.g. <= 100), sort allowlist, event/org authorization, structured request IDs. CSRF protection for session-authenticated writes, secure same-site cookies and CORS allowlist. Public creates require anti-bot and rate limiting. HTTP 409 for revision/idempotency conflicts; 422 invalid details; 401 unauthenticated; 403 unauthorized; 404 to avoid enumeration. API docs and test fixtures must match real implementation.

## Public
- `GET /events/:slug` returns published public details and editable event categories only. No private registration list.
- `POST /events/:eventPublicId/registrations` with header `Idempotency-Key`, Turnstile token, representative `{name, contacts, preferredContact}`, `eventCategoryId?`, `attendees:[{fullName,ageCategory,rsvp,categoryId?}]`, `consentVersion`, `acceptedPrivacy`, optional note. Validate one contact method, each attendee; do not infer representative attendee. Return `201 {reference, registrationPublicId, countSummary, confirmationEmailQueued}`. Must not return a permanent sensitive bearer token in normal response.
- `POST /registrations/access/request` accepts email plus reference or another privacy-preserving mechanism, responds with same generic message whether found or not; send email ownership link when eligible.
- `GET /registrations/manage` with short-lived one-time or revocable token in an appropriately protected exchange (avoid persisting token in analytics/logs) returns only authorized registration details.
- `PATCH /registrations/:publicId` / `POST /registrations/:publicId/cancel` require verified owner session or authorized admin and `revision` precondition. Return updated revision. For mobile/Messenger-only registrations use committee-assisted pathway until verified channel available.

## Auth
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`; enforce login attempt limits, secure sessions and privileged role checks. Reset flow should be verified via email or controlled admin process, not public unverified Messenger.

## Admin
- `GET /admin/events/:id/dashboard` totals `activeRegistrations`, `confirmed`, `tentative`, `declined`, `confirmedAdults`, `confirmedChildren`, `potential`, `byCategory`, `asOf`.
- `GET /admin/events/:id/registrations` supports paginated search, category, RSVP, created-at filters and field allowlisting.
- `GET /admin/events/:id/registrations/:id` admin-only details with audit.
- `PATCH /admin/events/:id/registrations/:id` validates revision and records who changed what.
- `POST /admin/events/:id/registrations` committee walk-in or assisted entry (P1, optionally earlier).
- `GET /admin/events/:id/exports?format=csv|xlsx&view=attendees|registrations|summary&filters=...` returns authorized streamed download with correct mime/content disposition; no public route.
- `GET /admin/events/:id/duplicate-flags`, `PATCH /admin/events/:id/duplicate-flags/:id` review flags without unsafe auto-merge.
- `POST /admin/events/:id/snapshots` event admin only; explicit cutoff time, source filters, idempotent snapshot key; append-only.
- `GET /admin/events/:id/snapshots` authorized read/list.
- `POST /admin/registrations/:id/email/resend` event admin authorized, throttled, audited.

## P1 venue and sync (see 12)
- `POST /sync/events/:id/push` event-and-device-authorized batch operations, idempotency and per-operation results.
- `GET /sync/events/:id/pull?cursor=...` versioned deltas, stable cursor, permission-limited.
- Venue local `GET /health`, authenticated attendees search and check-in endpoints (namespacing decided during implementation).

## Example public registration payload
```json
{
  "representative": {"name":"Example Family Representative", "contacts":{"email":"representative@example.com","preferred":"email"}},
  "eventCategoryId":"category-id",
  "attendees":[{"fullName":"Example Attendee One","ageCategory":"adult","rsvp":"confirmed"},{"fullName":"Example Attendee Two","ageCategory":"child","rsvp":"tentative"}],
  "acceptedPrivacy":true,
  "consentVersion":"2026-10-v2"
}
```
Reference labels/example values above are illustrative, not real participants. Implement exact serialization from shared contracts and add API integration tests.
