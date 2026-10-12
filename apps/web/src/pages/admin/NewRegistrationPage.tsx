import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminRegistrationCreateSchema, type AdminRegistrationDto } from '@heh/contracts';
import { AttendeesSection, BranchSection, ContactSection, emptyForm, fieldIdFor, flattenErrors, formToBody, type Errors, type FormState } from '../../components/RegistrationForm';
import { Alert, Button, Card, Checkbox, ErrorSummary, PageTitle, TextArea } from '../../components/ui';
import type { ApiError } from '../../lib/api';
import { api } from '../../lib/api';
import { useAdminEvent } from './AdminShell';

export default function NewRegistrationPage() {
  const { event } = useAdminEvent();
  const navigate = useNavigate();
  const [state, setStateRaw] = useState<FormState>(emptyForm);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setState = (u: (s: FormState) => FormState) => setStateRaw(u);
  const active = event.categories.filter((c) => c.active);

  const submit = async () => {
    const parsed = adminRegistrationCreateSchema.safeParse({ ...formToBody(state), consentExplained: consent });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ registration: AdminRegistrationDto }>(`/admin/events/${event.id}/registrations`, { method: 'POST', body: parsed.data });
      navigate(`/admin/events/${event.id}/registrations/${res.registration.id}`);
    } catch (e) {
      const e2 = e as ApiError;
      if (Object.keys(e2.fieldErrors).length) setErrors(flattenErrors(e2.fieldErrors));
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <PageTitle sub="For registrations received by phone, Messenger or in person.">Add registration</PageTitle>
      {err && <Alert tone="error">{err}</Alert>}
      <ErrorSummary errors={Object.entries(errors).map(([p, m]) => ({ id: fieldIdFor(p, state), message: m }))} />
      <Card><h2 className="mb-3 text-lg font-semibold">Representative</h2><ContactSection state={state} setState={setState} errors={errors} /></Card>
      <Card><BranchSection state={state} setState={setState} errors={errors} categories={active} /></Card>
      <Card><h2 className="mb-3 text-lg font-semibold">People</h2><AttendeesSection state={state} setState={setState} errors={errors} allowRepToggle perAttendeeCategories={active} /></Card>
      <Card><TextArea id="notes" label="Internal notes" value={state.notes} onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))} maxLength={1000} /></Card>
      <Checkbox id="consent-explained" checked={consent} onChange={(e) => setConsent(e.target.checked)} label="I explained the privacy notice to the registrant and they agreed." error={errors.consentExplained} />
      <Button type="submit" loading={busy} className="self-start">Save registration</Button>
    </form>
  );
}
