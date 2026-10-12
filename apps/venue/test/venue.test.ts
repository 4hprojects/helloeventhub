import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rosterChecksumInput, type SyncOp, type SyncOpResult, type VenueRosterItem } from '@heh/contracts';
import { createVenueApp } from '../src/app.js';
import { backupDb } from '../src/backup.js';
import { checkIn, stats, upsertRoster } from '../src/checkin.js';
import { openDb, type DB } from '../src/db.js';
import { upsertOperator } from '../src/operators.js';
import { localChecksum, pullRoster, pushPending, SyncLoop, type CloudClient } from '../src/sync.js';

const item = (n: number, over: Partial<VenueRosterItem> = {}): VenueRosterItem => ({
  attendeeId: `A${String(n).padStart(25, '0')}`,
  registrationId: `R${String(Math.ceil(n / 2)).padStart(25, '0')}`,
  reference: `HEH-0000000${Math.ceil(n / 2)}`,
  fullName: `Person Number ${n}`,
  ageCategory: 'adult',
  branch: 'Albina',
  rsvp: 'confirmed',
  representativeName: `Household ${Math.ceil(n / 2)}`,
  active: true,
  walkIn: false,
  revision: 1,
  checkedInAt: null,
  ...over,
});

/** In-memory stand-in for the cloud sync API with the same semantics. */
class FakeCloud implements CloudClient {
  roster: VenueRosterItem[] = [];
  checkins = new Map<string, string>();
  applied = new Map<string, SyncOpResult>();
  offline = false;
  pulls = 0;
  undone: string[] = [];
  async pull(cursor: string | null) {
    if (this.offline) throw new TypeError('fetch failed');
    this.pulls++;
    const start = cursor ? Number(cursor) : 0;
    const page = this.roster.slice(start, start + 2);
    return { items: page, nextCursor: String(start + page.length), hasMore: start + page.length < this.roster.length, serverTime: new Date().toISOString() };
  }
  async summary() {
    if (this.offline) throw new TypeError('fetch failed');
    const active = this.roster.filter((r) => r.active);
    return { activeCount: active.length, checksum: createHash('sha256').update(rosterChecksumInput(active)).digest('hex'), serverTime: new Date().toISOString() };
  }
  async push(ops: SyncOp[]) {
    if (this.offline) throw new TypeError('fetch failed');
    const results = ops.map((op): SyncOpResult => {
      const prior = this.applied.get(op.opId);
      if (prior) return { ...prior, result: 'already_applied' };
      let r: SyncOpResult;
      if (op.type === 'checkin') {
        const a = this.roster.find((x) => x.attendeeId === op.attendeeId);
        if (!a) r = { opId: op.opId, result: 'rejected', code: 'unknown_attendee' };
        else if (!a.active) r = { opId: op.opId, result: 'needs_review' };
        else if (this.checkins.has(a.attendeeId)) r = { opId: op.opId, result: 'already_applied', firstCheckedInAt: this.checkins.get(a.attendeeId) };
        else {
          this.checkins.set(a.attendeeId, op.deviceTime);
          Object.assign(a, { checkedInAt: op.deviceTime, revision: a.revision + 1 });
          r = { opId: op.opId, result: 'accepted' };
        }
      } else if (op.type === 'walkin') {
        const id = `C${ulid().slice(1)}`;
        const regId = `CR${op.groupId.slice(3)}`;
        this.roster.push(item(999, { attendeeId: id, registrationId: regId, reference: 'HEH-WALKIN01', fullName: op.fullName, walkIn: true, representativeName: op.groupName, checkedInAt: op.deviceTime }));
        if (op.checkedIn) this.checkins.set(id, op.deviceTime);
        r = { opId: op.opId, result: 'accepted', attendeeId: id, registrationId: regId, reference: 'HEH-WALKIN01' };
      } else if (op.type === 'attendee_add') {
        const head = this.roster.find((x) => x.registrationId === op.registrationId);
        if (!head || !head.active) r = { opId: op.opId, result: 'needs_review', code: 'registration_cancelled' };
        else {
          const id = `C${ulid().slice(1)}`;
          this.roster.push({ ...head, attendeeId: id, fullName: op.fullName, ageCategory: op.ageCategory, walkIn: true, revision: 0, checkedInAt: op.checkedIn ? op.deviceTime : null });
          if (op.checkedIn) this.checkins.set(id, op.deviceTime);
          r = { opId: op.opId, result: 'accepted', attendeeId: id, registrationId: head.registrationId, reference: head.reference };
        }
      } else if (op.type === 'attendee_update') {
        const a = this.roster.find((x) => x.attendeeId === op.attendeeId);
        if (!a) r = { opId: op.opId, result: 'rejected' };
        else if (a.revision !== op.baseRevision) r = { opId: op.opId, result: 'needs_review', code: 'changed_online' };
        else {
          Object.assign(a, { ...(op.fullName ? { fullName: op.fullName } : {}), ...(op.rsvp ? { rsvp: op.rsvp } : {}), ...(op.ageCategory ? { ageCategory: op.ageCategory } : {}), revision: a.revision + 1 });
          r = { opId: op.opId, result: 'accepted' };
        }
      } else {
        this.undone.push(op.checkinOpId);
        const a = this.roster.find((x) => x.attendeeId === op.attendeeId);
        if (a) Object.assign(a, { checkedInAt: null, revision: a.revision + 1 });
        this.checkins.delete(op.attendeeId);
        r = { opId: op.opId, result: 'accepted' };
      }
      this.applied.set(op.opId, r);
      return r;
    });
    return { results, serverTime: new Date().toISOString() };
  }
}

