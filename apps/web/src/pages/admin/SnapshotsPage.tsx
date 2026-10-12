import { useState } from 'react';
import { formatInZone, type SnapshotDto } from '@heh/contracts';
import { Alert, Badge, Button, Card, PageTitle, Spinner, TextArea, TextField } from '../../components/ui';
import { api, newIdempotencyKey, type ApiError } from '../../lib/api';
import { fromZonedInput, toZonedInput } from '../../lib/time';
import { useAsync } from '../../lib/useAsync';
import { AdminOnly, useAdminEvent } from './AdminShell';

export default function SnapshotsPage() {
  return (
    <AdminOnly>
      <Snapshots />
    </AdminOnly>
  );
}

function Snapshots() {
  const { event } = useAdminEvent();
  const tz = event.timezone;
  const { data, loading, error, reload } = useAsync((signal) => api<{ items: SnapshotDto[] }>(`/admin/events/${event.id}/snapshots`, { signal }), [event.id]);
  const defaultCutoff = event.preregSnapshotAt && new Date(event.preregSnapshotAt) < new Date() ? event.preregSnapshotAt : new Date().toISOString();
  const [cutoff, setCutoff] = useState(() => toZonedInput(defaultCutoff, tz));
  const [label, setLabel] = useState('Planning headcount');
  const [amends, setAmends] = useState<SnapshotDto | null>(null);
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const capture = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api<SnapshotDto>(`/admin/events/${event.id}/snapshots`, {
        method: 'POST',
        body: { cutoffAt: fromZonedInput(cutoff, tz), idempotencyKey: key, label, ...(amends ? { amendsSnapshotId: amends.id, amendmentReason: reason } : {}) },
      });
      setKey(newIdempotencyKey());
      setAmends(null);
      setReason('');
      setFieldErrors({});
      setMsg({ tone: 'success', text: 'Snapshot saved. It will not change even if registrations change later.' });
      reload();
    } catch (e) {
      const err = e as ApiError;
      setFieldErrors(err.fieldErrors);
      setMsg({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="A snapshot freezes the headcount at a cutoff time. Snapshots can't be edited or deleted; a correction is saved as a new snapshot that amends the original.">Headcount snapshots</PageTitle>
      {event.preregSnapshotAt && (
        <Alert tone="info">The planning snapshot is captured automatically at {formatInZone(event.preregSnapshotAt, tz)} ({tz}).</Alert>
      )}
      <Card>
        <h2 className="mb-3 text-lg font-semibold">{amends ? 'Amend snapshot' : 'Capture a snapshot now'}</h2>
        {msg && <Alert tone={msg.tone} className="mb-3">{msg.text}</Alert>}
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void capture(); }}>
          {amends && <p className="text-sm">Amending “{amends.label}” captured {formatInZone(amends.capturedAt, tz)}. <Button type="button" size="sm" variant="ghost" onClick={() => setAmends(null)}>Cancel amendment</Button></p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={`Cutoff (${tz})`} type="datetime-local" required value={cutoff} onChange={(e) => setCutoff(e.target.value)} hint="Registrations created after this time are excluded." error={fieldErrors.cutoffAt?.[0]} />
            <TextField label="Label" required value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
          </div>
          {amends && <TextArea label="Reason for amendment" required value={reason} onChange={(e) => setReason(e.target.value)} error={fieldErrors.amendmentReason?.[0]} maxLength={1000} />}
          <Button type="submit" loading={busy} className="self-start">{amends ? 'Save amended snapshot' : 'Capture snapshot'}</Button>
        </form>
      </Card>
      {error && <Alert tone="error">{error.message}</Alert>}
      {loading && !data && <Spinner />}
      {data?.items.map((s) => (
        <Card as="article" key={s.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{s.label}</h2>
            <div className="flex gap-1">
              {s.capturedBy === 'system' && <Badge tone="brand">Automatic</Badge>}
              {s.amendsSnapshotId && <Badge tone="warning">Amendment</Badge>}
            </div>
          </div>
          <p className="text-sm text-ink-muted">
            Cutoff {formatInZone(s.cutoffAt, tz)} · captured {formatInZone(s.capturedAt, tz)} by {s.capturedBy === 'system' ? 'the system' : s.capturedBy.replace(/ <.*>$/, '')}
          </p>
          {s.amendmentReason && <p className="mt-1 text-sm"><strong>Reason:</strong> {s.amendmentReason}</p>}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            {([
              ['Potential', s.totals.potential],
              ['Attending', s.totals.confirmed],
              ['Maybe', s.totals.tentative],
              ['Not attending', s.totals.declined],
              ['Households', s.totals.activeRegistrations],
              ['Adults attending', s.totals.confirmedAdults],
              ['Children attending', s.totals.confirmedChildren],
              ['Unreviewed duplicates', s.unresolvedDuplicateFlags],
            ] as const).map(([k, v]) => (
              <div key={k} className="rounded-[10px] bg-canvas p-2">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="text-lg font-bold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">By branch</summary>
            <ul className="mt-2 text-sm">
              {s.byCategory.map((c) => (
                <li key={c.label}>{c.label}: {c.confirmed} attending, {c.tentative} maybe ({c.potential} potential)</li>
              ))}
            </ul>
          </details>
          {!s.amendsSnapshotId && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => { setAmends(s); setCutoff(toZonedInput(s.cutoffAt, tz)); setLabel(`${s.label} (amended)`); window.scrollTo({ top: 0 }); }}>
              Amend…
            </Button>
          )}
        </Card>
      ))}
      {data?.items.length === 0 && <p className="text-ink-muted">No snapshots yet.</p>}
    </div>
  );
}
