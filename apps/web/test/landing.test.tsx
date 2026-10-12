import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ reload: vi.fn() }));

vi.mock('../src/lib/publicData', () => ({
  usePublicEvent: () => ({
    data: undefined,
    error: new Error('unavailable'),
    loading: false,
    reload: state.reload,
  }),
}));

import Landing from '../src/pages/public/Landing';

describe('landing page recovery', () => {
  beforeEach(() => state.reload.mockClear());

  it('explains a temporary event-loading failure and lets the visitor retry', async () => {
    const user = userEvent.setup();
    render(<Landing />);

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load the event");
    expect(screen.getByText('The event details are temporarily unavailable. Please try again.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.reload).toHaveBeenCalledTimes(1);
  });
});
