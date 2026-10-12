import { normalizeName, type VenueRosterItem } from '@heh/contracts';
import { ulid } from 'ulid';
import type { DB } from './db.js';

export interface RosterRow {
  attendee_id: string;
  registration_id: string;
  reference: string;
  full_name: string;
  representative_name: string;
  age_category: 'adult' | 'child';
  branch: string;
  rsvp: 'confirmed' | 'tentative' | 'declined';
  active: number;
  walk_in: number;
  local_only: number;
  cloud_checked_in_at: string | null;
}

export interface AttendeeView {
  attendeeId: string;
  registrationId: string;
  reference: string;
  fullName: string;
  representativeName: string;
  ageCategory: 'adult' | 'child';
  branch: string;
  rsvp: 'confirmed' | 'tentative' | 'declined';
  active: boolean;
  walkIn: boolean;
  checkedIn: null | { at: string; station: string | null; source: 'local' | 'cloud' };
}

const VIEW_SQL = `
  SELECT r.*, c.local_time AS local_checkin_at, c.device_id AS local_station
  FROM venue_roster r
  LEFT JOIN checkin_operations c ON c.attendee_id = r.attendee_id AND c.status = 'accepted'`;

type ViewRow = RosterRow & { local_checkin_at: string | null; local_station: string | null };

function toView(r: ViewRow): AttendeeView {
  return {
    attendeeId: r.attendee_id,
    registrationId: r.registration_id,
    reference: r.reference,
    fullName: r.full_name,
    representativeName: r.representative_name,
    ageCategory: r.age_category,
    branch: r.branch,
    rsvp: r.rsvp,
    active: !!r.active,
    walkIn: !!r.walk_in,
    checkedIn: r.local_checkin_at
      ? { at: r.local_checkin_at, station: r.local_station, source: 'local' }
      : r.cloud_checked_in_at
        ? { at: r.cloud_checked_in_at, station: null, source: 'cloud' }
        : null,
  };
}

/** Insert or update roster rows from a cloud pull. Never downgrades to an older revision. */
export function upsertRoster(db: DB, items: VenueRosterItem[], now = new Date()) {
  const stmt = db.prepare(`
    INSERT INTO venue_roster (attendee_id, registration_id, reference, full_name, normalized_name, representative_name, normalized_rep,
      age_category, branch, rsvp, active, walk_in, local_only, server_revision, cloud_checked_in_at, updated_at)
    VALUES (@attendeeId, @registrationId, @reference, @fullName, @normalizedName, @representativeName, @normalizedRep,
      @ageCategory, @branch, @rsvp, @active, @walkIn, 0, @revision, @checkedInAt, @now)
    ON CONFLICT(attendee_id) DO UPDATE SET
      registration_id = excluded.registration_id, reference = excluded.reference, full_name = excluded.full_name,
      normalized_name = excluded.normalized_name, representative_name = excluded.representative_name, normalized_rep = excluded.normalized_rep,
      age_category = excluded.age_category, branch = excluded.branch, rsvp = excluded.rsvp, active = excluded.active,
      walk_in = excluded.walk_in, local_only = 0, server_revision = excluded.server_revision,
      cloud_checked_in_at = excluded.cloud_checked_in_at, updated_at = excluded.updated_at
    WHERE excluded.server_revision >= venue_roster.server_revision
      AND NOT EXISTS (SELECT 1 FROM attendee_operations o WHERE o.attendee_id = venue_roster.attendee_id AND o.sync_status = 'pending')`);
  const tx = db.transaction((rows: VenueRosterItem[]) => {
    for (const i of rows) {
      stmt.run({
        ...i,
        normalizedName: normalizeName(i.fullName),
        normalizedRep: normalizeName(i.representativeName),
        active: i.active ? 1 : 0,
        walkIn: i.walkIn ? 1 : 0,
        checkedInAt: i.checkedInAt,
        now: now.toISOString(),
      });
    }
  });
  tx(items);
}

