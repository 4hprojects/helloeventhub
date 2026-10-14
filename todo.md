# HelloEventHub project analysis and prioritized TODO

**Review date:** October 14, 2026 (Asia/Manila)
**Reviewed commit:** `6e489c6` (`main`)
**Target public launch:** October 15, 2026
**First event:** October 24, 2026
**Primary UX audience:** mixed-age, first-time participants using mobile phones, including non-technical family members

This is the single prioritized working backlog for the current release. It consolidates actionable findings without replacing the detailed evidence in [Project analysis](docs/PROJECT_ANALYSIS.md), owner actions in [Manual checklist](MANUAL_CHECKLIST.md), deployment steps in [Deployment](docs/DEPLOYMENT.md), the [public registration specification](docs/HelloEventHub_Full_Project_MD_Package/HelloEventHub_Project_Plan/05_PUBLIC_REGISTRATION_UI.md), or the [brand system](docs/HelloEventHub_Full_Project_MD_Package/HelloEventHub_Project_Plan/13_BRANDING_AND_DESIGN_SYSTEM.md).

## How to use this backlog

| Priority | Meaning                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | Blocks a safe public launch or reliable event operation. Complete and record evidence before opening registration.                 |
| **P1**   | Important usability, trust, accessibility, or readiness work. Complete after launch gates and before the relevant event milestone. |
| **P2**   | Valuable maintenance or polish that must not displace launch and event-day work.                                                   |

Every unchecked item states its affected surface, owner or dependency, and an observable acceptance condition. Product changes should retain the current security and privacy model unless a separately reviewed decision explicitly changes it.

## Executive assessment

HelloEventHub is a credible release candidate with sound foundations: an npm-workspace monorepo, shared Zod contracts, transaction-safe registration, idempotent submission, durable email delivery, secure staff sessions, event-scoped authorization, reporting, and an offline-capable venue application. The public registration flow already handles mobile layouts, keyboard interaction, large households, failure recovery, privacy consent, and secure owner-managed changes.

The immediate risk is operational rather than missing core functionality. Production hosting, DNS/TLS, Atlas persistence and restore, real email delivery, Turnstile, organizer contact/privacy approval, and a production smoke test remain the release gates. Do not trade those gates for visual work.

The public UI is functional, restrained, and accessible in its tested states. Its highest-value UX improvements are clearer navigation and staff-login orientation, protection against losing an in-progress registration during internal navigation, a more semantic progress indicator, stronger footer/site context, and route-specific metadata. The participant journey must remain accountless: only committee and admin staff sign in.

### UX strategy

- **Target user:** a family member who may be hurried, unfamiliar with the service, and using a small phone to register several people.
- **Core goal:** understand the event, submit an accurate household response, and know how to retrieve or change it without learning a new account system.
- **Desired feeling:** confident that the registration was received and that personal information is handled responsibly.
- **Core design rule:** one obvious next action per stage, plain language, large targets, preserved input, and recovery paths for network or validation failures.
- **Biggest UX risk:** losing entered household data or confusing public registration with committee account access.

## Verified baseline — preserve these strengths

These are implemented protections, not missing tasks:

- Public participants register without an account; committee and event-admin accounts are separately provisioned.
- The four-step household form supports a representative, configurable family branch, 0–20 attendees, per-person age group and RSVP, review, consent, and a success reference.
- Submission uses client/server validation and an idempotency key; retrying a network failure does not create a duplicate.
- Error summaries receive focus and link to inline field errors; labels, input types, autocomplete, focus styles, reduced-motion handling, and minimum control heights are present.
- The representative is not silently counted as an attendee, and a household can explicitly report that nobody is attending.
- Email owner links are single-use and short-lived; the reference alone cannot reveal or edit a registration.
- Staff authentication has CSRF protection, generic invalid-credential responses, Argon2id hashing, rate limits, lockout, session expiry, required temporary-password replacement, and event-scoped roles.
- Reports are formula-safe; snapshots are append-only; duplicate review, email retry, retention tooling, and venue reconciliation exist.
- The visual system uses the approved Celebration Pine assets, Plus Jakarta Sans/Inter, Glacier Blue palette, restrained shadows, semantic status colors, and light-first presentation.
- The interface avoids the common generated-design patterns: no ornamental glassmorphism, purple/cyan default palette, gradient text, identical icon-card feature grid, side-tab card accents, bounce motion, or blanket `transition: all`.

