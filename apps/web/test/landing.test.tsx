import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  reload: vi.fn(),
  current: {
    data: undefined as undefined | { slug: string; title: string; registrationOpen: boolean },
    error: new Error('unavailable') as Error | undefined,
    loading: false,
  },
}));

vi.mock('../src/lib/publicData', () => ({
  usePublicEvent: () => ({ ...state.current, reload: state.reload }),
}));

import Landing from '../src/pages/public/Landing';

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe('landing page recovery', () => {
  beforeEach(() => {
    state.reload.mockReset();
    state.current = { data: undefined, error: new Error('unavailable'), loading: false };
    state.reload.mockImplementation(() => {
      state.current = { data: undefined, error: undefined, loading: true };
    });
  });

  it('offers calm, actionable recovery and organizer help', () => {
    renderLanding();

    expect(screen.getByRole('alert')).toHaveTextContent('We can’t show the event details right now');
    expect(screen.getByText(/Check your connection and try again/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Contact the organizers' })).toHaveAttribute('href', '/contact');
  });

  it('keeps the recovery panel stable and exposes progress while retrying', async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(state.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trying again…' })).toBeDisabled();
    expect(screen.queryByText('Loading event details…')).not.toBeInTheDocument();
  });

  it('returns to the recovery action after another failure', async () => {
    const user = userEvent.setup();
    const view = renderLanding();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    state.current = { data: undefined, error: new Error('still unavailable'), loading: false };
    view.rerender(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled());
    expect(screen.getByRole('alert')).toBeVisible();
  });

  it('shows the event after a successful retry', async () => {
    const user = userEvent.setup();
    const view = renderLanding();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    state.current = {
      data: { slug: 'family-day', title: 'Family Day', registrationOpen: true },
      error: undefined,
      loading: false,
    };
    view.rerender(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Family Day' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
