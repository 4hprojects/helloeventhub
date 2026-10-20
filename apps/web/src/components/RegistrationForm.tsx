import { Plus, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { MAX_ATTENDEES, composeFullName, splitFullName, type AttendeeDto, type ContactMethod, type ContactsDto, type NameParts, type PublicCategory } from '@heh/contracts';
import { Button, Checkbox, RadioGroup, SelectField, TextArea, TextField, cx } from './ui';

export interface AttendeeRow {
  key: string;
  publicId?: string;
  isRep?: boolean;
  lastName: string;
  firstName: string;
  middleName: string;
  ageCategory: 'adult' | 'child' | '';
  rsvp: 'confirmed' | 'tentative' | 'declined' | '';
  categoryId?: string | null;
}

export interface FormState {
  repLastName: string;
  repFirstName: string;
  repMiddleName: string;
  email: string;
  mobile: string;
  messengerDisplayName: string;
  messengerProfileUrl: string;
  preferred: ContactMethod | '';
  eventCategoryId: string;
  attendees: AttendeeRow[];
  noneAttending: boolean;
  noAttendeesReason: string;
  notes: string;
  /** Public wizard only: the representative's explicit answer to "Are you attending too?". */
  repAnswer?: 'yes' | 'no';
}

let seq = 0;
export const rowKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;
export const blankAttendee = (): AttendeeRow => ({ key: rowKey(), lastName: '', firstName: '', middleName: '', ageCategory: '', rsvp: '' });

/** "Last, First Middle" once a last or first name is typed; empty otherwise. */
export function displayName(p: { lastName: string; firstName: string; middleName?: string }): string {
  return p.lastName.trim() || p.firstName.trim() ? composeFullName(p) : '';
}

export const repDisplayName = (s: FormState) => displayName({ lastName: s.repLastName, firstName: s.repFirstName, middleName: s.repMiddleName });

/** Prefill the separate fields from stored parts, or split a name stored as one field. */
function partsFor(fullName: string, parts: NameParts | null | undefined) {
  const p = parts ?? splitFullName(fullName);
  return { lastName: p.lastName, firstName: p.firstName, middleName: p.middleName ?? '' };
}

export function emptyForm(): FormState {
  return {
    repLastName: '',
    repFirstName: '',
    repMiddleName: '',
    email: '',
    mobile: '',
    messengerDisplayName: '',
    messengerProfileUrl: '',
    preferred: '',
    eventCategoryId: '',
    attendees: [],
    noneAttending: false,
    noAttendeesReason: '',
    notes: '',
  };
}

export function formFromRegistration(r: {
  representativeName: string;
  representativeNameParts?: NameParts | null;
  contacts: ContactsDto;
  eventCategoryId: string | null;
  attendees: AttendeeDto[];
  noAttendeesReason: string | null;
  notes: string | null;
}): FormState {
  const rep = partsFor(r.representativeName, r.representativeNameParts);
  return {
    repLastName: rep.lastName,
    repFirstName: rep.firstName,
    repMiddleName: rep.middleName,
    email: r.contacts.email ?? '',
    mobile: r.contacts.mobile ?? '',
    messengerDisplayName: r.contacts.messengerDisplayName ?? '',
    messengerProfileUrl: r.contacts.messengerProfileUrl ?? '',
    preferred: r.contacts.preferred,
    eventCategoryId: r.eventCategoryId ?? '',
    attendees: r.attendees.map((a) => ({ key: a.id, publicId: a.id, ...partsFor(a.fullName, a.nameParts), ageCategory: a.ageCategory, rsvp: a.rsvp, categoryId: a.categoryId })),
    noneAttending: r.attendees.length === 0,
    noAttendeesReason: r.noAttendeesReason ?? '',
    notes: r.notes ?? '',
  };
}

/** Build the API body. Empty strings are sent as-is; the shared schema treats them as absent. */
export function formToBody(s: FormState) {
  const attendees = s.noneAttending ? [] : s.attendees;
  return {
    representative: {
      lastName: s.repLastName,
      firstName: s.repFirstName,
      middleName: s.repMiddleName,
      contacts: {
        email: s.email,
        mobile: s.mobile,
        messengerDisplayName: s.messengerDisplayName,
        messengerProfileUrl: s.messengerProfileUrl,
        preferred: (s.preferred || undefined) as ContactMethod,
      },
    },
    eventCategoryId: s.eventCategoryId || null,
    attendees: attendees.map((a) => ({
      ...(a.publicId ? { publicId: a.publicId } : {}),
      ...(a.isRep ? { lastName: s.repLastName, firstName: s.repFirstName, middleName: s.repMiddleName } : { lastName: a.lastName, firstName: a.firstName, middleName: a.middleName }),
      ageCategory: (a.ageCategory || undefined) as 'adult',
      rsvp: (a.rsvp || undefined) as 'confirmed',
      ...(a.categoryId !== undefined ? { categoryId: a.categoryId || null } : {}),
    })),
    noAttendeesReason: s.noneAttending ? s.noAttendeesReason : undefined,
    notes: s.notes,
  };
}

/** Map a server/Zod error path to the DOM id of the field that should receive focus. */
export function fieldIdFor(path: string, s: FormState): string {
  const m = /^attendees\.(\d+)\.(\w+)/.exec(path);
  if (m) {
    const row = (s.noneAttending ? [] : s.attendees)[Number(m[1])];
    const suffixes: Record<string, string> = { firstName: 'first', middleName: 'middle', ageCategory: 'age', rsvp: 'rsvp' };
    const suffix = suffixes[m[2]!] ?? 'last';
    return row ? `att-${row.key}-${suffix}` : 'attendees';
  }
  const map: Record<string, string> = {
    'representative.name': 'rep-last',
    'representative.lastName': 'rep-last',
    'representative.firstName': 'rep-first',
    'representative.middleName': 'rep-middle',
    'representative.contacts.email': 'rep-email',
    'representative.contacts.mobile': 'rep-mobile',
    'representative.contacts.messengerDisplayName': 'rep-msgr-name',
    'representative.contacts.messengerProfileUrl': 'rep-msgr-url',
    'representative.contacts.preferred': 'rep-preferred',
    'representative.contacts': 'rep-contacts',
    eventCategoryId: 'branch',
    attendees: 'attendees',
    noAttendeesReason: 'none-reason',
    repAttending: 'rep-attends',
    acceptedPrivacy: 'accept-privacy',
    consentExplained: 'consent-explained',
    notes: 'notes',
  };
  return map[path] ?? 'form-top';
}

export type Errors = Record<string, string>;

export function flattenErrors(fieldErrors: Record<string, string[]>): Errors {
  const out: Errors = {};
  for (const [k, v] of Object.entries(fieldErrors)) if (v[0]) out[k] = v[0];
  return out;
}

function availableMethods(s: FormState): ContactMethod[] {
  return [
    ...(s.email.trim() ? (['email'] as const) : []),
    ...(s.mobile.trim() ? (['mobile'] as const) : []),
    ...(s.messengerDisplayName.trim() || s.messengerProfileUrl.trim() ? (['messenger'] as const) : []),
  ];
}

interface SectionProps {
  state: FormState;
  setState: (updater: (s: FormState) => FormState) => void;
  errors: Errors;
}

export function ContactSection({ state, setState, errors, lockContacts }: SectionProps & { lockContacts?: boolean }) {
  const [showLink, setShowLink] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setState((s) => {
      const n = { ...s, [k]: v };
      const methods = availableMethods(n);
      // Keep "preferred" valid: default to the only method given, clear it if its field was emptied.
      if (n.preferred && !methods.includes(n.preferred)) n.preferred = '';
      if (!n.preferred && methods.length === 1) n.preferred = methods[0]!;
      return n;
    });
  const labels: Record<ContactMethod, string> = { email: 'Email', mobile: 'Mobile', messenger: 'Messenger' };
  const available = availableMethods(state).map((value) => ({ value, label: labels[value] }));
  const groupError = errors['representative.contacts'];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField id="rep-last" label="Your last name" required autoComplete="family-name" value={state.repLastName} onChange={(e) => set('repLastName', e.target.value)} error={errors['representative.lastName'] ?? errors['representative.name']} maxLength={40} />
        <TextField id="rep-first" label="Your first name" required autoComplete="given-name" value={state.repFirstName} onChange={(e) => set('repFirstName', e.target.value)} error={errors['representative.firstName']} maxLength={40} />
        <TextField id="rep-middle" label="Your middle name" optional autoComplete="additional-name" value={state.repMiddleName} onChange={(e) => set('repMiddleName', e.target.value)} error={errors['representative.middleName']} maxLength={30} />
      </div>
      <fieldset
        id="rep-contacts"
        tabIndex={-1}
        aria-describedby={groupError ? 'rep-contacts-error' : undefined}
        className={cx('flex flex-col gap-4 rounded-[10px] border p-3 sm:p-4', groupError ? 'border-danger ring-1 ring-danger' : 'border-line')}
        disabled={lockContacts}
      >
        <legend className="px-1 text-sm font-semibold">
          How can the organizers reach you? <span className="font-normal text-ink-muted">Give at least one.</span>
        </legend>
        {groupError && (
          <p id="rep-contacts-error" className="text-sm font-medium text-danger">
            {groupError}
          </p>
        )}
        {lockContacts && <p className="text-sm text-ink-muted">To change contact details, please contact the organizers.</p>}
        <TextField
          id="rep-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          hint="We'll email your confirmation and a link to manage your registration."
          value={state.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors['representative.contacts.email']}
          maxLength={254}
        />
        <TextField
          id="rep-mobile"
          label="Philippine mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0917 123 4567"
          hint="For organizers to call or text you. We don't send automated texts."
          value={state.mobile}
          onChange={(e) => set('mobile', e.target.value)}
          error={errors['representative.contacts.mobile']}
          maxLength={32}
        />
        <TextField
          id="rep-msgr-name"
          label="Facebook Messenger name"
          autoComplete="off"
          hint="The name organizers should look for on Messenger."
          value={state.messengerDisplayName}
          onChange={(e) => set('messengerDisplayName', e.target.value)}
          error={errors['representative.contacts.messengerDisplayName']}
          maxLength={100}
        />
        {showLink || state.messengerProfileUrl || errors['representative.contacts.messengerProfileUrl'] ? (
          <TextField
            id="rep-msgr-url"
            label="Facebook profile link"
            optional
            type="url"
            inputMode="url"
            placeholder="https://facebook.com/your.name"
            hint="Helps organizers find the right person."
            value={state.messengerProfileUrl}
            onChange={(e) => set('messengerProfileUrl', e.target.value)}
            error={errors['representative.contacts.messengerProfileUrl']}
            maxLength={300}
          />
        ) : (
          !lockContacts && (
            <button type="button" className="-mt-2 self-start text-sm font-medium text-brand-strong underline-offset-2 hover:underline" onClick={() => setShowLink(true)}>
              + Add Facebook profile link (optional)
            </button>
          )
        )}
        {available.length > 0 && (
          <RadioGroup id="rep-preferred" legend="Preferred way to contact you" name="preferred" value={state.preferred} options={available} onChange={(v) => set('preferred', v)} error={errors['representative.contacts.preferred']} />
        )}
      </fieldset>
    </div>
  );
}