## Verification evidence from this review

| Check                                 |              Result | Evidence / limitation                                                                                                                                                                                                      |
| ------------------------------------- | ------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git state before documentation change |                Pass | Clean `main` at `6e489c6`.                                                                                                                                                                                                 |
| Lint                                  |                Pass | `npm run lint`.                                                                                                                                                                                                            |
| Type checking                         |                Pass | All four workspaces via `npm run typecheck`.                                                                                                                                                                               |
| Production build                      |                Pass | Web, API, and venue builds via `npm run build`.                                                                                                                                                                            |
| Unit/integration tests                |      **159 passed** | 21 contracts + 103 API + 17 web + 18 venue tests; the four new web tests cover public site context/navigation, staff-login orientation, password visibility, semantic form progress, and dirty-form navigation protection. |
| Local browser E2E rerun               |    **14/14 passed** | October 14 rerun used the documented `PW_CHROMIUM_PATH=/usr/bin/google-chrome` fallback on Ubuntu 26.04; registration, owner access, admin, automated WCAG checks, and venue offline/reconnect reconciliation passed.       |
| Latest documented browser/CI evidence |                Pass | The current working tree passes the self-contained browser suite under Node `v22.23.1`; CI must rerun the same checks for the exact release commit.                                                                         |
| Local runtime alignment               |                Pass | Lint, typecheck, all 159 unit/integration tests, production build, browser E2E, and venue simulation pass under the required Node `v22.23.1`.                                                                              |

## P0 — production launch gates

- [ ] **P0-01 — Deploy the exact release commit through HelloDeploy.** **Surface:** hosting/release. **Owner/dependency:** deployment owner with HelloDeploy Admin or Super Admin approval; depends on current `origin/main`. **Acceptance:** the approved request names the exact release commit, uses Node 22 with `npm ci`, `npm run build:cloud`, `npm start`, and `/api/v1/health`, and the deployed commit/image identifier is recorded for rollback.

- [ ] **P0-02 — Replace the parked origin and prove DNS/TLS.** **Surface:** `helloeventhub.online`. **Owner/dependency:** domain/Cloudflare owner; depends on a healthy HelloDeploy platform hostname. **Acceptance:** the supplied CNAME is active, HTTPS has a trusted certificate, HTTP redirects to HTTPS, Cloudflare uses Full (strict), `/` serves HelloEventHub rather than GoDaddy parking, and `/api/v1/health` returns HTTP 200 with `status: ok` and `db: connected`.

- [ ] **P0-03 — Complete Atlas production persistence and restore evidence.** **Surface:** MongoDB. **Owner/dependency:** infrastructure owner with Atlas access. **Acceptance:** a database-scoped user and required network access are configured, backups are enabled, a restore into a separate target succeeds, and application data remains present after an application restart/redeploy.

- [ ] **P0-04 — Publish a real organizer contact and approve the privacy notice.** **Surface:** public Event, Contact, Privacy, and registration-review screens. **Owner/dependency:** Ruby Sagorsor/event owner. **Acceptance:** at least one monitored public contact channel is configured, privacy notice v2 is reviewed and marked approved, Ruby Sagorsor is correctly identified as controller/organizer, and the January 22, 2027 deletion/anonymization commitment is accurate.

  **Local evidence, October 14:** `09618085084` is configured, privacy notice v2 is approved, the obsolete pending-approval marker is removed, and local registration reports open. Repeat/verify these settings in production after deployment.

