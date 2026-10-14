# Project analysis and priorities

**Assessment date:** October 14, 2026 (Asia/Manila)

**Target launch:** October 15, 2026

**First event:** October 24, 2026

This is the current working status and priority list. The detailed product specification remains in `docs/HelloEventHub_Full_Project_MD_Package`; human-owned launch tasks remain in `MANUAL_CHECKLIST.md`.

## Executive assessment

HelloEventHub is a credible release candidate for its first event. The P0 registration/admin flow, P0.5 reporting and snapshot flow, and P1 offline venue flow are implemented with unusually good safeguards for a small event system. Local linting, type checks, production builds, unit/integration tests, and browser tests all pass.

The launch risk is now operational, not feature completeness. The repository cannot prove the state of DNS, hosting, Atlas, backups, Resend, Turnstile, remaining organizer decisions, or venue hardware. Most of those sign-offs are not yet recorded as complete in `MANUAL_CHECKLIST.md`. With one day to the target public launch, those items take precedence over new features or broad dependency upgrades.

**Recommendation:** freeze feature scope, complete the launch gates below, and do not open registration until the privacy notice, real-email flow, database persistence/restore, and production smoke test are signed off.

**Current production blocker (reverified October 14):** the Cloudflare edge certificate for `helloeventhub.online` is trusted and valid through January 9, 2027, but both `/` and `/api/v1/health` return HTTP 525 (SSL handshake failed). The automated public preflight currently passes only 3 of 12 reachable checks, and plain HTTP does not redirect to HTTPS. A direct HTTP response identifies the configured origin as a GoDaddy parked-domain service (`lander_type=parkweb`). The HelloDeploy project has since been created and its repository, detection and 19 environment-variable names are configured, but mandatory administrator review blocks the first deployment; the signed-in owner receives HTTP 403 at the admin review route. An Admin or Super Admin must approve it, after which deploy verified SHA `812dfb124cc02f984253cf47a08ca1be86c7fa51`, verify the platform hostname, activate the custom domain, replace the parked DNS target with HelloDeploy's supplied CNAME, and retain Cloudflare Full (strict). Do not use Flexible. Recheck `/api/v1/health` before continuing the production smoke test.

## Evidence from this review

Run locally from a clean `main` checkout after `npm ci`:

| Check | Result | Notes |
|---|---:|---|
| Git state before review | Clean | `main` matched `origin/main` at the recorded review point |
| Lint | Pass | ESLint across the repository |
| Type checking | Pass | All four workspaces |
| Production builds | Pass | Web, API, and venue |
| Unit/integration tests | **153 passed** | 21 contracts, 103 API, 11 web, 18 venue |
| Browser E2E/accessibility | **14 passed** | Mobile and desktop; registration, owner link, admin, exports, snapshots, keyboard path, responsive overflow, automated WCAG A/AA scans |
| Production dependency audit | Pass | `npm audit --omit=dev`: 0 vulnerabilities |
| Full dependency audit | Attention | 3 development-only findings: 1 moderate and 2 critical in Vitest 3 / transitive test-runner packages; remediation requires Vitest 4 |
| GitHub Actions release gate | **Pass** | Run `38347951383` for commit `812dfb1`: lint, types, 153 tests, builds, 14 browser/accessibility tests, offline/reconnect venue simulation and Docker image build |
| Docker image build | **Pass locally and in CI** | Root production image built as `helloeventhub:812dfb1` on October 14 and in GitHub Actions run `38347951383`; image runs as `node`, exposes port 3000 and includes the API healthcheck |
| Local development smoke test | **Pass** | Persistent MongoDB replica set, API and Vite proxy health, seeded public event, admin login/dashboard, 14 browser/accessibility scenarios and venue reconciliation verified on October 14 |
| External services/hardware | Not verified | Requires owner access and the manual checklists |

The E2E run used an isolated MongoDB replica set and a local production build. It did not validate Atlas, HelloDeploy, Cloudflare, Resend delivery, DNS/TLS, or real venue devices.

