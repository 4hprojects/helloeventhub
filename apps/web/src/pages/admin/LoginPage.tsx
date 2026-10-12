import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, TextField } from '../../components/ui';
import type { ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';

export default function LoginPage() {
  const { user, login } = useSession();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next');
  const safeNext = next && next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';
  if (user) return <Navigate to={safeNext} replace />;
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <img src="/brand/logo-stacked.svg" alt="HelloEventHub" className="mx-auto mb-6 h-24 w-auto" width={150} height={96} />
      <Card>
        <h1 className="mb-4 text-xl font-bold">Committee sign in</h1>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await login(email, password);
            } catch (e2) {
              setErr((e2 as ApiError).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {err && <Alert tone="error">{err}</Alert>}
          <TextField label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" loading={busy}>
            Sign in
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-muted">Forgot your password? Ask your event admin to reset it.</p>
    </main>
  );
}