- [ ] **P0-05 — Verify production email delivery.** **Surface:** confirmation, owner-access, and staff email flows. **Owner/dependency:** domain/DNS and Resend owner; depends on verified SPF/DKIM and production API credentials. **Acceptance:** real messages reach Gmail, Yahoo, and Outlook test recipients, spam placement is checked, manage links work once, failures appear in Admin → Emails, and resend/retry behavior is demonstrated.

- [ ] **P0-06 — Verify production Turnstile and abuse controls.** **Surface:** public registration submission. **Owner/dependency:** Cloudflare owner; depends on production hostname and keys. **Acceptance:** a legitimate registration passes, invalid or expired tokens are handled as designed, the documented fail-open behavior is observable in logs, and registration/IP rate limits remain active.

- [ ] **P0-07 — Run and record the production smoke test.** **Surface:** full cloud journey. **Owner/dependency:** release verifier; depends on P0-01 through P0-06 and fake test identities/inboxes. **Acceptance:** event view, household registration, email confirmation, secure owner edit, cancellation, staff login/search/edit, exports, snapshots, duplicate review, failed-email handling, deep links, health checks, and restart persistence pass; fake records are then removed or cancelled.

- [ ] **P0-08 — Keep registration in draft until every launch gate is signed off.** **Surface:** Admin → Settings. **Owner/dependency:** event admin; depends on P0-01 through P0-07. **Acceptance:** registration is opened only after each gate has dated evidence and the deployed commit is recorded.

  **Scope note:** local registration was opened on October 14 for release verification. Production remains unavailable and must not be opened until P0-01 through P0-07 pass.

## P1 — public navigation

Current state: the header logo returns home and the public header exposes Manage registration and Help; the event and registration destinations are reached through page content. There is no current-page indication. The footer duplicates Contact and Privacy but does not orient visitors to the wider site.

- [ ] **P1-NAV-01 — Define one consistent public navigation model.** **Surface:** public header on Home, Event, Register, Success, Manage, About, Contact, and Privacy routes. **Owner/dependency:** product/UX; depends on approved About copy and the primary event slug. **Acceptance:** Home/Event, Register when open, Manage registration, and Help are reachable with clear labels; links do not wrap or overflow at 320px; lower-priority destinations may move to a simple mobile menu rather than disappear.

- [ ] **P1-NAV-02 — Show location and current state.** **Surface:** public header/navigation. **Owner/dependency:** frontend. **Acceptance:** the current destination uses `aria-current="page"` plus a visible non-color-only state, the brand link remains labelled, and focus/active/hover states are distinct without changing font weight.

- [ ] **P1-NAV-03 — Make public navigation touch-safe.** **Surface:** header and footer links. **Owner/dependency:** frontend/design. **Acceptance:** interactive targets provide at least 44×44px effective touch areas where layout allows, focus rings remain visible, link labels remain readable at 200% zoom, and no critical destination depends on hover.

- [ ] **P1-NAV-04 — Improve admin navigation discoverability on phones.** **Surface:** ten-item event-admin navigation strip. **Owner/dependency:** admin UX/frontend. **Acceptance:** users can tell that more destinations are available off-screen, the active item remains visible, keyboard scrolling works, no page-level horizontal overflow is introduced, and role-hidden destinations stay inaccessible rather than merely hidden.

- [ ] **P1-NAV-05 — Test navigation without losing form data.** **Surface:** all links reachable during registration. **Owner/dependency:** frontend/E2E; depends on P1-REG-01. **Acceptance:** every internal and external exit path either preserves the in-progress form or obtains explicit confirmation before discarding it.

## P1 — committee login and staff onboarding

Current state: `/admin/login` provides email/password login, safe `next` handling, generic credential errors, loading state, lockout support, and an instruction to ask an event admin for password help. It lacks a route back to the public site and does not explicitly explain that participant registration requires no login.

