# Manual checklist (owner / organizers)

Everything here needs a human: accounts, DNS, secrets, organizer decisions, hardware. The code is done. Items are ordered by deadline. Commands assume the repo root.

Legend: 🔴 blocks the public launch (target **Oct 15**) · 🟠 needed by **Oct 20** · 🟡 needed by the **Oct 23** rehearsal

---

## 1. Organizer decisions 🔴 (enter them in Admin → Settings; nothing is hard-coded)

| Decision | Current default in the app | Where to set it |
|---|---|---|
| [ ] Official event title | "Menay Bugtong–Wakat Alsem Clan Reunion 2026" (working title) | Settings → Official title |
| [ ] Venue name, address, map link | Hidden ("Venue to be announced") | Settings → Venue |
| [ ] Organizer contact (email / phone / Messenger) | None shown | Settings → Organizer contact |
| [ ] Event description | Empty | Settings → Description |
| [ ] Adult/child age definition | "Organizers will confirm the age that counts as a child." | Settings → Adult / child definition |
| [ ] Oct 20 headcount cutoff time | **Oct 20, 23:59 Asia/Manila** (automatic snapshot) | Settings → Planning headcount cutoff |
| [ ] Late registration after the cutoff | Allowed, marked "late" | Settings → Accept late registrations |
| [ ] Capacity | No limit | Settings → Capacity |
| [ ] Online changes deadline | Until event start | Settings → Online changes allowed until |
| [ ] Family branch labels (8 + Other/Unsure, all provisional) | Albina, Magdalena, Mary, Toribio, Ganzon, Onofre, Mistihil, Denio, Other/Unsure | Settings → Family branches (rename or hide) |
| [ ] **Privacy notice** text, retention period, and who the "controller" is (Data Privacy Act) | DRAFT template with `[ORGANIZERS TO CONFIRM]` placeholders | Settings → Privacy notice → edit, bump the version, tick "approved" |
| [ ] Who is event admin vs committee | — | See §5 |

## 2. Hosting: HelloDeploy smoke test 🔴 (doc 10)

Deploy the repo with its `Dockerfile` and record pass/fail for each step:

- [ ] Control of `helloeventhub.online` and DNS edit access confirmed.
- [ ] DNS A/CNAME set as HelloDeploy instructs; a trusted HTTPS certificate is issued and http redirects to https.
- [ ] Secrets are set in HelloDeploy's secret store (§3) and don't appear in logs or response headers.
- [ ] `https://helloeventhub.online/api/v1/health` returns `{"status":"ok","db":"connected"}` (this proves Atlas connectivity).
- [ ] Redeploy or restart: data is still there and health is OK again.
- [ ] Logs are visible in HelloDeploy, and a crash restarts the container (the image has a Docker `HEALTHCHECK`).
- [ ] Deep links work, e.g. `https://helloeventhub.online/events/alsem-reunion-2026` loads.
- [ ] **If any critical step fails**, decide explicitly whether to use a temporary managed host rather than miss Oct 15. The same Docker image runs anywhere.

## 3. Accounts and secrets 🔴

- [ ] **MongoDB Atlas:** create the cluster, a DB user limited to the `helloeventhub` database, and add HelloDeploy's egress IP to the network allowlist. Put the connection string in `MONGODB_URI`.
- [ ] **Atlas backups:** turn on automated backups (M10+). On M0, schedule a `mongodump`. **Do one test restore** into a separate cluster.
- [ ] **Resend:** add the domain, add the SPF/DKIM records Resend shows you plus a DMARC record, wait for "Verified", create an API key and set `RESEND_API_KEY`. Set `EMAIL_FROM` (e.g. `HelloEventHub <noreply@helloeventhub.online>`). Send a real test to Gmail, Yahoo and Outlook addresses and check spam placement.
- [ ] **Cloudflare Turnstile:** create a widget for `helloeventhub.online` and set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
- [ ] **Session secret:** generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` and set it as `SESSION_SECRET`.
- [ ] Set the other production variables listed in `docs/DEPLOYMENT.md` §2 (`NODE_ENV=production`, `APP_BASE_URL=https://helloeventhub.online`, `TRUST_PROXY=1`, `CLOUDFLARE=true`, …).
- [ ] Cloudflare → SSL/TLS: same mode as the other HelloDeploy apps (origin is HTTP on port 80). "Full" without an origin certificate gives **error 525**.

