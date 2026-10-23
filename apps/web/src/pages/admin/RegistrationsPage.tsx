import { ChevronDown, Home, Printer, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatInZone, type AdminAttendeeList, type AdminRegistrationList, type SignupSummary } from '@heh/contracts';
import { Alert, Badge, Button, Card, Checkbox, cx, RSVP_LABEL, RsvpBadge, SelectField, Spinner, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useAdminEvent } from './AdminShell';

type View = 'households' | 'people';
type Params = ReturnType<typeof useSearchParams>[0];

const HOUSEHOLD_SORTS = [
  ['-createdAt', 'Newest first'],
  ['createdAt', 'Oldest first'],
  ['representativeName', 'Name A–Z'],
  ['-representativeName', 'Name Z–A'],
] as const;
const PEOPLE_SORTS = [
  ['fullName', 'Last name A–Z'],
  ['-fullName', 'Last name Z–A'],
  ['household', 'Household'],
  ['branch', 'Branch'],
  ['-createdAt', 'Newest first'],
] as const;
// Params that only make sense in one view; dropped when switching.
const VIEW_ONLY_PARAMS = ['sort', 'page', 'late', 'ageCategory'];

export default function RegistrationsPage() {
  const { event } = useAdminEvent();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const view: View = params.get('view') === 'people' ? 'people' : 'households';
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k !== 'page') p.delete('page');
    setParams(p);
  };
  const setView = (v: View) => {
    const p = new URLSearchParams(params);
    for (const k of VIEW_ONLY_PARAMS) p.delete(k);
    if (v === 'people') p.set('view', 'people');
    else p.delete('view');
    setParams(p);
  };
  const branchLabel = (id: string | null) => (id === 'none' ? 'Not specified' : event.categories.find((c) => c.id === id)?.label);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Registrations</h1>
        <div className="no-print flex flex-wrap items-center gap-2">
          <div role="group" aria-label="View" className="inline-flex rounded-[10px] border border-line bg-white p-1">
            {(
              [
                ['households', 'Households', Home],
                ['people', 'Everyone', Users],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cx(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-[7px] px-3 text-sm font-semibold',
                  view === v ? 'bg-brand-deep text-white' : 'text-ink-muted hover:bg-canvas hover:text-ink',
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Print
          </Button>
        </div>
      </div>
      <PrintHeading title={event.title} view={view} params={params} branchLabel={branchLabel} timezone={event.timezone} />
      <Card className="print:hidden">
        <form
          role="search"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('q', q.trim());
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-60">
              <TextField
                label="Search"
                hint={view === 'people' ? 'Person’s name or reference (HEH-…)' : 'Name, reference (HEH-…), email or mobile'}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                type="search"
              />
            </div>
            <Button type="submit">
              <Search className="size-4" aria-hidden /> Search
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SelectField label="Branch" value={params.get('categoryId') ?? ''} onChange={(e) => setParam('categoryId', e.target.value)}>
              <option value="">All</option>
              {event.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
              <option value="none">Not specified</option>
            </SelectField>
            <SelectField label={view === 'people' ? 'Response' : 'Has someone who is'} value={params.get('rsvp') ?? ''} onChange={(e) => setParam('rsvp', e.target.value)}>
              <option value="">Any response</option>
              <option value="confirmed">Attending</option>
              <option value="tentative">Maybe</option>
              <option value="declined">Not attending</option>
            </SelectField>
            <SelectField label="Status" value={params.get('status') ?? 'active'} onChange={(e) => setParam('status', e.target.value === 'active' ? '' : e.target.value)}>
              <option value="active">Active</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">All</option>
            </SelectField>
            {view === 'people' ? (
              <SelectField label="Age group" value={params.get('ageCategory') ?? ''} onChange={(e) => setParam('ageCategory', e.target.value)}>
                <option value="">All ages</option>
                <option value="adult">Adults</option>
                <option value="child">Children</option>
              </SelectField>
            ) : (
              <SelectField label="Timing" value={params.get('late') ?? ''} onChange={(e) => setParam('late', e.target.value)}>
                <option value="">Any</option>
                <option value="false">On time</option>
                <option value="true">Late</option>
              </SelectField>
            )}
            <div className="col-span-2 lg:col-span-1">
              <SelectField label="Sort by" value={params.get('sort') ?? ''} onChange={(e) => setParam('sort', e.target.value)}>
                {(view === 'people' ? PEOPLE_SORTS : HOUSEHOLD_SORTS).map(([v, label], i) => (
                  <option key={v} value={i === 0 ? '' : v}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
        </form>
      </Card>
      {view === 'people' ? <PeopleView params={params} setParam={setParam} /> : <HouseholdsView params={params} setParam={setParam} />}
    </div>
  );
}

/** Shown only on paper, so a printed list says what it is and when it was taken. */
function PrintHeading({ title, view, params, branchLabel, timezone }: { title: string; view: View; params: Params; branchLabel: (id: string | null) => string | undefined; timezone: string }) {
  const filters = [
    params.get('q') && `Search “${params.get('q')}”`,
    params.get('categoryId') && `Branch: ${branchLabel(params.get('categoryId'))}`,
    params.get('rsvp') && `${view === 'people' ? 'Response' : 'Has someone'}: ${RSVP_LABEL[params.get('rsvp') as keyof typeof RSVP_LABEL]}`,
    params.get('ageCategory') && (params.get('ageCategory') === 'child' ? 'Children only' : 'Adults only'),
    params.get('late') && (params.get('late') === 'true' ? 'Late only' : 'On time only'),
    params.get('status') === 'cancelled' ? 'Cancelled only' : params.get('status') === 'all' ? 'Including cancelled' : null,
  ].filter(Boolean);
  return (
    <div className="hidden print:block">
      <p className="font-semibold">{title}</p>
      <p className="text-sm">
        {view === 'people' ? 'Everyone signed up' : 'Households'} · printed {formatInZone(new Date().toISOString(), timezone)}
        {filters.length > 0 && ` · ${filters.join(' · ')}`}
      </p>
    </div>
  );
}

function SummaryBar({ s, view }: { s: SignupSummary; view: View }) {
  const tiles: Array<[string, string | number, string?]> = [
    ['People', s.people, view === 'households' ? 'in these households' : undefined],
    ['Attending', s.confirmed, 'text-success'],
    ['Maybe', s.tentative, 'text-warning'],
    ['Not attending', s.declined],
    ['Adults · Children', `${s.adults} · ${s.children}`],
    ['Households', s.households],
  ];
  return (
    <dl aria-live="polite" className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6">
      {tiles.map(([label, value, extra]) => (
        <div key={label} className="bg-white px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
          <dd className={cx('font-display text-2xl font-bold tabular-nums', extra?.startsWith('text-') ? extra : 'text-ink')}>{value}</dd>
          {extra && !extra.startsWith('text-') && <dd className="text-xs text-ink-muted">{extra}</dd>}
        </div>
      ))}
    </dl>
  );
}

function Pagination({ page, pages, setParam }: { page: number; pages: number; setParam: (k: string, v: string) => void }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="no-print flex items-center justify-between gap-2">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
        Previous
      </Button>
      <span className="text-sm">
        Page {page} of {pages}
      </span>
      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setParam('page', String(page + 1))}>
        Next
      </Button>
    </nav>
  );
}

function SourceBadge({ source, long }: { source: string; long?: boolean }) {
  if (source === 'public') return null;
  return <Badge tone="brand">{source === 'committee' ? (long ? 'Staff entry' : 'Staff') : 'Walk-in'}</Badge>;
}

function HouseholdsView({ params, setParam }: { params: Params; setParam: (k: string, v: string) => void }) {
  const { event } = useAdminEvent();
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const query = Object.fromEntries(params.entries());
  const { data, loading, error } = useAsync(
    (signal) => api<AdminRegistrationList>(`/admin/events/${event.id}/registrations`, { query: { limit: 50, ...query }, signal }),
    [event.id, params.toString()],
  );
  const page = Number(params.get('page') ?? 1);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const isOpen = (id: string) => showAll || open.has(id);
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const tz = event.timezone;

  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (!data) return loading ? <Spinner /> : null;
  return (
    <>
      <SummaryBar s={data.summary} view="households" />
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {data.total} registration{data.total === 1 ? '' : 's'}
        </p>
        <Checkbox label="Show everyone’s names" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
      </div>
      {data.items.length === 0 && <p className="text-ink-muted">No registrations match these filters.</p>}
      {data.items.length > 0 && (
        <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-line bg-white md:block print:block">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Registrations</caption>
            <thead className="bg-canvas text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Household</th>
                <th scope="col" className="px-3 py-2 font-semibold">Reference</th>
                <th scope="col" className="px-3 py-2 font-semibold">Branch</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">People</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Attending</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Maybe</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Not</th>
                <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                <th scope="col" className="px-3 py-2 font-semibold">Registered</th>
              </tr>
            </thead>
            {data.items.map((r) => (
              <tbody key={r.id} className="border-t border-line break-inside-avoid">
                <tr className="hover:bg-canvas">
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-1">
                      <button
                        type="button"
                        onClick={() => toggle(r.id)}
                        aria-expanded={isOpen(r.id)}
                        aria-controls={`people-${r.id}`}
                        aria-label={`${isOpen(r.id) ? 'Hide' : 'Show'} people in ${r.representativeName}’s household`}
                        disabled={showAll || r.people.length === 0}
                        className="no-print -ml-1 rounded p-0.5 text-ink-muted hover:bg-brand-ice hover:text-ink disabled:opacity-30"
                      >
                        <ChevronDown className={cx('size-4 transition-transform', isOpen(r.id) ? '' : '-rotate-90')} aria-hidden />
                      </button>
                      <div>
                        <Link to={r.id} className="font-semibold">{r.representativeName}</Link>
                        {r.matchedAttendees && <span className="block text-xs text-ink-muted">Matches: {r.matchedAttendees.join(', ')}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.reference}</td>
                  <td className="px-3 py-2">{r.categoryLabel ?? <span className="text-ink-muted">—</span>}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.attendeeCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.confirmed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.tentative}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.declined}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {r.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Active</Badge>}
                      {r.lateRegistration && <Badge tone="warning">Late</Badge>}
                      <SourceBadge source={r.source} />
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{formatInZone(r.createdAt, tz, { weekday: undefined })}</td>
                </tr>
                {isOpen(r.id) && r.people.length > 0 && (
                  <tr id={`people-${r.id}`} className="bg-canvas/60">
                    <td colSpan={9} className="px-3 pb-3 pl-9 pt-1">
                      <PeopleChips people={r.people} />
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <ul className="flex flex-col gap-2 md:hidden print:hidden">
        {data.items.map((r) => (
          <li key={r.id}>
            <Card as="article" className="!p-3 sm:!p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={r.id} className="font-semibold">
                    {r.representativeName}
                  </Link>
                  <p className="font-mono text-xs text-ink-muted">{r.reference}</p>
                  {r.matchedAttendees && <p className="text-sm">Matches: {r.matchedAttendees.join(', ')}</p>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.status === 'cancelled' && <Badge tone="danger">Cancelled</Badge>}
                  {r.lateRegistration && <Badge tone="warning">Late</Badge>}
                  <SourceBadge source={r.source} long />
                  {r.categoryLabel && <Badge>{r.categoryLabel}</Badge>}
                </div>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {r.confirmed} attending · {r.tentative} maybe · {r.declined} not attending · contact by {r.preferredContact} · {formatInZone(r.createdAt, tz)}
              </p>
              {r.people.length > 0 && (
                <details className="mt-2" open={showAll || undefined}>
                  <summary className="cursor-pointer text-sm font-semibold text-brand-strong">
                    {r.people.length} {r.people.length === 1 ? 'person' : 'people'}
                  </summary>
                  <div className="mt-2">
                    <PeopleChips people={r.people} />
                  </div>
                </details>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <Pagination page={page} pages={pages} setParam={setParam} />
    </>
  );
}

function PeopleChips({ people }: { people: AdminRegistrationList['items'][number]['people'] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {people.map((p, i) => (
        <li key={i} className={cx('flex items-center gap-1.5 text-sm', p.rsvp === 'declined' && 'text-ink-muted line-through decoration-ink-muted/40')}>
          <span>{p.fullName}</span>
          {p.ageCategory === 'child' && <Badge tone="brand">Child</Badge>}
          {p.rsvp !== 'confirmed' && <RsvpBadge rsvp={p.rsvp} />}
        </li>
      ))}
    </ul>
  );
}

function PeopleView({ params, setParam }: { params: Params; setParam: (k: string, v: string) => void }) {
  const { event } = useAdminEvent();
  const query = Object.fromEntries([...params.entries()].filter(([k]) => k !== 'view'));
  const { data, loading, error } = useAsync(
    (signal) => api<AdminAttendeeList>(`/admin/events/${event.id}/attendees`, { query: { limit: 500, ...query }, signal }),
    [event.id, params.toString()],
  );
  const page = Number(params.get('page') ?? 1);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const tz = event.timezone;
  const offset = data ? (data.page - 1) * data.limit : 0;

  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (!data) return loading ? <Spinner /> : null;
  return (
    <>
      <SummaryBar s={data.summary} view="people" />
      <p className="no-print text-sm text-ink-muted">
        {data.total} {data.total === 1 ? 'person' : 'people'} from {data.summary.households} household{data.summary.households === 1 ? '' : 's'}
      </p>
      {data.items.length === 0 && <p className="text-ink-muted">No one matches these filters.</p>}
      {data.items.length > 0 && (
        <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-line bg-white md:block print:block">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Everyone signed up</caption>
            <thead className="bg-canvas text-ink-muted">
              <tr>
                <th scope="col" className="w-10 px-3 py-2 text-right font-semibold">#</th>
                <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                <th scope="col" className="px-3 py-2 font-semibold">Age</th>
                <th scope="col" className="px-3 py-2 font-semibold">Response</th>
                <th scope="col" className="px-3 py-2 font-semibold">Branch</th>
                <th scope="col" className="px-3 py-2 font-semibold">Household</th>
                <th scope="col" className="px-3 py-2 font-semibold">Registered</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p, i) => (
                <tr key={p.id} className="break-inside-avoid border-t border-line hover:bg-canvas">
                  <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{offset + i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="font-semibold">{p.fullName}</span>
                    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                      {p.registrationStatus === 'cancelled' && <Badge tone="danger">Cancelled</Badge>}
                      {p.checkedInAt && <Badge tone="success">Checked in</Badge>}
                      {p.walkIn && <Badge tone="brand">Walk-in</Badge>}
                    </span>
                  </td>
                  <td className="px-3 py-2">{p.ageCategory === 'child' ? 'Child' : 'Adult'}</td>
                  <td className="px-3 py-2">
                    <RsvpBadge rsvp={p.rsvp} />
                  </td>
                  <td className="px-3 py-2">{p.branchLabel ?? <span className="text-ink-muted">—</span>}</td>
                  <td className="px-3 py-2">
                    <Link to={p.registrationId}>{p.representativeName}</Link>
                    <span className="block font-mono text-xs text-ink-muted">{p.reference}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{formatInZone(p.registeredAt, tz, { weekday: undefined })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="flex flex-col gap-2 md:hidden print:hidden">
        {data.items.map((p) => (
          <li key={p.id}>
            <Card as="article" className="!p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold">{p.fullName}</p>
                <div className="flex flex-wrap gap-1">
                  <RsvpBadge rsvp={p.rsvp} />
                  {p.ageCategory === 'child' && <Badge tone="brand">Child</Badge>}
                  {p.registrationStatus === 'cancelled' && <Badge tone="danger">Cancelled</Badge>}
                  {p.checkedInAt && <Badge tone="success">Checked in</Badge>}
                </div>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                <Link to={p.registrationId}>{p.representativeName}</Link> · {p.branchLabel ?? 'Branch not specified'}
              </p>
            </Card>
          </li>
        ))}
      </ul>
      <Pagination page={page} pages={pages} setParam={setParam} />
    </>
  );
}
