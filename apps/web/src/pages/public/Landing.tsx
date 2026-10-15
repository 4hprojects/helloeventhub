import { CloudOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Spinner } from '../../components/ui';
import { usePublicEvent } from '../../lib/publicData';
import { EventFacts } from './EventDetails';

export default function Landing() {
  const { data: event, error, loading, reload } = usePublicEvent(undefined);
  const [retrying, setRetrying] = useState(false);
  const showRecovery = Boolean(error) || retrying;

  useEffect(() => {
    if (retrying && !loading) setRetrying(false);
  }, [loading, retrying]);

  function retry() {
    setRetrying(true);
    reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <img src="/brand/logo-stacked.svg" alt="" className="mx-auto h-28 w-auto" width={180} height={112} />
        <p className="mt-2 font-display text-lg text-ink-muted">Plan. Register. Connect.</p>
      </div>
      {loading && !showRecovery && <Spinner label="Loading event details…" />}
      {showRecovery && (
        <section
          role="alert"
          aria-labelledby="event-load-heading"
          className="mx-auto w-full max-w-xl rounded-[var(--radius-card)] bg-brand-ice p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <CloudOff className="mt-1 size-6 shrink-0 text-brand-deep" aria-hidden />
            <div className="min-w-0">
              <h1 id="event-load-heading" className="text-balance text-xl font-semibold text-brand-deep sm:text-2xl">
                We can’t show the event details right now
              </h1>
              <p className="mt-2 max-w-prose text-pretty text-ink-muted">
                Check your connection and try again. If the problem continues, contact the organizers for help.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button className="w-full sm:w-auto" loading={retrying} onClick={retry}>
              {retrying ? 'Trying again…' : 'Try again'}
            </Button>
            <Link
              to="/contact"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] border border-line bg-white px-5 font-semibold text-brand-deep no-underline hover:bg-white/70 hover:no-underline sm:w-auto"
            >
              Contact the organizers
            </Link>
          </div>
        </section>
      )}
      {event && !showRecovery && (
        <Card>
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <div className="mt-4">
            <EventFacts event={event} />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={`/events/${event.slug}`} className="inline-flex min-h-12 items-center rounded-[10px] bg-brand-strong px-5 font-semibold text-white no-underline hover:bg-brand-deep hover:no-underline">
              {event.registrationOpen ? 'View event & register' : 'View event details'}
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