- [x] **P1-AUTH-01 — Clarify who the login is for.** **Surface:** `/admin/login`. **Owner/dependency:** product copy/frontend. **Acceptance:** the page says it is for committee/event staff, tells attendees to use the public event registration instead, and links back to the event/home page without weakening the existing login controls. **Completed:** October 14, 2026; covered by the shared public-route and build checks.

- [x] **P1-AUTH-02 — Add an accessible password visibility control.** **Surface:** login and required password-change forms. **Owner/dependency:** frontend/security review. **Acceptance:** the control is keyboard accessible, has a changing accessible name, does not alter/persist the password, preserves password-manager compatibility, and meets the minimum touch target. **Completed:** October 14, 2026; shared component test verifies reveal/hide behavior and value preservation.

- [ ] **P1-AUTH-03 — Make authentication recovery messages specific.** **Surface:** login and account screens. **Owner/dependency:** frontend/API copy; preserve enumeration resistance. **Acceptance:** wrong credentials remain generic, locked accounts state the retry window, expired sessions tell the user to reload/sign in again, and password-reset instructions name the event-admin route without exposing account existence.

- [ ] **P1-AUTH-04 — Verify first-login onboarding end to end.** **Surface:** Staff → temporary password → Account. **Owner/dependency:** event admin plus E2E environment. **Acceptance:** a new staff member is forced to set a compliant password before accessing event data, the old temporary credential stops working, the intended destination is restored safely where appropriate, and removing access invalidates subsequent authorization.

- [ ] **P1-AUTH-05 — Keep attendee and staff identity models separate.** **Surface:** product scope and public copy. **Owner/dependency:** product owner. **Acceptance:** no participant signup/password feature is introduced; attendee changes continue through verified email links or committee-assisted identity checking.

## P1 — attendee registration process

Current journey: Home → Event details → four-step registration → Success → optional secure Manage registration. The flow matches the specification and already supports network retry, idempotency, privacy consent, large households, and mobile use.

- [x] **P1-REG-01 — Protect in-progress data during SPA navigation.** **Surface:** registration wizard. **Owner/dependency:** frontend/router. **Acceptance:** React Router navigation, browser back/forward, logo/nav links, refresh, tab close, and external links are covered; dirty forms receive a clear stay/leave choice; successful submission and an intentionally empty form do not trigger it; no PII is written to persistent shared-device storage. **Completed:** October 14, 2026; data-router test verifies stay/leave behavior and browser unload protection remains active.

- [x] **P1-REG-02 — Make the four-step progress indicator semantic.** **Surface:** registration header. **Owner/dependency:** frontend/accessibility. **Acceptance:** assistive technology can identify all step names and the current step, `aria-current="step"` is used appropriately, focus moves to the new step heading, and the compact visual indicator still fits at 320px without destructive truncation. **Completed:** October 14, 2026; progress is now a labelled navigation list with an announced current step.

- [x] **P1-REG-03 — Clarify the contact requirement before validation.** **Surface:** “Your details.” **Owner/dependency:** content design/frontend. **Acceptance:** neutral helper copy explains that email, Philippine mobile, or Messenger is required; untouched fields do not look invalid; the error state appears only after validation; preferred-contact choices only include entered methods; email benefits and non-email limitations remain clear. **Completed:** October 14, 2026; the pre-validation instruction is neutral while existing validation behavior is preserved.

- [ ] **P1-REG-04 — Validate the optional branch step with real users.** **Surface:** “Family branch.” **Owner/dependency:** organizer/UX test participants. **Acceptance:** five mixed-age participants can explain “family branch,” locate Other/Unsure, and continue without assuming the optional field is required; if repeated confusion appears, revise the explanation before considering structural changes to the approved four-step flow.

- [ ] **P1-REG-05 — Verify attendee-entry efficiency and edge cases.** **Surface:** “Who is coming.” **Owner/dependency:** QA/E2E. **Acceptance:** representative opt-in, 1/10/20 attendees, bulk RSVP, adult/child explanation, remove/re-add, long names, zero-attendee reason, and maximum-limit messaging work at 320px, 375px, 768px, and desktop sizes without hidden actions or horizontal overflow.

