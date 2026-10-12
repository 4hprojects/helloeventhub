// Venue admin commands. Usage: npm run cli -- <command> [options]
//   operator-add --name "Ana" --role lead|operator     (PIN prompted, or VENUE_PIN)
//   operator-disable --name "Ana"
//   operators
//   sync               push pending operations and pull the roster now
//   status             roster/check-in/sync counts
//   backup             write a backup now
//   reset-cursor       force a full roster re-pull on next sync
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { backupDb } from './backup.js';
import { stats } from './checkin.js';
import { loadVenueConfig } from './config.js';
import { getState, openDb, setState } from './db.js';
import { disableOperator, listOperatorNames, upsertOperator, validatePin } from './operators.js';
import { httpCloudClient, SyncLoop } from './sync.js';

const [cmd, ...rest] = process.argv.slice(2);
const { values } = parseArgs({ args: rest, options: { name: { type: 'string' }, role: { type: 'string', default: 'operator' } } });
const config = loadVenueConfig();
const db = openDb(config.dbPath);

async function main() {
  switch (cmd) {
    case 'operator-add': {
      if (!values.name) throw new Error('--name is required');
      const role = values.role === 'lead' ? 'lead' : 'operator';
      let pin = process.env.VENUE_PIN;
      if (!pin) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        pin = await rl.question('PIN (6-12 digits): ');
        rl.close();
      }
      const err = validatePin(pin);
      if (err) throw new Error(err);
      const op = upsertOperator(db, values.name, pin, role);
      console.log(`OK: ${op.name} (${op.role})`);
      break;
    }
    case 'operator-disable':
      if (!values.name) throw new Error('--name is required');
      console.log(disableOperator(db, values.name) ? 'Disabled.' : 'No such operator.');
      break;
    case 'operators':
      console.log(listOperatorNames(db).join('\n') || '(none)');
      break;
    case 'sync': {
      if (!config.cloudConfigured) throw new Error('Cloud not configured');
      const loop = new SyncLoop(db, httpCloudClient({ baseUrl: config.CLOUD_BASE_URL!, eventId: config.CLOUD_EVENT_ID!, token: config.CLOUD_DEVICE_TOKEN! }), 0);
      const r = await loop.runOnce();
      console.log(JSON.stringify(r, null, 2));
      if (r.error) process.exitCode = 1;
      break;
    }
    case 'status':
      console.log(JSON.stringify({ ...stats(db), rosterVerifiedAt: getState(db, 'roster_verified'), lastPullAt: getState(db, 'last_pull_at'), lastPushAt: getState(db, 'last_push_at') }, null, 2));
      break;
    case 'backup':
      console.log(`Backup written: ${await backupDb(db, config.VENUE_BACKUP_DIR)}`);
      break;
    case 'reset-cursor':
      setState(db, 'cursor', null);
      console.log('Cursor reset; next sync re-pulls the full roster.');
      break;
    default:
      console.log('Commands: operator-add, operator-disable, operators, sync, status, backup, reset-cursor');
      process.exitCode = cmd ? 1 : 0;
  }
}

main()
  .catch((e) => {
    console.error(`Error: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
