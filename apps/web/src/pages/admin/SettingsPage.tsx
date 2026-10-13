import { useState } from 'react';
import type { AdminEventDto, EventUpdateInput } from '@heh/contracts';
import { Alert, Badge, Button, Card, Checkbox, PageTitle, SelectField, TextArea, TextField } from '../../components/ui';
import type { ApiError } from '../../lib/api';
import { api } from '../../lib/api';
import { fromZonedInput, toZonedInput } from '../../lib/time';
import { AdminOnly, useAdminEvent } from './AdminShell';

type Draft = Omit<EventUpdateInput, 'capacity'> & { capacity: string };

function toDraft(e: AdminEventDto): Draft {
  const z = (iso: string | null) => toZonedInput(iso, e.timezone);
  return {
    revision: e.revision,
    title: e.title,
    description: e.description,
    venueName: e.venueName ?? '',
    venueAddress: e.venueAddress ?? '',
    venueMapUrl: e.venueMapUrl ?? '',
    startsAt: z(e.startsAt),
    endsAt: z(e.endsAt),
    onsiteRegistrationStartsAt: z(e.onsiteRegistrationStartsAt),
    registrationStatus: e.registrationStatus,
    registrationClosesAt: z(e.registrationClosesAt),
    selfServiceEditUntil: z(e.selfServiceEditUntil),
    preregSnapshotAt: z(e.preregSnapshotAt),
    allowLateRegistration: e.allowLateRegistration,
    capacity: e.capacity ? String(e.capacity) : '',
    contactInfo: { email: e.contactInfo.email ?? '', phone: e.contactInfo.phone ?? '', messenger: e.contactInfo.messenger ?? '', note: e.contactInfo.note ?? '' },
    ageCategoryNote: e.ageCategoryNote,
    privacyNotice: e.privacyNotice,
    privacyNoticeApproved: e.privacyNoticeApproved,
    consentVersion: e.consentVersion,
  };
}

export default function SettingsPage() {
  return (
    <AdminOnly>
      <Settings />
    </AdminOnly>
  );
}

function Settings() {
  const { event, reload } = useAdminEvent();
  const [d, setD] = useState<Draft>(() => toDraft(event));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const tz = event.timezone;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setContact = (k: keyof Draft['contactInfo'], v: string) => setD((x) => ({ ...x, contactInfo: { ...x.contactInfo, [k]: v } }));
  const err = (k: string) => errors[k]?.[0];

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const z = (v: string | null | undefined) => (v ? fromZonedInput(v, tz) : null);
    const body = {
      ...d,
      startsAt: z(d.startsAt),
      endsAt: z(d.endsAt),
      onsiteRegistrationStartsAt: z(d.onsiteRegistrationStartsAt),
      registrationClosesAt: z(d.registrationClosesAt),
      selfServiceEditUntil: z(d.selfServiceEditUntil),
      preregSnapshotAt: z(d.preregSnapshotAt),
      capacity: d.capacity ? Number(d.capacity) : null,
    };
    try {
      const updated = await api<AdminEventDto>(`/admin/events/${event.id}`, { method: 'PATCH', body });
      setD(toDraft(updated));
      setErrors({});
      setMsg({ tone: 'success', text: 'Settings saved.' });
      reload();
    } catch (e) {
      const e2 = e as ApiError;
      setErrors(e2.fieldErrors);
      setMsg({ tone: 'error', text: e2.message });
    } finally {
      setBusy(false);
    }
  };

  const hasPublicContact = Boolean(d.contactInfo.email || d.contactInfo.phone || d.contactInfo.messenger);
  const openingBlocked = d.registrationStatus === 'open' && (!d.privacyNoticeApproved || !hasPublicContact);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub={`Times are in ${tz}.`}>Event settings</PageTitle>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Registration</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Online registration" required value={d.registrationStatus} onChange={(e) => set('registrationStatus', e.target.value as Draft['registrationStatus'])} error={err('registrationStatus')}>
              <option value="draft">Not yet open</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </SelectField>
            <TextField label="Planning headcount cutoff" type="datetime-local" hint="The automatic snapshot is captured at this time." value={d.preregSnapshotAt ?? ''} onChange={(e) => set('preregSnapshotAt', e.target.value)} error={err('preregSnapshotAt')} />
            <TextField label="Close online registration at" type="datetime-local" hint="Leave empty to keep open until the event." value={d.registrationClosesAt ?? ''} onChange={(e) => set('registrationClosesAt', e.target.value)} error={err('registrationClosesAt')} />
            <TextField label="Online changes allowed until" type="datetime-local" hint="Default: event start." value={d.selfServiceEditUntil ?? ''} onChange={(e) => set('selfServiceEditUntil', e.target.value)} error={err('selfServiceEditUntil')} />
            <TextField label="Capacity (people attending + maybe)" type="number" min={1} inputMode="numeric" hint="Leave empty for no limit." value={d.capacity} onChange={(e) => set('capacity', e.target.value)} error={err('capacity')} />
          </div>
          <div className="mt-4">
            <Checkbox label="Accept late registrations after the headcount cutoff (marked as late)" checked={d.allowLateRegistration} onChange={(e) => set('allowLateRegistration', e.target.checked)} />
          </div>
          {openingBlocked && (
            <Alert tone="warning" className="mt-4">
              Before opening registration, add an organizer email, phone or Messenger contact and mark the privacy notice as approved.
            </Alert>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Event details</h2>
          <div className="flex flex-col gap-4">
            <TextField label="Official title" required value={d.title} onChange={(e) => set('title', e.target.value)} error={err('title')} maxLength={160} />
            <TextArea label="Description" value={d.description ?? ''} onChange={(e) => set('description', e.target.value)} error={err('description')} maxLength={5000} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="On-site registration starts" type="datetime-local" required value={d.onsiteRegistrationStartsAt} onChange={(e) => set('onsiteRegistrationStartsAt', e.target.value)} error={err('onsiteRegistrationStartsAt')} />
              <TextField label="Program starts" type="datetime-local" required value={d.startsAt} onChange={(e) => set('startsAt', e.target.value)} error={err('startsAt')} />
              <TextField label="Program ends" type="datetime-local" required value={d.endsAt} onChange={(e) => set('endsAt', e.target.value)} error={err('endsAt')} />
            </div>
            <TextField label="Venue name" hint="Hidden on the public page until filled in." value={d.venueName ?? ''} onChange={(e) => set('venueName', e.target.value)} error={err('venueName')} />
            <TextField label="Venue address" value={d.venueAddress ?? ''} onChange={(e) => set('venueAddress', e.target.value)} error={err('venueAddress')} />
            <TextField label="Map link" type="url" placeholder="https://maps.google.com/…" value={d.venueMapUrl ?? ''} onChange={(e) => set('venueMapUrl', e.target.value)} error={err('venueMapUrl')} />
            <TextField label="Adult / child definition shown on the form" value={d.ageCategoryNote ?? ''} onChange={(e) => set('ageCategoryNote', e.target.value)} error={err('ageCategoryNote')} />
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Organizer contact (public)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Email" type="email" value={d.contactInfo.email ?? ''} onChange={(e) => setContact('email', e.target.value)} error={err('contactInfo.email')} />
            <TextField label="Phone" value={d.contactInfo.phone ?? ''} onChange={(e) => setContact('phone', e.target.value)} error={err('contactInfo.phone')} />
            <TextField label="Messenger (name or https link)" value={d.contactInfo.messenger ?? ''} onChange={(e) => setContact('messenger', e.target.value)} error={err('contactInfo.messenger')} />
            <TextField label="Note" value={d.contactInfo.note ?? ''} onChange={(e) => setContact('note', e.target.value)} error={err('contactInfo.note')} />
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Privacy notice</h2>
          <div className="flex flex-col gap-4">
            <TextArea label="Notice text" required rows={12} value={d.privacyNotice ?? ''} onChange={(e) => set('privacyNotice', e.target.value)} error={err('privacyNotice')} />
            <TextField label="Notice version" required hint="Change this whenever the text changes; it is stored with each registration's consent." value={d.consentVersion} onChange={(e) => set('consentVersion', e.target.value)} error={err('consentVersion')} />
            <Checkbox label="The organizers have reviewed and approved this notice" checked={d.privacyNoticeApproved} onChange={(e) => set('privacyNoticeApproved', e.target.checked)} />
          </div>
        </Card>
        <Button type="submit" loading={busy} className="self-start">Save settings</Button>
      </form>
      <Branches />
    </div>
  );
}

