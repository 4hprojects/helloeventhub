import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatInZone, type EmailJobDto } from '@heh/contracts';
import { Alert, Badge, Button, Card, PageTitle, SelectField, Spinner } from '../../components/ui';
import { api, type ApiError } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { AdminOnly, useAdminEvent } from './AdminShell';

const TYPE: Record<string, string> = {
  registration_confirmation: 'Confirmation',
  registration_updated: 'Update',
  registration_cancelled: 'Cancellation',
  access_link: 'Manage link',
};
const TONE = { sent: 'success', failed: 'danger', queued: 'warning', sending: 'brand', suppressed: 'neutral' } as const;

export default function EmailsPage() {
  return (
    <AdminOnly>
      <Emails />
    </AdminOnly>
  );
}

interface Ops {
  version: string;
  uptimeSeconds: number;
  db: string;
  email: { configured: boolean; workerRunning: boolean; workerLastTickAt: string | null; workerLastError: string | null; queued: number; failed: number; stuck: number; oldestQueuedMinutes: number | null };
  scheduler: { lastRunAt: string | null; lastError: string | null };
}

function OpsCard({ eventId, tz }: { eventId: string; tz: string }) {
  const { data } = useAsync((signal) => api<Ops>(`/admin/events/${eventId}/ops`, { signal }), [eventId]);
  if (!data) return null;
  const e = data.email;
  const problems = [
    !e.configured && 'Email sending is not configured (RESEND_API_KEY missing) — emails stay queued.',
    e.configured && !e.workerRunning && 'The email worker is not running in this server process.',
    e.workerLastError && `Email worker error: ${e.workerLastError}`,
    e.oldestQueuedMinutes !== null && e.oldestQueuedMinutes > 30 && `Oldest queued email has waited ${e.oldestQueuedMinutes} minutes.`,
    e.stuck > 0 && `${e.stuck} email(s) stuck in sending.`,
    data.db !== 'connected' && `Database: ${data.db}`,
    data.scheduler.lastError && `Scheduler error: ${data.scheduler.lastError}`,
  ].filter(Boolean) as string[];
  return (
    <Card>
      <h2 className="mb-2 text-lg font-semibold">System status</h2>
      {problems.length ? (
        <Alert tone="warning" title="Needs attention">
          <ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </Alert>
      ) : (
        <Alert tone="success">Email delivery and scheduled jobs are running normally.</Alert>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div><dt className="text-ink-muted">Waiting to send</dt><dd className="font-semibold tabular-nums">{e.queued}</dd></div>
        <div><dt className="text-ink-muted">Failed</dt><dd className="font-semibold tabular-nums">{e.failed}</dd></div>
        <div><dt className="text-ink-muted">Worker last ran</dt><dd className="font-semibold">{e.workerLastTickAt ? formatInZone(e.workerLastTickAt, tz, { weekday: undefined, year: undefined }) : '—'}</dd></div>
        <div><dt className="text-ink-muted">Version</dt><dd className="font-semibold">{data.version}</dd></div>
      </dl>
    </Card>
  );
}

function Emails() {
  const { event } = useAdminEvent();
  const [status, setStatus] = useState('failed');
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { data, loading, error, reload } = useAsync(
    (signal) => api<{ items: EmailJobDto[]; total: number }>(`/admin/events/${event.id}/email-jobs`, { query: { status, limit: 100 }, signal }),
    [event.id, status],
  );
  const retry = async (id: string) => {
    try {
      await api(`/admin/events/${event.id}/email-jobs/${id}/retry`, { method: 'POST' });
      setMsg({ tone: 'success', text: 'Queued for another attempt.' });
      reload();
    } catch (e) {
      setMsg({ tone: 'error', text: (e as ApiError).message });
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="Registrations are saved even when an email fails. Contact people with failed emails another way.">Email delivery</PageTitle>
      <div className="max-w-xs">
        <SelectField label="Show" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="failed">Failed</option>
          <option value="queued">Waiting to send / retrying</option>
          <option value="sent">Sent</option>
          <option value="suppressed">Not sent (suppressed)</option>
          <option value="all">All</option>
        </SelectField>
      </div>
      <OpsCard eventId={event.id} tz={event.timezone} />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {error && <Alert tone="error">{error.message}</Alert>}
      {loading && !data && <Spinner />}
      {data && (
        <Card>
          <p className="mb-2 text-sm text-ink-muted">{data.total} email{data.total === 1 ? '' : 's'}</p>
          <ul className="divide-y divide-line">
            {data.items.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm">
                    <Badge tone={TONE[j.status]}>{j.status}</Badge> {TYPE[j.type] ?? j.type} to {j.recipientMasked}
                    {j.reference && j.registrationId && (
                      <> · <Link to={`/admin/events/${event.id}/registrations/${j.registrationId}`} className="font-mono">{j.reference}</Link></>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatInZone(j.updatedAt, event.timezone)} · {j.attempts} attempt{j.attempts === 1 ? '' : 's'}
                    {j.lastErrorCode && ` · ${j.lastErrorCode}`}
                  </p>
                </div>
                {j.status === 'failed' && j.type !== 'access_link' && (
                  <Button size="sm" variant="secondary" onClick={() => retry(j.id)}>Retry</Button>
                )}
              </li>
            ))}
            {data.items.length === 0 && <li className="py-2 text-ink-muted">Nothing here.</li>}
          </ul>
        </Card>
      )}
    </div>
  );
}