### Local development recovery (October 14)

The public-page error at `localhost:5173` was caused by two local conditions: the API had stopped because MongoDB was unavailable, and `.env` configured API port 3009 while Vite still proxied to port 3000. Vite now reads the root `.env` port automatically, with `API_PROXY_TARGET` retained as an explicit override. Docker access is now working, the persistent MongoDB replica set is healthy, the local `.env` is on the standard port 3000, and the event was reseeded. Direct API and Vite-proxied health checks, public event loading, admin login/dashboard, all 14 E2E/accessibility scenarios and the offline/reconnect venue reconciliation passed on October 14. Local registration remains in `draft` because Ruby's public contact and privacy approval are deliberately still pending; production remains unavailable and unverified.

## What is in good shape

- **Architecture:** a clear npm-workspace monorepo with shared Zod contracts, a same-origin React/Express cloud app, and a separate local venue server. Deployment is intentionally one cloud process for the first event.
- **Data correctness:** MongoDB transactions, idempotency keys, unique indexes, revision preconditions, append-only snapshots, formula-safe exports, and test reconciliation between reports and dashboard counts.
- **Security/privacy:** event-scoped RBAC, server-side sessions, CSRF and origin checks, Argon2 password hashing and lockout, opaque public IDs/references, rate limits backed by MongoDB, CSP/HSTS, PII-conscious logs, verified owner links, and explicit retention tooling. The API refuses to open public registration until a real organizer contact channel is present and the privacy notice is approved.
- **Failure handling:** durable email outbox with retries, production refusal of unsafe configuration, SQLite WAL plus full synchronization at the venue, duplicate check-in protection, sync idempotency/checksums, backups, and printed fallback procedures.
- **Documentation:** deployment, testing, venue operations, ADRs, and owner actions are documented. The remaining work can be handed to organizers without reverse-engineering the code.

## Priority work

Confirmed October 13 decisions: the venue remains publicly **“Venue to be announced”**; organizer and privacy controller is **Ruby Sagorsor**; the official title and short description are approved; child means age 12 or younger; the planning cutoff is October 20 at 23:59 Asia/Manila; late registrations remain allowed; capacity is unlimited; self-service changes close at the October 24 program start; and the organizer supplied the numbered Albin–Denio branch/couple labels, with Other/Unsure retained as a fallback. Identifiable data is deleted or anonymized by January 22, 2027. Ruby's public contact channel and final privacy-notice approval remain pending.

### P0 fast-track — parallel work on October 14

