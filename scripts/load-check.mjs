#!/usr/bin/env node
// Load check against a RUNNING local production build (never production itself).
// Start the server with CLOUDFLARE=true TURNSTILE_DISABLED=true so each simulated visitor gets its own
// rate-limit bucket via CF-Connecting-IP (the real code path), then:
//   BASE=http://localhost:3210 node scripts/load-check.mjs
import { randomUUID } from 'node:crypto';
import autocannon from 'autocannon';

const BASE = process.env.BASE ?? 'http://localhost:3210';
const SLUG = process.env.EVENT_SLUG ?? 'alsem-reunion-2026';
const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@local.test', password: process.env.ADMIN_PASSWORD ?? 'local-dev-password-123' };
const DURATION = Number(process.env.DURATION ?? 15);
const CONNECTIONS = Number(process.env.CONNECTIONS ?? 20);
const CF_EDGE = '172.64.1.1'; // a Cloudflare edge address, so CF-Connecting-IP is honoured
const visitor = () => `198.18.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
const tag = `LOAD${Date.now().toString(36)}`;

function run(title, opts) {
  return new Promise((resolve, reject) => {
    const inst = autocannon({ url: BASE, duration: DURATION, connections: CONNECTIONS, ...opts }, (err, res) => (err ? reject(err) : resolve(res)));
    inst.on('error', reject);
  }).then((r) => {
    const row = {
      scenario: title,
      'req/s (avg)': Math.round(r.requests.average),
      'p50 ms': r.latency.p50,
      'p97.5 ms': r.latency.p97_5,
      'p99 ms': r.latency.p99,
      '2xx': r['2xx'],
      non2xx: r.non2xx,
      errors: r.errors + r.timeouts,
    };
    return row;
  });
}

const json = async (res) => ({ status: res.status, body: await res.json().catch(() => ({})), cookie: res.headers.getSetCookie?.() ?? [] });
const ev = (await json(await fetch(`${BASE}/api/v1/events/${SLUG}`))).body;
if (!ev.id) throw new Error('event not found — is the server running and seeded?');
if (!ev.registrationOpen) throw new Error('registration is not open on the local event');

// Admin session for the dashboard scenario.
const s = await json(await fetch(`${BASE}/api/v1/auth/session`));
const sid = s.cookie.map((c) => c.split(';')[0]).join('; ');
const login = await json(await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.body.csrfToken, Cookie: sid }, body: JSON.stringify(ADMIN) }));
if (login.status !== 200) throw new Error(`admin login failed (${login.status}) — check ADMIN_EMAIL/ADMIN_PASSWORD or rate limits`);
const adminCookie = login.cookie.map((c) => c.split(';')[0]).join('; ') || sid;
const adminEventId = (await json(await fetch(`${BASE}/api/v1/admin/events`, { headers: { Cookie: adminCookie } }))).body.items[0].id;

const before = (await json(await fetch(`${BASE}/api/v1/admin/events/${adminEventId}/registrations?q=${tag.toLowerCase()}&limit=1`, { headers: { Cookie: adminCookie } }))).body.total;

const rows = [];
rows.push(
  await run('Public event page API', {
    requests: [{ method: 'GET', path: `/api/v1/events/${SLUG}`, setupRequest: (r) => ({ ...r, headers: { 'X-Forwarded-For': CF_EDGE, 'CF-Connecting-IP': visitor() } }) }],
  }),
);
let sent = 0;
rows.push(
  await run('Registration submit (unique households)', {
    requests: [
      {
        method: 'POST',
        path: `/api/v1/events/${ev.id}/registrations`,
        setupRequest: (r) => {
          sent++;
          return {
            ...r,
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), 'X-Forwarded-For': CF_EDGE, 'CF-Connecting-IP': visitor() },
            body: JSON.stringify({
              representative: { name: `${tag} Household ${sent}`, contacts: { mobile: '09170000000', preferred: 'mobile' } },
              attendees: [
                { fullName: `${tag} Adult ${sent}`, ageCategory: 'adult', rsvp: 'confirmed' },
                { fullName: `${tag} Child ${sent}`, ageCategory: 'child', rsvp: 'tentative' },
              ],
              acceptedPrivacy: true,
              consentVersion: ev.consentVersion,
            }),
          };
        },
      },
    ],
  }),
);
rows.push(
  await run('Admin dashboard (live headcount)', {
    connections: Math.max(2, Math.round(CONNECTIONS / 4)),
    requests: [{ method: 'GET', path: `/api/v1/admin/events/${adminEventId}/dashboard`, headers: { Cookie: adminCookie } }],
  }),
);
console.table(rows);

const after = (await json(await fetch(`${BASE}/api/v1/admin/events/${adminEventId}/registrations?q=${tag.toLowerCase()}&limit=1`, { headers: { Cookie: adminCookie } }))).body.total;
const created = after - before;
const ok201 = rows[1]['2xx'];
// Requests still in flight when the timer stops complete on the server but aren't counted by autocannon,
// so created can exceed the 2xx count by at most the number of connections. Each request used a unique
// idempotency key and household number, so created must never exceed requests sent.
const consistent = created >= ok201 && created <= sent && created - ok201 <= CONNECTIONS;
console.log(`Registrations created: ${created}; counted successes: ${ok201}; requests sent: ${sent} → ${consistent ? 'consistent (no duplicates, none lost)' : 'MISMATCH'}`);
console.log(`Note: these are tagged "${tag}" in the LOCAL database.`);
process.exit(consistent && rows.every((r) => r.errors === 0) ? 0 : 1);
