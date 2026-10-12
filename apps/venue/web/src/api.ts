export class VenueApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export async function vapi<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Venue-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new VenueApiError(0, 'network');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new VenueApiError(res.status, (json as { error?: string }).error ?? 'error');
  return json as T;
}

export const opId = () =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

export interface Attendee {
  attendeeId: string;
  registrationId: string;
  reference: string;
  fullName: string;
  representativeName: string;
  ageCategory: 'adult' | 'child';
  branch: string;
  rsvp: 'confirmed' | 'tentative' | 'declined';
  active: boolean;
  walkIn: boolean;
  checkedIn: null | { at: string; station: string | null; source: 'local' | 'cloud' };
}

export interface Status {
  stats: { expected: number; checkedIn: number; checkedInPreregistered: number; walkins: number; pendingSync: number; needsReview: number; rosterSize: number };
  sync: { configured: boolean; cloudReachable: boolean | null; lastPullAt: string | null; lastPushAt: string | null; rosterVerifiedAt: string | null; lastError: string | null; syncing: boolean };
  branches: string[];
}

export type CheckinOutcome =
  | { status: 'checked_in'; at: string; attendee: Attendee }
  | { status: 'already_checked_in'; firstAt: string; station: string | null; attendee: Attendee }
  | { status: 'not_active'; attendee: Attendee }
  | { status: 'not_found' };
