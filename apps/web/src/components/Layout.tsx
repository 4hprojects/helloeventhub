import { Link, Outlet } from 'react-router-dom';

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
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="no-print border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" aria-label="HelloEventHub home" className="shrink-0 no-underline hover:no-underline">
            <Brand />
          </Link>
          <nav aria-label="Help" className="flex shrink-0 gap-3 text-sm sm:gap-4 [&_a]:no-underline [&_a:hover]:underline">
            <Link to="/registration/manage">
              <span className="sm:hidden">My registration</span>
              <span className="hidden sm:inline">Manage registration</span>
            </Link>
            {/* Footer already links to Contact; hide here on the narrowest phones to avoid overflow. */}
            <Link to="/contact" className="hidden min-[360px]:inline">
              Help
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>
      <footer className="no-print border-t border-line bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-ink-muted">
          <p>HelloEventHub · Plan. Register. Connect.</p>
          <nav aria-label="Legal" className="flex gap-4">
            <Link to="/privacy">Privacy</Link>
            <Link to="/contact">Contact</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
