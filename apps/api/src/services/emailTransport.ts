import type { Logger } from '../lib/logger.js';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export class EmailSendError extends Error {
  constructor(
    public readonly code: string,
    public readonly permanent: boolean,
  ) {
    super(code);
  }
}

export interface EmailTransport {
  send(msg: OutgoingEmail): Promise<{ id: string }>;
}

/** Resend REST API (no SDK). Classifies failures as permanent vs retryable. */
export function createResendTransport(opts: { apiKey: string; from: string; replyTo?: string }): EmailTransport {
  return {
    async send(msg) {
      let res: Response;
      try {
        res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': msg.idempotencyKey,
          },
          body: JSON.stringify({
            from: opts.from,
            to: [msg.to],
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
            ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new EmailSendError('network_error', false);
      }
      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as { id?: string };
        return { id: json.id ?? 'unknown' };
      }
      const json = (await res.json().catch(() => ({}))) as { name?: string };
      const code = `resend_${res.status}${json.name ? `_${json.name}` : ''}`;
      // 429 and 5xx are retryable; other 4xx (validation, invalid recipient, auth) are permanent.
      const permanent = res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 409;
      throw new EmailSendError(code, permanent);
    },
  };
}

/** Dev transport: logs that an email would be sent, without contents or recipient. */
export function createConsoleTransport(logger: Logger, onSend?: (msg: OutgoingEmail) => void): EmailTransport {
  let n = 0;
  return {
    async send(msg) {
      n += 1;
      logger.info({ subject: msg.subject, idempotencyKey: msg.idempotencyKey }, 'email (console transport)');
      onSend?.(msg);
      return { id: `console-${n}` };
    },
  };
}
