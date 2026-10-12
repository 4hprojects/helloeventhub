# 07 | Email confirmation and multi-channel contact strategy

## Contacts
At least one of email, mobile, Messenger is required. Preferred method stored. Email optional but enables automated Resend confirmation and verified self-service access. Normalize Philippine mobile numbers; do not assume phone ownership without verification. Messenger name/profile URL is informational for manual organizer contact, not an authenticated account.

## P0 email flows
- Registration confirmation (after DB persistence).
- Registration changed/cancelled (where eligible).
- Verified owner access link by email.
- Admin-only throttled resend.
- Optional reminders if all critical items finished before Oct 20.

## Template fields
Brand: HelloEventHub Glacier Blue, event title/date/time, representative, reference, RSVP breakdown and total, organizer support contact, privacy help. Do not list children's unnecessary personal data. Include no secret management token except within explicitly requested time-limited verification email. Render HTML + plain text; escape user content.

## Delivery architecture
Use persistent email outbox (`email_jobs`), asynchronous worker, exponential retry for temporary failures, failed/permanent status, per-provider ID. Enqueue after successful registration; return success if email is queued even if provider unavailable. Implement deduplication per event, registration, event type and revision. Suppress invalid/unwanted destinations; prevent abuse in resend endpoint.

## Configuration prerequisites
Verify sender domain with Resend; configure DNS SPF/DKIM as required; separate testing sender and production sender; test real delivery/spam placement. Keep `RESEND_API_KEY` server-side only.

## Mobile and Messenger
P0: store contacts securely and allow committee to contact manually. Do not claim SMS or Facebook Messenger message delivery, no OAuth or Meta chat integration. Future automation needs separate provider/legal verification, opt-in, cost and permission analysis.

## Failure and privacy
Show on-screen registration reference immediately. Avoid sending sensitive data to unverified addresses beyond minimal confirmation. Generic responses for account recovery to prevent address enumeration. Log delivery codes rather than message bodies, secrets or contact details.
