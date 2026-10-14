import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PublicEvent } from '@heh/contracts';

vi.mock('../src/lib/publicData', () => ({
  usePublicConfig: () => ({ data: { primaryEventSlug: 'family-day' }, loading: false }),
  usePublicEvent: () => ({ data: event, loading: false, error: null }),
}));
vi.mock('../src/lib/session', () => ({
  useSession: () => ({ user: null, login: vi.fn() }),
}));

import { PublicLayout } from '../src/components/Layout';
import { PasswordField } from '../src/components/ui';
import AboutPage from '../src/pages/public/AboutPage';
import RegisterPage from '../src/pages/public/RegisterPage';
import LoginPage from '../src/pages/admin/LoginPage';

const event = {
  id: 'event-id',
  slug: 'family-day',
  title: 'Family Day',
  description: 'A family event.',
  venueName: null,
  venueAddress: null,
  venueMapUrl: null,
  startsAt: '2026-10-24T01:00:00.000Z',
  endsAt: '2026-10-24T07:00:00.000Z',
  onsiteRegistrationStartsAt: '2026-10-24T00:00:00.000Z',
  timezone: 'Asia/Manila',
  registrationOpen: true,
  registrationMessage: '',
  lateRegistration: false,
  categories: [],
  ageCategoryNote: 'Child means age 12 or younger.',
  consentVersion: 'v1',
  privacyNotice: 'We use these details to plan the event.',
  privacyNoticeApproved: true,
  contactInfo: {},
} satisfies PublicEvent;

describe('public interface', () => {
  it('provides site context and an active public navigation destination', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          element: <PublicLayout />,
          children: [
            { path: '/about', element: <AboutPage /> },
            { path: '/events/:slug', element: <p>Event destination</p> },
          ],
        },
      ],
      { initialEntries: ['/about'] },
    );
    render(<RouterProvider router={router} />);

    expect(screen.getByRole('heading', { name: 'About HelloEventHub' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Site information' })).toHaveTextContent(
      'Committee sign in',
    );
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    await user.click(screen.getAllByRole('link', { name: 'Event' })[0]!);
    expect(await screen.findByText('Event destination')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Public' }).getElementsByTagName('a')[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('orients staff at login and directs attendees to the accountless public flow', () => {
    const router = createMemoryRouter([{ path: '/admin/login', element: <LoginPage /> }], {
      initialEntries: ['/admin/login'],
    });
    render(<RouterProvider router={router} />);

    expect(screen.getByRole('heading', { name: 'Committee sign in' })).toBeVisible();
    expect(screen.getByText(/Attendees can/)).toHaveTextContent('register without an account');
    expect(screen.getByRole('link', { name: 'Back to the public site' })).toHaveAttribute('href', '/');
  });

  it('reveals and hides a password without changing its value', async () => {
    const user = userEvent.setup();
    render(<PasswordField label="Password" defaultValue="keep-this-secret" />);
    const input = screen.getByLabelText('Password');

    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('keep-this-secret');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('marks the current registration step and protects entered data during internal navigation', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          element: <PublicLayout />,
          children: [
            { path: '/', element: <p>Home destination</p> },
            { path: '/events/:slug/register', element: <RegisterPage /> },
          ],
        },
      ],
      { initialEntries: ['/events/family-day/register'] },
    );
    render(<RouterProvider router={router} />);

    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Current step: Details');
    await user.type(screen.getByLabelText(/^Your full name/), 'Maria Santos');
    await user.click(screen.getByRole('link', { name: 'HelloEventHub home' }));

    expect(screen.getByRole('heading', { name: 'Leave this registration?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('heading', { name: 'Your details' })).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'HelloEventHub home' }));
    await user.click(screen.getByRole('button', { name: 'Leave registration' }));
    expect(await screen.findByText('Home destination')).toBeVisible();
  });
});
