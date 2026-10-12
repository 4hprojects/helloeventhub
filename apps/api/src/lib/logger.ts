import pino from 'pino';

/**
 * Structured logger. PII and secrets are redacted by path; request URLs are logged
 * without query strings (admin search terms can contain names).
 */
export function createLogger(level: string) {
  return pino({
    level,
    base: { service: 'helloeventhub-api' },
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-csrf-token"]',
        'req.headers["idempotency-key"]',
        'res.headers["set-cookie"]',
        '*.email',
        '*.mobile',
        '*.password',
        '*.token',
        '*.recipient',
        '*.messengerProfileUrl',
        '*.messengerDisplayName',
        '*.fullName',
        '*.representativeName',
        '*.name',
      ],
      censor: '[redacted]',
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