function Branches() {
  const { event, reload } = useAdminEvent();
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const call = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setMsg((e as ApiError).message);
    }
  };
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Family branches</h2>
      <p className="mb-3 text-sm text-ink-muted">Renaming keeps existing registrations linked. Hide a branch instead of deleting it.</p>
      {msg && <Alert tone="error" className="mb-3">{msg}</Alert>}
      <ul className="divide-y divide-line">
        {event.categories.map((c) => (
          <BranchRow
            key={c.id}
            c={c}
            onRename={(l) => call(() => api(`/admin/events/${event.id}/categories/${c.id}`, { method: 'PATCH', body: { label: l } }))}
            onToggle={() => call(() => api(`/admin/events/${event.id}/categories/${c.id}`, { method: 'PATCH', body: { active: !c.active } }))}
          />
        ))}
      </ul>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) void call(() => api(`/admin/events/${event.id}/categories`, { method: 'POST', body: { label: label.trim() } })).then(() => setLabel(''));
        }}
      >
        <div className="min-w-0 flex-1 basis-48">
          <TextField label="New branch" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
        </div>
        <Button type="submit" variant="secondary">Add</Button>
      </form>
    </Card>
  );
}

function BranchRow({ c, onRename, onToggle }: { c: AdminEventDto['categories'][number]; onRename: (l: string) => void; onToggle: () => void }) {
  const [editing, setEditing] = useState(false);
  const [l, setL] = useState(c.label);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      {editing ? (
        <form className="flex flex-1 flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); onRename(l); setEditing(false); }}>
          <div className="min-w-0 flex-1"><TextField label={`Rename ${c.label}`} value={l} onChange={(e) => setL(e.target.value)} maxLength={80} /></div>
          <Button type="submit" size="sm">Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </form>
      ) : (
        <>
          <span className="flex items-center gap-2">
            {c.label}
            {c.provisional && <Badge tone="warning">Provisional</Badge>}
            {!c.active && <Badge>Hidden</Badge>}
          </span>
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Rename</Button>
            <Button size="sm" variant="ghost" onClick={onToggle}>{c.active ? 'Hide' : 'Show'}</Button>
          </span>
        </>
      )}
    </li>
  );
}
