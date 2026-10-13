import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const apiBuild = path.join(root, 'apps/api/dist/server.js');
const webBuild = path.join(root, 'apps/web/dist/index.html');
const venueBuild = path.join(root, 'apps/venue/dist/server.js');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!existsSync(apiBuild) || !existsSync(webBuild) || !existsSync(venueBuild)) {
  throw new Error('Production builds not found. Run `npm run build` before the self-contained release suite.');
}

const port = process.env.E2E_PORT ?? '3210';
const baseUrl = `http://127.0.0.1:${port}`;
const mailbox = mkdtempSync(path.join(tmpdir(), 'heh-e2e-mail-'));
const replSet = await MongoMemoryReplSet.create({
  binary: { version: '7.0.14' },
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});

const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: port,
  APP_BASE_URL: baseUrl,
  ALLOWED_ORIGINS: baseUrl,
  TRUST_PROXY: '0',
  CLOUDFLARE: 'false',
  MONGODB_URI: replSet.getUri('helloeventhub'),
  SESSION_SECRET: 'isolated-e2e-secret-is-longer-than-thirty-two-characters',
  TURNSTILE_DISABLED: 'true',
  DEV_MAILBOX_DIR: mailbox,
  MAILBOX_DIR: mailbox,
  E2E_BASE_URL: baseUrl,
  E2E_ADMIN_EMAIL: 'admin@local.test',
  E2E_ADMIN_PASSWORD: 'local-dev-password-123',
  ADMIN_PASSWORD: 'local-dev-password-123',
  CLOUD: baseUrl,
  SYNC_SETTLE_MS: '1000',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn',
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (${code ?? signal})`));
    });
  });
}

async function waitForServer(server) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`API server exited before becoming ready (${server.exitCode})`);
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`API server did not become ready at ${baseUrl}`);
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      server.kill('SIGKILL');
      resolve();
    }, 10_000);
    server.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    server.kill('SIGTERM');
  });
}

let server;
try {
  await run(npm, ['run', 'seed']);
  await run(npm, [
    'run',
    'create-admin',
    '--',
    '--email',
    env.E2E_ADMIN_EMAIL,
    '--name',
    'E2E Admin',
    '--role',
    'event_admin',
  ]);
  server = spawn(process.execPath, [apiBuild], { cwd: root, env, stdio: 'inherit' });
  await waitForServer(server);
  await run(npm, ['run', 'test:e2e']);
  await run(process.execPath, ['scripts/venue-simulation.mjs']);
} finally {
  await stopServer(server);
  await replSet.stop();
  rmSync(mailbox, { recursive: true, force: true });
}
