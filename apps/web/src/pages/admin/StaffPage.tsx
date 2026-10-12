import { Copy } from 'lucide-react';
import { useState } from 'react';
import { formatInZone, type StaffMemberDto } from '@heh/contracts';
import { Alert, Badge, Button, Card, PageTitle, SelectField, Spinner, TextField } from '../../components/ui';
import { api, type ApiError } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { AdminOnly, useAdminEvent } from './AdminShell';

const ROLE_LABEL = { event_admin: 'Event admin', committee: 'Committee' } as const;

export default function StaffPage() {
  return (
    <AdminOnly>
      <Staff />
    </AdminOnly>
  );
}

function OneTimePassword({ who, password, onDone }: { who: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert tone="warning" title={`Temporary password for ${who} — shown only once`}>
      <p className="mt-1">Give it to them in person or by phone. They must choose their own password when they first sign in at <strong>/admin</strong>.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="rounded bg-white px-2 py-1 font-mono text-base">{password}</code>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard?.writeText(password).catch(() => undefined);
            setCopied(true);
          }}
        >
          <Copy className="size-4" aria-hidden /> {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </Alert>
  );
}

function Staff() {
  const { event } = useAdminEvent();
  const base = `/admin/events/${event.id}/staff`;
  const { data, loading, error, reload } = useAsync((signal) => api<{ items: StaffMemberDto[] }>(base, { signal }), [base]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'committee' | 'event_admin'>('committee');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: 'remove' | 'reset' } | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'success', text: ok });
      reload();
    } catch (e) {
      setMsg({ tone: 'error', text: (e as ApiError).message });
    } finally {
      setConfirm(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="Give committee members and event admins their own sign-in. Committee can search, add and edit registrations; event admins can also export, take snapshots, change settings and manage staff.">
        Staff access
      </PageTitle>
      {secret && <OneTimePassword who={secret.who} password={secret.password} onDone={() => setSecret(null)} />}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Add a person</h2>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMsg(null);
            try {
              const r = await api<{ email: string; tempPassword: string | null }>(base, { method: 'POST', body: { email, name, role } });
              if (r.tempPassword) setSecret({ who: name || r.email, password: r.tempPassword });
              else setMsg({ tone: 'success', text: `${r.email} already had an account; they can now access this event with their existing password.` });
              setEmail('');
              setName('');
              setFieldErrors({});
              reload();
            } catch (e2) {
              const err = e2 as ApiError;
              setFieldErrors(err.fieldErrors);
              setMsg({ tone: 'error', text: err.message });
            } finally {
              setBusy(false);
            }
          }}
        >
          <TextField label="Full name" required value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors.name?.[0]} maxLength={120} />
          <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email?.[0]} />
          <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="committee">Committee</option>
            <option value="event_admin">Event admin</option>
          </SelectField>
          <Button type="submit" loading={busy}>
            Add
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">People with access</h2>
        {loading && !data && <Spinner />}
        {error && <Alert tone="error">{error.message}</Alert>}
        <ul className="divide-y divide-line">
          {data?.items.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">
                  {s.name} {s.isYou && <span className="font-normal text-ink-muted">(you)</span>}
                </p>
                <p className="break-all text-sm text-ink-muted">{s.email}</p>
                <p className="mt-1 flex flex-wrap gap-1 text-xs">
                  <Badge tone={s.role === 'event_admin' ? 'brand' : 'neutral'}>{ROLE_LABEL[s.role]}</Badge>
                  {s.scope === 'organization' && <Badge>All events</Badge>}
                  {s.mustChangePassword && <Badge tone="warning">Temporary password</Badge>}
                  <span className="text-ink-muted">{s.lastLoginAt ? `Last sign-in ${formatInZone(s.lastLoginAt, event.timezone)}` : 'Never signed in'}</span>
                </p>
              </div>
              {s.scope === 'event' && !s.isYou && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`role-${s.id}`}>
                    Role for {s.name}
                  </label>
                  <select
                    id={`role-${s.id}`}
                    className="min-h-10 rounded-[10px] border border-[#A9BCCB] bg-white px-2 text-sm"
                    value={s.role}
                    onChange={(e) => run(() => api(`${base}/${s.id}`, { method: 'PATCH', body: { role: e.target.value } }), `${s.name} is now ${ROLE_LABEL[e.target.value as keyof typeof ROLE_LABEL]}.`)}
                  >
                    <option value="committee">Committee</option>
                    <option value="event_admin">Event admin</option>
                  </select>
                  {confirm?.id === s.id ? (
                    <span className="flex flex-wrap items-center gap-2 rounded-[10px] bg-danger-bg p-1.5 text-sm">
                      <span className="font-medium text-danger">{confirm.action === 'remove' ? 'Remove access?' : 'Reset password?'}</span>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          confirm.action === 'remove'
                            ? run(() => api(`${base}/${s.id}/remove`, { method: 'POST' }), `${s.name} no longer has access.`)
                            : api<{ tempPassword: string }>(`${base}/${s.id}/reset-password`, { method: 'POST' })
                                .then((r) => {
                                  setSecret({ who: s.name, password: r.tempPassword });
                                  setConfirm(null);
                                  reload();
                                })
                                .catch((e2: ApiError) => {
                                  setMsg({ tone: 'error', text: e2.message });
                                  setConfirm(null);
                                })
                        }
                      >
                        Yes
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setConfirm({ id: s.id, action: 'reset' })}>
                        Reset password
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setConfirm({ id: s.id, action: 'remove' })}>
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