- [ ] **P1-REG-06 — Complete registration-state coverage.** **Surface:** all wizard steps. **Owner/dependency:** frontend/QA. **Acceptance:** loading, empty, field error, form error, Turnstile pending/failure, slow network, offline/network failure, idempotency conflict, success, and unexpected server failure each give a specific message, preserve valid input, and provide one clear next action.

- [ ] **P1-REG-07 — Verify the review and consent stage.** **Surface:** “Review & submit.” **Owner/dependency:** privacy owner plus QA. **Acceptance:** edit actions return to the correct step, totals and RSVP labels match entered people, long privacy text is keyboard readable, the approved notice/version is displayed, consent errors focus correctly, and submission cannot be double-fired.

- [ ] **P1-REG-08 — Strengthen the completion and recovery path.** **Surface:** registration success. **Owner/dependency:** frontend/content. **Acceptance:** the page clearly confirms the event, reference, totals, email/no-email outcome, late status, print/screenshot option, and next actions; revisiting without saved success state points safely to Manage registration and organizer help.

- [ ] **P1-REG-09 — Reverify secure owner management.** **Surface:** `/registration/manage`. **Owner/dependency:** email delivery plus E2E. **Acceptance:** generic access-request responses prevent account discovery, one-time links disappear from the URL after exchange, edits respect the deadline/revision check, contact details stay staff-managed, cancellation is explicit and recoverable through organizers, and a participant cannot reach another registration.

- [ ] **P1-REG-10 — Run lightweight usability validation.** **Surface:** complete public journey. **Owner/dependency:** organizer recruits five participants across age/technical-comfort ranges. **Acceptance:** each participant can find the event, register a four-person household, explain whether the representative is counted, locate their reference, and describe how to make a change without facilitator help; observed hesitation and failure points are recorded before UI changes are prioritized.

## P1 — footer and site information

Current state: the footer contains the tagline plus Privacy and Contact. Public event/contact/privacy content comes from event configuration, which correctly prevents fabricated organizer or venue details. There is no About page or concise explanation of the platform versus the event organizer.

- [x] **P1-INFO-01 — Add truthful About-style platform context.** **Surface:** new public `/about` route and footer summary. **Owner/dependency:** product owner approves copy. **Acceptance:** content explains what HelloEventHub does, that event organizers control event details and participant data, and that public attendees do not need an account; it makes no unsupported company, security-certification, trademark, or ownership claims. **Completed:** October 14, 2026; `/about` and its route test were added.

- [x] **P1-INFO-02 — Expand the footer information architecture.** **Surface:** all public pages. **Owner/dependency:** frontend/content; depends on P1-INFO-01. **Acceptance:** footer groups About, Event details, Help/Contact, Privacy, and a discreet Committee sign-in destination; it retains the tagline, wraps cleanly at 320px, uses descriptive link text, and does not compete with page-level primary actions. **Completed:** October 14, 2026; the responsive footer and site-information navigation are covered by a component test and production build.

- [ ] **P1-INFO-03 — Keep event information authoritative and configurable.** **Surface:** Home, Event, Contact, Privacy, and footer event link. **Owner/dependency:** event admin. **Acceptance:** title, description, date/time/timezone, onsite-registration time, venue/map, registration status, age policy, contact, and privacy text come from event configuration; missing data uses honest fallback copy rather than invented details.

- [ ] **P1-INFO-04 — Define route-specific document metadata.** **Surface:** browser title and HTML head. **Owner/dependency:** frontend/content. **Acceptance:** Home, Event, Register, Success, Manage, About, Contact, Privacy, Not Found, Login, and admin pages have accurate titles; public descriptions are specific; sensitive/private routes do not include participant data in titles or metadata.

