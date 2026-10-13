import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    APP_BASE_URL: z.string().url().default('http://localhost:5173'),
    ALLOWED_ORIGINS: z.string().default(''),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    /** True when the site is proxied by Cloudflare (orange cloud): use CF-Connecting-IP from Cloudflare edges. */
    CLOUDFLARE: bool.default('false'),
    EVENT_TIMEZONE: z.string().default('Asia/Manila'),
    MONGODB_URI: z.string().min(1),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    RESEND_API_KEY: z.string().optional().default(''),
    EMAIL_FROM: z.string().default('HelloEventHub <noreply@helloeventhub.online>'),
    EMAIL_REPLY_TO: z.string().optional().default(''),
    EMAIL_WORKER_ENABLED: bool.default('true'),
    TURNSTILE_SITE_KEY: z.string().optional().default(''),
    TURNSTILE_SECRET_KEY: z.string().optional().default(''),
    TURNSTILE_FAIL_OPEN: bool.default('true'),
    TURNSTILE_DISABLED: bool.default('false'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    WEB_DIST_DIR: z.string().optional(),
    PRIMARY_EVENT_SLUG: z.string().default('alsem-reunion-2026'),
    /** Venue pulls only see changes older than this (covers in-flight transactions). */
    SYNC_SETTLE_MS: z.coerce.number().int().min(0).default(65_000),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV !== 'production') return;
    const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (e.TURNSTILE_DISABLED) fail('TURNSTILE_DISABLED', 'Turnstile cannot be disabled in production');
    if (!e.TURNSTILE_SECRET_KEY || !e.TURNSTILE_SITE_KEY)
      fail('TURNSTILE_SECRET_KEY', 'Turnstile keys are required in production');
    if (e.TURNSTILE_SITE_KEY.startsWith('1x0000') || e.TURNSTILE_SITE_KEY.startsWith('2x0000'))
      fail('TURNSTILE_SITE_KEY', 'Turnstile test keys are not allowed in production');
    if (e.TURNSTILE_SECRET_KEY.startsWith('1x0000') || e.TURNSTILE_SECRET_KEY.startsWith('2x0000'))
      fail('TURNSTILE_SECRET_KEY', 'Turnstile test keys are not allowed in production');
    if (/change-me/.test(e.SESSION_SECRET)) fail('SESSION_SECRET', 'Set a real SESSION_SECRET in production');
    if (!e.APP_BASE_URL.startsWith('https://')) fail('APP_BASE_URL', 'APP_BASE_URL must be https in production');
  });

export type Config = z.output<typeof envSchema> & {
  isProd: boolean;
  isTest: boolean;
  allowedOrigins: string[];
  version: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const c = parsed.data;
  const appOrigin = new URL(c.APP_BASE_URL).origin;
  return {
    ...c,
    isProd: c.NODE_ENV === 'production',
    isTest: c.NODE_ENV === 'test',
    allowedOrigins: [
      appOrigin,
      ...c.ALLOWED_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ],
    version: process.env.APP_VERSION ?? '0.1.0-dev',
  };
}
