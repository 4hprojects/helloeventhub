import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { accessRequestSchema, registrationUpdateSchema, type OwnerRegistrationDto } from '@heh/contracts';
import {
  AttendeesSection,
  BranchSection,
  ContactSection,
  fieldIdFor,
  flattenErrors,
  formFromRegistration,
  formToBody,
  type Errors,
  type FormState,
} from '../../components/RegistrationForm';
import { Alert, Button, Card, ErrorSummary, PageTitle, RsvpBadge, Spinner, TextField, TextArea } from '../../components/ui';
import type { ApiError} from '../../lib/api';
import { api, setCsrfToken } from '../../lib/api';
import { usePublicConfig } from '../../lib/publicData';
import { formatInZone } from '@heh/contracts';

type Phase = { kind: 'loading' } | { kind: 'request' } | { kind: 'ready'; reg: OwnerRegistrationDto } | { kind: 'linkError'; message: string };

export default function ManagePage() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    const open = async (token: string | null) => {
      try {
        if (token) {
          setPhase({ kind: 'loading' });
          const ex = await api<{ csrfToken: string }>('/registrations/manage/exchange', { method: 'POST', body: { token } });
          setCsrfToken(ex.csrfToken);
        }
        const me = await api<{ registration: OwnerRegistrationDto; csrfToken: string }>('/registrations/manage');
        setCsrfToken(me.csrfToken);
        setPhase({ kind: 'ready', reg: me.registration });
      } catch (e) {
        if (token) setPhase({ kind: 'linkError', message: (e as ApiError).message });
        else setPhase({ kind: 'request' });
      }
    };
    /** Read the one-time token from the fragment and remove it from the address bar and history immediately. */
    const consume = () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get('t');
      if (window.location.hash) history.replaceState(history.state, '', window.location.pathname);
      return token;
    };
    if (!started.current) {
      started.current = true;
      void open(consume());
    }
    const onHash = () => {
      const t = consume();
      if (t) void open(t);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (phase.kind === 'loading') return <Spinner label="Opening your registration…" />;
  if (phase.kind === 'request') return <AccessRequest />;
  if (phase.kind === 'linkError')
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="error" title="This link can't be used">
          {phase.message}
        </Alert>
        <AccessRequest />
      </div>
    );
  return <Manage reg={phase.reg} onChange={(reg) => setPhase({ kind: 'ready', reg })} />;
}

