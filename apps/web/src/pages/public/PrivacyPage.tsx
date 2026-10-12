import { Alert, Card, PageTitle, Spinner } from '../../components/ui';
import { usePublicEvent } from '../../lib/publicData';

export default function PrivacyPage() {
  const { data: event, loading, error } = usePublicEvent(undefined);
  return (
    <div>
      <PageTitle>Privacy notice</PageTitle>
      {loading && <Spinner />}
      {error && <Alert tone="error">Could not load the privacy notice.</Alert>}
      {event && (
        <Card>
          {!event.privacyNoticeApproved && (
            <Alert tone="warning" title="Draft notice" className="mb-4">
              This notice is awaiting approval by the event organizers.
            </Alert>
          )}
          <h2 className="mb-2 text-lg font-semibold">{event.title}</h2>
          <div className="whitespace-pre-line">{event.privacyNotice || 'The organizers have not published a privacy notice yet.'}</div>
          <p className="mt-4 text-sm text-ink-muted">Notice version {event.consentVersion}</p>
        </Card>
      )}
    </div>
  );
}
