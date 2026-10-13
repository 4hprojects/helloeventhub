# 11 | Execution backlog, critical path and open decisions

## Critical timeline
**Oct 10–11:** verify HelloDeploy, repo, contracts, seed event, login baseline.  
**Oct 12–14:** public form, persistence, RSVP counts, confirmation, outbox and admin views.  
**By Oct 15:** target public preregistration launch after security and functional gate.  
**Oct 16–19:** improve validation, dedup review, XLSX/CSV, communications, monitor signups; plan/test venue mode in parallel.  
**Oct 20:** approved local-time immutable headcount snapshot.  
**Oct 21–22:** venue dataset, local server and check-in rehearsal; disable unfinished features.  
**Oct 23:** freeze, printed lists, backups and committee training.  
**Oct 24:** on-site registrations 08:00, program 09:00–15:00, late arrivals handled.

## Ordered P0 tasks
- [ ] P0-01 Confirm organizer owner, official event title/venue, public description and contacts. *(owner — MANUAL_CHECKLIST §1; all editable in Admin → Settings)*
- [ ] P0-02 HelloDeploy compatibility smoke test, domain, HTTPS, secret storage, Atlas. *(owner — MANUAL_CHECKLIST §2–3; Dockerfile verified locally)*
- [x] P0-03 Project scaffolding, CI, environment templates, seed event and categories.
- [x] P0-04 Define and test Zod contracts + MongoDB indexes/invariants.
- [x] P0-05 Public event page and responsive household/individual form.
- [x] P0-06 Public submission API, Turnstile, rate limit and idempotency.
- [x] P0-07 On-screen confirmation and safe reference issuance.
- [x] P0-08 Resend outbox/worker, email templates and retry.
- [x] P0-09 Committee login, role scopes, search, editing and audit logs.
- [x] P0-10 Headcount aggregation/dashboard; verify fixtures.
- [x] P0-11 Owner change/access workflow, privacy page, mobile E2E.
- [ ] P0-12 Backup test and controlled production launch. *(owner — MANUAL_CHECKLIST §3, §6)*

## Ordered P0.5 tasks
- [x] P0.5-01 XLSX five-sheet reports, CSV views and spreadsheet-safe escaping.
- [x] P0.5-02 Duplicate review queue and resolution permissions.
- [x] P0.5-03 Email resend + failure queue admin status.
- [x] P0.5-04 Immutable snapshot endpoint/admin flow for Oct 20.
- [ ] P0.5-05 Repeat export/headcount reconciliation and capture initial headcount. *(reconciliation automated in tests; capturing the real Oct 20 headcount is operational — auto snapshot at cutoff)*

## Ordered P1 tasks
- [ ] P1-01 Venue inventory: 1–5 devices, router, primary laptop, power and network. *(owner — MANUAL_CHECKLIST §8)*
- [ ] P1-02 Local server trust/HTTPS feasibility check on actual phones. *(owner — manual lookup works over plain LAN HTTP; HTTPS optional via VENUE_TLS_CERT/KEY)*
- [x] P1-03 Restricted export/preload of attendee records, encryption and integrity check.
- [x] P1-04 SQLite schema and manual name/reference check-in.
- [x] P1-05 Duplicate check-in lock and transaction/outbox log.
- [x] P1-06 Walk-in and late-change handling.
- [x] P1-07 Sync protocol with cloud, cursor/replay protection and reconciliation.
- [x] P1-08 QR camera scanning only after manual lookup passes. *(not shipped by decision — manual lookup is the supported primary method)*
- [ ] P1-09 Printed fallback, device training and disconnected rehearsal. *(printed roster implemented; training/rehearsal is owner — docs/VENUE_RUNBOOK.md)*

## Decisions requiring owner signoff
| Decision | Proposed default until confirmed | Blocks |
|---|---|---|
| Official event title | Working title Menay Bugtong–Wakat Alsem Clan Reunion 2026 | Public wording |
| Venue and map/address | Placeholder hidden until supplied | Event page directions |
| Oct 20 deadline time | Make configurable, propose 23:59 Asia/Manila for review | Snapshot scheduler |
| Late registration policy | Keep enabled after snapshot but mark late | Event-day workflow |
| Capacity | No cap initially; configuration supported | Registration limits |
| Age definition | Ask organizers to set adult/child threshold, show policy | Category interpretation |
| Contact rule | At least one email, mobile or Messenger | Form |
| Self-service management | Verified email only, committee assistance otherwise | Access UX |
| Committee devices | One primary laptop plus up to 4 stations | P1 deployment |
| P1 QR scanning | Manual search first, QR stretch | Scope gate |
| Privacy notice / retention | Event organizer approves before public opening | Compliance |
| HelloDeploy readiness | Prove by smoke test | Hosting release |
| Resend sending domain | Verify before promising emails | Email readiness |

## Explicitly not on critical path
Approved final illustration/logo variations, entire handwritten family tree proofreading, payments, SMS/Messenger automation, generalized SaaS billing, brand SEO, public discovery marketplace.

## Change management
An added feature after October 15 requires explicit priority tradeoff. Keep backlog `must/should/could/deferred`. Coding agent must surface blockers instead of silently replacing implementation decisions.
