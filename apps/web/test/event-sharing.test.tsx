import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toDataURL: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('qrcode', () => ({ default: { toDataURL: mocks.toDataURL } }));

import { OrganizerEventShare, ShareEventButton } from '../src/components/EventSharing';

describe('event sharing', () => {
  beforeEach(() => {
    mocks.toDataURL.mockReset().mockResolvedValue('data:image/png;base64,qr');
    mocks.writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.writeText } });
  });

  it('copies the public event link when native sharing is unavailable', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.writeText } });
    render(<ShareEventButton slug="family-day" title="Family Day" />);

    await user.click(screen.getByRole('button', { name: 'Share event' }));

    expect(mocks.writeText).toHaveBeenCalledWith('http://localhost:3000/events/family-day');
    expect(screen.getByText('Event link copied.')).toBeInTheDocument();
  });

  it('creates an organizer QR download for the public event page', async () => {
    render(<OrganizerEventShare slug="family-day" title="Family Day" />);

    expect(screen.getByText('http://localhost:3000/events/family-day')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'QR code for Family Day' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download QR code' })).toHaveAttribute('download', 'family-day-qr.png');
    await waitFor(() => expect(mocks.toDataURL).toHaveBeenCalledWith('http://localhost:3000/events/family-day', expect.objectContaining({ width: 1024, errorCorrectionLevel: 'H' })));
  });
});
