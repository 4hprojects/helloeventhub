# HelloEventHub | Project implementation package

**Status:** Approved planning direction; implementation not started.  
**Planning baseline:** October 10, 2026. **Timezone:** `Asia/Manila` (UTC+08:00).  
**Initial deployment:** `helloeventhub.online` through HelloDeploy, **subject to a deployment smoke test**.  
**First event:** Working title `Menay Bugtong–Wakat Alsem Clan Reunion 2026`; official wording and venue still to be confirmed.  
**Reunion:** Saturday, October 24, 2026. On-site registration at 8:00 AM; program 9:00 AM–3:00 PM.  
**Initial planning headcount:** October 20, 2026.  
**Target online public launch:** October 15, 2026 or earlier, after tests pass.

## How to use this package

This repository-level specification package is intended for a developer or coding agent. Read this file first, then `01_MASTER_SCOPE_AND_RELEASES.md`, `02_ARCHITECTURE_AND_REPOSITORY.md`, and the document for the current workstream. **Do not implement P2/P3/P4 features during the October release.** After any implementation step, run checks described in `09_TESTING_ACCEPTANCE_AND_RELEASE.md` and update the task checklist in `11_EXECUTION_BACKLOG_AND_DECISIONS.md`.

| Document | Purpose |
|---|---|
| 01_MASTER_SCOPE_AND_RELEASES.md | Boundaries, user journeys, delivery priorities |
| 02_ARCHITECTURE_AND_REPOSITORY.md | Technology, packages, service boundaries |
| 03_DATABASE_MODELS_AND_INVARIANTS.md | MongoDB models, indexes, rules |
| 04_API_CONTRACTS.md | Routes, payloads, authorization, errors |
| 05_PUBLIC_REGISTRATION_UI.md | Public pages and form flows |
| 06_ADMIN_DASHBOARD_REPORTS.md | Committee views, counts, exports, snapshot |
| 07_EMAIL_AND_CONTACTS.md | Resend, alternate contacts, notifications |
| 08_SECURITY_PRIVACY_AND_ACCESS.md | RBAC, safeguards, retention |
| 09_TESTING_ACCEPTANCE_AND_RELEASE.md | Release gates, test cases and rehearsals |
| 10_HELLODEPLOY_DEPLOYMENT_OPERATIONS.md | Hosting validation, deployment, backout |
| 11_EXECUTION_BACKLOG_AND_DECISIONS.md | Priority-ordered checklist and open questions |
| 12_OFFLINE_CHECKIN_AND_SYNC.md | P1 local server architecture and conflict rules |
| 13_BRANDING_AND_DESIGN_SYSTEM.md | Glacier Blue and Celebration Pine specifications |
| 14_FUTURE_PLATFORM_AND_FAMILY_TREE.md | Deferred multi-tenant SaaS and genealogy |

## Nonnegotiable sequencing

1. **P0:** Registration, per-attendee RSVP, reference, safe confirmation, core dashboard, secure administration, email when supplied.
2. **P0.5:** XLSX/CSV, duplicate review, and immutable October 20 snapshot.
3. **P1:** Reliable event-day attendance without public internet; manual search/check-in before QR enhancement. Rehearsal no later than October 23.
4. **P2+ deferred:** Payments, genealogy, general organizer self-service, billing, photo gallery.

## Decisions that have not been confirmed

Do not silently invent an event venue or official title, hosting capability, completed domain setup, exact Oct 20 cutoff clock-time, participant capacity, or whether late registration stays open. Use settings with reviewable defaults described in `11_EXECUTION_BACKLOG_AND_DECISIONS.md`. Record choices before production launch.

## Coding agent instructions

- Build only the current priority release. Never describe a planned capability as shipped.
- Implement TypeScript types, input validation, proper authorization, and tests together.
- Prefer simple and reliable behavior over speculative abstractions.
- A secure registration reference is **not** proof of authorization to retrieve a private record.
- Preserve attendee-level RSVP and do not count household representatives by default.
- Maintain separation between permanent genealogy records and event attendees.
- Do not expose credentials, tokens or participant PII in logs, URLs, client bundles, or public reports.
- No automated SMS or Messenger messaging in P0.
- Do not assume HelloDeploy supports a feature without a live smoke test.
