#!/usr/bin/env node
// Automated venue rehearsal against a RUNNING cloud server (doc 12 "P1 exit criteria"):
// preload + checksum, two stations, duplicate check-ins, WAN outage with local check-ins
// and walk-ins, venue server reboot, backup, conflict injection, reconnection and replay.
//
// Usage:
//   CLOUD=http://localhost:3210 ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/venue-simulation.mjs
// The cloud must run with SYNC_SETTLE_MS small (e.g. 1000) for a quick run.
// Creates clearly-marked test registrations ("SIM ...") — run against local/staging only.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLOUD = process.env.CLOUD ?? 'http://localhost:3210';
const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@local.test', password: process.env.ADMIN_PASSWORD ?? 'local-dev-password-123' };
const SLUG = process.env.EVENT_SLUG ?? 'mb-wa-reunion-2026';
const VENUE_PORT = Number(process.env.VENUE_PORT ?? 8091);
const VENUE = `http://127.0.0.1:${VENUE_PORT}`;
const DEAD_CLOUD = 'http://127.0.0.1:9'; // nothing listens here: simulates "no internet"
const tag = `SIM${Date.now().toString(36).toUpperCase()}`;

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${msg}`);
  if (!cond) failures++;
};
const step = (s) => console.log(`\n== ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- tiny cookie-aware client
function client(base, extraHeaders = {}) {
  const jar = new Map();
  return async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...extraHeaders, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';');
      const [k, ...v] = kv.split('=');
      jar.set(k.trim(), v.join('='));
    }
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: res.status, body: json };
  };
}

