import type { Config } from './config.js';
import type { Logger } from './lib/logger.js';
import type { EmailTransport } from './services/emailTransport.js';
import type { TurnstileVerifier } from './services/turnstile.js';

export interface AppDeps {
  config: Config;
  logger: Logger;
  turnstile: TurnstileVerifier;
  emailTransport: EmailTransport;
  now: () => Date;
}
