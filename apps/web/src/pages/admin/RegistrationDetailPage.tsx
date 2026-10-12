import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatInZone, formatPhMobile, registrationUpdateSchema, type AdminRegistrationDto } from '@heh/contracts';
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
import { Alert, Badge, Button, Card, Checkbox, ErrorSummary, RsvpBadge, Spinner, TextArea } from '../../components/ui';
import type { ApiError } from '../../lib/api';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useAdminEvent } from './AdminShell';

interface HistoryItem {
  action: string;
  actorType: string;
  actorId: string | null;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export default function RegistrationDetailPage() {
  const { event, isAdmin } = useAdminEvent();
  const { registrationId } = useParams();
  const base = `/admin/events/${event.id}/registrations/${registrationId}`;
  const { data, loading, error, setData } = useAsync((signal) => api<{ registration: AdminRegistrationDto }>(base, { signal }), [base]);
  const history = useAsync((signal) => api<{ items: HistoryItem[] }>(`${base}/history`, { signal }), [base, data?.registration.revision]);
  const [editing, setEditing] = useState(false);
  const [state, setStateRaw] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notify, setNotify] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  if (loading && !data) return <Spinner />;
  if (error || !data) return <Alert tone="error">{error?.message ?? 'Not found'}</Alert>;
  const reg = data.registration;
  const catLabel = (id: string | null) => event.categories.find((c) => c.id === id)?.label ?? 'Not specified';
  const setState = (u: (s: FormState) => FormState) => setStateRaw((s) => (s ? u(s) : s));

  const startEdit = () => {
    setStateRaw(formFromRegistration(reg));
    setEditing(true);
    setMsg(null);
  };

