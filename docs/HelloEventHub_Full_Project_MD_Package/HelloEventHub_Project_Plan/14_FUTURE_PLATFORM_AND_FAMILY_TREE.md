# 14 | Post-reunion product roadmap (NOT for P0/P1 delivery)

## P2 reusable multi-event management
Multiple organizations, event templates, custom categories, scheduled registration windows, custom event branding, organizer invitation and scoped permissions, per-event analytics, archives. Start schema event-scoped now; defer UI and onboarding until after Oct 24.

## P3 heritage/genealogy
Original handwritten Alsem/Menay–Wakat family records are historical source documents and are still being proofread. Build separate `persons`, `relationships`, `sources`, `verification_requests` with page traceability, parental/partner/adoptive links and privacy control. Never import unverified transcriptions as factual public genealogy. Link event attendee to a person only after identity validation; do not require a tree record for registration.

## P4 commercial SaaS
Self-service organizer signup, free/paid tiers, billing, tenant isolation audits, org-specific domains, integrations, payment gateways, custom form builder and message automation. Analyze cost and support burden before designing. Keep sports activity validation primarily in HelloRun where suitable; an integration can be considered later.

## Event categories
Family reunions, school events, seminars, conferences, community activities, private gatherings and sports-related event registration. Do not require family branch fields for general event types; model as optional event category or future configurable questions.

## Evaluation milestones
After initial event, review conversion, drop-off, errors, admin time, actual attendance vs forecast, offline incidents and feedback. Use findings to prioritize reusable organizer features before monetization.
