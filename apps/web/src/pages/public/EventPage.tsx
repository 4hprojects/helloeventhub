import { CalendarPlus } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { formatDateInZone, type PublicEvent } from '@heh/contracts';
import { Alert, Card, Spinner } from '../../components/ui';
import { usePublicEvent } from '../../lib/publicData';
import { EventFacts } from './EventDetails';
import { ContactInfo } from './ContactPage';

export default function EventPage() {
  const { slug } = useParams();
  const { data: event, error, loading } = usePublicEvent(slug);
  if (loading) return <Spinner />;
  if (error || !event) return <Alert tone="error" title="Event not found">Check the link you were given, or contact the organizers.</Alert>;
  return (
    <article className="flex flex-col gap-6">
      <header className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-brand-deep via-brand-strong to-brand px-4 pb-5 pt-12 sm:px-6 sm:pt-16">
        {/* Decorative: faint Celebration Pine mark and celebration accents (doc 13: coral/amber are accents only). */}
        <img src="/brand/logo-symbol-white.svg" alt="" aria-hidden className="pointer-events-none absolute -right-6 -top-4 h-44 w-44 opacity-15 sm:h-56 sm:w-56" width={224} height={224} />
        <span aria-hidden className="absolute left-6 top-5 size-2 rounded-full bg-brand-amber" />
        <span aria-hidden className="absolute left-11 top-9 size-1.5 rounded-full bg-brand-coral" />
        <h1 className="relative text-2xl font-bold text-white sm:text-3xl">{event.title}</h1>
        <p className="relative mt-1 font-medium text-white/90">{formatDateInZone(event.startsAt, event.timezone)}</p>
      </header>
      <Card>
        <EventFacts event={event} />
        <button
          type="button"
          onClick={() => downloadIcs(event)}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line px-3 text-sm font-semibold text-brand-deep hover:bg-brand-ice"
        >
          <CalendarPlus className="size-4" aria-hidden /> Add to calendar
        </button>
      </Card>
      {event.description && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold">About</h2>
          <p className="whitespace-pre-line">{event.description}</p>
        </Card>
      )}
      <Card>
        <h2 className="text-lg font-semibold">Online pre-registration</h2>
        {event.registrationOpen ? (
          <>
            <p className="mt-2">
              Register your household so the organizers can plan food and seating. It takes about 3 minutes. No account needed.
            </p>
            {event.registrationMessage && <Alert tone="warning" className="mt-3">{event.registrationMessage}</Alert>}
            <Link
              to={`/events/${event.slug}/register`}
              className="mt-4 inline-flex min-h-12 items-center rounded-[10px] bg-brand-strong px-5 font-semibold text-white no-underline hover:bg-brand-deep hover:no-underline"
            >
              Register now
            </Link>
            <p className="mt-3 text-sm text-ink-muted">
              Already registered? <Link to="/registration/manage">View or change your registration</Link>.
            </p>
          </>
        ) : (
          <Alert tone="info" className="mt-2">{event.registrationMessage ?? 'Online registration is not open.'}</Alert>
        )}
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Questions?</h2>
        <ContactInfo event={event} />
      </Card>
    </article>
  );
}

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (t: string) => t.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** Client-side .ics so attendees can save the date (times in UTC; calendars convert to local time). */
function downloadIcs(event: PublicEvent) {
  const location = [event.venueName, event.venueAddress].filter(Boolean).join(', ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HelloEventHub//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@helloeventhub.online`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(event.onsiteRegistrationStartsAt)}`,
    `DTEND:${icsDate(event.endsAt)}`,
    `SUMMARY:${icsText(event.title)}`,
    ...(location ? [`LOCATION:${icsText(location)}`] : []),
    `DESCRIPTION:${icsText(`On-site registration opens at the start time. Event page: ${window.location.origin}/events/${event.slug}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.slug}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
