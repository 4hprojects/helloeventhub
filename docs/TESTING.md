# Testing and quality checks

| Layer | Command | What it covers |
|---|---|---|
| Unit + integration | `npm test` | Contracts, API (in-memory MongoDB replica set), web helpers, venue server (temp SQLite) |
| Lint / types | `npm run lint && npm run typecheck` | All workspaces |
| End-to-end + accessibility | `npm run test:e2e` | Mobile and desktop flows; axe WCAG 2.0/2.1 A+AA scans of public and admin pages (`e2e/a11y.spec.ts`) |
| Venue rehearsal | `node scripts/venue-simulation.mjs` | Real cloud + venue processes: offline check-ins, walk-ins, edits, undo, reboot, backup, conflicts, reconnect |
| Load | `node scripts/load-check.mjs` | Throughput, latency and duplicate safety (below) |
| Dependencies | `npm audit --omit=dev` | Must report 0 vulnerabilities before a release |

E2E, simulation and load scripts run against a **local production build**. See README "End-to-end tests" for how to start it (port 3210, `TURNSTILE_DISABLED=true`).

## Load check (Oct 11, 2026)

**Setup.** Local production build on the development laptop, with MongoDB 7 in Docker (single-node replica set, journaled writes). 20 concurrent connections for 15 s per scenario; the dashboard used 5. The server ran with `CLOUDFLARE=true`, and every simulated visitor had its own `CF-Connecting-IP`, so the real per-visitor rate limiter applied. No bypass exists in the code. The database held ~1,250 registrations and ~2,700 attendees, several times the real event.

| Scenario | Throughput | p50 | p97.5 | Errors |
|---|---|---|---|---|
| Public event page API | 185 req/s | 100 ms | 188 ms | 0 |
| Registration submit (2 people each, full transaction) | 37 req/s | 510 ms | 730 ms | 0 |
| Admin dashboard (live headcount) | 15 req/s | 297 ms | 525 ms | 0 |

**Duplicate safety under load:** 575 submissions sent → 575 registrations created, none duplicated or lost.

**What this means.** The reunion expects a few hundred households over several days, so even an extreme spike is a handful of submissions per minute. 37 per second is about 130,000 per hour. Registration speed here is limited by the local disk sync on each transaction commit. On Atlas, latency depends on the network distance between HelloDeploy and the Atlas region. Pick the region closest to the server; for the Philippines that's typically Singapore.

**Change from this check.** The dashboard headcount used to join every attendee to its registration inside MongoDB. It now loads the active registrations once and joins in memory. Results are identical (all count tests unchanged), and throughput doubled (7 → 15 req/s, p50 688 → 297 ms).

To rerun: start the server with `CLOUDFLARE=true TURNSTILE_DISABLED=true` on a **local** database, then `BASE=http://localhost:3210 node scripts/load-check.mjs`. It creates registrations tagged `LOAD…`; reset the local database afterwards with `docker compose down -v && docker compose up -d && npm run seed`.

## Known accepted findings

- `npm audit` (dev dependencies only): Vitest 3 / tinypool advisories are fixed only in Vitest 4+, a major upgrade that's deferred until after the event. They affect the Vitest UI server and worker options in the test runner. They never ship in the production image or run on the server.
