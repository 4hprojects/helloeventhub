import { CalendarPlus } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { formatDateInZone, type PublicEvent } from '@heh/contracts';
import { Alert, Card, Spinner } from '../../components/ui';
import { ShareEventButton } from '../../components/EventSharing';
import { usePublicEvent } from '../../lib/publicData';
import { EventFacts } from './EventDetails';
import { ContactInfo } from './ContactPage';

export default function EventPage() {
  const { slug } = useParams();
  const { data: event, error, loading } = usePublicEvent(slug);
  if (loading) return <Spinner />;
  if (error || !event) return <Alert tone="error" title="Event not found">Check the link you were given, or contact the organizers.</Alert>;
  return (
    <article className="flex flex-col gap-6 sm:gap-8">
      <header className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-brand-deep via-brand-strong to-brand px-5 pb-8 pt-12 sm:px-8 sm:pb-10 sm:pt-14">
        {/* Decorative: faint Celebration Pine mark and celebration accents (doc 13: coral/amber are accents only). */}
        <img src="/brand/logo-symbol-white.svg" alt="" aria-hidden className="pointer-events-none absolute -right-6 -top-4 h-44 w-44 opacity-15 sm:h-56 sm:w-56" width={224} height={224} />
        <span aria-hidden className="absolute left-6 top-5 size-2 rounded-full bg-brand-amber" />
        <span aria-hidden className="absolute left-11 top-9 size-1.5 rounded-full bg-brand-coral" />
        <div className="relative max-w-xl">
          <p className="mb-2 font-semibold text-white/90">{formatDateInZone(event.startsAt, event.timezone)}</p>
          <h1 className="text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">{event.title}</h1>
        </div>
      </header>

      <section className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[0_1px_2px_rgba(36,51,72,0.06)]">
        <div className="p-4 sm:p-6">
          <EventFacts event={event} />
          <div className="mt-5 flex flex-wrap items-start gap-2">
            <button
              type="button"
              onClick={() => downloadIcs(event)}
              className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line px-3 text-sm font-semibold text-brand-deep transition-colors hover:bg-brand-ice"
            >
              <CalendarPlus className="size-4" aria-hidden /> Add to calendar
            </button>
            <ShareEventButton slug={event.slug} title={event.title} />
          </div>
        </div>

        <section aria-labelledby="registration-heading" className="border-t border-line bg-brand-ice/50 p-4 sm:p-6">
          <h2 id="registration-heading" className="text-xl font-semibold">Online pre-registration</h2>
          {event.registrationOpen ? (
            <>
              <p className="mt-2 max-w-prose text-pretty">
                Register your household so the organizers can plan food and seating. It takes about 3 minutes, and no account is needed.
              </p>
              {event.registrationMessage && <Alert tone="warning" className="mt-4">{event.registrationMessage}</Alert>}
              <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Link
                  to={`/events/${event.slug}/register`}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-brand-strong px-5 font-semibold text-white no-underline transition-colors hover:bg-brand-deep hover:no-underline sm:w-auto"
                >
                  Register now
                </Link>
                <p className="text-sm text-ink-muted">
                  Already registered? <Link to="/registration/manage">View or change your registration</Link>.
                </p>
              </div>
            </>
          ) : (
            <Alert tone="info" title="Registration is not open yet" className="mt-3">
              {event.registrationMessage && event.registrationMessage !== 'Online registration is not open yet.'
                ? event.registrationMessage
                : 'Please check back here once the organizers announce that registration has opened.'}
            </Alert>
          )}
        </section>
      </section>

      <div className="grid items-start gap-6 sm:grid-cols-5">
        {event.description && (
          <Card className="sm:col-span-3">
            <h2 className="mb-2 text-lg font-semibold">About the reunion</h2>
            <p className="max-w-prose whitespace-pre-line text-pretty">{event.description}</p>
          </Card>
        )}
        <Card className={event.description ? 'sm:col-span-2' : 'sm:col-span-5'}>
          <h2 className="mb-2 text-lg font-semibold">Questions?</h2>
          <ContactInfo event={event} />
        </Card>
      </div>
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
