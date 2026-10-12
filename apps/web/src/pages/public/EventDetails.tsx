import { CalendarDays, Clock, MapPin } from 'lucide-react';
import { formatDateInZone, formatTimeInZone, type PublicEvent } from '@heh/contracts';

export function EventFacts({ event }: { event: PublicEvent }) {
  const tz = event.timezone;
  return (
    <dl className="grid gap-3 text-base sm:grid-cols-2">
      <div>
        <dt className="sr-only">Date</dt>
        <dd className="flex gap-3 font-semibold">
          <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
          {formatDateInZone(event.startsAt, tz)}
        </dd>
      </div>
      <div>
        <dt className="sr-only">Time</dt>
        <dd className="flex gap-3">
          <Clock className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
          <span>
            On-site registration from <strong>{formatTimeInZone(event.onsiteRegistrationStartsAt, tz)}</strong>
            <br />
            Program {formatTimeInZone(event.startsAt, tz)} – {formatTimeInZone(event.endsAt, tz)}
          </span>
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="sr-only">Venue</dt>
        <dd className="flex gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
          <span>
            {event.venueName ? (
              <>
                <span className="font-semibold">{event.venueName}</span>
                {event.venueAddress && <span className="block text-ink-muted">{event.venueAddress}</span>}
                {event.venueMapUrl && (
                  <a href={event.venueMapUrl} target="_blank" rel="noopener noreferrer" className="block">
                    Open map
                  </a>
                )}
              </>
            ) : (
              <span className="text-ink-muted">Venue to be announced</span>
            )}
          </span>
        </dd>
      </div>
    </dl>
  );
}
