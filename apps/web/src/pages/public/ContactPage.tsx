import type { PublicEvent } from '@heh/contracts';
import { Alert, Card, PageTitle, Spinner } from '../../components/ui';
import { usePublicEvent } from '../../lib/publicData';

export function ContactInfo({ event }: { event: PublicEvent }) {
  const c = event.contactInfo;
  if (!c.email && !c.phone && !c.messenger) {
    return <p className="text-ink-muted">Organizer contact details will be posted here soon.</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {c.email && (
        <li>
          Email: <a href={`mailto:${c.email}`}>{c.email}</a>
        </li>
      )}
      {c.phone && (
        <li>
          Phone: <a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a>
        </li>
      )}
      {c.messenger && (
        <li>
          Messenger:{' '}
          {/^https:\/\//.test(c.messenger) ? (
            <a href={c.messenger} target="_blank" rel="noopener noreferrer">
              {c.messenger}
            </a>
          ) : (
            c.messenger
          )}
        </li>
      )}
      {c.note && <li className="mt-2 text-ink-muted">{c.note}</li>}
    </ul>
  );
}

export default function ContactPage() {
  const { data: event, loading, error } = usePublicEvent(undefined);
  return (
    <div>
      <PageTitle>Help &amp; contact</PageTitle>
      {loading && <Spinner />}
      {error && <Alert tone="error">Could not load contact details.</Alert>}
      {event && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold">{event.title}</h2>
          <ContactInfo event={event} />
          <p className="mt-4 text-sm text-ink-muted">
            Registered with a mobile number or Messenger only? Contact the organizers to change your registration — they will verify it's you first.
          </p>
        </Card>
      )}
    </div>
  );
}