- [ ] **P1-INFO-05 — Complete canonical and social-sharing metadata.** **Surface:** index/head and event route. **Owner/dependency:** frontend/deployment; depends on the production base URL. **Acceptance:** canonical URL, `og:url`, absolute share-image URL, Open Graph title/description, and relevant Twitter card fields resolve correctly for the public event and do not advertise stale placeholder information.

- [ ] **P1-INFO-06 — Add event structured data.** **Surface:** public event page. **Owner/dependency:** frontend plus organizer-confirmed event content. **Acceptance:** valid JSON-LD uses schema.org `Event`, accurate local dates/timezone, attendance mode, location only when known, canonical URL, and registration status; validation passes without fabricated offers, prices, performers, or venue data.

- [ ] **P1-INFO-07 — Prevent indexing of private/utility routes.** **Surface:** admin, login, registration success, and manage-registration routes. **Owner/dependency:** frontend/server headers. **Acceptance:** `noindex` is applied to private/utility pages, `robots.txt` remains a crawl hint rather than the only privacy control, and public Home/Event/About/Contact/Privacy pages remain indexable as intended.

- [ ] **P1-INFO-08 — Review site information as a trust journey.** **Surface:** Home → Event → Register → Success. **Owner/dependency:** product/UX. **Acceptance:** a five-second review communicates what the site is, which event is active, who to contact, what data is requested, whether an account is needed, and what happens after submission.

## P2 — visual system and interface polish

- [ ] **P2-UI-01 — Replace remaining primitive colors with semantic tokens.** **Surface:** shared inputs, danger hover, neutral badges/success summary. **Owner/dependency:** frontend/design. **Acceptance:** hard-coded `#A9BCCB`, `#912018`, and `#EEF2F6` usages are represented by role-based tokens; contrast remains WCAG 2.2 AA and tokens are named for purpose rather than appearance.

- [ ] **P2-UI-02 — Audit all interactive states.** **Surface:** buttons, links, fields, radio groups, checkboxes, navigation, sharing, and admin actions. **Owner/dependency:** frontend/QA. **Acceptance:** default, hover-capable pointer, active, focus-visible, disabled, loading, error, and success states are intentional; touch devices do not retain misleading hover styling; reduced-motion preferences remain respected.

- [ ] **P2-UI-03 — Normalize spacing, radii, and hierarchy.** **Surface:** public and admin components. **Owner/dependency:** design/frontend. **Acceptance:** spacing follows the existing 4/8px-derived scale, related controls group more tightly than separate sections, nested radii are visually concentric, heading levels are sequential, and long-form text stays within a readable measure.

- [ ] **P2-UI-04 — Perform manual accessibility checks.** **Surface:** public and admin web apps. **Owner/dependency:** QA with real browser/device access. **Acceptance:** screen-reader landmarks/announcements, keyboard order, 200%/400% zoom, high contrast, visible focus, touch targets, error recovery, and real-device behavior pass; automated Axe results are attached but are not treated as complete accessibility proof.

- [ ] **P2-UI-05 — Keep dark mode deferred for this event release.** **Surface:** design scope. **Owner/dependency:** product owner. **Acceptance:** no partial/inverted dark theme is shipped; if later prioritized, it receives a separate semantic palette, elevation strategy, contrast test, and complete component-state audit.

- [ ] **P2-UI-06 — Re-run the anti-template review after visual changes.** **Surface:** public brand pages and product/admin screens. **Owner/dependency:** design review. **Acceptance:** the Celebration Pine/event identity remains the distinctive element; changes do not add ornamental glass, generic purple/cyan gradients, gradient text, repetitive icon-card grids, side-accent cards, excessive pills, bounce motion, or marketing buzzwords.

## P2 — engineering, operations, and post-event work

- [ ] **P2-ENG-01 — Align all development and release environments on Node 22.** **Surface:** local shell, CI, HelloDeploy, and documentation. **Owner/dependency:** engineering/deployment. **Acceptance:** `node --version` is within `>=22 <23` everywhere and lint, types, tests, builds, seed, and runtime smoke tests pass under that version.

