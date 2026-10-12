import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { ulid } from 'ulid';

export const newPublicId = (): string => ulid();

export const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

export const hmac = (secret: string, input: string): string =>
  createHmac('sha256', secret).update(input).digest('hex');

/** 256-bit URL-safe random token (43 chars). */
export const randomToken = (): string => randomBytes(32).toString('base64url');

// Crockford base32 without I, L, O, U to avoid misreading references over the phone.
const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Non-enumerable, human-friendly reference: HEH-XXXXXXXX (40 bits of entropy). */
export function newReference(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `HEH-${s}`;
}

/** Deterministic JSON for request hashing (sorted keys). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * AES-256-GCM sealing for short-lived secrets that must sit in the email outbox
 * (e.g. a manage-link token) until the worker sends them. Cleared after send.
 */
export function seal(secret: string, plaintext: string): string {
  const key = createHash('sha256').update(`seal:${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function unseal(secret: string, sealed: string): string {
  const [iv, tag, enc] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !enc) throw new Error('Malformed sealed value');
  const key = createHash('sha256').update(`seal:${secret}`).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