// ---------------------------------------------------------------- venue process control
const dataDir = mkdtempSync(path.join(tmpdir(), 'heh-venue-sim-'));
let venueProc;
function venueEnv(cloudUrl, eventId, token) {
  return {
    ...process.env,
    VENUE_PORT: String(VENUE_PORT),
    VENUE_HOST: '127.0.0.1',
    VENUE_DATA_DIR: path.join(dataDir, 'data'),
    VENUE_BACKUP_DIR: path.join(dataDir, 'backups'),
    CLOUD_BASE_URL: cloudUrl,
    CLOUD_EVENT_ID: eventId,
    CLOUD_DEVICE_TOKEN: token,
    SYNC_INTERVAL_MS: '600000', // sync only when triggered, for determinism
  };
}
async function startVenue(env) {
  venueProc = spawn(process.execPath, [path.join(root, 'apps/venue/dist/server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  venueProc.stderr.on('data', () => undefined);
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${VENUE}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error('venue server did not start');
}
async function stopVenue() {
  if (!venueProc) return;
  const p = venueProc;
  venueProc = undefined;
  const exited = new Promise((r) => p.once('exit', r));
  p.kill('SIGTERM');
  await exited;
}
const cli = (env, args, extra = {}) => spawnSync(process.execPath, [path.join(root, 'apps/venue/dist/cli.js'), ...args], { env: { ...env, ...extra }, encoding: 'utf8' });

// ---------------------------------------------------------------- run
try {
  step('Cloud: admin login, device token, test registrations');
  const cloud = client(CLOUD);
  const sess = await cloud('GET', '/api/v1/auth/session');
  const login = await cloud('POST', '/api/v1/auth/login', ADMIN, { 'X-CSRF-Token': sess.body.csrfToken });
  ok(login.status === 200, 'admin signed in');
  const csrf = login.body.csrfToken;
  const events = await cloud('GET', '/api/v1/admin/events');
  const eventId = events.body.items.find((e) => e.slug === SLUG)?.id;
  ok(!!eventId, `event ${SLUG} found`);
  const dev = await cloud('POST', `/api/v1/admin/events/${eventId}/venue-devices`, { label: `Sim laptop ${tag}` }, { 'X-CSRF-Token': csrf });
  ok(dev.status === 201 && dev.body.token, 'device token issued');
  const ev = (await cloud('GET', `/api/v1/events/${SLUG}`)).body;
  const reg = async (rep, people) =>
    (
      await fetch(`${CLOUD}/api/v1/events/${ev.id}/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({
          representative: { name: `${rep} ${tag}`, contacts: { mobile: '09170000000', preferred: 'mobile' } },
          attendees: people.map((p) => ({ fullName: `${p} ${tag}`, ageCategory: 'adult', rsvp: 'confirmed' })),
          acceptedPrivacy: true,
          consentVersion: ev.consentVersion,
        }),
      })
    ).json();
  const h1 = await reg('SIM Household One', ['SIM Lolo', 'SIM Lola']);
  const h2 = await reg('SIM Household Two', ['SIM Tito', 'SIM Tita', 'SIM Pinsan']);
  const h3 = await reg('SIM Household Three', ['SIM Cancel Me']);
  ok(h1.reference && h2.reference && h3.reference, 'three households registered online');
  const dash0 = (await cloud('GET', `/api/v1/admin/events/${eventId}/dashboard`)).body;
  await sleep(1500); // let the cloud settle window pass

  step('Venue: preload roster while online, verify checksum');
  const onlineEnv = venueEnv(CLOUD, eventId, dev.body.token);
  cli(onlineEnv, ['operator-add', '--name', 'Ana', '--role', 'lead'], { VENUE_PIN: '246810' });
  cli(onlineEnv, ['operator-add', '--name', 'Ben', '--role', 'operator'], { VENUE_PIN: '135790' });
  const syncOut = cli(onlineEnv, ['sync']);
  ok(syncOut.status === 0, 'initial sync succeeded');
  const pulled = JSON.parse(syncOut.stdout);
  ok(pulled.pull?.verified === true, `roster verified by checksum (${pulled.pull?.activeCount} active people)`);
  await startVenue(onlineEnv);
  const ana = client(VENUE, { 'X-Venue-Request': '1' });
  const ben = client(VENUE, { 'X-Venue-Request': '1' });
  ok((await ana('POST', '/api/login', { name: 'Ana', pin: '246810', station: 'Table 1' })).status === 200, 'station 1 (Ana) signed in');
  ok((await ben('POST', '/api/login', { name: 'Ben', pin: '135790', station: 'Table 2' })).status === 200, 'station 2 (Ben) signed in');
  const find = async (who, name) => (await who('GET', `/api/search?q=${encodeURIComponent(`${name} ${tag}`)}`)).body.items[0];
  const lolo = await find(ana, 'SIM Lolo');
  ok(!!lolo, 'search finds a preregistered attendee by name');

  step('Two stations check in the same person at once');
  const [r1, r2] = await Promise.all([ana('POST', '/api/checkins', { opId: randomUUID(), attendeeId: lolo.attendeeId }), ben('POST', '/api/checkins', { opId: randomUUID(), attendeeId: lolo.attendeeId })]);
  ok([r1.body.status, r2.body.status].sort().join() === 'already_checked_in,checked_in', 'exactly one accepted, the other shown as already checked in');

  step('Internet goes down (WAN unplugged)');
  await stopVenue();
  const offlineEnv = venueEnv(DEAD_CLOUD, eventId, dev.body.token);
  await startVenue(offlineEnv);
  const ana2 = client(VENUE, { 'X-Venue-Request': '1' });
  await ana2('POST', '/api/login', { name: 'Ana', pin: '246810', station: 'Table 1' });
  const lola = await find(ana2, 'SIM Lola');
  const tito = await find(ana2, 'SIM Tito');
  const cancelMe = await find(ana2, 'SIM Cancel Me');
  const retryOp = randomUUID();
  ok((await ana2('POST', '/api/checkins', { opId: retryOp, attendeeId: lola.attendeeId })).body.status === 'checked_in', 'offline check-in saved locally');
  ok((await ana2('POST', '/api/checkins', { opId: retryOp, attendeeId: lola.attendeeId })).body.status === 'checked_in', 'retried request (same op id) is idempotent');
  ok((await ana2('POST', '/api/checkins', { opId: randomUUID(), attendeeId: tito.attendeeId })).body.status === 'checked_in', 'second offline check-in saved');
  ok((await ana2('POST', '/api/checkins', { opId: randomUUID(), attendeeId: cancelMe.attendeeId })).body.status === 'checked_in', 'check-in for a person who will be cancelled online');
  const walk = await ana2('POST', '/api/walkins', {
    groupName: `SIM Walk-in Family ${tag}`,
    members: [
      { opId: randomUUID(), fullName: `SIM Walker One ${tag}`, ageCategory: 'adult' },
      { opId: randomUUID(), fullName: `SIM Walker Two ${tag}`, ageCategory: 'child' },
    ],
  });
  ok(walk.status === 201 && walk.body.items.length === 2, 'walk-in household registered and checked in offline');
  const offSync = await ana2('POST', '/api/sync', {});
  ok(offSync.body.error === 'Cloud unreachable', 'sync attempt reports cloud unreachable (no data lost)');
  ok(offSync.body.stats.pendingSync === 6, `6 operations waiting to sync (got ${offSync.body.stats.pendingSync})`);

  step('Offline corrections: fix a person, add a baby to a household, undo a wrong check-in');
  const tita = await find(ana2, 'SIM Tita');
  const pinsan = await find(ana2, 'SIM Pinsan');
  const patch = (who, id, body) => who('PATCH', `/api/attendees/${encodeURIComponent(id)}`, { opId: randomUUID(), ...body });
  ok((await patch(ana2, tita.attendeeId, { rsvp: 'tentative' })).body.attendee?.rsvp === 'tentative', 'RSVP correction shows immediately offline');
  ok((await patch(ana2, pinsan.attendeeId, { fullName: `SIM Pinsan Venue ${tag}` })).status === 200, 'name correction saved offline');
  const added = await ana2('POST', `/api/households/${encodeURIComponent(tito.registrationId)}/members`, { checkIn: true, members: [{ opId: randomUUID(), fullName: `SIM Baby ${tag}`, ageCategory: 'child' }] });
  ok(added.status === 201 && added.body.items[0]?.checkedIn, 'extra person added to an existing household and checked in');
  const undoTito = await ana2('POST', `/api/attendees/${encodeURIComponent(tito.attendeeId)}/undo-checkin`, { opId: randomUUID(), reason: 'wrong person' });
  ok(undoTito.status === 200 && undoTito.body.attendee.checkedIn === null, 'lead undid a mistaken (unsynced) check-in');
  const branches = await ana2('GET', '/api/branch-stats');
  ok(Array.isArray(branches.body.items) && branches.body.items.length > 0, 'branch breakdown available offline');
  const pendingOffline = (await ana2('GET', '/api/status')).body.stats.pendingSync;
  ok(pendingOffline === 8, `8 operations waiting (Tito's undone check-in never needs sending) (got ${pendingOffline})`);

  step('Venue laptop reboots while offline');
  await stopVenue();
  await startVenue(offlineEnv);
  const health = (await (await fetch(`${VENUE}/api/health`)).json());
  ok(health.pendingSync === pendingOffline, 'pending operations survived the restart');
  const backup = cli(offlineEnv, ['backup']);
  ok(backup.status === 0 && readdirSync(path.join(dataDir, 'backups')).length >= 1, 'backup written');

  step('Meanwhile online: organizer cancels a registration (conflict injection)');
  const regDetail = (await cloud('GET', `/api/v1/admin/events/${eventId}/registrations/${h3.registrationPublicId}`)).body.registration;
  const cancel = await cloud('POST', `/api/v1/admin/events/${eventId}/registrations/${h3.registrationPublicId}/cancel?notify=false`, { revision: regDetail.revision }, { 'X-CSRF-Token': csrf });
  ok(cancel.status === 200, 'registration cancelled online');
  // Conflict: an organizer also edits Pinsan online while the venue has its own offline edit.
  const h2Detail = (await cloud('GET', `/api/v1/admin/events/${eventId}/registrations/${h2.registrationPublicId}`)).body.registration;
  const h2Body = {
    revision: h2Detail.revision,
    representative: { name: h2Detail.representativeName, contacts: h2Detail.contacts },
    attendees: h2Detail.attendees.map((a) => ({ publicId: a.id, fullName: a.fullName, ageCategory: a.ageCategory, rsvp: a.fullName.startsWith('SIM Pinsan') ? 'declined' : a.rsvp })),
  };
  ok((await cloud('PATCH', `/api/v1/admin/events/${eventId}/registrations/${h2.registrationPublicId}?notify=false`, h2Body, { 'X-CSRF-Token': csrf })).status === 200, 'organizer edited the same person online (conflict injected)');

  step('Internet returns: sync');
  await stopVenue();
  await startVenue(onlineEnv);
  const ana3 = client(VENUE, { 'X-Venue-Request': '1' });
  await ana3('POST', '/api/login', { name: 'Ana', pin: '246810', station: 'Table 1' });
  await sleep(1500);
  const onSync = await ana3('POST', '/api/sync', {});
  ok(!onSync.body.error, 'sync succeeded after reconnection');
  ok(onSync.body.stats.pendingSync === 0, 'nothing left pending');
  // The venue server also syncs once at startup, so check the persistent review queue.
  ok(onSync.body.stats.needsReview === 2, `2 conflicts flagged for review: cancelled person + edited-online person (got ${onSync.body.stats.needsReview})`);
  const review = await ana3('GET', '/api/review');
  const kinds = review.body.items.map((i) => i.kind).sort().join(',');
  ok(kinds === 'attendee_update,checkin', `review list shows both conflicts (got ${kinds})`);
  ok(onSync.body.pull?.verified === true, 'roster re-verified after sync');
  const again = await ana3('POST', '/api/sync', {});
  ok(again.body.push?.sent === 0, 'replaying sync sends nothing new');

  step('Cloud totals reconcile');
  const dash = (await cloud('GET', `/api/v1/admin/events/${eventId}/dashboard`)).body;
  ok(dash.checkedIn - dash0.checkedIn === 5, `cloud check-ins +5: Lolo, Lola, 2 walk-ins, baby — Tito's undone check-in never counted (got ${dash.checkedIn - dash0.checkedIn})`);
  // −1 cancelled, +2 walk-ins, +1 baby, −1 Tita→maybe, −1 Pinsan declined online (venue edit did not overwrite) = 0
  ok(dash.confirmed - dash0.confirmed === 0, `confirmed headcount change 0 (got ${dash.confirmed - dash0.confirmed})`);
  const h2After = (await cloud('GET', `/api/v1/admin/events/${eventId}/registrations/${h2.registrationPublicId}`)).body.registration;
  ok(h2After.attendees.some((a) => a.fullName === `SIM Baby ${tag}`), 'baby added to the right household online');
  ok(h2After.attendees.some((a) => a.fullName.startsWith('SIM Tita') && a.rsvp === 'tentative'), 'venue RSVP correction applied online');
  ok(h2After.attendees.some((a) => a.fullName === `SIM Pinsan ${tag}` && a.rsvp === 'declined'), 'online edit kept; conflicting venue edit not applied blindly');
  const walkSearch = (await cloud('GET', `/api/v1/admin/events/${eventId}/registrations?q=${encodeURIComponent(`walk-in family ${tag}`)}`)).body;
  ok(walkSearch.total === 1 && walkSearch.items[0].source === 'venue', 'walk-ins appear online as one venue registration');
  const status = await ana3('GET', '/api/status');
  ok(status.body.stats.checkedIn >= 5, 'venue still shows everyone who arrived');

  await cloud('POST', `/api/v1/admin/events/${eventId}/venue-devices/${dev.body.id}/revoke`, undefined, { 'X-CSRF-Token': csrf });
} catch (err) {
  failures++;
  console.error('Simulation error:', err);
} finally {
  await stopVenue();
}
const kept = process.env.KEEP_VENUE_SIM_DATA === 'true';
if (!kept) rmSync(dataDir, { recursive: true, force: true });
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}${kept ? `  (venue data: ${dataDir})` : ''}`);
process.exit(failures === 0 ? 0 : 1);
