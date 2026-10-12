import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatInZone, type DuplicateFlagDto } from '@heh/contracts';
import { Alert, Badge, Button, Card, PageTitle, RsvpBadge, SelectField, Spinner, TextField } from '../../components/ui';
import { api, type ApiError } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { AdminOnly, useAdminEvent } from './AdminShell';

type Flag = DuplicateFlagDto & { registrations: Array<{ id: string; reference: string; representativeName: string; status: string }> };
const REASON: Record<string, string> = {
  same_attendee_name: 'Same attendee name in different registrations',
  same_contact_email: 'Same email on different registrations',
  same_contact_mobile: 'Same mobile number on different registrations',
};

export default function DuplicatesPage() {
  return (
    <AdminOnly>
      <Duplicates />
    </AdminOnly>
  );
}

function Duplicates() {
  const { event } = useAdminEvent();
  const [status, setStatus] = useState('open');
  const { data, loading, error, reload } = useAsync((signal) => api<{ items: Flag[] }>(`/admin/events/${event.id}/duplicate-flags`, { query: { status }, signal }), [event.id, status]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="Possible duplicates are never merged automatically. Check with the families, then edit or cancel the extra registration if needed.">Duplicate review</PageTitle>
      <div className="max-w-xs">
        <SelectField label="Show" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Needs review</option>
          <option value="not_duplicate">Marked not duplicate</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </SelectField>
      </div>
      {error && <Alert tone="error">{error.message}</Alert>}
      {loading && !data && <Spinner />}
      {data?.items.length === 0 && <Alert tone="success">Nothing to review.</Alert>}
      {data?.items.map((f) => <FlagCard key={f.id} flag={f} eventId={event.id} tz={event.timezone} onDone={reload} />)}
    </div>
  );
}

function FlagCard({ flag, eventId, tz, onDone }: { flag: Flag; eventId: string; tz: string; onDone: () => void }) {
  const [resolution, setResolution] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (status: 'not_duplicate' | 'resolved') => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/events/${eventId}/duplicate-flags/${flag.id}`, { method: 'PATCH', body: { status, resolution } });
      onDone();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card as="article">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{REASON[flag.reason] ?? flag.reason}</h2>
        <Badge tone={flag.status === 'open' ? 'warning' : 'neutral'}>{flag.status.replace('_', ' ')}</Badge>
      </div>
      <p className="text-sm text-ink-muted">Flagged {formatInZone(flag.createdAt, tz)}</p>
      <ul className="mt-3 divide-y divide-line">
        {flag.attendees.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              {a.fullName} — <Link to={`/admin/events/${eventId}/registrations/${a.registrationId}`}>{a.representativeName}</Link> <span className="font-mono text-xs text-ink-muted">{a.reference}</span>
            </span>
            <RsvpBadge rsvp={a.rsvp} />
          </li>
        ))}
        {flag.attendees.length === 0 &&
          flag.registrations.map((r) => (
            <li key={r.id} className="py-2">
              <Link to={`/admin/events/${eventId}/registrations/${r.id}`}>{r.representativeName}</Link> <span className="font-mono text-xs text-ink-muted">{r.reference}</span> {r.status === 'cancelled' && <Badge tone="danger">Cancelled</Badge>}
            </li>
          ))}
      </ul>
      {flag.status === 'open' ? (
        <div className="mt-3 flex flex-col gap-3">
          {err && <Alert tone="error">{err}</Alert>}
          <TextField label="What did you find?" required value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="e.g. Two different cousins with the same name" maxLength={1000} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={resolution.trim().length < 3} loading={busy} onClick={() => act('not_duplicate')}>Not a duplicate</Button>
            <Button size="sm" disabled={resolution.trim().length < 3} loading={busy} onClick={() => act('resolved')}>Duplicate handled</Button>
          </div>
        </div>
      ) : (
        flag.resolution && <p className="mt-3 text-sm"><strong>Resolution:</strong> {flag.resolution}</p>
      )}
    </Card>
  );
}
