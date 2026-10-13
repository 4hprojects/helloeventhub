import tls from 'node:tls';

const baseUrl = new URL(process.env.BASE_URL ?? 'https://helloeventhub.online');
const eventSlug = process.env.EVENT_SLUG ?? 'alsem-reunion-2026';
const timeoutMs = Number(process.env.PREFLIGHT_TIMEOUT_MS ?? 10_000);
const results = [];

function record(ok, name, detail = '') {
  results.push({ ok, name, detail });
}

async function request(path, options = {}) {
  try {
    return await fetch(new URL(path, baseUrl), {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    record(false, `GET ${path}`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function json(path) {
  const response = await request(path);
  if (!response) return null;
  const text = await response.text();
  record(response.ok, `GET ${path}`, `HTTP ${response.status}`);
  if (!response.ok) return null;
  try {
    return { response, body: JSON.parse(text) };
  } catch {
    record(false, `${path} JSON`, 'Response is not valid JSON');
    return null;
  }
}

async function checkTls() {
  if (baseUrl.protocol !== 'https:') {
    record(false, 'HTTPS base URL', baseUrl.href);
    return;
  }
  await new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: baseUrl.hostname,
        port: Number(baseUrl.port || 443),
        servername: baseUrl.hostname,
        rejectUnauthorized: true,
        timeout: timeoutMs,
      },
      () => {
        const cert = socket.getPeerCertificate();
        const expiresAt = new Date(cert.valid_to);
        const days = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);
        record(
          socket.authorized,
          'TLS certificate trusted',
          socket.authorizationError ?? cert.subject?.CN ?? 'trusted',
        );
        record(
          days >= 14,
          'TLS certificate lifetime',
          `${days} day(s) remaining; expires ${expiresAt.toISOString()}`,
        );
        socket.end();
        resolve();
      },
    );
    socket.once('timeout', () => {
      record(false, 'TLS connection', `Timed out after ${timeoutMs} ms`);
      socket.destroy();
      resolve();
    });
    socket.once('error', (error) => {
      record(false, 'TLS connection', error.message);
      resolve();
    });
  });
}

async function checkHttpRedirect() {
  const url = new URL(baseUrl);
  url.protocol = 'http:';
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const location = response.headers.get('location') ?? '';
    record(
      [301, 302, 307, 308].includes(response.status) && location.startsWith('https://'),
      'HTTP redirects to HTTPS',
      `HTTP ${response.status}${location ? ` → ${location}` : ''}`,
    );
  } catch (error) {
    record(false, 'HTTP redirects to HTTPS', error instanceof Error ? error.message : String(error));
  }
}

await checkTls();
await checkHttpRedirect();

const health = await json('/api/v1/health');
if (health) {
  record(health.body.status === 'ok', 'Application health', `status=${String(health.body.status)}`);
  record(health.body.db === 'connected', 'Database health', `db=${String(health.body.db)}`);
}

const config = await json('/api/v1/public-config');
if (config) {
  const key = config.body.turnstileSiteKey;
  record(
    config.body.appName === 'HelloEventHub',
    'Public configuration app name',
    String(config.body.appName),
  );
  record(
    typeof key === 'string' && key.length > 0 && !/^[12]x0{4}/.test(key),
    'Production Turnstile site key',
    key ? 'configured' : 'missing',
  );
  record(config.body.timezone === 'Asia/Manila', 'Public timezone', String(config.body.timezone));
}

const event = await json(`/api/v1/events/${encodeURIComponent(eventSlug)}`);
if (event) {
  const body = event.body;
  const contact = body.contactInfo ?? {};
  record(
    typeof body.title === 'string' && body.title.length >= 3,
    'Official event title',
    String(body.title ?? 'missing'),
  );
  record(
    typeof body.description === 'string' && body.description.trim().length > 0,
    'Event description',
    body.description ? 'configured' : 'missing',
  );
  record(
    Boolean(contact.email || contact.phone || contact.messenger),
    'Organizer contact channel',
    contact.email || contact.phone || contact.messenger || 'missing',
  );
  record(body.privacyNoticeApproved === true, 'Privacy notice approved', String(body.privacyNoticeApproved));
  record(
    !/PENDING|TO CONFIRM|PLACEHOLDER/i.test(body.privacyNotice ?? ''),
    'Privacy notice has no draft markers',
  );
  record(body.consentVersion === '2026-10-v2', 'Consent version', String(body.consentVersion));
  record(
    body.registrationOpen === true,
    'Online registration open',
    body.registrationOpen ? 'open' : body.registrationMessage || 'closed',
  );
  record(
    Array.isArray(body.categories) && body.categories.length >= 1,
    'Family categories',
    `${body.categories?.length ?? 0} active`,
  );
  record(body.venueName == null, 'Venue intentionally TBA', body.venueName ?? 'Venue to be announced');
}

for (const path of ['/', `/events/${encodeURIComponent(eventSlug)}`]) {
  const response = await request(path);
  if (!response) continue;
  const contentType = response.headers.get('content-type') ?? '';
  record(
    response.ok && contentType.includes('text/html'),
    `Page ${path}`,
    `HTTP ${response.status}; ${contentType || 'no content type'}`,
  );
  if (path === '/') {
    record(Boolean(response.headers.get('strict-transport-security')), 'HSTS header');
    record(Boolean(response.headers.get('content-security-policy')), 'Content-Security-Policy header');
    record(
      response.headers.get('x-content-type-options') === 'nosniff',
      'X-Content-Type-Options header',
      response.headers.get('x-content-type-options') ?? 'missing',
    );
    record(!response.headers.has('x-powered-by'), 'Technology header hidden');
  }
}

const width = Math.max(...results.map((result) => result.name.length));
for (const result of results) {
  const detail = result.detail ? ` — ${result.detail}` : '';
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name.padEnd(width)}${detail}`);
}

const failures = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failures}/${results.length} checks passed for ${baseUrl.origin}`);
if (failures) process.exitCode = 1;
