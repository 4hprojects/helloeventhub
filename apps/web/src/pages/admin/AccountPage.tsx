import { useState } from 'react';
import { Alert, Button, Card, PageTitle, TextField } from '../../components/ui';
import type { ApiError} from '../../lib/api';
import { api, setCsrfToken } from '../../lib/api';
import { useSession } from '../../lib/session';
import { AdminFrame } from './AdminShell';

export default function AccountPage() {
  const { user, refresh } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  return (
    <AdminFrame>
      <PageTitle>Account</PageTitle>
      {user?.mustChangePassword && (
        <Alert tone="warning" title="Choose your own password" className="mb-4 max-w-md">
          You signed in with a temporary password. Set a new one to continue.
        </Alert>
      )}
      <Card className="max-w-md">
        <h2 className="mb-3 text-lg font-semibold">Change password</h2>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMsg(null);
            try {
              const r = await api<{ csrfToken: string }>('/auth/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
              setCsrfToken(r.csrfToken);
              setCurrent('');
              setNext('');
              setErrors({});
              setMsg({ tone: 'success', text: 'Password changed. Other sessions were signed out.' });
              await refresh();
            } catch (e2) {
              const err = e2 as ApiError;
              setErrors(err.fieldErrors);
              setMsg({ tone: 'error', text: err.message });
            } finally {
              setBusy(false);
            }
          }}
        >
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <TextField label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.currentPassword?.[0]} />
          <TextField label="New password" type="password" autoComplete="new-password" required hint="At least 12 characters." value={next} onChange={(e) => setNext(e.target.value)} error={errors.newPassword?.[0]} />
          <Button type="submit" loading={busy} className="self-start">
            Change password
          </Button>
        </form>
      </Card>
    </AdminFrame>
  );
}
