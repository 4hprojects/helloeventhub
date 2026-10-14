import { Card, PageTitle } from '../../components/ui';

export default function AboutPage() {
  return (
    <div>
      <PageTitle sub="Plan. Register. Connect.">About HelloEventHub</PageTitle>
      <Card className="flex flex-col gap-4">
        <p>
          HelloEventHub helps families view event details, send a household response, and keep attendance
          information up to date.
        </p>
        <div>
          <h2 className="text-lg font-semibold">No attendee account required</h2>
          <p className="mt-1 max-w-prose">
            You can register for a public event without creating an account or password. If you provide an
            email address, you can request a secure one-time link to view or change your registration.
            Otherwise, the event organizers can help after verifying your identity.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Who manages event information</h2>
          <p className="mt-1 max-w-prose">
            Each event's organizers manage its schedule, venue, contact details, registration settings, and
            participant information. Use the event's Help &amp; contact page when you have a question about a
            specific event or registration.
          </p>
        </div>
      </Card>
    </div>
  );
}
