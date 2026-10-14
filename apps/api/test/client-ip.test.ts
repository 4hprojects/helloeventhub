import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { RateLimit } from '../src/db/models.js';
import { isCloudflareIp, normalizeIp } from '../src/middleware/clientIp.js';
import { setupTestApp, teardownTestApp, type TestCtx } from './helpers.js';

describe('isCloudflareIp', () => {
  it('recognizes Cloudflare edge ranges (v4, v6, v4-mapped) and rejects others', () => {
    expect(isCloudflareIp('172.64.1.1')).toBe(true);
    expect(isCloudflareIp('::ffff:104.21.66.91')).toBe(true);
    expect(isCloudflareIp('2606:4700:3033::6815:425b')).toBe(true);
    expect(isCloudflareIp('8.8.8.8')).toBe(false);
    expect(isCloudflareIp('127.0.0.1')).toBe(false);
    expect(isCloudflareIp('not-an-ip')).toBe(false);
    expect(normalizeIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
  });
});

describe('rate limits behind Cloudflare', () => {
  let ctx: TestCtx;
  let app: ReturnType<typeof createApp>;
  let productionApp: ReturnType<typeof createApp>;
  beforeAll(async () => {
    ctx = await setupTestApp();
    app = createApp({ ...ctx.deps, config: { ...ctx.deps.config, CLOUDFLARE: true } });
    productionApp = createApp({
      ...ctx.deps,
      config: {
        ...ctx.deps.config,
        NODE_ENV: 'production',
        isProd: true,
        APP_BASE_URL: 'https://helloeventhub.online',
      },
    });
  });
  afterAll(teardownTestApp);
  beforeEach(async () => {
    await RateLimit.deleteMany({});
  });

  // TRUST_PROXY=1: X-Forwarded-For carries the address nginx saw (here: the connecting hop).
  const ask = (hop: string, visitor: string) =>
    request(app)
      .post('/api/v1/registrations/access/request')
      .set('X-Forwarded-For', hop)
      .set('CF-Connecting-IP', visitor)
      .send({ eventSlug: ctx.eventSlug, email: `v${Math.random()}@example.test`, reference: 'HEH-00000000' });

  it('gives each real visitor behind the same Cloudflare edge their own bucket', async () => {
    for (let i = 0; i < 10; i++) await ask('172.64.1.1', '203.0.113.7').expect(202);
    await ask('172.64.1.1', '203.0.113.7').expect(429);
    await ask('172.64.1.1', '203.0.113.8').expect(202); // a different visitor is unaffected
  });

  it('ignores CF-Connecting-IP from a hop that is not Cloudflare (no spoofing past the limit)', async () => {
    for (let i = 0; i < 10; i++) await ask('8.8.8.8', `198.51.100.${i}`).expect(202);
    await ask('8.8.8.8', '198.51.100.99').expect(429);
  });

  it('without the Cloudflare flag the header is ignored', async () => {
    for (let i = 0; i < 10; i++) {
      await request(ctx.app).post('/api/v1/registrations/access/request').set('X-Forwarded-For', '172.64.1.1').set('CF-Connecting-IP', `203.0.113.${i}`).send({ eventSlug: ctx.eventSlug, email: `w${i}@example.test`, reference: 'HEH-00000000' }).expect(202);
    }
    await request(ctx.app).post('/api/v1/registrations/access/request').set('X-Forwarded-For', '172.64.1.1').set('CF-Connecting-IP', '203.0.113.200').send({ eventSlug: ctx.eventSlug, email: 'x@example.test', reference: 'HEH-00000000' }).expect(429);
  });

  it('redirects public production HTTP traffic to HTTPS without breaking the internal health probe', async () => {
    const redirect = await request(productionApp).get(`/events/${ctx.eventSlug}`).expect(308);
    expect(redirect.headers.location).toBe(`https://helloeventhub.online/events/${ctx.eventSlug}`);
    await request(productionApp).get('/api/v1/health').expect(200);
    await request(productionApp)
      .get(`/api/v1/events/${ctx.eventSlug}`)
      .set('X-Forwarded-Proto', 'https')
      .expect(200);
  });
});
