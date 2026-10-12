# Deployment guide (HelloDeploy → helloeventhub.online)

The cloud app is **one Docker image** (root `Dockerfile`) that listens on `PORT` (default 3000) and serves both the API and the web app. HelloDeploy builds Docker images with buildx and puts its reverse proxy in front of the container, so set `TRUST_PROXY=1`. The domain is proxied by Cloudflare, so also set `CLOUDFLARE=true` and use the same Cloudflare SSL/TLS mode as the other HelloDeploy apps (their origins serve HTTP on port 80; "Full"/"Full (strict)" without an origin certificate causes error 525).

> The hosting platform is not assumed to work until the smoke test in `MANUAL_CHECKLIST.md` §2 passes (doc 10).

## 1. Prerequisites (owner)

- MongoDB Atlas cluster (M0/M10; replica set is standard), a database user scoped to the `helloeventhub` DB, and a network allowlist entry for HelloDeploy's egress IP.
- Resend account with the sending domain verified (SPF/DKIM per Resend's DNS instructions, plus DMARC).
- Cloudflare Turnstile widget for `helloeventhub.online` (site key + secret key).
- DNS for `helloeventhub.online` pointing at HelloDeploy as its docs instruct.

## 2. Environment variables (production)

Set these in HelloDeploy's secret store. **Never commit them.**

| Variable | Example / rule |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` (or what HelloDeploy assigns) |
| `APP_BASE_URL` | `https://helloeventhub.online` (must be https) |
| `ALLOWED_ORIGINS` | empty (same origin), or extra origins comma-separated |
| `TRUST_PROXY` | `1` (trust only HelloDeploy's nginx — keep it 1 even behind Cloudflare) |
| `CLOUDFLARE` | `true` when the DNS record is proxied (orange cloud). The real visitor IP is then taken from `CF-Connecting-IP`, but only when the request arrives from a Cloudflare edge address, so rate limits are per visitor and can't be spoofed by bypassing Cloudflare |
| `EVENT_TIMEZONE` | `Asia/Manila` |
| `MONGODB_URI` | `mongodb+srv://USER:PASS@cluster.../helloeventhub?retryWrites=true&w=majority` |
| `SESSION_SECRET` | ≥ 32 random chars: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `RESEND_API_KEY` | from Resend (server-side only). Without it, emails stay *queued* — the app never pretends they were sent |
| `EMAIL_FROM` | `HelloEventHub <noreply@helloeventhub.online>` (a verified sender) |
| `EMAIL_REPLY_TO` | organizer inbox (optional) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | real keys; test keys are refused in production |
| `TURNSTILE_FAIL_OPEN` | `true` (accept-and-flag with a strict per-IP limit if Cloudflare is unreachable) |
| `PRIMARY_EVENT_SLUG` | `alsem-reunion-2026` |
| `SYNC_SETTLE_MS` | `65000` (leave default) |
| `LOG_LEVEL` | `info` |

The process refuses to start in production with missing/unsafe values (test Turnstile keys, `change-me` session secret, non-https base URL).

## 3. First deploy

1. Deploy the repo (HelloDeploy builds the `Dockerfile`). Indexes are created automatically on start.
2. Check `https://helloeventhub.online/api/v1/health` → `{"status":"ok","db":"connected"}`.
3. Seed and create admins **from a trusted machine** pointing at Atlas:
   ```bash
   MONGODB_URI='mongodb+srv://…' SESSION_SECRET=x…x(32+) npm run seed
   MONGODB_URI='mongodb+srv://…' SESSION_SECRET=… ADMIN_PASSWORD='…' npm run create-admin -- --email organizer@example.com --name "Organizer" --role event_admin
   MONGODB_URI='mongodb+srv://…' SESSION_SECRET=… ADMIN_PASSWORD='…' npm run create-admin -- --email member@example.com --name "Committee Member" --role committee
   ```
   (Or run `node apps/api/dist/scripts/seed.js` / `create-admin.js` inside the container if HelloDeploy supports one-off commands.)
4. Sign in at `/admin` → **Settings**: official title, venue, contacts, age definition, privacy notice (mark approved only after organizer sign-off), cutoff time. Then set **Online registration → Open**.
5. Smoke test with obviously fake identities, then cancel those registrations.

## 4. Each release

1. CI green (lint, typecheck, tests, build, docker build).
2. Take an Atlas on-demand snapshot.
3. Deploy. Check `/api/v1/health` and a test registration on staging/production.
4. Record version, time, person and result.

## 5. Rollback

Redeploy the previous image/commit. Schema changes so far are additive (new optional fields and indexes), so older releases run against newer data. Never run destructive migrations without a fresh snapshot.

## 6. Backups

- Atlas automated backups ON (or a scheduled `mongodump` if on M0, which has no automated backups).
- Test a restore into a separate temporary cluster before Oct 15, and again before Oct 23.
- CSV/XLSX exports are reports, not backups.

## 7. Scaling notes

- Sessions, rate limits, idempotency keys, the email outbox and the snapshot scheduler are all Mongo-backed and safe across multiple instances.
- To scale web horizontally, run N web containers with `EMAIL_WORKER_ENABLED=false` plus one container running `node apps/api/dist/worker.js` (the outbox claims jobs atomically, so even multiple workers are safe).