let dir: string;
let db: DB;
let cloud: FakeCloud;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'venue-test-'));
  db = openDb(path.join(dir, 'venue.sqlite'));
  cloud = new FakeCloud();
  cloud.roster = [item(1), item(2), item(3), item(4, { active: false }), item(5, { checkedInAt: '2026-10-24T00:10:00.000Z' })];
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function station(app: ReturnType<typeof createVenueApp>, name: string, stationName: string) {
  const a = request.agent(app);
  await a.post('/api/login').set('X-Venue-Request', '1').send({ name, pin: '123456', station: stationName }).expect(200);
  return a;
}
const post = (a: request.Agent, url: string, body: object) => a.post(url).set('X-Venue-Request', '1').send(body);

describe('roster preload', () => {
  it('pulls all pages and verifies the checksum', async () => {
    const r = await pullRoster(db, cloud);
    expect(r).toMatchObject({ pulled: 5, verified: true, activeCount: 4 });
    expect(localChecksum(db).count).toBe(4);
  });

  it('re-pulls everything when the checksum does not match', async () => {
    await pullRoster(db, cloud);
    db.prepare("DELETE FROM venue_roster WHERE attendee_id = ?").run(item(2).attendeeId); // simulate a lost row
    const before = cloud.pulls;
    const r = await pullRoster(db, cloud);
    expect(r.verified).toBe(true);
    expect(cloud.pulls - before).toBeGreaterThan(1);
    expect(localChecksum(db).count).toBe(4);
  });

  it('never downgrades a row to an older revision', () => {
    upsertRoster(db, [item(1, { revision: 5, rsvp: 'tentative' })]);
    upsertRoster(db, [item(1, { revision: 3, rsvp: 'declined' })]);
    expect((db.prepare('SELECT rsvp FROM venue_roster').get() as { rsvp: string }).rsvp).toBe('tentative');
  });
});

