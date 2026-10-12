import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { ulid } from 'ulid';
import type { DB } from './db.js';

const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;

export interface Operator {
  id: string;
  name: string;
  role: 'operator' | 'lead';
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPin(pin: string, stored: string): boolean {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const got = scryptSync(pin, Buffer.from(salt, 'base64'), 32, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(hash, 'base64');
  return got.length === want.length && timingSafeEqual(got, want);
}

export function validatePin(pin: string): string | null {
  return /^\d{6,12}$/.test(pin) ? null : 'PIN must be 6 to 12 digits';
}

export function upsertOperator(db: DB, name: string, pin: string, role: 'operator' | 'lead'): Operator {
  const err = validatePin(pin);
  if (err) throw new Error(err);
  const existing = db.prepare('SELECT id FROM local_operators WHERE name = ?').get(name) as { id: string } | undefined;
  if (existing) {
    db.prepare('UPDATE local_operators SET pin_hash = ?, role = ?, active = 1, failed = 0, locked_until = NULL WHERE id = ?').run(hashPin(pin), role, existing.id);
    db.prepare('DELETE FROM local_operator_sessions WHERE operator_id = ?').run(existing.id);
    return { id: existing.id, name, role };
  }
  const id = ulid();
  db.prepare('INSERT INTO local_operators (id, name, pin_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, hashPin(pin), role, new Date().toISOString());
  return { id, name, role };
}

export function disableOperator(db: DB, name: string): boolean {
  const r = db.prepare('UPDATE local_operators SET active = 0 WHERE name = ?').run(name);
  db.prepare('DELETE FROM local_operator_sessions WHERE operator_id IN (SELECT id FROM local_operators WHERE name = ?)').run(name);
  return r.changes > 0;
}

export function listOperatorNames(db: DB): string[] {
  return (db.prepare('SELECT name FROM local_operators WHERE active = 1 ORDER BY name').all() as Array<{ name: string }>).map((r) => r.name);
}

const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

export type LoginResult = { ok: true; token: string; operator: Operator } | { ok: false; reason: 'invalid' | 'locked' };

export function login(db: DB, name: string, pin: string, station: string, now = new Date()): LoginResult {
  const op = db.prepare('SELECT * FROM local_operators WHERE name = ? AND active = 1').get(name) as
    | { id: string; name: string; role: 'operator' | 'lead'; pin_hash: string; failed: number; locked_until: string | null }
    | undefined;
  if (!op) {
    verifyPin(pin, hashPin('000000')); // equalize timing
    return { ok: false, reason: 'invalid' };
  }
  if (op.locked_until && new Date(op.locked_until) > now) return { ok: false, reason: 'locked' };
  if (!verifyPin(pin, op.pin_hash)) {
    const failed = op.failed + 1;
    db.prepare('UPDATE local_operators SET failed = ?, locked_until = ? WHERE id = ?').run(
      failed >= MAX_FAILS ? 0 : failed,
      failed >= MAX_FAILS ? new Date(now.getTime() + LOCK_MS).toISOString() : null,
      op.id,
    );
    return { ok: false, reason: failed >= MAX_FAILS ? 'locked' : 'invalid' };
  }
  db.prepare('UPDATE local_operators SET failed = 0, locked_until = NULL WHERE id = ?').run(op.id);
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO local_operator_sessions (token_hash, operator_id, station, expires_at) VALUES (?, ?, ?, ?)').run(
    tokenHash(token),
    op.id,
    station,
    new Date(now.getTime() + SESSION_MS).toISOString(),
  );
  return { ok: true, token, operator: { id: op.id, name: op.name, role: op.role } };
}

export function sessionFor(db: DB, token: string | undefined, now = new Date()): (Operator & { station: string }) | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT o.id, o.name, o.role, s.station, s.expires_at FROM local_operator_sessions s
       JOIN local_operators o ON o.id = s.operator_id WHERE s.token_hash = ? AND o.active = 1`,
    )
    .get(tokenHash(token)) as { id: string; name: string; role: 'operator' | 'lead'; station: string; expires_at: string } | undefined;
  if (!row || new Date(row.expires_at) < now) return null;
  return { id: row.id, name: row.name, role: row.role, station: row.station };
}

export function logout(db: DB, token: string | undefined) {
  if (token) db.prepare('DELETE FROM local_operator_sessions WHERE token_hash = ?').run(tokenHash(token));
}
