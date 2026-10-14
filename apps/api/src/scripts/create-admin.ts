// Usage: npm run create-admin -- --email you@example.com --name "Your Name" --role event_admin [--event mb-wa-reunion-2026]
// Prompts for a password (or reads ADMIN_PASSWORD). Re-running for an existing email adds/updates the membership.
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import mongoose from 'mongoose';
import type { ROLES} from '@heh/contracts';
import { normalizeEmail } from '@heh/contracts';
import { loadConfig } from '../config.js';
import { connectDb, ensureIndexes } from '../db/connect.js';
import { AdminUser, Event, Membership } from '../db/models.js';
import { hashPassword, passwordPolicy } from '../routes/auth.js';
import { PRIMARY_EVENT_SLUG } from '../services/seedData.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'committee' },
    event: { type: 'string', default: PRIMARY_EVENT_SLUG },
    'reset-password': { type: 'boolean', default: false },
  },
});
if (!values.email || !values.name) {
  console.error('Required: --email and --name. Optional: --role committee|event_admin, --event <slug>, --reset-password');
  process.exit(1);
}
const role = values.role as (typeof ROLES)[number];
if (!['committee', 'event_admin'].includes(role)) {
  console.error('--role must be committee or event_admin');
  process.exit(1);
}
const config = loadConfig();
await connectDb(config.MONGODB_URI);
await ensureIndexes();
const event = await Event.findOne({ slug: values.event });
if (!event) {
  console.error(`Event "${values.event}" not found. Run npm run seed first.`);
  process.exit(1);
}
const email = normalizeEmail(values.email);
let user = await AdminUser.findOne({ email });
if (!user || values['reset-password']) {
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question('Password (min 12 chars): ');
    rl.close();
  }
  const ok = passwordPolicy.safeParse(password);
  if (!ok.success) {
    console.error(ok.error.issues.map((i) => i.message).join('; '));
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);
  if (user) {
    user.passwordHash = passwordHash;
    user.passwordChangedAt = new Date();
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    await user.save();
  } else {
    user = await AdminUser.create({ email, name: values.name, passwordHash });
  }
}
await Membership.updateOne(
  { userId: user._id, organizationId: event.organizationId, eventId: event._id },
  { $set: { role, grantedBy: 'cli' } },
  { upsert: true },
);
console.log(`OK: ${email} is ${role} for "${event.title}".`);
await mongoose.disconnect();
