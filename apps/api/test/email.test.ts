import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EmailJob, RateLimit } from '../src/db/models.js';
import { createLogger } from '../src/lib/logger.js';
import { processEmailBatch, MAX_EMAIL_ATTEMPTS } from '../src/services/emailOutbox.js';
import { escapeHtml } from '../src/services/emailTemplates.js';
import { EmailSendError, type EmailTransport, type OutgoingEmail } from '../src/services/emailTransport.js';
import { registrationPayload, setupTestApp, submit, teardownTestApp, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(teardownTestApp);
beforeEach(async () => {
  await RateLimit.deleteMany({});
  await EmailJob.deleteMany({});
});

const logger = createLogger('silent');
const run = (transport: EmailTransport, now = new Date()) =>
  processEmailBatch({ transport, logger, appBaseUrl: 'https://helloeventhub.online', sessionSecret: 'x'.repeat(40), now: () => now });

describe('email outbox', () => {
  it('registration succeeds even when the provider is down, then retries with backoff', async () => {
    const res = await submit(ctx, registrationPayload()).expect(201);
    expect(res.body.confirmationEmailQueued).toBe(true);
    const down: EmailTransport = { send: async () => { throw new EmailSendError('network_error', false); } };
    await run(down);
    let job = await EmailJob.findOne({}).lean();
    expect(job).toMatchObject({ status: 'queued', attempts: 1, lastErrorCode: 'network_error' });
    expect(job!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    const sent: OutgoingEmail[] = [];
    const up: EmailTransport = { send: async (m) => (sent.push(m), { id: 'prov-1' }) };
    await run(up); // not yet due
    expect(sent).toHaveLength(0);
    await run(up, new Date(Date.now() + 60 * 60 * 1000));
    job = await EmailJob.findOne({}).lean();
    expect(job).toMatchObject({ status: 'sent', providerMessageId: 'prov-1', attempts: 2 });
    expect(sent[0]!.subject).toContain(res.body.reference);
    expect(sent[0]!.html).toContain(res.body.reference);
    expect(sent[0]!.idempotencyKey).toBe(job!.dedupeKey);
  });

  it('marks permanent failures as failed without retry', async () => {
    await submit(ctx, registrationPayload()).expect(201);
    await run({ send: async () => { throw new EmailSendError('resend_422_validation_error', true); } });
    expect(await EmailJob.findOne({}).lean()).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it(`gives up after ${MAX_EMAIL_ATTEMPTS} transient failures`, async () => {
    await submit(ctx, registrationPayload()).expect(201);
    const down: EmailTransport = { send: async () => { throw new EmailSendError('resend_500', false); } };
    let t = Date.now();
    for (let i = 0; i < MAX_EMAIL_ATTEMPTS; i++) {
      await run(down, new Date(t));
      t += 2 * 60 * 60 * 1000;
    }
    expect(await EmailJob.findOne({}).lean()).toMatchObject({ status: 'failed', attempts: MAX_EMAIL_ATTEMPTS });
  });

  it('escapes user content in HTML emails', async () => {
    expect(escapeHtml('<script>"x"&\'y\'</script>')).toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
    await submit(ctx, registrationPayload({ representative: { name: 'Evil <img src=x onerror=alert(1)>', contacts: { email: 'e@example.test', preferred: 'email' } } })).expect(201);
    const sent: OutgoingEmail[] = [];
    await run({ send: async (m) => (sent.push(m), { id: '1' }) });
    expect(sent[0]!.html).not.toContain('<img src=x');
    expect(sent[0]!.html).toContain('&lt;img');
  });

  it('does not list children by name in emails', async () => {
    await submit(ctx, registrationPayload({ attendees: [{ fullName: 'Grown Up', ageCategory: 'adult', rsvp: 'confirmed' }, { fullName: 'Little Kid', ageCategory: 'child', rsvp: 'confirmed' }] })).expect(201);
    const sent: OutgoingEmail[] = [];
    await run({ send: async (m) => (sent.push(m), { id: '1' }) });
    expect(sent[0]!.text).toContain('Grown Up');
    expect(sent[0]!.text).not.toContain('Little Kid');
    expect(sent[0]!.text).toContain('Children: 1');
  });
});
