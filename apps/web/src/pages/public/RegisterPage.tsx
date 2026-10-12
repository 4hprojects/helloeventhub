import { ArrowLeft, ArrowRight, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { registrationCreateSchema, type PublicEvent, type RegistrationCreatedResponse } from '@heh/contracts';
import {
  AttendeesSection,
  BranchSection,
  ContactSection,
  attendeeTotals,
  emptyForm,
  fieldIdFor,
  flattenErrors,
  formToBody,
  type Errors,
  type FormState,
} from '../../components/RegistrationForm';
import { Turnstile, type TurnstileHandle } from '../../components/Turnstile';
import { Alert, Button, Card, Checkbox, ErrorSummary, RSVP_LABEL, Spinner } from '../../components/ui';
import type { ApiError} from '../../lib/api';
import { api, newIdempotencyKey } from '../../lib/api';
import { usePublicConfig, usePublicEvent } from '../../lib/publicData';

const STEPS = ['Your details', 'Family branch', 'Who is coming', 'Review & submit'] as const;
const STEP_SHORT = ['Details', 'Branch', 'People', 'Review'] as const;
const STEP_PREFIXES: string[][] = [['representative'], ['eventCategoryId'], ['attendees', 'noAttendeesReason'], ['acceptedPrivacy', 'consentVersion']];

function stepOf(path: string): number {
  const i = STEP_PREFIXES.findIndex((ps) => ps.some((p) => path === p || path.startsWith(`${p}.`)));
  return i === -1 ? 3 : i;
}

export const LAST_REG_KEY = 'heh:lastRegistration';

export default function RegisterPage() {
  const { slug } = useParams();
  const { data: event, loading, error } = usePublicEvent(slug);
  if (loading) return <Spinner />;
  if (error || !event) return <Alert tone="error" title="Event not found">Check the link you were given.</Alert>;
  if (!event.registrationOpen) {
    return (
      <Alert tone="info" title="Registration is not open">
        {event.registrationMessage} <Link to={`/events/${event.slug}`}>Back to event</Link>
      </Alert>
    );
  }
  return <Wizard event={event} />;
}

function Wizard({ event }: { event: PublicEvent }) {
  const navigate = useNavigate();
  const { data: config } = usePublicConfig();
  const [state, setStateRaw] = useState<FormState>(emptyForm);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ title: string; body: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // One key per form session: retries after network errors replay safely instead of duplicating.
  const idemKey = useRef(newIdempotencyKey());
  const firstRender = useRef(true);

  const setState = (u: (s: FormState) => FormState) => setStateRaw(u);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  // Warn before leaving with unsent data. The form is held in memory only (no localStorage on shared devices).
  useEffect(() => {
    const dirty = state.repName || state.attendees.length;
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [state.repName, state.attendees.length]);

  const body = () => ({ ...formToBody(state), acceptedPrivacy: accepted, consentVersion: event.consentVersion, turnstileToken: token ?? undefined });

  const validateStep = (s: number): Errors => {
    // Object-level refinements only run once every field parses, so treat later-step
    // fields as valid while checking an earlier step.
    const r = registrationCreateSchema.safeParse({ ...body(), ...(s < 3 ? { acceptedPrivacy: true } : {}) });
    if (r.success) return {};
    const out: Errors = {};
    for (const issue of r.error.issues) {
      const path = issue.path.join('.');
      if (stepOf(path) === s && !out[path]) out[path] = issue.message;
    }
    return out;
  };

  const next = () => {
    const errs = validateStep(step);
    setErrors(errs);
    if (Object.keys(errs).length === 0) setStep((s) => Math.min(s + 1, 3));
  };

  const submit = async () => {
    setFormError(null);
    for (let s = 0; s < 4; s++) {
      const errs = validateStep(s);
      if (Object.keys(errs).length) {
        setErrors(errs);
        setStep(s);
        return;
      }
    }
    if (config?.turnstileSiteKey && !token && !turnstileFailed) {
      setFormError({ title: 'Almost done', body: 'Please wait for the security check below to finish, then submit again.' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<RegistrationCreatedResponse>(`/events/${event.id}/registrations`, {
        method: 'POST',
        body: body(),
        headers: { 'Idempotency-Key': idemKey.current },
      });
      try {
        sessionStorage.setItem(
          LAST_REG_KEY,
          JSON.stringify({ ...res, hasEmail: !!state.email.trim(), eventSlug: event.slug, eventTitle: event.title }),
        );
      } catch {
        /* storage unavailable: success page falls back to router state */
      }
      idemKey.current = newIdempotencyKey();
      setStateRaw(emptyForm());
      navigate('/registration/success', { state: { ...res, hasEmail: !!state.email.trim(), eventSlug: event.slug, eventTitle: event.title } });
    } catch (e) {
      const err = e as ApiError;
      if (err.isNetwork) {
        setFormError({ title: 'Connection problem', body: 'Your details are still here. Check your connection and press Submit again — you will not be registered twice.' });
      } else if (err.code === 'validation_failed' && Object.keys(err.fieldErrors).length) {
        const errs = flattenErrors(err.fieldErrors);
        setErrors(errs);
        setStep(Math.min(...Object.keys(errs).map(stepOf)));
        turnstileRef.current?.reset();
      } else if (err.code === 'idempotency_conflict') {
        setFormError({ title: 'Already submitted', body: 'An earlier attempt from this page may have gone through. Check your email, or contact the organizers before submitting again.' });
      } else {
        setFormError({ title: 'Could not submit', body: err.message });
        turnstileRef.current?.reset();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const errorList = Object.entries(errors).map(([path, message]) => ({ id: fieldIdFor(path, state), message }));
  const totals = attendeeTotals(state);

  return (
    <div className="flex flex-col gap-4" id="form-top">
      <div>
        <p className="text-sm font-medium text-ink-muted">{event.title}</p>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none sm:text-3xl">
          {STEPS[step]}
        </h1>
        <p className="mt-1 text-sm text-ink-muted" aria-live="polite">
          Step {step + 1} of {STEPS.length}
        </p>
        <ol className="mt-2 grid grid-cols-4 gap-1" aria-hidden>
          {STEP_SHORT.map((label, i) => (
            <li key={label} className="min-w-0">
              <div className={`h-1.5 rounded-full ${i <= step ? 'bg-brand-strong' : 'bg-line'}`} />
              <span className={`mt-1 block truncate text-xs ${i === step ? 'font-semibold text-brand-deep' : 'text-ink-muted'}`}>{label}</span>
            </li>
          ))}
        </ol>
      </div>

      <ErrorSummary errors={errorList} />
      {formError && (
        <Alert tone="error" title={formError.title}>
          {formError.body}
        </Alert>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 3) next();
          else void submit();
        }}
      >
        <Card>
          {step === 0 && <ContactSection state={state} setState={setState} errors={errors} />}
          {step === 1 && <BranchSection state={state} setState={setState} errors={errors} categories={event.categories} />}
          {step === 2 && <AttendeesSection state={state} setState={setState} errors={errors} allowRepToggle ageNote={event.ageCategoryNote} />}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <Review state={state} event={event} goTo={setStep} />
              <p className="rounded-[10px] bg-brand-ice p-3 text-sm">
                <strong>Total:</strong> {totals.confirmed} attending · {totals.tentative} maybe · {totals.declined} not attending
              </p>
              <details className="rounded-[10px] border border-line p-3">
                <summary className="cursor-pointer font-semibold">Read the privacy notice</summary>
                {!event.privacyNoticeApproved && <p className="mt-2 text-sm font-semibold text-warning">Draft — awaiting organizer approval.</p>}
                <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-line text-sm">{event.privacyNotice}</div>
                <p className="mt-2 text-sm">
                  <Link to="/privacy" target="_blank">
                    Open the privacy notice in a new tab
                  </Link>
                </p>
              </details>
              <Checkbox
                id="accept-privacy"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                label="I have read the privacy notice and agree that the organizers may use these details to plan and run the event."
                error={errors.acceptedPrivacy}
              />
              {config?.turnstileSiteKey && (
                <div>
                  <Turnstile ref={turnstileRef} siteKey={config.turnstileSiteKey} onToken={setToken} onLoadError={() => setTurnstileFailed(true)} />
                  {turnstileFailed && <p className="text-sm text-ink-muted">The security check could not load. You can still try to submit.</p>}
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="mt-4 flex flex-wrap-reverse items-center justify-between gap-3">
          {step > 0 ? (
            <Button type="button" variant="secondary" onClick={() => { setErrors({}); setStep((s) => s - 1); }} disabled={submitting}>
              <ArrowLeft className="size-4" aria-hidden /> Back
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button type="submit">
              Continue <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button type="submit" loading={submitting}>
              {submitting ? 'Submitting…' : 'Submit registration'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function Review({ state, event, goTo }: { state: FormState; event: PublicEvent; goTo: (s: number) => void }) {
  const branch = event.categories.find((c) => c.id === state.eventCategoryId)?.label ?? 'Not specified';
  const contacts = [
    state.email && `Email: ${state.email}`,
    state.mobile && `Mobile: ${state.mobile}`,
    state.messengerDisplayName && `Messenger: ${state.messengerDisplayName}`,
    state.messengerProfileUrl && `Profile: ${state.messengerProfileUrl}`,
  ].filter(Boolean);
  const EditBtn = ({ s, label }: { s: number; label: string }) => (
    <Button type="button" variant="ghost" size="sm" onClick={() => goTo(s)} aria-label={`Edit ${label}`}>
      <Pencil className="size-4" aria-hidden /> Edit
    </Button>
  );
  return (
    <dl className="flex flex-col divide-y divide-line">
      <div className="flex items-start justify-between gap-3 py-3">
        <div className="min-w-0">
          <dt className="text-sm font-semibold text-ink-muted">Representative</dt>
          <dd className="break-words">{state.repName}</dd>
          {contacts.map((c) => (
            <dd key={c as string} className="break-words text-sm">
              {c}
            </dd>
          ))}
        </div>
        <EditBtn s={0} label="your details" />
      </div>
      <div className="flex items-start justify-between gap-3 py-3">
        <div>
          <dt className="text-sm font-semibold text-ink-muted">Family branch</dt>
          <dd>{branch}</dd>
        </div>
        <EditBtn s={1} label="family branch" />
      </div>
      <div className="flex items-start justify-between gap-3 py-3">
        <div className="min-w-0">
          <dt className="text-sm font-semibold text-ink-muted">People</dt>
          {state.noneAttending ? (
            <dd>No one from the household can attend</dd>
          ) : (
            <dd>
              <ul className="flex flex-col gap-1">
                {state.attendees.map((a) => (
                  <li key={a.key} className="break-words">
                    {a.isRep ? state.repName : a.fullName} — {a.ageCategory === 'child' ? 'Child' : 'Adult'}, {a.rsvp ? RSVP_LABEL[a.rsvp] : ''}
                  </li>
                ))}
              </ul>
            </dd>
          )}
        </div>
        <EditBtn s={2} label="people" />
      </div>
    </dl>
  );
}
