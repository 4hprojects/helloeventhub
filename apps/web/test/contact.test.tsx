import { render, screen } from '@testing-library/react';
import type { PublicEvent } from '@heh/contracts';
import { describe, expect, it } from 'vitest';
import { ContactInfo } from '../src/pages/public/ContactPage';

function eventWithContact(contactInfo: PublicEvent['contactInfo']): PublicEvent {
  return { contactInfo } as PublicEvent;
}

describe('organizer contact', () => {
  it('shows the organizer note while contact channels are still pending', () => {
    render(
      <ContactInfo
        event={eventWithContact({ note: 'Organizer: Ruby Sagorsor. Contact details will be added soon.' })}
      />,
    );

    expect(
      screen.getByText('Organizer: Ruby Sagorsor. Contact details will be added soon.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Organizer contact details will be posted here soon.')).not.toBeInTheDocument();
  });

  it('keeps the generic pending message when no organizer information exists', () => {
    render(<ContactInfo event={eventWithContact({})} />);

    expect(screen.getByText('Organizer contact details will be posted here soon.')).toBeInTheDocument();
  });
});
