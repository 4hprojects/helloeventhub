import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import { loadConfig } from '../config.js';
import { connectDb } from '../db/connect.js';
import { migrateReunionEvent } from '../services/reunionMigration.js';
import { PRIMARY_EVENT_SLUG } from '../services/seedData.js';

const { values } = parseArgs({
  options: { apply: { type: 'boolean', default: false }, confirm: { type: 'string' } },
});
const dryRun = !values.apply;
if (!dryRun && values.confirm !== PRIMARY_EVENT_SLUG) {
  console.error(`To apply, repeat the event slug: --confirm ${PRIMARY_EVENT_SLUG}`);
  process.exit(1);
}

const config = loadConfig();
await connectDb(config.MONGODB_URI);
try {
  const report = await migrateReunionEvent({ dryRun });
  console.log(dryRun ? 'DRY RUN — nothing changed' : 'APPLIED');
  console.table(report);
} finally {
  await mongoose.disconnect();
}