## 4. Seed production data 🔴

From a trusted machine (production `MONGODB_URI` exported; `SESSION_SECRET` can be any 32+ character value for these scripts):

```bash
npm install
MONGODB_URI='mongodb+srv://…' SESSION_SECRET='…' npm run seed
```

## 5. Admin accounts 🔴

One per person; never share accounts. Passwords must be at least 12 characters.

```bash
MONGODB_URI='…' SESSION_SECRET='…' npm run create-admin -- --email organizer@example.com --name "Organizer Name" --role event_admin
MONGODB_URI='…' SESSION_SECRET='…' npm run create-admin -- --email member@example.com --name "Committee Member" --role committee
```

- [ ] Event admins created (they can export, snapshot, change settings, issue venue tokens).
- [ ] Committee members created (they can search, edit and add registrations, but not export).
- [ ] After the first event admin exists, add everyone else in **Admin → Staff** (one-time temporary password, changed on first sign-in). The CLI is still available for the first account.
- [ ] Password resets: an event admin uses **Admin → Staff → Reset password**.

## 6. Launch day (target Oct 15) 🔴

- [ ] All of §1–§5 done, and the privacy notice approved and marked approved.
- [ ] Atlas on-demand snapshot taken.
- [ ] Staging or production smoke test with **fake** names: register, receive the email, use the manage link, change an RSVP, cancel; admin search, edit and export. Then cancel the fake registrations.
- [ ] Admin → Settings → **Online registration: Open**.
- [ ] Share the link: `https://helloeventhub.online/events/alsem-reunion-2026`.
- [ ] Watch daily: Dashboard (counts, possible duplicates, failed emails) and Admin → Emails.

## 7. Before Oct 20 🟠

- [ ] Review the **Duplicates** queue (resolve or mark "not duplicate").
- [ ] Check that the automatic snapshot appears in Admin → Snapshots after the cutoff. If the cutoff time changed, capture a manual snapshot.
- [ ] Download the Excel report and file it securely. Exports contain personal data, so delete local copies when done.

## 8. Venue (P1) 🟡 — see `docs/VENUE_RUNBOOK.md`

- [ ] Main laptop with Node 22+ and full-disk encryption; charger and power strip.
- [ ] Router that works with the WAN unplugged; up to 4 extra station devices.
- [ ] Admin → Venue → create a device token and put it in `apps/venue/.env` on the laptop.
- [ ] Create operator PINs (`npm run cli -- operator-add …`); at least one `lead`.
- [ ] Pull the roster and confirm `verified: true`.
- [ ] **Rehearsal by Oct 23** with the WAN unplugged: run the whole checklist in the runbook on the actual phones.
- [ ] Printed roster and blank walk-in sheets ready; reconciliation owner assigned; training done.
- [ ] Decision recorded: **QR scanning is not shipped**; manual search is the primary method.

## 9. After the event

- [ ] Venue sync to zero pending; organizers resolve the "needs review" list.
- [ ] Final attendance report exported and signed off.
- [ ] Venue laptop data and backups deleted; device token revoked.
- [ ] Apply the retention policy from the privacy notice when it says so. Take an Atlas snapshot first, then:
  ```bash
  MONGODB_URI='…atlas…' SESSION_SECRET='…' npm run retention -- --event alsem-reunion-2026 --mode anonymize            # dry run: shows counts
  MONGODB_URI='…atlas…' SESSION_SECRET='…' npm run retention -- --event alsem-reunion-2026 --mode anonymize --apply --confirm alsem-reunion-2026
  ```
  `anonymize` keeps the counts and snapshots but removes all names, contacts and notes; `delete` removes the registrations entirely. Snapshots are kept either way.

## 10. Code hand-off decisions

- [ ] Review the changes, then decide when to commit and push. The repo is `git init`-ed locally with **no commits**.
- [ ] Optional: connect the GitHub repo so `.github/workflows/ci.yml` runs on every push.
