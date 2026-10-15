import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePrimaryEventConfig } from './release-preflight-lib.mjs';

test('accepts the expected configured primary event', () => {
  assert.deepEqual(evaluatePrimaryEventConfig({ primaryEventSlug: 'family-day' }, 'family-day'), {
    ok: true,
    configuredSlug: 'family-day',
    detail: 'family-day',
  });
});

test('rejects a stale configured primary event', () => {
  assert.deepEqual(evaluatePrimaryEventConfig({ primaryEventSlug: 'old-family-day' }, 'family-day'), {
    ok: false,
    configuredSlug: 'old-family-day',
    detail: 'old-family-day',
  });
});

test('rejects a missing configured primary event', () => {
  assert.deepEqual(evaluatePrimaryEventConfig({}, 'family-day'), {
    ok: false,
    configuredSlug: '',
    detail: 'missing',
  });
});
