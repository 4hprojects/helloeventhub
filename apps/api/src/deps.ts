import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AppDeps } from './app-deps.js';
import type { Config } from './config.js';
import { createLogger } from './lib/logger.js';
import { createConsoleTransport, createResendTransport } from './services/emailTransport.js';
import { createTurnstileVerifier } from './services/turnstile.js';

export function buildDeps(config: Config): AppDeps {
  const logger = createLogger(config.LOG_LEVEL);
  let emailTransport;
  if (config.RESEND_API_KEY) {
    emailTransport = createResendTransport({ apiKey: config.RESEND_API_KEY, from: config.EMAIL_FROM, replyTo: config.EMAIL_REPLY_TO || undefined });
  } else {
    // Dev-only mailbox so manage links can be followed locally. Never enabled in production.
    const dir = !config.isProd ? process.env.DEV_MAILBOX_DIR : undefined;
    emailTransport = createConsoleTransport(logger, dir ? (msg) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${Date.now()}-${msg.idempotencyKey.replace(/[^\w-]/g, '_')}.txt`), `To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}`);
    } : undefined);
  }
  return {
    config,
    logger,
    emailTransport,
    turnstile: createTurnstileVerifier({ secret: config.TURNSTILE_SECRET_KEY, disabled: config.TURNSTILE_DISABLED }),
    now: () => new Date(),
  };
}