describe('check-in', () => {
  beforeEach(async () => {
    await pullRoster(db, cloud);
    upsertOperator(db, 'Ana', '123456', 'lead');
    upsertOperator(db, 'Ben', '123456', 'operator');
  });

  it('two stations checking in the same person count once', async () => {
    const app = createVenueApp({ db, sync: new SyncLoop(db, null, 1000) });
    const s1 = await station(app, 'Ana', 'Station 1');
    const s2 = await station(app, 'Ben', 'Station 2');
    const id = item(1).attendeeId;
    const [a, b] = await Promise.all([post(s1, '/api/checkins', { opId: ulid(), attendeeId: id }), post(s2, '/api/checkins', { opId: ulid(), attendeeId: id })]);
    expect([a.body.status, b.body.status].sort()).toEqual(['already_checked_in', 'checked_in']);
    const dup = a.body.status === 'already_checked_in' ? a.body : b.body;
    expect(dup.station).toMatch(/Station/);
    expect(stats(db).checkedIn).toBe(2); // person 1 + person 5 (checked in on cloud)
  });

  it('is idempotent per operation id (retry after a dropped response)', async () => {
    const opId = ulid();
    const first = checkIn(db, { opId, attendeeId: item(2).attendeeId, operatorId: 'x', station: 'S1' });
    const retry = checkIn(db, { opId, attendeeId: item(2).attendeeId, operatorId: 'x', station: 'S1' });
    expect(first.status).toBe('checked_in');
    expect(retry).toMatchObject({ status: 'checked_in', at: (first as { at: string }).at });
    expect((db.prepare('SELECT COUNT(*) n FROM checkin_operations').get() as { n: number }).n).toBe(1);
  });

  it('refuses inactive people and recognizes cloud check-ins', () => {
    expect(checkIn(db, { opId: ulid(), attendeeId: item(4).attendeeId, operatorId: 'x', station: 'S1' }).status).toBe('not_active');
    expect(checkIn(db, { opId: ulid(), attendeeId: item(5).attendeeId, operatorId: 'x', station: 'S1' }).status).toBe('already_checked_in');
    expect(checkIn(db, { opId: ulid(), attendeeId: 'nope', operatorId: 'x', station: 'S1' }).status).toBe('not_found');
  });

  it('searches by name, household and reference', async () => {
    const app = createVenueApp({ db, sync: new SyncLoop(db, null, 1000) });
    const s = await station(app, 'Ana', 'S1');
    expect((await s.get('/api/search?q=number 3').expect(200)).body.items[0].fullName).toBe('Person Number 3');
    expect((await s.get('/api/search?q=household 1').expect(200)).body.items).toHaveLength(2);
    expect((await s.get('/api/search?q=HEH-00000002').expect(200)).body.items).toHaveLength(2);
  });

  it('survives a restart with all check-ins, and backups restore', async () => {
    checkIn(db, { opId: ulid(), attendeeId: item(1).attendeeId, operatorId: 'x', station: 'S1' });
    const backup = await backupDb(db, path.join(dir, 'backups'));
    db.close();
    db = openDb(path.join(dir, 'venue.sqlite'));
    expect(stats(db).checkedIn).toBe(2);
    const restored = openDb(backup);
    expect(stats(restored).checkedIn).toBe(2);
    restored.close();
  });
});

describe('walk-ins and sync', () => {
  beforeEach(async () => {
    await pullRoster(db, cloud);
    upsertOperator(db, 'Ana', '123456', 'lead');
  });

  it('works offline, then syncs check-ins and walk-ins exactly once when the cloud returns', async () => {
    const app = createVenueApp({ db, sync: new SyncLoop(db, cloud, 60_000) });
    const s = await station(app, 'Ana', 'S1');
    cloud.offline = true;
    await post(s, '/api/checkins', { opId: ulid(), attendeeId: item(1).attendeeId }).expect(200);
    await post(s, '/api/checkins', { opId: ulid(), attendeeId: item(2).attendeeId }).expect(200);
    const w = await post(s, '/api/walkins', {
      groupName: 'Walk-in Family',
      branch: 'Denio',
      members: [
        { opId: ulid(), fullName: 'Walk One', ageCategory: 'adult' },
        { opId: ulid(), fullName: 'Walk Two', ageCategory: 'child' },
      ],
    }).expect(201);
    expect(w.body.items.every((i: { checkedIn: unknown }) => i.checkedIn)).toBe(true);
    const offline = await post(s, '/api/sync', {}).expect(200);
    expect(offline.body.error).toBe('Cloud unreachable');
    expect(offline.body.stats.pendingSync).toBe(4);
    expect(offline.body.stats.checkedIn).toBe(5);

    cloud.offline = false;
    const online = await post(s, '/api/sync', {}).expect(200);
    expect(online.body.push).toMatchObject({ sent: 4, accepted: 4, failed: 0 });
    expect(online.body.stats.pendingSync).toBe(0);
    expect(cloud.checkins.size).toBe(4); // 2 preregistered + 2 walk-ins (carried by the walk-in ops)
    // Walk-ins were re-keyed to cloud ids; the pull did not duplicate them.
    const rows = db.prepare("SELECT attendee_id, reference FROM venue_roster WHERE walk_in = 1").all() as Array<{ attendee_id: string; reference: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.attendee_id.startsWith('C') && r.reference === 'HEH-WALKIN01')).toBe(true);
    expect(online.body.stats.checkedIn).toBe(5);
    // Re-running sync sends nothing new.
    expect((await pushPending(db, cloud)).sent).toBe(0);
  });

  it('surfaces cloud conflicts for review instead of hiding them', async () => {
    checkIn(db, { opId: ulid(), attendeeId: item(3).attendeeId, operatorId: 'x', station: 'S1' });
    cloud.roster.find((r) => r.attendeeId === item(3).attendeeId)!.active = false; // cancelled online meanwhile
    const r = await pushPending(db, cloud);
    expect(r.needsReview).toBe(1);
    expect(stats(db).needsReview).toBe(1);
  });
});

