// Standalone email worker for horizontally scaled deployments (set EMAIL_WORKER_ENABLED=false on web instances).
import mongoose from 'mongoose';
import { loadConfig } from './config.js';
import { connectDb } from './db/connect.js';
import { buildDeps } from './deps.js';
import { startEmailWorker } from './services/emailOutbox.js';

const config = loadConfig();
if (config.isProd && !config.RESEND_API_KEY) {
  console.error('RESEND_API_KEY is required for the production email worker');
  process.exit(1);
}
const deps = buildDeps(config);
await connectDb(config.MONGODB_URI);
const stop = startEmailWorker({ transport: deps.emailTransport, logger: deps.logger, appBaseUrl: config.APP_BASE_URL, sessionSecret: config.SESSION_SECRET });
deps.logger.info('email worker started');
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    stop();
    await mongoose.disconnect();
    process.exit(0);
  });
}
