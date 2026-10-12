# ADR-001: Manage-link token travels in the URL fragment and is exchanged by POST

**Context.** Doc 04 sketches `GET /registrations/manage` with a short-lived token. Tokens in query strings end up in server, proxy and analytics logs and in `Referer` headers.

**Decision.** The email link is `/registration/manage#t=<token>`. The page reads the fragment, immediately removes it from the address bar and history (`history.replaceState`), and `POST`s it to `/api/v1/registrations/manage/exchange`. The server stores only `sha256(token)`, accepts it once and only within 30 minutes, then issues a 60-minute owner session (HttpOnly cookie plus CSRF token). `GET /registrations/manage` then works off that session. Requests require **email + reference**; the response is always the same generic message, and requests are limited to 3 per hour per address.

**Alternatives.** Token in the query string (logs and Referer exposure); magic codes typed by hand (more friction on mobile).

**Security impact.** The token never reaches server logs. It is single-use and short-lived, and the reference alone is never enough to read data. Owners cannot change contact details; staff do that after an identity check.

**Tests.** `apps/api/test/owner-access.test.ts`, `e2e/register.spec.ts` ("verified email link…").