function AccessRequest() {
  const { data: config } = usePublicConfig();
  const [email, setEmail] = useState('');
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    const body = { eventSlug: config.primaryEventSlug, email, reference };
    const r = accessRequestSchema.safeParse(body);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ message: string }>('/registrations/access/request', { method: 'POST', body: r.data });
      setDone(res.message);
    } catch (e2) {
      setErr((e2 as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageTitle sub="We'll email you a secure link that works once and expires in 30 minutes.">View or change your registration</PageTitle>
      {done ? (
        <Alert tone="success" title="Check your email">
          {done}
        </Alert>
      ) : (
        <Card>
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            {err && <Alert tone="error">{err}</Alert>}
            <TextField id="acc-email" label="Email you registered with" required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
            <TextField
              id="acc-ref"
              label="Reference number"
              required
              autoComplete="off"
              placeholder="HEH-XXXXXXXX"
              hint="Shown after you registered and in your confirmation email."
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              error={errors.reference}
              className="font-mono uppercase"
            />
            <Button type="submit" loading={busy} className="self-start">
              Email me a link
            </Button>
          </form>
        </Card>
      )}
      <p className="mt-4 text-sm text-ink-muted">
        Registered with a mobile number or Messenger only? <Link to="/contact">Contact the organizers</Link> — they'll verify it's you and make the change.
      </p>
    </div>
  );
}

function Manage({ reg, onChange }: { reg: OwnerRegistrationDto; onChange: (r: OwnerRegistrationDto) => void }) {
  const [editing, setEditing] = useState(false);
  const [state, setStateRaw] = useState<FormState>(() => formFromRegistration(reg));
  const [errors, setErrors] = useState<Errors>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const setState = (u: (s: FormState) => FormState) => setStateRaw(u);
  const tz = reg.event.timezone;

  const save = async () => {
    const body = { revision: reg.revision, ...formToBody(state) };
    const r = registrationUpdateSchema.safeParse(body);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ registration: OwnerRegistrationDto }>(`/registrations/${reg.id}`, { method: 'PATCH', body: r.data });
      onChange(res.registration);
      setStateRaw(formFromRegistration(res.registration));
      setEditing(false);
      setErrors({});
      setMsg({ tone: 'success', text: 'Your changes were saved.' });
    } catch (e) {
      const err = e as ApiError;
      if (err.fieldErrors && Object.keys(err.fieldErrors).length) setErrors(flattenErrors(err.fieldErrors));
      setMsg({ tone: 'error', text: err.status === 401 ? 'Your secure session expired. Request a new link to continue.' : err.message });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const res = await api<{ registration: OwnerRegistrationDto }>(`/registrations/${reg.id}/cancel`, { method: 'POST', body: { revision: reg.revision, reason: cancelReason || undefined } });
      onChange(res.registration);
      setConfirmCancel(false);
      setMsg({ tone: 'success', text: 'Your registration was cancelled.' });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  };

  const errorList = Object.entries(errors).map(([p, m]) => ({ id: fieldIdFor(p, state), message: m }));

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub={reg.event.title}>Your registration</PageTitle>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {reg.status === 'cancelled' && <Alert tone="warning" title="Cancelled">This registration has been cancelled. Contact the organizers if this was a mistake.</Alert>}
      <Card>
        <p className="text-sm text-ink-muted">Reference</p>
        <p className="font-mono text-2xl font-bold text-brand-deep">{reg.reference}</p>
        {reg.canEdit && reg.editDeadline && <p className="mt-1 text-sm text-ink-muted">You can make changes online until {formatInZone(reg.editDeadline, tz)}.</p>}
        {!reg.canEdit && reg.status === 'active' && <p className="mt-1 text-sm text-ink-muted">Online changes are closed. Contact the organizers for changes.</p>}
      </Card>

      {!editing ? (
        <Card>
          <h2 className="text-lg font-semibold">{reg.representativeName}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {reg.attendees.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <span>
                  {a.fullName} <span className="text-sm text-ink-muted">({a.ageCategory === 'child' ? 'Child' : 'Adult'})</span>
                </span>
                <RsvpBadge rsvp={a.rsvp} />
              </li>
            ))}
            {reg.attendees.length === 0 && <li className="text-ink-muted">No attendees{reg.noAttendeesReason ? ` — ${reg.noAttendeesReason}` : ''}</li>}
          </ul>
          {reg.canEdit && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => setEditing(true)}>Change attendees</Button>
              <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
                Cancel registration
              </Button>
            </div>
          )}
          {confirmCancel && (
            <div className="mt-4 rounded-[10px] border border-danger/40 bg-danger-bg p-4">
              <p className="font-semibold">Cancel this registration?</p>
              <p className="text-sm">Everyone on it will be removed from the headcount.</p>
              <div className="mt-3">
                <TextArea label="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} />
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button variant="danger" loading={busy} onClick={cancel}>
                  Yes, cancel it
                </Button>
                <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
                  Keep my registration
                </Button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-4">
          <ErrorSummary errors={errorList} />
          <Card>
            <h2 className="mb-3 text-lg font-semibold">Your details</h2>
            <ContactSection state={state} setState={setState} errors={errors} lockContacts />
          </Card>
          <Card>
            <BranchSection state={state} setState={setState} errors={errors} categories={reg.event.categories} />
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-semibold">Who is coming</h2>
            <AttendeesSection state={state} setState={setState} errors={errors} />
          </Card>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={busy}>
              Save changes
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setEditing(false); setStateRaw(formFromRegistration(reg)); setErrors({}); }}>
              Discard
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
