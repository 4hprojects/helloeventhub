import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatInZone, type AdminRegistrationListItem, type Paginated } from '@heh/contracts';
import { Alert, Badge, Button, Card, SelectField, Spinner, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useAdminEvent } from './AdminShell';

export default function RegistrationsPage() {
  const { event } = useAdminEvent();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = Object.fromEntries(params.entries());
  const { data, loading, error } = useAsync(
    (signal) => api<Paginated<AdminRegistrationListItem>>(`/admin/events/${event.id}/registrations`, { query: { limit: 25, ...query }, signal }),
    [event.id, params.toString()],
  );
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k !== 'page') p.delete('page');
    setParams(p);
  };
  const page = Number(params.get('page') ?? 1);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Registrations</h1>
      <Card>
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
              <TextField label="Search" hint="Name, reference (HEH-…), email or mobile" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
            </div>
            <Button type="submit">
              <Search className="size-4" aria-hidden /> Search
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <SelectField label="Branch" value={params.get('categoryId') ?? ''} onChange={(e) => setParam('categoryId', e.target.value)}>
              <option value="">All</option>
              {event.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
              <option value="none">Not specified</option>
            </SelectField>
            <SelectField label="Has someone who is" value={params.get('rsvp') ?? ''} onChange={(e) => setParam('rsvp', e.target.value)}>
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
            <SelectField label="Timing" value={params.get('late') ?? ''} onChange={(e) => setParam('late', e.target.value)}>
              <option value="">Any</option>
              <option value="false">On time</option>
              <option value="true">Late</option>
            </SelectField>
          </div>
        </form>
      </Card>
      {error && <Alert tone="error">{error.message}</Alert>}
      {loading && !data && <Spinner />}
      {data && (
        <>
          <p className="text-sm text-ink-muted" aria-live="polite">
            {data.total} registration{data.total === 1 ? '' : 's'}
          </p>
          <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-line bg-white md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Registrations</caption>
              <thead className="bg-canvas text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Household</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Reference</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Branch</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Attending</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Maybe</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Not</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Registered</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="border-t border-line hover:bg-canvas">
                    <td className="px-3 py-2">
                      <Link to={r.id} className="font-semibold">{r.representativeName}</Link>
                      {r.matchedAttendees && <span className="block text-xs text-ink-muted">Matches: {r.matchedAttendees.join(', ')}</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.reference}</td>
                    <td className="px-3 py-2">{r.categoryLabel ?? <span className="text-ink-muted">—</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.confirmed}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.tentative}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.declined}</td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        {r.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Active</Badge>}
                        {r.lateRegistration && <Badge tone="warning">Late</Badge>}
                        {r.source !== 'public' && <Badge tone="brand">{r.source === 'committee' ? 'Staff' : 'Walk-in'}</Badge>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{formatInZone(r.createdAt, event.timezone, { weekday: undefined })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
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
                      {r.source !== 'public' && <Badge tone="brand">{r.source === 'committee' ? 'Staff entry' : 'Walk-in'}</Badge>}
                      {r.categoryLabel && <Badge>{r.categoryLabel}</Badge>}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    {r.confirmed} attending · {r.tentative} maybe · {r.declined} not attending · contact by {r.preferredContact} · {formatInZone(r.createdAt, event.timezone)}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-2">
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
          )}
        </>
      )}
    </div>
  );
}
