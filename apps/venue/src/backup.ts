import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { DB } from './db.js';

/** Consistent online backup (SQLite backup API). Keeps the newest `keep` files. */
export async function backupDb(db: DB, dir: string, keep = 72, now = new Date()): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `venue-${now.toISOString().replace(/[:.]/g, '-')}.sqlite`);
  await db.backup(file);
  const files = readdirSync(dir)
    .filter((f) => /^venue-.*\.sqlite$/.test(f))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(path.join(dir, f), { force: true });
  return file;
}