export function search(db: DB, q: string, limit = 40): AttendeeView[] {
  const term = q.trim();
  if (!term) return [];
  const upper = term.toUpperCase();
  if (/^HEH-[0-9A-Z]{1,8}$/.test(upper)) {
    return (db.prepare(`${VIEW_SQL} WHERE r.reference LIKE ? ORDER BY r.reference, r.full_name LIMIT ?`).all(`${upper}%`, limit) as ViewRow[]).map(toView);
  }
  const n = normalizeName(term);
  if (n.length < 2) return [];
  const like = `%${n.replace(/[%_]/g, '')}%`;
  return (
    db
      .prepare(
        `${VIEW_SQL} WHERE r.normalized_name LIKE ? OR r.normalized_rep LIKE ?
         ORDER BY (r.normalized_name LIKE ?) DESC, r.active DESC, r.full_name LIMIT ?`,
      )
      .all(like, like, `${n}%`, limit) as ViewRow[]
  ).map(toView);
}

export function household(db: DB, registrationId: string): AttendeeView[] {
  return (db.prepare(`${VIEW_SQL} WHERE r.registration_id = ? ORDER BY r.full_name`).all(registrationId) as ViewRow[]).map(toView);
}

export function getAttendee(db: DB, attendeeId: string): AttendeeView | null {
  const row = db.prepare(`${VIEW_SQL} WHERE r.attendee_id = ?`).get(attendeeId) as ViewRow | undefined;
  return row ? toView(row) : null;
}

export type CheckinOutcome =
  | { status: 'checked_in'; at: string; attendee: AttendeeView }
  | { status: 'already_checked_in'; firstAt: string; station: string | null; attendee: AttendeeView }
  | { status: 'not_active'; attendee: AttendeeView }
  | { status: 'not_found' };

interface OpRow {
  op_id: string;
  attendee_id: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  local_time: string;
  first_op_id: string | null;
}

/**
 * Record a check-in. Durable before returning (SQLite FULL sync). Idempotent by opId, and the
 * partial unique index guarantees at most one accepted check-in per attendee across all stations.
 */