describe('operator security', () => {
  it('requires login, the CSRF header, and locks after repeated wrong PINs', async () => {
    upsertOperator(db, 'Ana', '123456', 'operator');
    const app = createVenueApp({ db, sync: new SyncLoop(db, null, 1000) });
    await request(app).get('/api/search?q=x').expect(401);
    await request(app).post('/api/login').send({ name: 'Ana', pin: '123456', station: 'S' }).expect(403);
    for (let i = 0; i < 4; i++) await request(app).post('/api/login').set('X-Venue-Request', '1').send({ name: 'Ana', pin: '000000', station: 'S' }).expect(401);
    await request(app).post('/api/login').set('X-Venue-Request', '1').send({ name: 'Ana', pin: '000000', station: 'S' }).expect(429);
    await request(app).post('/api/login').set('X-Venue-Request', '1').send({ name: 'Ana', pin: '123456', station: 'S' }).expect(429);
    const s = request.agent(app);
    upsertOperator(db, 'Ana', '654321', 'operator'); // reset by a lead re-adding the operator
    await s.post('/api/login').set('X-Venue-Request', '1').send({ name: 'Ana', pin: '654321', station: 'S' }).expect(200);
    await s.post('/api/sync').set('X-Venue-Request', '1').expect(403); // lead only
  });
});

