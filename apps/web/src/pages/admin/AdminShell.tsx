import { LogOut, RefreshCw, UserCog, WifiOff } from 'lucide-react';
import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import type { AdminEventDto } from '@heh/contracts';
import { Brand, SkipLink } from '../../components/Layout';
import { Alert, Button, Spinner, cx } from '../../components/ui';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useAsync } from '../../lib/useAsync';

export function RequireAuth() {
  const { user, loading } = useSession();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  // Temporary password: nothing else works until the person sets their own.
  if (user.mustChangePassword && location.pathname !== '/admin/account') return <Navigate to="/admin/account" replace />;
  return <Outlet />;
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function AdminFrame({ children, nav }: { children: React.ReactNode; nav?: React.ReactNode }) {
  const { user, logout } = useSession();
  const online = useOnline();
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="no-print border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <Link to="/admin" aria-label="Admin home" className="no-underline hover:no-underline">
            <Brand size="sm" />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-ink-muted sm:inline">{user?.name}</span>
            <Link to="/admin/account" className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 px-2" aria-label="Account">
              <UserCog className="size-4" aria-hidden /> <span className="hidden sm:inline">Account</span>
            </Link>
            <Button variant="ghost" size="sm" onClick={() => void logout()} aria-label="Sign out" className="min-w-10">
              <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
        {nav}
      </header>
      {!online && (
        <div role="alert" className="bg-danger px-4 py-2 text-center font-semibold text-white">
          <WifiOff className="mr-2 inline size-4" aria-hidden /> You are offline. Changes cannot be saved until the connection returns.
        </div>
      )}
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}

export function AdminHome() {
  const { data, loading, error } = useAsync((signal) => api<{ items: Array<{ id: string; title: string; role: string }> }>('/admin/events', { signal }), []);
  if (loading) return <AdminFrame><Spinner /></AdminFrame>;
  if (error) return <AdminFrame><Alert tone="error">{error.message}</Alert></AdminFrame>;
  if (data?.items.length === 1) return <Navigate to={`/admin/events/${data.items[0]!.id}`} replace />;
  return (
    <AdminFrame>
      <h1 className="mb-4 text-2xl font-bold">Your events</h1>
      {data?.items.length === 0 && <Alert tone="info">You don't have access to any events yet. Ask an event admin to grant access.</Alert>}
      <ul className="flex flex-col gap-2">
        {data?.items.map((e) => (
          <li key={e.id}>
            <Link to={`/admin/events/${e.id}`}>{e.title}</Link> <span className="text-sm text-ink-muted">({e.role.replace('_', ' ')})</span>
          </li>
        ))}
      </ul>
    </AdminFrame>
  );
}

interface EventCtx {
  event: AdminEventDto;
  isAdmin: boolean;
  reload: () => void;
}
const EventContext = createContext<EventCtx | null>(null);
export function useAdminEvent() {
  const c = useContext(EventContext);
  if (!c) throw new Error('useAdminEvent outside provider');
  return c;
}

export function AdminEventLayout() {
  const { eventId } = useParams();
  const { data: event, loading, error, reload } = useAsync((signal) => api<AdminEventDto>(`/admin/events/${eventId}`, { signal }), [eventId]);
  if (loading && !event) return <AdminFrame><Spinner /></AdminFrame>;
  if (error || !event) return <AdminFrame><Alert tone="error">{error?.message ?? 'Event not found'}</Alert></AdminFrame>;
  const isAdmin = event.role === 'event_admin';
  const base = `/admin/events/${event.id}`;
  const links: Array<[string, string, boolean]> = [
    ['', 'Dashboard', true],
    ['registrations', 'Registrations', true],
    ['registrations/new', 'Add registration', true],
    ['exports', 'Exports', isAdmin],
    ['duplicates', 'Duplicates', isAdmin],
    ['snapshots', 'Snapshots', isAdmin],
    ['emails', 'Emails', isAdmin],
    ['venue', 'Venue', isAdmin],
    ['staff', 'Staff', isAdmin],
    ['settings', 'Settings', isAdmin],
  ];
  const nav = (
    <nav aria-label="Event" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4">
        <p className="pt-2 text-sm font-semibold text-ink">{event.title}</p>
        <ul className="-mx-4 flex gap-x-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {links
            .filter(([, , show]) => show)
            .map(([to, label]) => (
              <li key={to} className="shrink-0">
                <NavLink
                  end={to === '' || to === 'registrations'}
                  to={to ? `${base}/${to}` : base}
                  ref={(el) => {
                    // Keep the current section visible in the scroll strip on phones.
                    // Only the strip scrolls (horizontally); the page itself never moves.
                    const strip = el?.closest('ul');
                    if (el && strip && el.getAttribute('aria-current') === 'page' && strip.scrollWidth > strip.clientWidth) {
                      strip.scrollLeft = Math.max(0, el.offsetLeft - strip.offsetLeft - 16);
                    }
                  }}
                  className={({ isActive }) => cx('inline-flex min-h-10 items-center whitespace-nowrap rounded px-2 text-sm font-medium no-underline hover:bg-brand-ice hover:no-underline', isActive ? 'bg-brand-ice text-brand-deep' : 'text-ink')}
                >
                  {label}
                </NavLink>
              </li>
            ))}
        </ul>
      </div>
    </nav>
  );
  return (
    <EventContext.Provider value={{ event, isAdmin, reload }}>
      <AdminFrame nav={nav}>
        <Outlet />
      </AdminFrame>
    </EventContext.Provider>
  );
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} loading={loading}>
      {!loading && <RefreshCw className="size-4" aria-hidden />} Refresh
    </Button>
  );
}

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAdminEvent();
  if (!isAdmin) return <Alert tone="warning">Only event admins can open this page.</Alert>;
  return <>{children}</>;
}
