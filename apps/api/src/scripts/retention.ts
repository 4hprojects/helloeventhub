// Post-event data retention (doc 08). Usage:
//   npm run retention -- --event alsem-reunion-2026 --mode anonymize            (dry run: shows what would change)
//   npm run retention -- --event alsem-reunion-2026 --mode anonymize --apply --confirm alsem-reunion-2026
// Take an Atlas backup first. Refuses to run before the event has ended unless --force.
import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import { loadConfig } from '../config.js';
import { connectDb } from '../db/connect.js';
import { Event } from '../db/models.js';
import { applyRetention, type RetentionMode } from '../services/retention.js';

const { values } = parseArgs({
  options: {
    event: { type: 'string' },
    mode: { type: 'string' },
    apply: { type: 'boolean', default: false },
    confirm: { type: 'string' },
    force: { type: 'boolean', default: false },
    actor: { type: 'string', default: 'cli' },
  },
});
const mode = values.mode as RetentionMode;
if (!values.event || !['anonymize', 'delete'].includes(mode)) {
  console.error('Required: --event <slug> --mode anonymize|delete [--apply --confirm <slug>] [--force]');
  process.exit(1);
}
const config = loadConfig();
await connectDb(config.MONGODB_URI);
const event = await Event.findOne({ slug: values.event }).lean();
if (!event) {
  console.error(`Event "${values.event}" not found.`);
  process.exit(1);
}
if (new Date() < event.endsAt && !values.force) {
  console.error(`The event has not ended yet (${event.endsAt.toISOString()}). Use --force only if you are sure.`);
  process.exit(1);
}
const dryRun = !values.apply;
if (!dryRun && values.confirm !== event.slug) {
  console.error(`To apply, repeat the event slug: --confirm ${event.slug}`);
  process.exit(1);
}
const report = await applyRetention(event, mode, { dryRun, actorId: values.actor! });
console.log(`${dryRun ? 'DRY RUN — nothing changed' : 'APPLIED'}: ${mode} for "${event.title}"`);
console.table(report);
await mongoose.disconnect();
