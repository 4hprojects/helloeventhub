import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Event } from '../src/db/models.js';
import { assertPublishedPrimaryEvent } from '../src/services/seedData.js';
import { setupTestApp, teardownTestApp, type TestCtx } from './helpers.js';

describe('primary event startup invariant', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await setupTestApp();
  });

  afterAll(teardownTestApp);

  it('accepts a configured published event', async () => {
    await expect(assertPublishedPrimaryEvent(ctx.eventSlug)).resolves.toBeUndefined();
  });

  it('rejects a missing event', async () => {
    await expect(assertPublishedPrimaryEvent('missing-event')).rejects.toThrow(
      'does not identify a published event',
    );
  });

  it('rejects the stale legacy event slug', async () => {
    await expect(assertPublishedPrimaryEvent('alsem-reunion-2026')).rejects.toThrow(
      'PRIMARY_EVENT_SLUG="alsem-reunion-2026"',
    );
  });

  it('rejects an unpublished event', async () => {
    await Event.updateOne({ slug: ctx.eventSlug }, { $set: { status: 'draft' } });
    await expect(assertPublishedPrimaryEvent(ctx.eventSlug)).rejects.toThrow(
      'does not identify a published event',
    );
    await Event.updateOne({ slug: ctx.eventSlug }, { $set: { status: 'published' } });
  });
});