  const save = async () => {
    if (!state) return;
    const parsed = registrationUpdateSchema.safeParse({ revision: reg.revision, ...formToBody(state) });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ registration: AdminRegistrationDto }>(base, { method: 'PATCH', body: parsed.data, query: { notify: notify ? undefined : 'false' } });
      setData(res);
      setEditing(false);
      setErrors({});
      setMsg({ tone: 'success', text: 'Saved.' });
    } catch (e) {
      const err = e as ApiError;
      if (Object.keys(err.fieldErrors).length) setErrors(flattenErrors(err.fieldErrors));
      setMsg({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const res = await api<{ registration: AdminRegistrationDto }>(`${base}/cancel`, { method: 'POST', body: { revision: reg.revision, reason: cancelReason || undefined }, query: { notify: notify ? undefined : 'false' } });
      setData(res);
      setCancelOpen(false);
      setMsg({ tone: 'success', text: 'Registration cancelled.' });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      await api(`/admin/events/${event.id}/registrations/${reg.id}/email/resend`, { method: 'POST' });
      setMsg({ tone: 'success', text: 'Confirmation email queued.' });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  };

  const c = reg.contacts;
  return (
    <div className="flex flex-col gap-4">
      <p>
        <Link to={`/admin/events/${event.id}/registrations`}>← All registrations</Link>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{reg.representativeName}</h1>
        <span className="font-mono text-ink-muted">{reg.reference}</span>
        {reg.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Active</Badge>}
        {reg.lateRegistration && <Badge tone="warning">Late</Badge>}
        {reg.botCheck === 'unverified' && <Badge tone="warning">Bot check unavailable</Badge>}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {!editing ? (
        <>
          <Card>
            <h2 className="mb-2 text-lg font-semibold">Contact</h2>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
              {c.email && (<><dt className="text-ink-muted">Email</dt><dd className="break-all">{c.email}{reg.emailVerifiedAt && <Badge tone="success">verified</Badge>}</dd></>)}
              {c.mobile && (<><dt className="text-ink-muted">Mobile</dt><dd><a href={`tel:${c.mobile}`}>{formatPhMobile(c.mobile)}</a></dd></>)}
              {c.messengerDisplayName && (<><dt className="text-ink-muted">Messenger</dt><dd>{c.messengerDisplayName}</dd></>)}
              {c.messengerProfileUrl && (<><dt className="text-ink-muted">Profile</dt><dd className="break-all"><a href={c.messengerProfileUrl} target="_blank" rel="noopener noreferrer nofollow">{c.messengerProfileUrl}</a></dd></>)}
              <dt className="text-ink-muted">Preferred</dt><dd>{c.preferred}</dd>
              <dt className="text-ink-muted">Branch</dt><dd>{catLabel(reg.eventCategoryId)}</dd>
              <dt className="text-ink-muted">Source</dt><dd>{reg.source}</dd>
              <dt className="text-ink-muted">Created</dt><dd>{formatInZone(reg.createdAt, event.timezone)}</dd>
              {reg.notes && (<><dt className="text-ink-muted">Notes</dt><dd className="whitespace-pre-line">{reg.notes}</dd></>)}
              {reg.cancellationReason && (<><dt className="text-ink-muted">Cancel reason</dt><dd>{reg.cancellationReason}</dd></>)}
            </dl>
            <p className="mt-2 text-xs text-ink-muted">Messenger details are self-reported and not verified.</p>
          </Card>
          <Card>
            <h2 className="mb-2 text-lg font-semibold">People ({reg.attendees.length})</h2>
            <ul className="divide-y divide-line">
              {reg.attendees.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {a.fullName} <span className="text-sm text-ink-muted">· {a.ageCategory === 'child' ? 'Child' : 'Adult'}{a.categoryId ? ` · ${catLabel(a.categoryId)}` : ''}</span>
                  </span>
                  <span className="flex gap-1">
                    <RsvpBadge rsvp={a.rsvp} />
                    {a.checkedInAt && <Badge tone="brand">Checked in</Badge>}
                  </span>
                </li>
              ))}
              {reg.attendees.length === 0 && <li className="py-2 text-ink-muted">No attendees{reg.noAttendeesReason ? ` — ${reg.noAttendeesReason}` : ''}</li>}
            </ul>
          </Card>
          {reg.status === 'active' && (
            <div className="flex flex-wrap gap-3">
              <Button onClick={startEdit}>Edit</Button>
              {isAdmin && c.email && (
                <Button variant="secondary" onClick={resend} loading={busy}>
                  Resend confirmation
                </Button>
              )}
              <Button variant="secondary" onClick={() => setCancelOpen(true)}>
                Cancel registration
              </Button>
            </div>
          )}
          {cancelOpen && (
            <Card className="border-danger/40 bg-danger-bg">
              <p className="font-semibold">Cancel this registration? All its people leave the headcount.</p>
              <div className="mt-3 flex flex-col gap-3">
                <TextArea label="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} />
                <Checkbox label="Email the registrant about this change (if they gave an email)" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                <div className="flex flex-wrap gap-3">
                  <Button variant="danger" onClick={cancel} loading={busy}>Cancel registration</Button>
                  <Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep</Button>
                </div>
              </div>
            </Card>
          )}
        </>
      ) : (
        state && (
          <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <ErrorSummary errors={Object.entries(errors).map(([p, m]) => ({ id: fieldIdFor(p, state), message: m }))} />
            <Card>
              <ContactSection state={state} setState={setState} errors={errors} />
              <p className="mt-2 text-sm text-warning">Verify the person's identity before changing contact details.</p>
            </Card>
            <Card><BranchSection state={state} setState={setState} errors={errors} categories={event.categories.filter((x) => x.active)} /></Card>
            <Card><AttendeesSection state={state} setState={setState} errors={errors} perAttendeeCategories={event.categories.filter((x) => x.active)} /></Card>
            <Card><TextArea id="notes" label="Internal notes" value={state.notes} onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))} maxLength={1000} /></Card>
            <Checkbox label="Email the registrant a summary of the change (if they gave an email)" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={busy}>Save</Button>
              <Button type="button" variant="secondary" onClick={() => { setEditing(false); setErrors({}); }}>Discard</Button>
            </div>
          </form>
        )
      )}

      <Card>
        <h2 className="mb-2 text-lg font-semibold">History</h2>
        {history.data?.items.length ? (
          <ol className="flex flex-col gap-1 text-sm">
            {history.data.items.map((h, i) => (
              <li key={i}>
                <span className="text-ink-muted">{formatInZone(h.timestamp, event.timezone)}</span> — {h.action.replace('registration.', '').replace('_', ' ')} by {h.actorType}
                {typeof h.metadata.added === 'number' && ` (+${h.metadata.added} / ~${h.metadata.updated} / −${h.metadata.removed} people${h.metadata.contactsChanged ? ', contacts changed' : ''})`}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted">No history.</p>
        )}
      </Card>
    </div>
  );
}
