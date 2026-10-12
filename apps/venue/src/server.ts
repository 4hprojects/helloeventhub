import { existsSync, readFileSync } from 'node:fs';
import { createServer as createHttps } from 'node:https';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVenueApp } from './app.js';
import { backupDb } from './backup.js';
import { loadVenueConfig } from './config.js';
import { openDb } from './db.js';
import { httpCloudClient, SyncLoop } from './sync.js';

const config = loadVenueConfig();
const db = openDb(config.dbPath);
const cloud = config.cloudConfigured
  ? httpCloudClient({ baseUrl: config.CLOUD_BASE_URL!, eventId: config.CLOUD_EVENT_ID!, token: config.CLOUD_DEVICE_TOKEN! })
  : null;
const log = (msg: string, extra?: unknown) => console.warn(`[venue] ${new Date().toISOString()} ${msg}`, extra ?? '');
const sync = new SyncLoop(db, cloud, config.SYNC_INTERVAL_MS, log);
const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = [path.resolve(here, 'web'), path.resolve(here, '../dist/web')].find((d) => existsSync(path.join(d, 'index.html')));
const tls = config.VENUE_TLS_CERT && config.VENUE_TLS_KEY;
const app = createVenueApp({ db, sync, webDir, secure: !!tls });

const server = tls
  ? createHttps({ cert: readFileSync(config.VENUE_TLS_CERT!), key: readFileSync(config.VENUE_TLS_KEY!) }, app).listen(config.VENUE_PORT, config.VENUE_HOST)
  : app.listen(config.VENUE_PORT, config.VENUE_HOST);

server.on('listening', () => {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `${tls ? 'https' : 'http'}://${i!.address}:${config.VENUE_PORT}`);
  log(`venue server ready. Open on committee devices: ${ips.join('  ') || `port ${config.VENUE_PORT}`}`);
  if (!cloud) log('cloud sync NOT configured (set CLOUD_BASE_URL, CLOUD_EVENT_ID, CLOUD_DEVICE_TOKEN)');
  if (!webDir) log('web UI build not found — run npm run build');
});

sync.start();
const backupTimer = setInterval(() => {
  backupDb(db, config.VENUE_BACKUP_DIR).catch((e) => log('backup failed', (e as Error).message));
}, config.BACKUP_INTERVAL_MS);

function shutdown() {
  sync.stop();
  clearInterval(backupTimer);
  server.close();
  backupDb(db, config.VENUE_BACKUP_DIR)
    .catch(() => undefined)
    .finally(() => {
      db.close();
      process.exit(0);
    });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