describe('offline corrections', () => {
  let app: ReturnType<typeof createVenueApp>;
  let lead: request.Agent;
  beforeEach(async () => {
    await pullRoster(db, cloud);
    upsertOperator(db, 'Ana', '123456', 'lead');
    upsertOperator(db, 'Ben', '123456', 'operator');
    app = createVenueApp({ db, sync: new SyncLoop(db, cloud, 60_000) });
    lead = await station(app, 'Ana', 'S1');
  });
  const patch = (a: request.Agent, id: string, body: object) => a.patch(`/api/attendees/${id}`).set('X-Venue-Request', '1').send(body);

  it('edits show immediately, merge while offline, survive a pull, then sync once', async () => {
    cloud.offline = true;
    const id = item(1).attendeeId;
    const r1 = await patch(lead, id, { opId: ulid(), fullName: 'Person Number One Fixed' }).expect(200);
    expect(r1.body.attendee.fullName).toBe('Person Number One Fixed');
    await patch(lead, id, { opId: ulid(), rsvp: 'tentative' }).expect(200);
    expect((db.prepare("SELECT COUNT(*) n FROM attendee_operations WHERE type = 'attendee_update'").get() as { n: number }).n).toBe(1);
    cloud.offline = false;
    upsertRoster(db, [item(1, { revision: 1 })]); // a pull must not clobber the pending edit
    expect((await lead.get('/api/search?q=one fixed').expect(200)).body.items[0].rsvp).toBe('tentative');
    const r = await pushPending(db, cloud);
    expect(r).toMatchObject({ sent: 1, accepted: 1 });
    expect(cloud.roster[0]).toMatchObject({ fullName: 'Person Number One Fixed', rsvp: 'tentative', revision: 2 });
  });

  it('a conflicting online edit is sent to review, and the cloud value wins on the next pull', async () => {
    const id = item(2).attendeeId;
    await patch(lead, id, { opId: ulid(), fullName: 'Venue Spelling' }).expect(200);
    cloud.roster[1]!.revision = 7; // changed online meanwhile
    cloud.roster[1]!.fullName = 'Online Spelling';
    const r = await pushPending(db, cloud);
    expect(r.needsReview).toBe(1);
    await pullRoster(db, cloud);
    expect((db.prepare('SELECT full_name FROM venue_roster WHERE attendee_id = ?').get(id) as { full_name: string }).full_name).toBe('Online Spelling');
    expect((await lead.get('/api/review').expect(200)).body.items[0].kind).toBe('attendee_update');
  });

  it('adds a person to an existing household; sync re-keys without duplicating', async () => {
    cloud.offline = true;
    const res = await lead.post(`/api/households/${item(1).registrationId}/members`).set('X-Venue-Request', '1').send({ members: [{ opId: ulid(), fullName: 'Extra Cousin', ageCategory: 'child' }] }).expect(201);
    expect(res.body.items[0]).toMatchObject({ reference: item(1).reference, checkedIn: expect.anything() });
    expect((await lead.get(`/api/households/${item(1).registrationId}`).expect(200)).body.items).toHaveLength(3);
    cloud.offline = false;
    const sync = await lead.post('/api/sync').set('X-Venue-Request', '1').expect(200);
    expect(sync.body.push).toMatchObject({ accepted: 1, failed: 0 });
    const rows = db.prepare("SELECT attendee_id FROM venue_roster WHERE full_name = 'Extra Cousin'").all() as Array<{ attendee_id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attendee_id.startsWith('C')).toBe(true);
    expect(cloud.checkins.has(rows[0]!.attendee_id)).toBe(true);
  });

  it('undo before sync never reaches the cloud; the person can be checked in again', async () => {
    const id = item(3).attendeeId;
    const first = ulid();
    checkIn(db, { opId: first, attendeeId: id, operatorId: 'x', station: 'S1' });
    const operator = await station(app, 'Ben', 'S2');
    await operator.post(`/api/attendees/${id}/undo-checkin`).set('X-Venue-Request', '1').send({ opId: ulid() }).expect(403); // lead only
    const u = await lead.post(`/api/attendees/${id}/undo-checkin`).set('X-Venue-Request', '1').send({ opId: ulid(), reason: 'wrong person' }).expect(200);
    expect(u.body.attendee.checkedIn).toBeNull();
    expect(checkIn(db, { opId: ulid(), attendeeId: id, operatorId: 'x', station: 'S1' }).status).toBe('checked_in');
    const r = await pushPending(db, cloud);
    expect(r.sent).toBe(1); // only the second check-in
    expect(cloud.undone).toHaveLength(0);
  });

  it('undo after sync pushes a checkin_undo naming the original op', async () => {
    const id = item(1).attendeeId;
    const op = ulid();
    checkIn(db, { opId: op, attendeeId: id, operatorId: 'x', station: 'S1' });
    await pushPending(db, cloud);
    expect(cloud.checkins.has(id)).toBe(true);
    await lead.post(`/api/attendees/${id}/undo-checkin`).set('X-Venue-Request', '1').send({ opId: ulid() }).expect(200);
    await pushPending(db, cloud);
    expect(cloud.undone).toEqual([op]);
    expect(cloud.checkins.has(id)).toBe(false);
    await pullRoster(db, cloud);
    expect(stats(db).checkedIn).toBe(1); // only person 5 (checked in on cloud before)
  });

  it('reports expected vs arrived by branch offline', async () => {
    checkIn(db, { opId: ulid(), attendeeId: item(1).attendeeId, operatorId: 'x', station: 'S1' });
    const b = await lead.get('/api/branch-stats').expect(200);
    expect(b.body.items).toEqual([{ branch: 'Albina', expected: 4, arrived: 2, walkins: 0 }]);
  });

  it('upgrades a database created by an older build', () => {
    const file = path.join(dir, 'old.sqlite');
    const old = openDb(file);
    old.exec("DROP INDEX one_accepted_checkin; DROP INDEX checkin_sync; DROP TABLE checkin_operations; CREATE TABLE checkin_operations (op_id TEXT PRIMARY KEY, attendee_id TEXT NOT NULL, device_id TEXT NOT NULL, operator_id TEXT NOT NULL, local_time TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('accepted','duplicate','rejected')), first_op_id TEXT, sync_status TEXT NOT NULL DEFAULT 'pending', sync_result TEXT, synced_at TEXT); INSERT INTO checkin_operations (op_id, attendee_id, device_id, operator_id, local_time, status) VALUES ('op-old-1','A1','S','O','2026-10-24T00:00:00Z','accepted');");
    old.close();
    const upgraded = openDb(file);
    expect((upgraded.prepare('SELECT COUNT(*) n FROM checkin_operations').get() as { n: number }).n).toBe(1);
    upgraded.prepare("UPDATE checkin_operations SET status = 'undone'").run();
    upgraded.close();
  });
});
