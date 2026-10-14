import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toDataURL: vi.fn(),
  toString: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('qrcode', () => ({ default: { toDataURL: mocks.toDataURL, toString: mocks.toString } }));

import { OrganizerEventShare, PublicEventShare, ShareEventButton } from '../src/components/EventSharing';

describe('event sharing', () => {
  beforeEach(() => {
    mocks.toDataURL.mockReset().mockResolvedValue('data:image/png;base64,qr');
    mocks.toString.mockReset().mockResolvedValue('<svg></svg>');
    mocks.writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  it('copies the public event link when native sharing is unavailable', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
    render(<ShareEventButton slug="family-day" title="Family Day" />);

    await user.click(screen.getByRole('button', { name: 'Share event' }));

    expect(mocks.writeText).toHaveBeenCalledWith('http://localhost:3000/events/family-day');
    expect(screen.getByText('Event link copied.')).toBeInTheDocument();
  });

  it('creates organizer links and QR downloads for the event and registration pages', async () => {
    render(<OrganizerEventShare slug="family-day" title="Family Day" />);

    expect(screen.getByText('http://localhost:3000/events/family-day')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:3000/events/family-day/register')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'QR code for Family Day event page' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'QR code for Family Day registration form' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download event page QR code' })).toHaveAttribute(
      'download',
      'family-day-event-qr.png',
    );
    expect(screen.getByRole('link', { name: 'Download registration form QR code' })).toHaveAttribute(
      'download',
      'family-day-registration-qr.png',
    );
    await waitFor(() =>
      expect(mocks.toDataURL).toHaveBeenCalledWith(
        'http://localhost:3000/events/family-day',
        expect.objectContaining({ width: 1024, errorCorrectionLevel: 'H' }),
      ),
    );
    expect(mocks.toDataURL).toHaveBeenCalledWith(
      'http://localhost:3000/events/family-day/register',
      expect.objectContaining({ width: 1024, errorCorrectionLevel: 'H' }),
    );
  });

  it('creates public event and directions QRs with exact canonical targets', async () => {
    render(
      <PublicEventShare
        slug="mb-wa-reunion-2026"
        title="Clan Reunion"
        mapsUrl="https://maps.app.goo.gl/6NLwRQT4iLkmXosD6"
      />,
    );
    expect(screen.getByText('https://helloeventhub.online/events/mb-wa-reunion-2026')).toBeVisible();
    expect(screen.getByText('https://maps.app.goo.gl/6NLwRQT4iLkmXosD6')).toBeVisible();
    expect(await screen.findByRole('img', { name: /event and registration details/ })).toBeVisible();
    expect(screen.getByRole('img', { name: /directions to Veterans Building/ })).toBeVisible();
    expect(mocks.toString).toHaveBeenCalledWith(
      'https://helloeventhub.online/events/mb-wa-reunion-2026',
      expect.objectContaining({ type: 'svg', margin: 4, errorCorrectionLevel: 'H' }),
    );
    expect(mocks.toString).toHaveBeenCalledWith(
      'https://maps.app.goo.gl/6NLwRQT4iLkmXosD6',
      expect.any(Object),
    );
  });
});
