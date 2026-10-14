# HelloEventHub

Event registration and management. **Plan. Register. Connect.**

The first event is the Menay Bugtong–Wakat Alsem Clan Reunion on **Saturday, Oct 24, 2026** (Asia/Manila). The specification lives in [docs/HelloEventHub_Full_Project_MD_Package](docs/HelloEventHub_Full_Project_MD_Package/HelloEventHub_Project_Plan/00_README_START_HERE.md).

| Release  | Scope                                                                                                                                                                                                                                | Status                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **P0**   | Public household registration, per-attendee RSVP, safe reference, email confirmation (Resend outbox), verified owner self-service, committee/admin login, event-scoped RBAC, search/edit/cancel with audit, live headcount dashboard | Implemented and tested                                                          |
| **P0.5** | XLSX five-sheet report + CSV views (formula-safe), duplicate review queue, email failure view/resend/retry, append-only headcount snapshots (manual and automatic at cutoff)                                                         | Implemented and tested                                                          |
| **P1**   | Venue server (Node + SQLite) for check-in without internet: multi-station, walk-ins, durable local log, backups, cloud sync with checksum and conflict review, printable roster                                                      | Implemented and tested (QR scanning **not** shipped — manual lookup is primary) |

Owner tasks that cannot be automated (organizer sign-offs, hosting, DNS, Resend, Turnstile, Atlas, venue hardware) are in **[MANUAL_CHECKLIST.md](MANUAL_CHECKLIST.md)**.

The current technical assessment, verified checks, risks, and ordered next work are in **[docs/PROJECT_ANALYSIS.md](docs/PROJECT_ANALYSIS.md)**.

## Repository layout

```
packages/contracts   Shared Zod schemas, enums, DTOs, sync contracts (used by web, api, venue)
apps/api             Express API + MongoDB (Mongoose) + email worker + scheduler; also serves the built web app
apps/web             React + Vite + Tailwind: public registration site and admin/committee UI
apps/venue           P1 venue server (Express + better-sqlite3) and its check-in UI
e2e                  Playwright end-to-end tests (mobile + desktop)
scripts              venue-simulation.mjs (automated offline rehearsal)
docs                 Spec package, ADRs, deployment guide, venue runbook
```

## Quick start (local)

Requirements: Node 22+, Docker.

```bash
npm install
cp .env.example .env                 # dev defaults; never commit real secrets
docker compose up -d                 # MongoDB single-node replica set on 127.0.0.1:27017
npm run seed                         # organization, event (registration in "draft"), 10 editable family-branch choices
ADMIN_PASSWORD='choose-a-long-password' npm run create-admin -- --email you@example.com --name "Your Name" --role event_admin
npm run dev                          # API on $PORT, web on :5173 (proxying /api to the same port)
```

Open http://localhost:5173, sign in at `/admin`, and in **Settings** set online registration to _Open_.

In dev without `RESEND_API_KEY`, emails go to the console transport. Set `DEV_MAILBOX_DIR=/some/dir` (non-production only) to write them to files so you can follow manage links.

The web dev server reads `PORT` from the root `.env` and proxies `/api` to that API port automatically. To proxy to a different host or port, set `API_PROXY_TARGET` explicitly; it takes precedence over `PORT`.

If the landing page says it cannot load the event, verify the complete local stack:

```bash
docker compose ps                  # MongoDB should be healthy
curl http://localhost:${PORT:-3000}/api/v1/health
npm run seed                       # safe to rerun; seed data is idempotent
```

If Docker reports permission denied on Linux, add your account to the `docker` group with `sudo usermod -aG docker "$USER"`, then sign out and back in before retrying. Membership in that group grants root-equivalent access to Docker, so only do this on a trusted development machine.

## Commands

| Command                                                                 | What it does                                                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run lint` / `npm run typecheck`                                    | ESLint / TypeScript across all workspaces                                                    |
| `npm test`                                                              | Unit + integration tests (API uses an in-memory MongoDB replica set; venue uses temp SQLite) |
| `npm run build`                                                         | Build web, API bundle and venue server                                                       |
| `npm start`                                                             | Run the built single-process server; loads root `.env` when present                          |
| `npm run test:e2e`                                                      | Playwright against a running server (see below)                                              |
| `npm run test:e2e:self-contained`                                       | Playwright with an isolated temporary MongoDB replica set (run `npm run build` first)        |
| `npm run preflight`                                                     | Verify the live site's TLS, health, public launch settings, deep links and security headers  |
| `npm run seed` / `npm run create-admin -- …` / `npm run ensure-indexes` | Operational scripts (use `MONGODB_URI` to target Atlas)                                      |
| `node scripts/venue-simulation.mjs`                                     | Automated venue rehearsal against a running cloud server                                     |
| `node scripts/load-check.mjs`                                           | Load and duplicate-safety check against a local build (see docs/TESTING.md)                  |
| `npm run retention -- --event <slug> --mode anonymize`                  | Post-event data minimization (dry run unless `--apply --confirm <slug>`)                     |

### End-to-end tests

```bash
npm run build
PORT=3210 APP_BASE_URL=http://localhost:3210 TURNSTILE_DISABLED=true DEV_MAILBOX_DIR=/tmp/heh-mail \
  node --env-file=.env apps/api/dist/server.js &
MAILBOX_DIR=/tmp/heh-mail E2E_BASE_URL=http://localhost:3210 npm run test:e2e
# If Playwright can't install a browser on your OS, point it at any Chromium:
#   PW_CHROMIUM_PATH=/path/to/chrome-headless-shell npm run test:e2e
```

## Architecture (short)

- **One deployable process** serves the API under `/api/v1` and the SPA from the same origin, and runs the email worker plus the snapshot scheduler in-process. `apps/api/dist/worker.js` exists for scaling the worker separately (set `EMAIL_WORKER_ENABLED=false` on web instances).
- **MongoDB transactions** make registration creation and idempotency atomic. Counts always come from DB aggregation over attendee records (representatives count only when listed).
- **Sessions** are server-side (Mongo store) with HttpOnly/SameSite cookies and synchronizer CSRF tokens. Rate limits use a Mongo store, so they hold across instances.
- **Security**: Turnstile on public submissions (documented fail-open with stricter limits), argon2id passwords with lockout, CSP/HSTS via Helmet, origin guard, PII-redacting structured logs, formula-safe exports, opaque ULIDs and non-enumerable references.
- **Venue (P1)**: a laptop runs `apps/venue` on the venue Wi-Fi. Check-ins are committed to SQLite (WAL, `synchronous=FULL`) before the UI confirms, and a partial unique index guarantees one accepted check-in per person across stations. Sync uses device tokens, idempotent op IDs, a cursor pull with a settle window, and a checksum.

Design decisions that deviate from or refine the spec are recorded in [docs/adr](docs/adr). Test strategy and load results: [docs/TESTING.md](docs/TESTING.md). Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Event day: [docs/VENUE_RUNBOOK.md](docs/VENUE_RUNBOOK.md).