1. **Deployment lane — active critical path.** The HelloDeploy project, repository connection, detection and environment-variable names are configured. It is waiting for mandatory Admin/Super Admin approval. After approval, deploy the verified `812dfb1` SHA (HelloDeploy's `0b50659` latest-commit label is stale), prove the platform hostname, activate `helloeventhub.online`, replace the parked DNS target with HelloDeploy's CNAME, retain Cloudflare Full (strict), enable the HTTP redirect, and verify restart persistence, logs and rollback identity.
2. **Service lane — work now without waiting for deployment.** Complete Atlas with a database-scoped user and HelloDeploy network access; enable backups and test a restore; verify the Resend domain and real delivery; create production Turnstile keys; generate the session secret; and prepare every production environment value from `docs/DEPLOYMENT.md`.
3. **Organizer lane — work now without waiting for deployment.** Add Ruby's public contact channel, approve privacy notice v2, and provide the names, emails and roles for one event admin plus each committee member. Never share accounts or transmit passwords through project notes.
4. **Verification lane — prepare now, execute after production health.** Select fake household data and Gmail/Yahoo/Outlook test recipients in advance. Once health is green, test registration, confirmation, manage-link editing, cancellation, staff search/edit, exports, snapshots, duplicate review, failed-email handling and Turnstile; then remove the fake records.
5. **Release evidence lane — already green locally, finish after deployment.** CI run `38347951383` is green for `812dfb1`; October 14 local verification passed lint, types, 153 tests, builds, 14 browser/accessibility scenarios, venue reconciliation, dependency audit and Docker image inspection. Record the actual deployed image/commit and the production preflight result.

**Launch rule:** keep registration in `draft` until all five P0 lanes are signed off. If HelloDeploy cannot pass the smoke test promptly, use the documented alternate-host decision instead of weakening the gates.

### P1 — after launch, before the October 20 snapshot

1. Monitor dashboard counts, duplicates, queued/failed email, logs, and database health daily; assign a named owner and response path.
2. Reconcile one production export against dashboard totals and store it securely. Treat exports as PII, not backups.
3. Confirm the automatic snapshot time in Asia/Manila and verify a snapshot appears after the cutoff. Capture a manual snapshot if scheduling or deployment status is uncertain.
4. Run a short production-like load/smoke check against the selected Atlas/hosting region. The documented local load result is encouraging but does not measure real network latency.

### P1 — venue readiness, October 21–23

1. **Advance now:** inventory the encrypted laptop, router, phones/tablets, chargers and power strip; confirm Node 22; select individual operators, a lead and the reconciliation owner.
2. Run `scripts/venue-simulation.mjs` against staging or the final cloud configuration and record the result.
3. Rehearse on the actual equipment with WAN disconnected. Test simultaneous check-in, walk-ins, corrections, undo, restart, backup, restore, reconnect, checksum and final reconciliation.
4. Create individual operator PINs and a lead, preload and verify the final roster, print the fallback roster and prepare blank walk-in sheets.
5. Freeze the event-day build after the rehearsal. Only accept critical fixes, then repeat the affected rehearsal steps.

### P2 — maintenance after the event

1. Upgrade Vitest 3 to 4 and rerun all tests. This removes the current development-only audit findings; do it as a controlled migration rather than an emergency pre-launch major upgrade.
2. Add release automation: an explicit release/tag workflow, stored test evidence, and a lightweight deployment/change log. The repository currently has only two large commits, which limits rollback granularity and review history.
3. Establish a dependency-update cadence. Many direct dependencies have newer versions, several with major-version changes; batch them by subsystem and test rather than updating everything together.
4. Improve observability if the app grows: external uptime checks and alerts for DB health, email backlog/failures, and scheduler failures. Current status is visible in logs/admin but is not an alerting system.
5. Split the largest UI and service modules only when active changes justify it (`apps/venue/web/src/App.tsx`, registration services/forms, and large route modules). They are maintainable now but are emerging concentration points.
6. After reconciliation, revoke the venue token, remove venue/USB data, take the agreed final backup, and execute the approved retention policy using a dry run first.

## Known gaps and accepted constraints

- Automated accessibility checks cover WCAG rules detectable by Axe plus one keyboard path; the manual screen-reader, zoom, focus-order, and real-device checks still matter.
- QR scanning is deliberately not shipped. Manual name/reference search and a printed roster are the supported paths.
- Email worker and snapshot scheduler run in-process for the single-instance deployment. Mongo-backed claiming/idempotency supports scaling later, but the first-event deployment still needs process health monitoring.
- Rate-limit storage is configured to fail open on datastore errors, and Turnstile may fail open by policy with stricter limits. This favors registration availability; monitor abuse and logs during launch.
- Retention is an operator-run command, not an automatic policy engine. The approved privacy notice must name an owner and date for execution.
- The local `.env` is ignored by Git and was restricted to owner-only access (`0600`) during this review. Rotate any secret if it was previously exposed outside this machine.

## Definition of ready

**Public launch ready** means: organizer settings/privacy approved; production health/deep links/restart persistence pass; backup restore passes; real email and Turnstile pass; named staff access passes; CI/Docker and browser suites pass; deployed commit is recorded.

**Event-day ready** means: the final roster verifies; actual-device offline rehearsal and backup restore pass; printed fallback exists; operators are trained; sync reaches zero pending operations; conflict/reconciliation ownership is assigned.
