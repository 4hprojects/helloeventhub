# ADR-004: Small refinements to the API contract

1. **Event slug is globally unique** in addition to `{organizationId, slug}`, because public URLs are `/events/:slug` without an organization segment.
2. **Resend endpoint is event-scoped:** `POST /admin/events/:eventId/registrations/:id/email/resend` instead of `/admin/registrations/:id/email/resend`, so the same event-scoped RBAC middleware guards every admin route. It is throttled to 3 per registration per hour and audited.
3. **Admin event access:** `platform_admin` does not grant event data access automatically (doc 08). Users need an `event_admin` or `committee` membership for that event or its organization. A missing grant returns **404**, so event IDs can't be probed.
4. **Zero-attendee registrations** are accepted only with an explicit "no one can attend" reason (doc 05).
5. **Automatic planning snapshot:** besides manual snapshots, the scheduler captures one at the event's `preregSnapshotAt` (idempotent key `auto:<cutoff>`). Snapshot policy v1 counts active registrations created at or before the cutoff, with edits as of capture time. That is why the automatic capture runs within a minute of the cutoff.
6. **Owner contact changes require staff,** because the verified email is the owner's credential.
7. **Production never fakes email delivery:** without `RESEND_API_KEY` the worker doesn't start and jobs stay `queued`.
