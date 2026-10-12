export const DEFAULT_TIMEZONE = 'Asia/Manila';

/** Format an ISO instant in the event timezone, e.g. "Sat, Oct 24, 2026, 9:00 AM". */
export function formatInZone(iso: string | Date, timeZone = DEFAULT_TIMEZONE, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-PH', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...opts,
  }).format(d);
}

export function formatDateInZone(iso: string | Date, timeZone = DEFAULT_TIMEZONE): string {
  return formatInZone(iso, timeZone, { hour: undefined, minute: undefined, weekday: 'long', month: 'long' });
}

export function formatTimeInZone(iso: string | Date, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    typeof iso === 'string' ? new Date(iso) : iso,
  );
}

/** Mask an email for staff lists: ju***@example.com */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}
