# 10 | HelloDeploy hosting readiness, deployment and operations

## Important qualification
HelloDeploy is selected but production ability is **not yet verified**. The HelloDeploy platform deploying a customer application is separate from how HelloDeploy itself is deployed. Do not claim Docker support, queue workers, SSL automation or backup reliability without actual checks.

## Day-one smoke test
1. Verify control of `helloeventhub.online` and DNS editing permissions.
2. Deploy a minimal Node.js app with `/health` returning version and healthy process status.
3. Verify custom domain and trusted HTTPS certificate and redirects.
4. Configure dummy non-secret env variable; separately validate secure secret injection without logs/headers leaking it.
5. Confirm outbound connection to MongoDB Atlas with TLS and configured network allowlist.
6. Confirm outbound call to Resend test endpoint with verified domain; never store key in frontend.
7. Restart/redeploy and test uninterrupted DB records; check server log rotation/error visibility.
8. Test failure recovery: process crash, DB unavailability, timeouts, invalid secrets.
9. Validate build artifacts, SPA fallback routing, API proxy and request body size/timeouts.
10. Record results with pass/fail and owner; if critical failure, make explicit call on temporarily using managed hosting rather than missing headcount deadline.

## Environments
`local`, `staging`, `production`; separate DB names and sending identity, no production PII in nonproduction. Environment templates committed without values. Keep session secret, MongoDB credentials, Turnstile secret and Resend API key server side.

## Deployment sequence
- CI checks: lint, typecheck, unit and API tests, production build.
- Staging deploy and smoke test.
- Verify indexes, admin provisioning, event seed and branch labels.
- Create recoverable Atlas backup or point-in-time recovery capability before production migration.
- Production deploy and HTTPS smoke test, then controlled pilot with organizer accounts.
- Open registration only when P0 checklist passes.
- Monitor submissions, emails and operational errors; store incident contact and rollback instructions.

## Required DNS/email configuration
Domain A/CNAME according to HelloDeploy's verified published configuration. For Resend, add and verify required SPF/DKIM and recommended DMARC policy; do not invent concrete DNS values without seeing provider instructions.

## Backups
MongoDB Atlas automated schedule and on-demand snapshot before risky changes. Prove restore into separate temporary environment. Export event-safe CSV/XLSX only as operational reports, not a substitute for DB backup.

## Rollback and fallback
Rollback application to last tested release while preserving compatible DB schema. Avoid destructive migrations. If HelloDeploy cannot meet the production minimum in time, secure a formally approved temporary host; do not silently change the chosen hosting plan.
