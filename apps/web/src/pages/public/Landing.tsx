import { Link } from 'react-router-dom';
import { Alert, Button, Card, Spinner } from '../../components/ui';
import { usePublicEvent } from '../../lib/publicData';
import { EventFacts } from './EventDetails';

export default function Landing() {
  const { data: event, error, loading, reload } = usePublicEvent(undefined);
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <img src="/brand/logo-stacked.svg" alt="" className="mx-auto h-28 w-auto" width={180} height={112} />
        <p className="mt-2 font-display text-lg text-ink-muted">Plan. Register. Connect.</p>
      </div>
      {loading && <Spinner />}
      {error && (
        <Alert tone="error" title="We couldn't load the event">
          <p>The event details are temporarily unavailable. Please try again.</p>
          <Button className="mt-3" variant="secondary" size="sm" loading={loading} onClick={reload}>
            Try again
          </Button>
        </Alert>
      )}
      {event && (
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