export function checkIn(db: DB, input: { opId: string; attendeeId: string; operatorId: string; station: string }, now = new Date()): CheckinOutcome {
  const run = db.transaction((): CheckinOutcome => {
    const prior = db.prepare('SELECT * FROM checkin_operations WHERE op_id = ?').get(input.opId) as OpRow | undefined;
    if (prior) return outcomeFor(db, prior);
    const att = getAttendee(db, input.attendeeId);
    if (!att) return { status: 'not_found' };
    const insert = db.prepare(
      `INSERT INTO checkin_operations (op_id, attendee_id, device_id, operator_id, local_time, status, first_op_id, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const t = now.toISOString();
    if (!att.active) {
      insert.run(input.opId, att.attendeeId, input.station, input.operatorId, t, 'rejected', null, 'not_required');
      return { status: 'not_active', attendee: att };
    }
    const first = db.prepare("SELECT * FROM checkin_operations WHERE attendee_id = ? AND status = 'accepted'").get(att.attendeeId) as OpRow | undefined;
    if (first || att.checkedIn) {
      insert.run(input.opId, att.attendeeId, input.station, input.operatorId, t, 'duplicate', first?.op_id ?? null, 'not_required');
      return { status: 'already_checked_in', firstAt: att.checkedIn!.at, station: att.checkedIn!.station, attendee: att };
    }
    // Walk-ins carry their own check-in in the walk-in sync op.
    const rosterRow = db.prepare('SELECT local_only FROM venue_roster WHERE attendee_id = ?').get(att.attendeeId) as { local_only: number };
    insert.run(input.opId, att.attendeeId, input.station, input.operatorId, t, 'accepted', null, rosterRow.local_only ? 'not_required' : 'pending');
    return { status: 'checked_in', at: t, attendee: getAttendee(db, att.attendeeId)! };
  });
  return run.immediate();
}

function outcomeFor(db: DB, op: OpRow): CheckinOutcome {
  const att = getAttendee(db, op.attendee_id);
  if (!att) return { status: 'not_found' };
  if (op.status === 'accepted') return { status: 'checked_in', at: op.local_time, attendee: att };
  if (op.status === 'rejected') return { status: 'not_active', attendee: att };
  return { status: 'already_checked_in', firstAt: att.checkedIn?.at ?? op.local_time, station: att.checkedIn?.station ?? null, attendee: att };
}

export interface WalkinInput {
  groupId?: string;
  groupName: string;
  branch?: string;
  contact?: string;
  members: Array<{ opId: string; fullName: string; ageCategory: 'adult' | 'child' }>;
  checkIn: boolean;
  operatorId: string;
  station: string;
}

/** Register a walk-in household locally (temporary ids), optionally checking everyone in. Idempotent per member opId. */
export function addWalkins(db: DB, input: WalkinInput, now = new Date()): AttendeeView[] {
  const run = db.transaction(() => {
    const groupId = input.groupId ?? `G-${ulid()}`;
    const t = now.toISOString();
    const out: AttendeeView[] = [];
    for (const m of input.members) {
      const prior = db.prepare('SELECT temp_attendee_id FROM walkin_operations WHERE op_id = ?').get(m.opId) as { temp_attendee_id: string } | undefined;
      if (prior) {
        // Already recorded (retry). The roster row may have been re-keyed to the cloud id after sync.
        const synced = db.prepare('SELECT cloud_attendee_id FROM walkin_operations WHERE op_id = ?').get(m.opId) as { cloud_attendee_id: string | null };
        const v = getAttendee(db, synced.cloud_attendee_id ?? prior.temp_attendee_id);
        if (v) out.push(v);
        continue;
      }
      const tempId = `W-${ulid()}`;
      db.prepare(
        `INSERT INTO walkin_operations (op_id, temp_attendee_id, group_id, group_name, full_name, age_category, branch, contact, checked_in, operator_id, device_id, local_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(m.opId, tempId, groupId, input.groupName, m.fullName, m.ageCategory, input.branch ?? null, input.contact ?? null, input.checkIn ? 1 : 0, input.operatorId, input.station, t);
      db.prepare(
        `INSERT INTO venue_roster (attendee_id, registration_id, reference, full_name, normalized_name, representative_name, normalized_rep,
           age_category, branch, rsvp, active, walk_in, local_only, server_revision, updated_at)
         VALUES (?, ?, 'WALK-IN', ?, ?, ?, ?, ?, ?, 'confirmed', 1, 1, 1, 0, ?)`,
      ).run(tempId, groupId, m.fullName, normalizeName(m.fullName), input.groupName, normalizeName(input.groupName), m.ageCategory, input.branch ?? 'Not specified', t);
      if (input.checkIn) {
        db.prepare(
          `INSERT INTO checkin_operations (op_id, attendee_id, device_id, operator_id, local_time, status, sync_status)
           VALUES (?, ?, ?, ?, ?, 'accepted', 'not_required')`,
        ).run(`${m.opId}-c`, tempId, input.station, input.operatorId, t);
      }
      out.push(getAttendee(db, tempId)!);
    }
    return out;
  });
  return run.immediate();
}

export interface Stats {
  expected: number;
  checkedIn: number;
  checkedInPreregistered: number;
  walkins: number;
  pendingSync: number;
  needsReview: number;
  rosterSize: number;
}

export function stats(db: DB): Stats {
  const one = <T>(sql: string) => (db.prepare(sql).get() as { n: T }).n;
  return {
    rosterSize: one<number>("SELECT COUNT(*) n FROM venue_roster WHERE active = 1 AND walk_in = 0"),
    expected: one<number>("SELECT COUNT(*) n FROM venue_roster WHERE active = 1 AND walk_in = 0 AND rsvp IN ('confirmed','tentative')"),
    checkedIn: one<number>(
      `SELECT COUNT(*) n FROM venue_roster r WHERE r.active = 1 AND (r.cloud_checked_in_at IS NOT NULL OR EXISTS
         (SELECT 1 FROM checkin_operations c WHERE c.attendee_id = r.attendee_id AND c.status = 'accepted'))`,
    ),
    checkedInPreregistered: one<number>(
      `SELECT COUNT(*) n FROM venue_roster r WHERE r.active = 1 AND r.walk_in = 0 AND (r.cloud_checked_in_at IS NOT NULL OR EXISTS
         (SELECT 1 FROM checkin_operations c WHERE c.attendee_id = r.attendee_id AND c.status = 'accepted'))`,
    ),
    walkins: one<number>('SELECT COUNT(*) n FROM walkin_operations'),
    pendingSync: one<number>(
      `SELECT (SELECT COUNT(*) FROM checkin_operations WHERE sync_status = 'pending') + (SELECT COUNT(*) FROM walkin_operations WHERE sync_status = 'pending')
        + (SELECT COUNT(*) FROM attendee_operations WHERE sync_status = 'pending') n`,
    ),
    needsReview: one<number>(
      `SELECT (SELECT COUNT(*) FROM checkin_operations WHERE sync_status IN ('needs_review','failed')) + (SELECT COUNT(*) FROM walkin_operations WHERE sync_status IN ('needs_review','failed'))
        + (SELECT COUNT(*) FROM attendee_operations WHERE sync_status IN ('needs_review','failed')) n`,
    ),
  };
}

export function branches(db: DB): string[] {
  return (db.prepare('SELECT DISTINCT branch FROM venue_roster ORDER BY branch').all() as Array<{ branch: string }>).map((r) => r.branch);
}

export function reviewItems(db: DB) {
  return db
    .prepare(
      `SELECT 'checkin' AS kind, c.op_id, r.full_name, r.reference, c.local_time, c.sync_status, c.sync_result FROM checkin_operations c
         JOIN venue_roster r ON r.attendee_id = c.attendee_id WHERE c.sync_status IN ('needs_review','failed')
       UNION ALL
       SELECT 'walkin', w.op_id, w.full_name, 'WALK-IN', w.local_time, w.sync_status, w.sync_result FROM walkin_operations w
         WHERE w.sync_status IN ('needs_review','failed')
       UNION ALL
       SELECT a.type, a.op_id, COALESCE(r.full_name, json_extract(a.payload, '$.fullName')), COALESCE(r.reference, ''), a.local_time, a.sync_status, a.sync_result
         FROM attendee_operations a LEFT JOIN venue_roster r ON r.attendee_id = a.attendee_id WHERE a.sync_status IN ('needs_review','failed')
       ORDER BY 5`,
    )
    .all();
}

/** Printable roster (no contact details). */
export function rosterForPrint(db: DB) {
  return (db.prepare(`${VIEW_SQL} WHERE r.active = 1 ORDER BY r.branch, r.representative_name, r.full_name`).all() as ViewRow[]).map(toView);
}

// ---------------------------------------------------------------- venue corrections

export class VenueError extends Error {
  constructor(public code: string, public status = 409) {
    super(code);
  }
}

export interface AttendeeEdit {
  fullName?: string;
  ageCategory?: 'adult' | 'child';
  rsvp?: 'confirmed' | 'tentative' | 'declined';
}

/**
 * Correct a person offline. The change shows immediately; for cloud-known people it is queued as one
 * attendee_update (later edits merge into the pending one) carrying the revision the venue last saw.
 */
export function updateAttendee(db: DB, input: { opId: string; attendeeId: string; edit: AttendeeEdit; operatorId: string; station: string }, now = new Date()): AttendeeView {
  const run = db.transaction(() => {
    if (db.prepare('SELECT 1 FROM attendee_operations WHERE op_id = ?').get(input.opId)) return getAttendee(db, input.attendeeId)!;
    const row = db.prepare('SELECT * FROM venue_roster WHERE attendee_id = ?').get(input.attendeeId) as (RosterRow & { server_revision: number }) | undefined;
    if (!row) throw new VenueError('not_found', 404);
    if (!row.active) throw new VenueError('not_active');
    const e = input.edit;
    db.prepare(
      `UPDATE venue_roster SET full_name = COALESCE(?, full_name), normalized_name = COALESCE(?, normalized_name),
         age_category = COALESCE(?, age_category), rsvp = COALESCE(?, rsvp), updated_at = ? WHERE attendee_id = ?`,
    ).run(e.fullName ?? null, e.fullName ? normalizeName(e.fullName) : null, e.ageCategory ?? null, e.rsvp ?? null, now.toISOString(), row.attendee_id);

    if (row.local_only) {
      // Not in the cloud yet: fold the edit into the pending walk-in / add operation instead.
      if (e.fullName || e.ageCategory) {
        db.prepare('UPDATE walkin_operations SET full_name = COALESCE(?, full_name), age_category = COALESCE(?, age_category) WHERE temp_attendee_id = ?').run(e.fullName ?? null, e.ageCategory ?? null, row.attendee_id);
        const add = db.prepare("SELECT op_id, payload FROM attendee_operations WHERE type = 'attendee_add' AND attendee_id = ? AND sync_status = 'pending'").get(row.attendee_id) as { op_id: string; payload: string } | undefined;
        if (add) db.prepare('UPDATE attendee_operations SET payload = ? WHERE op_id = ?').run(JSON.stringify({ ...JSON.parse(add.payload), ...stripUndefined({ fullName: e.fullName, ageCategory: e.ageCategory }) }), add.op_id);
      }
      return getAttendee(db, row.attendee_id)!;
    }
    const pending = db.prepare("SELECT op_id, payload FROM attendee_operations WHERE type = 'attendee_update' AND attendee_id = ? AND sync_status = 'pending'").get(row.attendee_id) as { op_id: string; payload: string } | undefined;
    if (pending) {
      db.prepare('UPDATE attendee_operations SET payload = ?, local_time = ? WHERE op_id = ?').run(JSON.stringify({ ...JSON.parse(pending.payload), ...stripUndefined(e) }), now.toISOString(), pending.op_id);
    } else {
      db.prepare(
        `INSERT INTO attendee_operations (op_id, type, attendee_id, registration_id, base_revision, payload, operator_id, device_id, local_time)
         VALUES (?, 'attendee_update', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(input.opId, row.attendee_id, row.registration_id, row.server_revision, JSON.stringify(stripUndefined(e)), input.operatorId, input.station, now.toISOString());
    }
    return getAttendee(db, row.attendee_id)!;
  });
  return run.immediate();
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Add extra people to an existing household (optionally checking them in). Idempotent per member opId. */
export function addToHousehold(
  db: DB,
  input: { registrationId: string; members: Array<{ opId: string; fullName: string; ageCategory: 'adult' | 'child' }>; checkIn: boolean; operatorId: string; station: string },
  now = new Date(),
): AttendeeView[] {
  const head = db.prepare('SELECT * FROM venue_roster WHERE registration_id = ? AND active = 1 LIMIT 1').get(input.registrationId) as RosterRow | undefined;
  if (!head) throw new VenueError('household_not_found', 404);
  if (input.registrationId.startsWith('G-')) {
    // Household is itself an unsynced walk-in group: extend the walk-in.
    const group = db.prepare('SELECT group_name, branch FROM walkin_operations WHERE group_id = ? LIMIT 1').get(input.registrationId) as { group_name: string; branch: string | null };
    return addWalkins(db, { groupId: input.registrationId, groupName: group.group_name, branch: group.branch ?? undefined, members: input.members, checkIn: input.checkIn, operatorId: input.operatorId, station: input.station }, now);
  }
  const run = db.transaction(() => {
    const t = now.toISOString();
    const out: AttendeeView[] = [];
    for (const m of input.members) {
      const prior = db.prepare('SELECT attendee_id FROM attendee_operations WHERE op_id = ?').get(m.opId) as { attendee_id: string } | undefined;
      if (prior) {
        const v = getAttendee(db, prior.attendee_id);
        if (v) out.push(v);
        continue;
      }
      const tempId = `W-${ulid()}`;
      db.prepare(
        `INSERT INTO attendee_operations (op_id, type, attendee_id, registration_id, payload, operator_id, device_id, local_time)
         VALUES (?, 'attendee_add', ?, ?, ?, ?, ?, ?)`,
      ).run(m.opId, tempId, input.registrationId, JSON.stringify({ fullName: m.fullName, ageCategory: m.ageCategory, checkedIn: input.checkIn }), input.operatorId, input.station, t);
      db.prepare(
        `INSERT INTO venue_roster (attendee_id, registration_id, reference, full_name, normalized_name, representative_name, normalized_rep,
           age_category, branch, rsvp, active, walk_in, local_only, server_revision, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 1, 1, 1, 0, ?)`,
      ).run(tempId, input.registrationId, head.reference, m.fullName, normalizeName(m.fullName), head.representative_name, normalizeName(head.representative_name), m.ageCategory, head.branch, t);
      if (input.checkIn) {
        db.prepare(
          `INSERT INTO checkin_operations (op_id, attendee_id, device_id, operator_id, local_time, status, sync_status)
           VALUES (?, ?, ?, ?, ?, 'accepted', 'not_required')`,
        ).run(`${m.opId}-c`, tempId, input.station, input.operatorId, t);
      }
      out.push(getAttendee(db, tempId)!);
    }
    return out;
  });
  return run.immediate();
}

/**
 * Undo a mistaken check-in (lead only). If the check-in never reached the cloud, it is simply cancelled
 * locally; otherwise a checkin_undo op is queued naming the venue op that created the cloud check-in.
 */
export function undoCheckin(db: DB, input: { opId: string; attendeeId: string; reason?: string; operatorId: string; station: string }, now = new Date()): AttendeeView {
  const run = db.transaction(() => {
    if (db.prepare('SELECT 1 FROM attendee_operations WHERE op_id = ?').get(input.opId)) return getAttendee(db, input.attendeeId)!;
    const ci = db.prepare("SELECT * FROM checkin_operations WHERE attendee_id = ? AND status = 'accepted'").get(input.attendeeId) as
      | { op_id: string; sync_status: string }
      | undefined;
    if (!ci) {
      const att = getAttendee(db, input.attendeeId);
      if (!att) throw new VenueError('not_found', 404);
      // Checked in elsewhere (cloud) — this venue has no record of the check-in to reverse.
      throw new VenueError(att.checkedIn ? 'checked_in_elsewhere' : 'not_checked_in');
    }
    db.prepare("UPDATE checkin_operations SET status = 'undone' WHERE op_id = ?").run(ci.op_id);
    db.prepare('UPDATE venue_roster SET cloud_checked_in_at = NULL WHERE attendee_id = ?').run(input.attendeeId);

    // Which cloud op (if any) created the check-in?
    let cloudOpId: string | null = null;
    let needsCloud = false;
    if (ci.sync_status === 'pending') {
      db.prepare("UPDATE checkin_operations SET sync_status = 'not_required' WHERE op_id = ?").run(ci.op_id);
    } else if (ci.sync_status === 'synced') {
      cloudOpId = ci.op_id;
      needsCloud = true;
    } else if (ci.sync_status === 'not_required' && ci.op_id.endsWith('-c')) {
      // Check-in carried by a walk-in or household-add op.
      const carrier = ci.op_id.slice(0, -2);
      const walk = db.prepare('SELECT sync_status FROM walkin_operations WHERE op_id = ?').get(carrier) as { sync_status: string } | undefined;
      const add = db.prepare("SELECT sync_status, payload FROM attendee_operations WHERE op_id = ? AND type = 'attendee_add'").get(carrier) as { sync_status: string; payload: string } | undefined;
      const status = walk?.sync_status ?? add?.sync_status;
      if (status === 'pending') {
        if (walk) db.prepare('UPDATE walkin_operations SET checked_in = 0 WHERE op_id = ?').run(carrier);
        if (add) db.prepare('UPDATE attendee_operations SET payload = ? WHERE op_id = ?').run(JSON.stringify({ ...JSON.parse(add.payload), checkedIn: false }), carrier);
      } else if (status === 'synced') {
        cloudOpId = carrier;
        needsCloud = true;
      }
    }
    db.prepare(
      `INSERT INTO attendee_operations (op_id, type, attendee_id, payload, operator_id, device_id, local_time, sync_status)
       VALUES (?, 'checkin_undo', ?, ?, ?, ?, ?, ?)`,
    ).run(input.opId, input.attendeeId, JSON.stringify(stripUndefined({ checkinOpId: cloudOpId ?? ci.op_id, reason: input.reason })), input.operatorId, input.station, now.toISOString(), needsCloud ? 'pending' : 'not_required');
    return getAttendee(db, input.attendeeId)!;
  });
  return run.immediate();
}

export interface BranchStat {
  branch: string;
  expected: number;
  arrived: number;
  walkins: number;
}

/** Expected (attending + maybe) vs arrived per branch — works fully offline. */
export function branchStats(db: DB): BranchStat[] {
  return db
    .prepare(
      `SELECT r.branch AS branch,
         SUM(CASE WHEN r.walk_in = 0 AND r.rsvp IN ('confirmed','tentative') THEN 1 ELSE 0 END) AS expected,
         SUM(CASE WHEN r.cloud_checked_in_at IS NOT NULL OR EXISTS (SELECT 1 FROM checkin_operations c WHERE c.attendee_id = r.attendee_id AND c.status = 'accepted') THEN 1 ELSE 0 END) AS arrived,
         SUM(CASE WHEN r.walk_in = 1 THEN 1 ELSE 0 END) AS walkins
       FROM venue_roster r WHERE r.active = 1 GROUP BY r.branch ORDER BY r.branch`,
    )
    .all() as BranchStat[];
}
