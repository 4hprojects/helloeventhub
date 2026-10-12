import { loadConfig } from './config.js';
import { connectDb, ensureIndexes } from './db/connect.js';
import { buildDeps } from './deps.js';
import { createApp } from './app.js';
import { startEmailWorker } from './services/emailOutbox.js';
import { startScheduler } from './services/scheduler.js';
import mongoose from 'mongoose';

const config = loadConfig();
const deps = buildDeps(config);
const { logger } = deps;

await connectDb(config.MONGODB_URI);
await ensureIndexes();
logger.info({ version: config.version, env: config.NODE_ENV }, 'database connected, indexes ensured');

const app = createApp(deps);
const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'HelloEventHub listening'));
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;

// In production, never fake delivery: without a Resend key, jobs stay "queued" (visible in Admin > Emails).
const emailReady = !!config.RESEND_API_KEY || !config.isProd;
if (config.EMAIL_WORKER_ENABLED && !emailReady) logger.error('RESEND_API_KEY missing in production: email worker NOT started; emails stay queued');
const stopWorker = config.EMAIL_WORKER_ENABLED && emailReady
  ? startEmailWorker({ transport: deps.emailTransport, logger, appBaseUrl: config.APP_BASE_URL, sessionSecret: config.SESSION_SECRET })
  : () => undefined;
const stopScheduler = startScheduler(deps);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  stopWorker();
  stopScheduler();
  server.close();
  setTimeout(() => process.exit(0), 10_000).unref();
  await mongoose.disconnect().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err: { message: (err as Error)?.message } }, 'unhandled rejection'));
