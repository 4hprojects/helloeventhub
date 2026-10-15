import { Link, NavLink, Outlet } from 'react-router-dom';
import { usePublicConfig } from '../lib/publicData';
import { cx } from './ui';

export function SkipLink() {
  return (
    <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
      Skip to main content
    </a>
  );
}

/** Celebration Pine mark + live-text wordmark (doc 13: "Hello" in Glacier Blue, "EventHub" in ink). Readable at any size. */
export function Brand({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img src="/brand/logo-symbol.svg" alt="" className={size === 'sm' ? 'size-8' : 'size-9'} width={36} height={36} />
      <span className={`font-display font-bold tracking-tight ${size === 'sm' ? 'text-lg' : 'text-lg sm:text-xl'}`}>
        <span className="text-brand-strong">Hello</span>
        <span className="text-ink">EventHub</span>
      </span>
    </span>
  );
}

export function PublicLayout() {
  const { data: config } = usePublicConfig();
  const eventPath = config ? `/events/${config.primaryEventSlug}` : '/';
  const navClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      'inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium no-underline hover:bg-brand-ice hover:no-underline',
      isActive ? 'bg-brand-ice text-brand-deep underline decoration-2 underline-offset-4' : 'text-ink',
    );
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="no-print border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-3 px-4 py-3 sm:flex-nowrap">
          <Link to="/" aria-label="HelloEventHub home" className="shrink-0 no-underline hover:no-underline">
            <Brand />
          </Link>
          <nav aria-label="Public" className="order-2 mt-2 flex w-full items-center justify-between gap-1 border-t border-line pt-2 sm:order-none sm:mt-0 sm:w-auto sm:justify-end sm:border-0 sm:pt-0">
            <NavLink to={eventPath} className={navClass}>
              Event
            </NavLink>
            <NavLink to="/registration/manage" className={navClass}>
              <span className="sm:hidden">My registration</span>
              <span className="hidden sm:inline">Manage registration</span>
            </NavLink>
            <NavLink to="/contact" className={navClass}>
              Help
            </NavLink>
            <Link
              to="/admin/login"
              aria-label="Organizer sign in"
              className="ml-1 inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-[10px] border border-line bg-white px-1 text-sm font-semibold text-brand-deep no-underline hover:bg-brand-ice hover:no-underline sm:px-3"
            >
              <span className="sm:hidden" aria-hidden="true">Sign in</span>
              <span className="hidden sm:inline" aria-hidden="true">Organizer sign in</span>
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>
      <footer className="no-print border-t border-line bg-white">
        <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6 text-sm text-ink-muted sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <p className="font-semibold text-ink">HelloEventHub · Plan. Register. Connect.</p>
            <p className="mt-1 max-w-md">A simple way for families to view event details, register a household, and keep attendance up to date.</p>
          </div>
          <nav aria-label="Site information" className="flex flex-wrap gap-x-4 gap-y-1 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
            <Link to="/about">About</Link>
            <Link to={eventPath}>Event</Link>
            <Link to="/contact">Help &amp; contact</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/admin/login">Organizer sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