- [x] **P2-ENG-02 — Restore reproducible local browser testing.** **Surface:** Playwright tooling. **Owner/dependency:** engineering workstation/CI image. **Acceptance:** the pinned Playwright Chromium binary is installed or `PW_CHROMIUM_PATH` is documented, `npm run test:e2e:self-contained` runs all 14 scenarios, and results are recorded against the release commit. **Completed:** October 14, 2026; Ubuntu 26.04 uses the documented `/usr/bin/google-chrome` fallback, all 14 browser scenarios pass, and the venue simulation ends with `ALL CHECKS PASSED`.

- [ ] **P2-ENG-03 — Upgrade Vitest 3 to 4 in a controlled change.** **Surface:** test toolchain. **Owner/dependency:** engineering after the event/release freeze. **Acceptance:** production and full dependency audits are reviewed, config/API migrations are complete, and all unit, integration, browser, build, and venue checks remain green.

- [ ] **P2-ENG-04 — Add external operational alerts.** **Surface:** production health, database, email worker, and scheduler. **Owner/dependency:** hosting/operations. **Acceptance:** named owners receive actionable alerts for downtime/degraded DB health, sustained email failures/backlog, and missed snapshot/scheduler activity; alert routing and recovery steps are tested.

- [ ] **P2-ENG-05 — Split large modules only when active work justifies it.** **Surface:** venue `App.tsx`, registration form/service, and large route modules. **Owner/dependency:** engineering; no pre-launch refactor. **Acceptance:** each extraction has a behavior-preserving test boundary and reduces change concentration without duplicating contracts or state.

- [ ] **P2-OPS-01 — Complete actual-device venue rehearsal.** **Surface:** venue laptop, router, phones/tablets, backups, printed fallback, and sync. **Owner/dependency:** venue lead/operators by October 23. **Acceptance:** WAN-disconnected check-in, simultaneous stations, walk-ins, correction/undo, restart, backup/restore, reconnect, checksum, conflict handling, and final reconciliation pass on the real equipment with named owners.

- [ ] **P2-OPS-02 — Monitor and reconcile through the event.** **Surface:** dashboard, duplicates, email queue, snapshots, exports, and venue sync. **Owner/dependency:** event admin/operations. **Acceptance:** daily checks have named owners; the October 20 snapshot is verified; one secure export reconciles with dashboard totals; event-day sync ends with zero pending operations or a documented resolution list.

- [ ] **P2-OPS-03 — Execute the approved retention plan.** **Surface:** cloud and venue participant data. **Owner/dependency:** privacy controller after final reconciliation, no later than January 22, 2027. **Acceptance:** a final backup and dry run are reviewed, the approved anonymize/delete command is applied with the correct event confirmation, results are audited, venue/USB copies are removed, and device tokens are revoked.

## Compatibility and non-goals

- This backlog does not authorize changes to APIs, schemas, database invariants, role permissions, retention policy, or the accountless participant model.
- Do not add public account signup, payments, QR scanning, advanced event discovery, a generic form builder, a family-tree feature, or visual redesign work to the current release.
- Do not fabricate venue details, organizer contacts, testimonials, user counts, legal claims, security certifications, prices, or business identity.
- Continue treating exports, logs, emails, and venue data as PII-bearing operational material rather than public content or backup substitutes.

## Completion rules

**Public launch ready** means P0-01 through P0-08 have dated evidence, the exact deployed commit is recorded, registration is intentionally opened, and the production smoke test has passed.

**Public UX ready** means navigation, staff-login orientation, dirty-form protection, semantic progress, registration state coverage, footer/site context, metadata, and the five-person usability test meet their acceptance criteria without adding participant accounts.

**Event-day ready** means the final roster is verified, actual-device offline rehearsal and restore pass, printed fallback exists, operators are trained, and reconciliation ownership is assigned.
