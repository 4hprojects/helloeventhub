/** Collapse whitespace while preserving the human-readable form a person typed. */
export function cleanDisplayName(input: string): string {
  return input.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * Normalized key for name search and duplicate detection: lowercase, no diacritics,
 * no punctuation, single spaces. Never used to merge records automatically.
 */
export function normalizeName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Normalize a Philippine mobile number to E.164 (+639XXXXXXXXX).
 * Accepts 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX, +639XXXXXXXXX with spaces/dashes/parentheses.
 * Returns null when the input is not a valid PH mobile number.
 */
export function normalizePhMobile(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  const m = /^(?:\+?63|0)?(9\d{9})$/.exec(digits);
  return m ? `+63${m[1]}` : null;
}

/** Display a normalized PH mobile as 0917 123 4567. */
export function formatPhMobile(e164: string): string {
  const m = /^\+63(9\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

const MESSENGER_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'fb.com',
  'm.me',
  'messenger.com',
  'www.messenger.com',
]);

/** Only allow https links on known Meta hosts so stored URLs can't become phishing/XSS vectors. */
export function isAllowedMessengerUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && MESSENGER_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export interface NameParts {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}

/** Display form used everywhere a single name is shown: "Last, First Middle". */
export function composeFullName(p: NameParts): string {
  const given = [p.firstName, p.middleName ?? ''].map(cleanDisplayName).filter(Boolean).join(' ');
  return `${cleanDisplayName(p.lastName)}, ${given}`;
}

/** Best-effort split of a legacy single-field name, for prefilling edit forms. */
export function splitFullName(fullName: string): NameParts {
  const name = cleanDisplayName(fullName);
  const comma = name.indexOf(',');
  if (comma !== -1)
    return { lastName: name.slice(0, comma).trim(), firstName: name.slice(comma + 1).trim(), middleName: '' };
  const words = name.split(' ');
  if (words.length < 2) return { lastName: '', firstName: name, middleName: '' };
  return { lastName: words.at(-1)!, firstName: words.slice(0, -1).join(' '), middleName: '' };
}
