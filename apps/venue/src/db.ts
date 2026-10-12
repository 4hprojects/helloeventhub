import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS venue_roster (
  attendee_id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  full_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  representative_name TEXT NOT NULL DEFAULT '',
  normalized_rep TEXT NOT NULL DEFAULT '',
  age_category TEXT NOT NULL,
  branch TEXT NOT NULL,
  rsvp TEXT NOT NULL,
  active INTEGER NOT NULL,
  walk_in INTEGER NOT NULL DEFAULT 0,
  local_only INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER NOT NULL DEFAULT 0,
  cloud_checked_in_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS roster_name ON venue_roster(normalized_name);
CREATE INDEX IF NOT EXISTS roster_rep ON venue_roster(normalized_rep);
CREATE INDEX IF NOT EXISTS roster_ref ON venue_roster(reference);
CREATE INDEX IF NOT EXISTS roster_reg ON venue_roster(registration_id);

CREATE TABLE IF NOT EXISTS checkin_operations (
  op_id TEXT PRIMARY KEY,
  attendee_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  local_time TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted','duplicate','rejected','undone')),
  first_op_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','synced','failed','needs_review','not_required')),
  sync_result TEXT,
  synced_at TEXT
);
-- At most one accepted check-in per attendee, across every station on this server.
CREATE UNIQUE INDEX IF NOT EXISTS one_accepted_checkin ON checkin_operations(attendee_id) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS checkin_sync ON checkin_operations(sync_status, local_time);

CREATE TABLE IF NOT EXISTS walkin_operations (
  op_id TEXT PRIMARY KEY,
  temp_attendee_id TEXT NOT NULL UNIQUE,
  group_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  age_category TEXT NOT NULL,
  branch TEXT,
  contact TEXT,
  checked_in INTEGER NOT NULL,
  operator_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  local_time TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','synced','failed','needs_review')),
  sync_result TEXT,
  cloud_attendee_id TEXT,
  cloud_registration_id TEXT,
  cloud_reference TEXT,
  synced_at TEXT
);
CREATE INDEX IF NOT EXISTS walkin_sync ON walkin_operations(sync_status, local_time);

-- Venue corrections: edits, extra household members, undone check-ins (synced to the cloud later).
CREATE TABLE IF NOT EXISTS attendee_operations (
  op_id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('attendee_update','attendee_add','checkin_undo')),
  attendee_id TEXT NOT NULL,
  registration_id TEXT,
  base_revision INTEGER,
  payload TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  local_time TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','synced','failed','needs_review','not_required')),
  sync_result TEXT,
  synced_at TEXT
);
CREATE INDEX IF NOT EXISTS attendee_ops_sync ON attendee_operations(sync_status, local_time);
CREATE INDEX IF NOT EXISTS attendee_ops_attendee ON attendee_operations(attendee_id, sync_status);

CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS local_operators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('operator','lead')),
  active INTEGER NOT NULL DEFAULT 1,
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_operator_sessions (
  token_hash TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES local_operators(id),
  station TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  // FULL: an acknowledged check-in survives power loss.
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  db.exec(SCHEMA);
  return db;
}

/** Upgrade databases created by older venue builds (SQLite can't alter a CHECK constraint in place). */
function migrate(db: DB) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'checkin_operations'").get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'undone'")) return;
  db.transaction(() => {
    db.exec('ALTER TABLE checkin_operations RENAME TO checkin_operations_old');
    db.exec('DROP INDEX IF EXISTS one_accepted_checkin');
    db.exec('DROP INDEX IF EXISTS checkin_sync');
    db.exec(SCHEMA);
    db.exec('INSERT INTO checkin_operations SELECT * FROM checkin_operations_old');
    db.exec('DROP TABLE checkin_operations_old');
  })();
}

export function getState(db: DB, key: string): string | null {
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setState(db: DB, key: string, value: string | null) {
  db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
