import { ArrowRight, CalendarPlus, Download, MapPin, UsersRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { formatDateInZone, type PublicEvent } from '@heh/contracts';
import { Alert, Card, Spinner } from '../../components/ui';
import { PublicEventShare, ShareEventButton } from '../../components/EventSharing';
import { useEventMetadata } from '../../lib/eventMetadata';
import { usePublicEvent } from '../../lib/publicData';
import { formatDeadline } from '../../lib/time';
import { EventFacts } from './EventDetails';
import { ContactInfo } from './ContactPage';

const POSTER_URL = '/events/mb-wa-reunion-2026/invitation-poster.png';

export default function EventPage() {
  const { slug } = useParams();
  const { data: event, error, loading } = usePublicEvent(slug);
  if (loading) return <Spinner />;
  if (error || !event)
    return (
      <Alert tone="error" title="Event not found">
        Check the link you were given, or contact the organizers.
      </Alert>
    );
  return <EventContent event={event} />;
}

function EventContent({ event }: { event: PublicEvent }) {
  useEventMetadata(event);
  const heritage = event.categories.filter((category) => category.label !== 'Other/Unsure');
  return (
    <article className="flex flex-col gap-6 sm:gap-8">
      <header className="relative overflow-hidden rounded-[var(--radius-card)] bg-heritage-deep px-5 pb-8 pt-10 text-cream shadow-[0_10px_30px_rgba(18,63,42,0.18)] sm:px-8 sm:pb-10 sm:pt-12">
        <img
          src="/events/mb-wa-reunion-2026/artwork-background.webp"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-luminosity"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-heritage-deep via-heritage-deep/95 to-heritage-deep/60"
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <p className="mb-3 inline-flex rounded-full bg-gold/20 px-3 py-1 text-sm font-semibold text-cream">
            {formatDateInZone(event.startsAt, event.timezone)}
          </p>
          <h1 className="text-balance text-3xl font-bold tracking-tight text-cream sm:text-4xl">
            {event.title}
          </h1>
          {event.tagline && (
            <p className="mt-4 max-w-xl font-display text-lg font-semibold text-gold-light sm:text-xl">
              {event.tagline}
            </p>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              to={`/events/${event.slug}/register`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-gold px-5 font-semibold text-heritage-deep no-underline hover:bg-gold-light hover:no-underline"
            >
              Start registration <ArrowRight className="size-4" aria-hidden />
            </Link>
            {event.venueMapUrl && (
              <a
                href={event.venueMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-cream/60 px-5 font-semibold text-cream no-underline hover:bg-cream/10 hover:no-underline"
              >
                <MapPin className="size-4" aria-hidden /> Get directions
              </a>
            )}
          </div>
        </div>
      </header>

      <section className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[0_1px_2px_rgba(36,51,72,0.06)]">
        <div className="p-4 sm:p-6">
          <h2 className="mb-4 text-xl font-semibold">Event essentials</h2>
          <EventFacts event={event} />
          {event.preregistrationDeadlineDate && (
            <div className="mt-5 rounded-[10px] bg-gold-soft p-4 text-sm text-heritage-deep">
              <strong>
                Online preregistration deadline: {formatDeadline(event.preregistrationDeadlineDate)}
              </strong>
              <p className="mt-1">
                You can still register after this planning date; late registrations and event-day walk-ins are
                welcome.
              </p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-start gap-2">
            <button
              type="button"
              onClick={() => downloadIcs(event)}
              className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line px-3 text-sm font-semibold text-brand-deep transition-colors hover:bg-brand-ice"
            >
              <CalendarPlus className="size-4" aria-hidden /> Add to calendar
            </button>
            <ShareEventButton slug={event.slug} title={event.title} />
            <a
              href={POSTER_URL}
              download="mb-wa-reunion-2026-invitation.png"
              className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line px-3 text-sm font-semibold no-underline hover:bg-brand-ice hover:no-underline"
            >
              <Download className="size-4" aria-hidden /> Download invitation
            </a>
          </div>
        </div>

        <section
          aria-labelledby="registration-heading"
          className="border-t border-line bg-brand-ice/50 p-4 sm:p-6"
        >
          <h2 id="registration-heading" className="text-xl font-semibold">
            Online preregistration
          </h2>
          {event.registrationOpen ? (
            <>
              <p className="mt-2 max-w-prose text-pretty">
                Register your household so the organizers can prepare for everyone. It takes about 3 minutes,
                and no account is needed.
              </p>
              {event.registrationMessage && (
                <Alert tone="warning" className="mt-4">
                  {event.registrationMessage}
                </Alert>
              )}
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
              {event.registrationMessage &&
              event.registrationMessage !== 'Online registration is not open yet.'
                ? event.registrationMessage
                : 'Please check back here once the organizers announce that registration has opened.'}
            </Alert>
          )}
        </section>
      </section>

      {event.description && (
        <Card>
          <h2 className="mb-2 text-xl font-semibold">You’re invited</h2>
          <p className="max-w-prose whitespace-pre-line text-pretty">{event.description}</p>
        </Card>
      )}

      {heritage.length > 0 && (
        <section
          aria-labelledby="heritage-heading"
          className="rounded-[var(--radius-card)] bg-cream p-4 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <UsersRound className="size-6 text-heritage" aria-hidden />
            <h2 id="heritage-heading" className="text-xl font-semibold text-heritage-deep">
              Our family heritage
            </h2>
          </div>
          <p className="mt-2 max-w-prose text-sm text-ink-muted">
            The eight supplied family branches and their associated names are listed as provided by the
            organizers.
          </p>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2">
            {heritage.map((category) => {
              const [branch, associated] = category.label.split(' — ');
              return (
                <li key={category.id} className="rounded-[10px] bg-white/85 p-4 shadow-sm">
                  <strong className="block text-heritage-deep">{branch}</strong>
                  {associated && (
                    <span className="mt-1 block text-sm text-ink-muted">Associated names: {associated}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {event.venueMapUrl && (
        <PublicEventShare slug={event.slug} title={event.title} mapsUrl={event.venueMapUrl} />
      )}
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Questions?</h2>
        <ContactInfo event={event} />
      </Card>
      <p className="text-center font-display text-lg font-semibold text-heritage-deep">
        Let’s come together, meet our relatives, and create new memories for generations to come!
      </p>
    </article>
  );
}

const icsDate = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const icsText = (t: string) => t.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

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
    `DESCRIPTION:${icsText(`On-site registration opens at 8:00 AM. Event page: https://helloeventhub.online/events/${event.slug}`)}`,
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
