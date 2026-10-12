# 02 | Architecture and repository structure

## Stack
- Frontend: React + TypeScript + Vite + Tailwind CSS; mobile-first accessible forms.
- API: Node.js LTS + Express + TypeScript; Zod request schemas.
- Primary DB: MongoDB Atlas + Mongoose; indexes, backups, explicit status transitions.
- Email: Resend with asynchronous send/outbox and retries.
- Reports: ExcelJS XLSX and escaped CSV.
- Hosting: HelloDeploy **only after verifying** Node.js process, HTTPS, custom domain, env secrets, outbound Atlas and Resend connections, logs, restart handling.
- P1: venue Node.js server + SQLite; optional Dexie/IndexedDB local PWA only after security and reliability tests.

## Recommended monorepo layout
```
apps/
  web/              # React client, public pages and admin UI
  api/              # Express API + MongoDB + mail worker
  venue/            # P1 local service and SQLite (not required for P0)
packages/
  contracts/        # Zod schemas, DTOs, enums
  ui/               # reusable accessible design components
  config/           # shared lint, TS configuration
scripts/            # export, seed, smoke tests
```
Use package manager workspace, lint, formatting, type checks, migrations/index bootstrap and environment templates. Do not commit `.env` values. Prefer a deployment path HelloDeploy can demonstrably support; monorepo layout can be simplified if necessary.

## System boundaries
1. **Public web** calls validated public routes; anonymous access cannot query directory.
2. **API** owns status transitions and count logic; never trust client-provided totals.
3. **DB** is the authority for cloud registration, with immutable identifiers.
4. **Email worker** sends asynchronously after transaction persisted.
5. **Committee UI** calls authenticated event-scoped endpoints.
6. **Venue service P1** becomes temporary operational authority during no-internet periods; exchanges versioned operations with cloud when possible.

## Environment configuration names (examples, never secrets)
`NODE_ENV`, `PORT`, `APP_BASE_URL`, `API_BASE_URL`, `MONGODB_URI`, `SESSION_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `ALLOWED_ORIGINS`, `EVENT_TIMEZONE=Asia/Manila`. Distinguish browser-safe and backend-only variables. Store secrets in HelloDeploy's verified secret mechanism.

## Observability
Structured request and job IDs; redact email, phone, Messenger links, tokens and names from logs. Expose access-controlled health endpoints; track API 5xx, form submit failures, outbox backlog, export failure, slow requests and DB connectivity. Plan a safe roll-back path.

## Architectural decision records
Document any deviations from these specifications in a concise ADR containing context, decision, alternatives, security impact and tests. Do not implement unnecessary microservices or a payment system.
