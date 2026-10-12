import { useState } from 'react';
import { formatInZone } from '@heh/contracts';
import { Alert, Badge, Button, Card, PageTitle, Spinner, TextField } from '../../components/ui';
import { api, type ApiError } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { AdminOnly, useAdminEvent } from './AdminShell';

interface Device {
  id: string;
  label: string;
  status: 'active' | 'revoked';
  createdAt: string;
  lastSeenAt: string | null;
}

export default function VenuePage() {
  return (
    <AdminOnly>
      <Venue />
    </AdminOnly>
  );
}

function Venue() {
  const { event } = useAdminEvent();
  const { data, loading, error, reload } = useAsync((signal) => api<{ items: Device[] }>(`/admin/events/${event.id}/venue-devices`, { signal }), [event.id]);
  const [label, setLabel] = useState('Main venue laptop');
  const [issued, setIssued] = useState<{ token: string; eventId: string; label: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const origin = window.location.origin;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="The venue server runs on a committee laptop and keeps check-in working on the local Wi-Fi when there is no internet. It syncs with this site whenever internet is available.">
        Venue check-in
      </PageTitle>
      {msg && <Alert tone="error">{msg}</Alert>}
      {issued && (
        <Alert tone="warning" title={`Device token for “${issued.label}” — copy it now, it won't be shown again`}>
          <p className="mt-1">Put these lines in the venue laptop's <code>apps/venue/.env</code> file:</p>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-xs">{`CLOUD_BASE_URL=${origin}\nCLOUD_EVENT_ID=${issued.eventId}\nCLOUD_DEVICE_TOKEN=${issued.token}`}</pre>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => setIssued(null)}>I've saved it</Button>
        </Alert>
      )}
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Connect a venue server</h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMsg(null);
            try {
              const r = await api<{ token: string; eventId: string; label: string }>(`/admin/events/${event.id}/venue-devices`, { method: 'POST', body: { label } });
              setIssued(r);
              reload();
            } catch (e2) {
              setMsg((e2 as ApiError).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="min-w-0 flex-1 basis-60">
            <TextField label="Device name" required value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
          </div>
          <Button type="submit" loading={busy}>Create device token</Button>
        </form>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Devices</h2>
        {loading && !data && <Spinner />}
        {error && <Alert tone="error">{error.message}</Alert>}
        <ul className="divide-y divide-line">
          {data?.items.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {d.label} {d.status === 'revoked' ? <Badge tone="danger">Revoked</Badge> : <Badge tone="success">Active</Badge>}
                <span className="block text-sm text-ink-muted">
                  Created {formatInZone(d.createdAt, event.timezone)} · {d.lastSeenAt ? `last synced ${formatInZone(d.lastSeenAt, event.timezone)}` : 'never synced'}
                </span>
              </span>
              {d.status === 'active' &&
                (confirmRevoke === d.id ? (
                  <span className="flex flex-wrap items-center gap-2 rounded-[10px] bg-danger-bg p-2 text-sm">
                    <span className="font-medium text-danger">It will stop syncing immediately.</span>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        await api(`/admin/events/${event.id}/venue-devices/${d.id}/revoke`, { method: 'POST' }).catch((e2: ApiError) => setMsg(e2.message));
                        setConfirmRevoke(null);
                        reload();
                      }}
                    >
                      Revoke {d.label}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmRevoke(null)}>
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setConfirmRevoke(d.id)}>
                    Revoke
                  </Button>
                ))}
            </li>
          ))}
          {data?.items.length === 0 && <li className="py-2 text-ink-muted">No venue devices yet.</li>}
        </ul>
      </Card>
      <Alert tone="info" title="Before the event">
        Follow the venue checklist in <code>docs/VENUE_RUNBOOK.md</code>: pull the roster while online, confirm “Roster verified”, print the fallback list, and rehearse with the internet unplugged.
      </Alert>
    </div>
  );
}
