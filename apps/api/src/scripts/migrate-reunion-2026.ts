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
  const { eventFieldChanges, branchLabelChanges, ...counts } = report;
  const show = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
  console.log(dryRun ? 'DRY RUN — nothing changed' : 'APPLIED');
  console.table(counts);
  console.log(`Event fields (${eventFieldChanges.length}):`);
  if (eventFieldChanges.length)
    console.table(eventFieldChanges.map((c) => ({ field: c.field, action: c.action, from: show(c.from), to: show(c.to) })));
  console.log(`Branch labels (${branchLabelChanges.length}):`);
  if (branchLabelChanges.length) console.table(branchLabelChanges);
} finally {
  await mongoose.disconnect();
}
