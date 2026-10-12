import { Download } from 'lucide-react';
import { useState } from 'react';
import { Alert, Card, Checkbox, PageTitle, SelectField } from '../../components/ui';
import { buildUrl } from '../../lib/api';
import { AdminOnly, useAdminEvent } from './AdminShell';

export default function ExportsPage() {
  return (
    <AdminOnly>
      <Exports />
    </AdminOnly>
  );
}

function Exports() {
  const { event } = useAdminEvent();
  const [categoryId, setCategoryId] = useState('');
  const [rsvp, setRsvp] = useState('');
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const filters = { categoryId: categoryId || undefined, rsvp: rsvp || undefined, includeCancelled: includeCancelled ? 'true' : undefined };
  const href = (format: string, view: string) => buildUrl(`/admin/events/${event.id}/exports`, { format, view, ...filters });
  const Btn = ({ format, view, label, hint }: { format: string; view: string; label: string; hint: string }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3">
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-sm text-ink-muted">{hint}</p>
      </div>
      <a href={href(format, view)} download className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line bg-white px-4 font-semibold text-brand-deep no-underline hover:bg-brand-ice hover:no-underline">
        <Download className="size-4" aria-hidden /> {format.toUpperCase()}
      </a>
    </li>
  );
  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="Downloads are recorded in the audit log. Store files securely and delete them when no longer needed.">Exports</PageTitle>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Filters</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Branch" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All branches</option>
            {event.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
            <option value="none">Not specified</option>
          </SelectField>
          <SelectField label="Response" value={rsvp} onChange={(e) => setRsvp(e.target.value)}>
            <option value="">All responses</option>
            <option value="confirmed">Attending</option>
            <option value="tentative">Maybe</option>
            <option value="declined">Not attending</option>
          </SelectField>
        </div>
        <div className="mt-3">
          <Checkbox label="Include cancelled registrations" checked={includeCancelled} onChange={(e) => setIncludeCancelled(e.target.checked)} />
        </div>
        <p className="mt-2 text-sm text-ink-muted">Filters apply to the Registrations and Attendees lists. Summary totals are always for all active registrations.</p>
      </Card>
      <Card>
        <ul>
          <Btn format="xlsx" view="attendees" label="Full report (Excel)" hint="Summary, Registrations, Attendees, Branches and RSVP Statistics sheets. Includes contact details." />
          <Btn format="csv" view="attendees" label="Attendees" hint="One row per person. No contact details." />
          <Btn format="csv" view="registrations" label="Registrations" hint="One row per household, with contact details." />
          <Btn format="csv" view="summary" label="Summary" hint="Totals and branch breakdown." />
          <Btn format="xlsx" view="venue" label="Venue roster (Excel)" hint="For printed check-in lists. Names, branch and reference only — no contacts." />
        </ul>
      </Card>
      <Alert tone="info">Spreadsheet cells starting with =, +, - or @ are prefixed with an apostrophe so they can't run as formulas.</Alert>
    </div>
  );
}
