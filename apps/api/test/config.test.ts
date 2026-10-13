import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const validProductionEnv = {
  NODE_ENV: 'production',
  PORT: '3000',
  APP_BASE_URL: 'https://helloeventhub.online',
  MONGODB_URI: 'mongodb+srv://example.test/helloeventhub',
  SESSION_SECRET: 'a-production-session-secret-with-enough-length',
  TURNSTILE_SITE_KEY: '0x4AAAAAAA-real-site-key-example',
  TURNSTILE_SECRET_KEY: '0x4AAAAAAA-real-secret-key-example',
} satisfies NodeJS.ProcessEnv;

describe('production configuration', () => {
  it('accepts a safe production baseline', () => {
    const config = loadConfig(validProductionEnv);
    expect(config).toMatchObject({
      isProd: true,
      PORT: 3000,
      APP_BASE_URL: 'https://helloeventhub.online',
    });
  });

  it.each([
    ['disabled Turnstile', { TURNSTILE_DISABLED: 'true' }, 'Turnstile cannot be disabled'],
    ['missing Turnstile keys', { TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET_KEY: '' }, 'Turnstile keys are required'],
    ['a Turnstile test site key', { TURNSTILE_SITE_KEY: '1x00000000000000000000AA' }, 'Turnstile test keys are not allowed'],
    ['a Turnstile test secret key', { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' }, 'Turnstile test keys are not allowed'],
    ['an insecure application URL', { APP_BASE_URL: 'http://helloeventhub.online' }, 'APP_BASE_URL must be https'],
    ['the placeholder session secret', { SESSION_SECRET: 'change-me-this-is-not-a-production-secret' }, 'Set a real SESSION_SECRET'],
  ])('rejects %s', (_label, override, message) => {
    expect(() => loadConfig({ ...validProductionEnv, ...override })).toThrow(message);
  });
});