export function BranchSection({ state, setState, errors, categories }: SectionProps & { categories: PublicCategory[] }) {
  return (
    <SelectField
      id="branch"
      label="Family branch"
      optional
      hint="Which branch of the family does your household belong to? Choose Other/Unsure if you're not sure."
      value={state.eventCategoryId}
      onChange={(e) => setState((s) => ({ ...s, eventCategoryId: e.target.value }))}
      error={errors.eventCategoryId}
    >
      <option value="">— Not specified —</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </SelectField>
  );
}

export function AttendeesSection({
  state,
  setState,
  errors,
  allowRepToggle,
  askRepAttending,
  ageNote,
  perAttendeeCategories,
}: SectionProps & { allowRepToggle?: boolean; askRepAttending?: boolean; ageNote?: string; perAttendeeCategories?: PublicCategory[] }) {
  const rows = state.attendees;
  const repRow = rows.find((r) => r.isRep);
  const update = (key: string, patch: Partial<AttendeeRow>) => setState((s) => ({ ...s, attendees: s.attendees.map((a) => (a.key === key ? { ...a, ...patch } : a)) }));
  const remove = (key: string) => setState((s) => ({ ...s, attendees: s.attendees.filter((a) => a.key !== key) }));
  const add = () => {
    const row = blankAttendee();
    setState((s) => ({ ...s, noneAttending: false, attendees: [...s.attendees, row] }));
    setTimeout(() => document.getElementById(`att-${row.key}-last`)?.focus(), 0);
  };
  const toggleRep = (on: boolean) =>
    setState((s) => ({
      ...s,
      noneAttending: on ? false : s.noneAttending,
      attendees: on
        ? s.attendees.some((a) => a.isRep)
          ? s.attendees
          : [{ key: 'rep', isRep: true, lastName: '', firstName: '', middleName: '', ageCategory: 'adult', rsvp: 'confirmed' }, ...s.attendees]
        : s.attendees.filter((a) => !a.isRep),
    }));
  const errIdx = (i: number, f: string) => errors[`attendees.${i}.${f}`];
  const repName = repDisplayName(state);
  return (
    <div id="attendees" tabIndex={-1} className="flex flex-col gap-4">
      {ageNote && <p className="text-sm text-ink-muted">{ageNote}</p>}
      {askRepAttending && (
        <RadioGroup
          id="rep-attends"
          legend={repName ? `Are you (${repName}) attending too?` : 'Are you attending too?'}
          name="rep-attends"
          value={repRow ? 'yes' : (state.repAnswer ?? '')}
          options={[
            { value: 'yes', label: 'Yes, count me', hint: "You'll be added as Person 1." },
            { value: 'no', label: "No, I'm only registering others", hint: 'You will not be counted in the headcount.' },
          ]}
          onChange={(v) => {
            toggleRep(v === 'yes');
            setState((s) => ({ ...s, repAnswer: v }));
          }}
          error={errors.repAttending}
        />
      )}
      {allowRepToggle && !askRepAttending && (
        <Checkbox
          id="rep-attends"
          checked={!!repRow}
          onChange={(e) => toggleRep(e.target.checked)}
          label={<>I{repName ? ` (${repName})` : ''} am also attending or responding for myself</>}
          hint="Only people listed below are counted. You are not counted unless you tick this."
        />
      )}
      {errors.attendees && <p className="text-sm font-medium text-danger">{errors.attendees}</p>}
      {rows.length >= 2 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-brand-ice p-2 text-sm" role="group" aria-label="Set everyone's answer">
          <span className="font-medium text-brand-deep">Set everyone to:</span>
          {(['confirmed', 'tentative'] as const).map((v) => (
            <Button key={v} type="button" size="sm" variant="secondary" onClick={() => setState((s) => ({ ...s, attendees: s.attendees.map((a) => ({ ...a, rsvp: v })) }))}>
              {v === 'confirmed' ? 'Yes, attending' : 'Maybe'}
            </Button>
          ))}
        </div>
      )}
      <ol className="flex flex-col gap-3">
        {rows.map((a, i) => (
          <li key={a.key} className="rounded-[10px] border border-line bg-canvas p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <UserRound className="size-4" aria-hidden /> Person {i + 1}
                {a.isRep && <span className="font-normal text-ink-muted">(you)</span>}
              </p>
              {!a.isRep && (
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(a.key)} aria-label={`Remove person ${i + 1}${displayName(a) ? `, ${displayName(a)}` : ''}`}>
                  <Trash2 className="size-4" aria-hidden /> Remove
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-3">
              {a.isRep ? (
                <p className="text-base">{repName || <span className="text-ink-muted">Enter your name in step 1</span>}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField id={`att-${a.key}-last`} label="Last name" required autoComplete="off" value={a.lastName} onChange={(e) => update(a.key, { lastName: e.target.value })} error={errIdx(i, 'lastName') ?? errIdx(i, 'fullName')} maxLength={40} />
                  <TextField id={`att-${a.key}-first`} label="First name" required autoComplete="off" value={a.firstName} onChange={(e) => update(a.key, { firstName: e.target.value })} error={errIdx(i, 'firstName')} maxLength={40} />
                  <TextField id={`att-${a.key}-middle`} label="Middle name" optional autoComplete="off" value={a.middleName} onChange={(e) => update(a.key, { middleName: e.target.value })} error={errIdx(i, 'middleName')} maxLength={30} />
                </div>
              )}
              <RadioGroup
                id={`att-${a.key}-age`}
                legend="Age group"
                name={`age-${a.key}`}
                value={a.ageCategory}
                options={[
                  { value: 'adult', label: 'Adult' },
                  { value: 'child', label: 'Child' },
                ]}
                onChange={(v) => update(a.key, { ageCategory: v })}
                error={errIdx(i, 'ageCategory')}
              />
              <RadioGroup
                id={`att-${a.key}-rsvp`}
                legend="Will this person attend?"
                name={`rsvp-${a.key}`}
                value={a.rsvp}
                options={[
                  { value: 'confirmed', label: 'Yes, attending' },
                  { value: 'tentative', label: 'Maybe' },
                  { value: 'declined', label: 'Not attending' },
                ]}
                onChange={(v) => update(a.key, { rsvp: v })}
                error={errIdx(i, 'rsvp')}
              />
              {perAttendeeCategories && (
                <SelectField label="Branch override" value={a.categoryId ?? ''} onChange={(e) => update(a.key, { categoryId: e.target.value || null })}>
                  <option value="">Same as household</option>
                  {perAttendeeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </SelectField>
              )}
            </div>
          </li>
        ))}
      </ol>
      {rows.length < MAX_ATTENDEES ? (
        <Button type="button" variant="secondary" onClick={add} className="self-start">
          <Plus className="size-4" aria-hidden /> {rows.length ? 'Add another person' : 'Add a person'}
        </Button>
      ) : (
        <p className="text-sm text-ink-muted">You can add up to {MAX_ATTENDEES} people in one form. For more, submit another form.</p>
      )}
      {rows.length === 0 && (
        <div className={cx('rounded-[10px] border p-3', errors.attendees ? 'border-danger' : 'border-line')}>
          <Checkbox
            id="none-attending"
            checked={state.noneAttending}
            onChange={(e) => setState((s) => ({ ...s, noneAttending: e.target.checked }))}
            label="No one from our household can attend"
          />
          {state.noneAttending && (
            <div className="mt-3">
              <TextArea id="none-reason" label="Please tell the organizers why" required value={state.noAttendeesReason} onChange={(e) => setState((s) => ({ ...s, noAttendeesReason: e.target.value }))} error={errors.noAttendeesReason ?? errors.attendees} maxLength={500} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function attendeeTotals(s: FormState) {
  const rows = s.noneAttending ? [] : s.attendees;
  return {
    confirmed: rows.filter((r) => r.rsvp === 'confirmed').length,
    tentative: rows.filter((r) => r.rsvp === 'tentative').length,
    declined: rows.filter((r) => r.rsvp === 'declined').length,
    total: rows.length,
  };
}
