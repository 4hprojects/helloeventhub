import { CheckCircle2, Plus, Printer } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { RegistrationCreatedResponse } from '@heh/contracts';
import { Alert, Button, Card } from '../../components/ui';
import { LAST_REG_KEY } from './RegisterPage';

// `hasEmail` came from older pages that guessed from the form; the server's flag is authoritative.
type Saved = RegistrationCreatedResponse & { hasEmail?: boolean; eventSlug: string; eventTitle: string };

function load(stateFromRouter: unknown): Saved | null {
  if (stateFromRouter && typeof stateFromRouter === 'object' && 'reference' in stateFromRouter) return stateFromRouter as Saved;
  try {
    const raw = sessionStorage.getItem(LAST_REG_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export default function SuccessPage() {
  const location = useLocation();
  const saved = load(location.state);
  if (!saved) {
    return (
      <Alert tone="info" title="No recent registration on this page">
        If you already registered, check your email or <Link to="/registration/manage">request a link to manage it</Link>. You can also{' '}
        <Link to="/contact">contact the organizers</Link>.
      </Alert>
    );
  }
  const s = saved.countSummary;
  const emailSent = saved.confirmationEmailQueued ?? saved.hasEmail ?? false;
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <img src="/brand/registration-success.svg" alt="" className="mx-auto h-24 w-auto" width={96} height={96} />
        <p className="mt-3 inline-flex items-center gap-1.5 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-success">
          <CheckCircle2 className="size-4" aria-hidden /> You're in
        </p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">You're registered!</h1>
        <p className="mt-1 text-ink-muted">{saved.eventTitle}</p>
      </div>
      <Card>
        <p className="text-sm font-semibold text-ink-muted">Your reference number</p>
        <p className="mt-1 select-all font-mono text-3xl font-bold tracking-wider text-brand-deep" data-testid="reference">
          {saved.reference}
        </p>
        <p className="mt-2 text-sm text-ink-muted">Take a screenshot or print this page. Show it to the committee if they ask.</p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-[10px] bg-success-bg p-3">
            <dt className="text-xs font-semibold text-success">Attending</dt>
            <dd className="text-2xl font-bold tabular-nums">{s.confirmed}</dd>
          </div>
          <div className="rounded-[10px] bg-warning-bg p-3">
            <dt className="text-xs font-semibold text-warning">Maybe</dt>
            <dd className="text-2xl font-bold tabular-nums">{s.tentative}</dd>
          </div>
          <div className="rounded-[10px] bg-neutral-bg p-3">
            <dt className="text-xs font-semibold text-ink-muted">Not attending</dt>
            <dd className="text-2xl font-bold tabular-nums">{s.declined}</dd>
          </div>
        </dl>
        {saved.lateRegistration && (
          <Alert tone="warning" className="mt-4">
            This registration arrived after the planning headcount, so it is marked as late. The organizers will still see it.
          </Alert>
        )}
      </Card>
      {emailSent ? (
        <Alert tone="info" title="Check your email">
          We're sending a confirmation to the email address you gave. It may take a few minutes — check your spam folder too.
        </Alert>
      ) : (
        <Alert tone="info" title="No email confirmation">
          We won't email you, so keep this reference.
        </Alert>
      )}
      <p className="text-sm">
        <strong>Need to change something?</strong>{' '}
        {emailSent ? (
          <>
            <Link to="/registration/manage">Get a link to manage your registration</Link>, or{' '}
            <Link to="/contact">contact the organizers</Link>.
          </>
        ) : (
          <>
            <Link to="/contact">Contact the organizers</Link> and give them your reference.
          </>
        )}
      </p>
      <Alert tone="info" title="Your reference is not a password">
        It identifies your registration for the committee. To view or change your details online, we email you a secure one-time link.
      </Alert>
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          to={`/events/${saved.eventSlug}/register`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-brand-strong px-5 font-semibold text-white no-underline hover:bg-brand-deep"
        >
          <Plus className="size-4" aria-hidden /> Register another household
        </Link>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden /> Print
        </Button>
        <Link
          to={`/events/${saved.eventSlug}`}
          className="inline-flex min-h-12 items-center justify-center rounded-[10px] border border-line bg-white px-5 font-semibold text-brand-deep no-underline hover:bg-brand-ice"
        >
          Back to event page
        </Link>
      </div>
    </div>
  );
}
