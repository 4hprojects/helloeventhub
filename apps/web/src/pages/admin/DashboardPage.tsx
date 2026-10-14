import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatInZone, type DashboardDto } from '@heh/contracts';
import { Alert, Card, Spinner, Stat } from '../../components/ui';
import { OrganizerEventShare } from '../../components/EventSharing';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { RefreshButton, useAdminEvent } from './AdminShell';

export default function DashboardPage() {
  const { event, isAdmin } = useAdminEvent();
  const { data: d, loading, error, reload } = useAsync((signal) => api<DashboardDto>(`/admin/events/${event.id}/dashboard`, { signal }), [event.id]);
  useEffect(() => {
    const t = setInterval(reload, 60_000);
    return () => clearInterval(t);
  }, [reload]);
  if (!d && loading) return <Spinner />;
  if (error && !d) return <Alert tone="error">{error.message}</Alert>;
  if (!d) return null;
  // Largest branches first; "Not specified" always last so real branches are easy to compare.
  const branchRows = [...d.byCategory].sort((a, b) => (a.categoryId === null ? 1 : b.categoryId === null ? -1 : b.potential - a.potential || a.label.localeCompare(b.label)));
  const maxPotential = Math.max(0, ...branchRows.map((c) => c.potential));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Headcount</h1>
          <p className="text-sm text-ink-muted">
            As of {formatInZone(d.asOf, d.timezone, { second: '2-digit' })} ({d.timezone}). Counts people listed on active registrations.
          </p>
        </div>
        <RefreshButton onClick={reload} loading={loading} />
      </div>
      {event.registrationStatus !== 'open' && (
        <Alert tone="warning" title={`Online registration is ${event.registrationStatus}`}>
          {isAdmin ? <Link to="settings">Change in Settings</Link> : 'An event admin can open it in Settings.'}
        </Alert>
      )}
      <OrganizerEventShare slug={event.slug} title={event.title} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Potential (attending + maybe)" value={d.potential} tone="brand" />
        <Stat label="Attending" value={d.confirmed} hint={`${d.confirmedAdults} adults · ${d.confirmedChildren} children`} />
        <Stat label="Maybe" value={d.tentative} hint={`${d.tentativeAdults} adults · ${d.tentativeChildren} children`} />
        <Stat label="Not attending" value={d.declined} />
        <Stat label="Household forms" value={d.activeRegistrations} />
        <Stat label="Late registrations" value={d.lateRegistrations} />
        <Stat label="Possible duplicates" value={d.openDuplicateFlags} hint={d.openDuplicateFlags ? 'Needs review' : undefined} />
        <Stat label="Failed emails" value={d.failedEmails} />
      </div>
      <section aria-labelledby="eventday-h">
        <h2 id="eventday-h" className="mb-2 text-lg font-semibold">Event day</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Checked in" value={d.checkedIn} hint={d.potential ? `${Math.round((d.checkedIn / Math.max(d.potential, 1)) * 100)}% of potential` : undefined} tone="brand" />
          <Stat label="Walk-ins" value={d.walkIns} hint="Added at the venue" />
          <div className="col-span-2 rounded-[var(--radius-card)] border border-line bg-white p-4">
            <p className="text-sm font-medium text-ink-muted">Venue sync</p>
            <p className="mt-1 font-semibold">{d.venueLastSyncAt ? `Last synced ${formatInZone(d.venueLastSyncAt, d.timezone)}` : 'No venue device has synced yet'}</p>
            <p className="mt-1 text-xs text-ink-muted">Check-ins made offline appear here after the venue laptop syncs.</p>
          </div>
        </div>
      </section>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">By family branch</h2>
        {/* Focusable so keyboard users can scroll the table sideways on narrow screens. */}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Headcount by family branch (scrollable)">
          <table className="w-full min-w-[420px] text-left text-sm">
            <caption className="sr-only">Headcount by family branch</caption>
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th scope="col" className="py-2 pr-2">Branch</th>
                <th scope="col" className="py-2 pr-2 text-right">Attending</th>
                <th scope="col" className="py-2 pr-2 text-right">Maybe</th>
                <th scope="col" className="py-2 pr-2 text-right">Not attending</th>
                <th scope="col" className="py-2 text-right">Potential</th>
              </tr>
            </thead>
            <tbody>
              {branchRows.map((c) => (
                <tr key={c.categoryId ?? 'none'} className="border-b border-line/60">
                  <th scope="row" className="py-2 pr-2 font-medium">
                    <span className="block">{c.label}</span>
                    <span aria-hidden className="mt-1 block h-1.5 rounded-full bg-brand-ice">
                      <span className="block h-1.5 rounded-full bg-brand" style={{ width: `${maxPotential ? (c.potential / maxPotential) * 100 : 0}%` }} />
                    </span>
                  </th>
                  <td className="py-2 pr-2 text-right tabular-nums">{c.confirmed}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{c.tentative}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{c.declined}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{c.potential}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Recent registrations</h2>
        {d.recent.length === 0 ? (
          <p className="text-ink-muted">No registrations yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link to={`registrations/${r.id}`}>
                  {r.representativeName} <span className="font-mono text-xs text-ink-muted">{r.reference}</span>
                </Link>
                <span className="text-sm text-ink-muted">
                  {r.attendeeCount} {r.attendeeCount === 1 ? 'person' : 'people'} · {formatInZone(r.createdAt, d.timezone)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
