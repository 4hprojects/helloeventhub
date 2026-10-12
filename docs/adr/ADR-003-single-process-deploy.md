# ADR-003: One deployable process; Mongo-backed shared state

**Context.** HelloDeploy runs one Docker container per app behind a reverse proxy. Its other capabilities are unverified.

**Decision.** A single image serves `/api/v1` and the SPA from the same origin, and runs the email worker plus the snapshot scheduler in-process. Sessions, rate limits, idempotency keys and the email outbox all live in MongoDB, so adding instances later needs no new infrastructure. A separate `worker.js` entrypoint lets the worker scale on its own.

**Alternatives.** Separate static hosting plus API (CORS and cookie complexity, two deploy targets); Redis for sessions and rate limits (extra service to verify on HelloDeploy).

**Security impact.** Same-origin cookies (`SameSite=Lax`, `Secure` in production, path `/api`), so a CORS allowlist is only needed for extra origins. An origin guard blocks cross-site mutations.
