import { createHash } from 'node:crypto';
import {
  rosterChecksumInput,
  type RosterSummary,
  type SyncOp,
  type SyncOpResult,
  type SyncPullResponse,
  type SyncPushResponse,
} from '@heh/contracts';
import { upsertRoster } from './checkin.js';
import { getState, setState, type DB } from './db.js';

export interface CloudClient {
  pull(cursor: string | null): Promise<SyncPullResponse>;
  summary(): Promise<RosterSummary>;
  push(ops: SyncOp[]): Promise<SyncPushResponse>;
}

export function httpCloudClient(opts: { baseUrl: string; eventId: string; token: string; timeoutMs?: number }): CloudClient {
  const base = `${opts.baseUrl.replace(/\/$/, '')}/api/v1/sync/events/${encodeURIComponent(opts.eventId)}`;
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new CloudError(res.status, text.slice(0, 300));
    }
    return (await res.json()) as T;
  };
  return {
    pull: (cursor) => call<SyncPullResponse>(`/pull${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
    summary: () => call<RosterSummary>('/roster-summary'),
    push: (ops) => call<SyncPushResponse>('/push', { method: 'POST', body: JSON.stringify({ ops }) }),
  };
}

export class CloudError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`cloud responded ${status}`);
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function localChecksum(db: DB): { count: number; checksum: string } {
  const rows = db.prepare('SELECT attendee_id AS attendeeId, server_revision AS revision FROM venue_roster WHERE active = 1 AND local_only = 0').all() as Array<{
    attendeeId: string;
    revision: number;
  }>;
  return { count: rows.length, checksum: sha256(rosterChecksumInput(rows)) };
}

export interface PullOutcome {
  pulled: number;
  verified: boolean;
  activeCount: number;
}

/** Pull roster deltas until caught up, then verify against the cloud checksum; full resync once on mismatch. */
export async function pullRoster(db: DB, cloud: CloudClient, now = () => new Date()): Promise<PullOutcome> {
  let pulled = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    let cursor = getState(db, 'cursor');
    for (let page = 0; page < 10_000; page++) {
      const res = await cloud.pull(cursor);
      upsertRoster(db, res.items, now());
      pulled += res.items.length;
      cursor = res.nextCursor || cursor;
      setState(db, 'cursor', cursor);
      if (!res.hasMore) break;
    }
    const summary = await cloud.summary();
    const local = localChecksum(db);
    const verified = local.checksum === summary.checksum;
    setState(db, 'roster_verified', verified ? summary.serverTime : null);
    setState(db, 'last_pull_at', now().toISOString());
    if (verified) return { pulled, verified, activeCount: local.count };
    setState(db, 'cursor', null); // mismatch: re-pull everything once
  }
  return { pulled, verified: false, activeCount: localChecksum(db).count };
}

interface PendingCheckin {
  op_id: string;
  attendee_id: string;
  operator_id: string;
  local_time: string;
}
interface PendingWalkin {
  op_id: string;
  temp_attendee_id: string;
  group_id: string;
  group_name: string;
  full_name: string;
  age_category: 'adult' | 'child';
  branch: string | null;
  contact: string | null;
  checked_in: number;
  operator_id: string;
  local_time: string;
}

export interface PushOutcome {
  sent: number;
  accepted: number;
  needsReview: number;
  failed: number;
}

interface PendingAttendeeOp {
  op_id: string;
  type: 'attendee_update' | 'attendee_add' | 'checkin_undo';
  attendee_id: string;
  registration_id: string | null;
  base_revision: number | null;
  payload: string;
  operator_id: string;
  local_time: string;
}

const BATCH = 100;

/**
 * Push pending operations in dependency order — walk-ins, household adds, corrections, check-ins,
 * undos — so ids and check-ins exist before later ops refer to them. Results are applied durably.
 */
export async function pushPending(db: DB, cloud: CloudClient, now = () => new Date()): Promise<PushOutcome> {
  const out: PushOutcome = { sent: 0, accepted: 0, needsReview: 0, failed: 0 };
  for (let round = 0; round < 1000; round++) {
    const walkins = db.prepare("SELECT * FROM walkin_operations WHERE sync_status = 'pending' ORDER BY local_time LIMIT ?").all(BATCH) as PendingWalkin[];
    const attOps = (type: PendingAttendeeOp['type'], limit: number) =>
      limit > 0 ? (db.prepare("SELECT * FROM attendee_operations WHERE sync_status = 'pending' AND type = ? ORDER BY local_time LIMIT ?").all(type, limit) as PendingAttendeeOp[]) : [];
    let room = BATCH - walkins.length;
    const adds = attOps('attendee_add', room);
    room -= adds.length;
    const updates = attOps('attendee_update', room);
    room -= updates.length;
    const checkins = room > 0 ? (db.prepare("SELECT * FROM checkin_operations WHERE sync_status = 'pending' AND status = 'accepted' ORDER BY local_time LIMIT ?").all(room) as PendingCheckin[]) : [];
    room -= checkins.length;
    const undos = attOps('checkin_undo', room);
    const attendeeOps = [...adds, ...updates, ...undos];

    const ops: SyncOp[] = [
      ...walkins.map(
        (w): SyncOp => ({
          opId: w.op_id,
          type: 'walkin',
          tempAttendeeId: w.temp_attendee_id,
          groupId: w.group_id,
          groupName: w.group_name,
          fullName: w.full_name,
          ageCategory: w.age_category,
          ...(w.branch ? { branchLabel: w.branch } : {}),
          ...(w.contact ? { contact: w.contact } : {}),
          checkedIn: !!w.checked_in,
          operatorId: w.operator_id,
          deviceTime: w.local_time,
        }),
      ),
      ...adds.map((a) => toOp(a)),
      ...updates.map((a) => toOp(a)),
      ...checkins.map((c): SyncOp => ({ opId: c.op_id, type: 'checkin', attendeeId: c.attendee_id, operatorId: c.operator_id, deviceTime: c.local_time })),
      ...undos.map((a) => toOp(a)),
    ];
    if (ops.length === 0) break;
    const res = await cloud.push(ops);
    const byOp = new Map(res.results.map((r) => [r.opId, r]));
    applyResults(db, walkins, checkins, attendeeOps, byOp, now(), out);
    out.sent += ops.length;
    if (ops.length < BATCH) break;
  }
  setState(db, 'last_push_at', now().toISOString());
  return out;
}

function toOp(a: PendingAttendeeOp): SyncOp {
  const p = JSON.parse(a.payload) as Record<string, unknown>;
  const common = { opId: a.op_id, operatorId: a.operator_id, deviceTime: a.local_time };
  if (a.type === 'attendee_add') {
    return { ...common, type: 'attendee_add', tempAttendeeId: a.attendee_id, registrationId: a.registration_id!, fullName: String(p.fullName), ageCategory: p.ageCategory as 'adult' | 'child', checkedIn: !!p.checkedIn };
  }
  if (a.type === 'attendee_update') {
    return {
      ...common,
      type: 'attendee_update',
      attendeeId: a.attendee_id,
      baseRevision: a.base_revision ?? 0,
      ...(p.fullName ? { fullName: String(p.fullName) } : {}),
      ...(p.ageCategory ? { ageCategory: p.ageCategory as 'adult' | 'child' } : {}),
      ...(p.rsvp ? { rsvp: p.rsvp as 'confirmed' | 'tentative' | 'declined' } : {}),
    };
  }
  return { ...common, type: 'checkin_undo', attendeeId: a.attendee_id, checkinOpId: String(p.checkinOpId), ...(p.reason ? { reason: String(p.reason) } : {}) };
}

function syncStatusFor(r: SyncOpResult | undefined): 'synced' | 'needs_review' | 'failed' | 'pending' {
  if (!r) return 'pending';
  if (r.result === 'accepted' || r.result === 'already_applied') return 'synced';
  if (r.result === 'needs_review') return 'needs_review';
  return 'failed';
}

function applyResults(
  db: DB,
  walkins: PendingWalkin[],
  checkins: PendingCheckin[],
  attendeeOps: PendingAttendeeOp[],
  byOp: Map<string, SyncOpResult>,
  now: Date,
  out: PushOutcome,
) {
  const tx = db.transaction(() => {
    for (const w of walkins) {
      const r = byOp.get(w.op_id);
      const status = syncStatusFor(r);
      if (status === 'pending') continue;
      count(out, status);
      db.prepare(
        `UPDATE walkin_operations SET sync_status = ?, sync_result = ?, cloud_attendee_id = ?, cloud_registration_id = ?, cloud_reference = ?, synced_at = ? WHERE op_id = ?`,
      ).run(status, JSON.stringify(r), r?.attendeeId ?? null, r?.registrationId ?? null, r?.reference ?? null, now.toISOString(), w.op_id);
      if (status === 'synced' && r?.attendeeId) rekeyWalkin(db, w.temp_attendee_id, r.attendeeId, r.registrationId!, r.reference!, w.group_id);
    }
    for (const a of attendeeOps) {
      const r = byOp.get(a.op_id);
      const status = syncStatusFor(r);
      if (status === 'pending') continue;
      count(out, status);
      db.prepare('UPDATE attendee_operations SET sync_status = ?, sync_result = ?, synced_at = ? WHERE op_id = ?').run(status, JSON.stringify(r), now.toISOString(), a.op_id);
      if (a.type === 'attendee_add' && status === 'synced' && r?.attendeeId) {
        rekeyWalkin(db, a.attendee_id, r.attendeeId, r.registrationId ?? a.registration_id!, r.reference ?? '', a.registration_id!);
      }
    }
    for (const c of checkins) {
      const r = byOp.get(c.op_id);
      const status = syncStatusFor(r);
      if (status === 'pending') continue;
      count(out, status);
      db.prepare('UPDATE checkin_operations SET sync_status = ?, sync_result = ?, synced_at = ? WHERE op_id = ?').run(status, JSON.stringify(r), now.toISOString(), c.op_id);
    }
  });
  tx();
}

function count(out: PushOutcome, s: 'synced' | 'needs_review' | 'failed') {
  if (s === 'synced') out.accepted++;
  else if (s === 'needs_review') out.needsReview++;
  else out.failed++;
}

/** Replace a temporary id (walk-in or household add) with the cloud's, so later pulls update the same row. */
function rekeyWalkin(db: DB, tempId: string, cloudId: string, cloudRegId: string, reference: string, groupId: string) {
  const cloudRowExists = db.prepare('SELECT 1 FROM venue_roster WHERE attendee_id = ?').get(cloudId);
  if (cloudRowExists) db.prepare('DELETE FROM venue_roster WHERE attendee_id = ?').run(tempId);
  else db.prepare('UPDATE venue_roster SET attendee_id = ?, local_only = 0 WHERE attendee_id = ?').run(cloudId, tempId);
  db.prepare('UPDATE checkin_operations SET attendee_id = ? WHERE attendee_id = ?').run(cloudId, tempId);
  db.prepare('UPDATE attendee_operations SET attendee_id = ? WHERE attendee_id = ?').run(cloudId, tempId);
  // Re-point the whole local group once its registration is known.
  if (reference) db.prepare('UPDATE venue_roster SET registration_id = ?, reference = ? WHERE registration_id IN (?, ?)').run(cloudRegId, reference, groupId, cloudRegId);
}

export interface SyncStatus {
  configured: boolean;
  cloudReachable: boolean | null;
  lastPullAt: string | null;
  lastPushAt: string | null;
  rosterVerifiedAt: string | null;
  lastError: string | null;
  syncing: boolean;
}

/** Background loop: push then pull. Failures leave local operations intact for the next attempt. */
export class SyncLoop {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  reachable: boolean | null = null;
  lastError: string | null = null;

  constructor(
    private db: DB,
    private cloud: CloudClient | null,
    private intervalMs: number,
    private log: (msg: string, extra?: unknown) => void = () => undefined,
  ) {}

  start() {
    if (!this.cloud) return;
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    void this.runOnce();
  }

  stop() {
    clearInterval(this.timer);
  }

  async runOnce(): Promise<{ push?: PushOutcome; pull?: PullOutcome; error?: string }> {
    if (!this.cloud) return { error: 'cloud not configured' };
    if (this.running) return { error: 'sync already running' };
    this.running = true;
    try {
      const push = await pushPending(this.db, this.cloud);
      const pull = await pullRoster(this.db, this.cloud);
      this.reachable = true;
      this.lastError = null;
      if (push.sent || pull.pulled) this.log('sync complete', { push, pull });
      return { push, pull };
    } catch (err) {
      // An HTTP error response means the cloud is reachable; anything else (DNS, timeout, refused) means offline.
      this.reachable = err instanceof CloudError;
      this.lastError = err instanceof CloudError ? `Cloud error ${err.status}` : 'Cloud unreachable';
      setState(this.db, 'last_error', `${new Date().toISOString()} ${this.lastError}`);
      return { error: this.lastError };
    } finally {
      this.running = false;
    }
  }

  status(): SyncStatus {
    return {
      configured: !!this.cloud,
      cloudReachable: this.reachable,
      lastPullAt: getState(this.db, 'last_pull_at'),
      lastPushAt: getState(this.db, 'last_push_at'),
      rosterVerifiedAt: getState(this.db, 'roster_verified'),
      lastError: this.lastError,
      syncing: this.running,
    };
  }
}
