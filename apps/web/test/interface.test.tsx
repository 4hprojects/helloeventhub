import { render, screen, within } from '@testing-library/react';
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
import EventPage from '../src/pages/public/EventPage';
import RegisterPage from '../src/pages/public/RegisterPage';
import LoginPage from '../src/pages/admin/LoginPage';

const event = {
  id: 'event-id',
  slug: 'family-day',
  title: '1st Menay Bugtong - Wakat Alsem Clan Reunion',
  tagline: 'One Family, Many Faces, New Connections',
  description: "You're invited to our first clan reunion!",
  venueName: 'Veterans Building',
  venueAddress: 'Puguis, La Trinidad, Benguet',
  venueMapUrl: 'https://maps.app.goo.gl/6NLwRQT4iLkmXosD6',
  startsAt: '2026-10-24T01:00:00.000Z',
  endsAt: '2026-10-24T07:00:00.000Z',
  onsiteRegistrationStartsAt: '2026-10-24T00:00:00.000Z',
  timezone: 'Asia/Manila',
  preregistrationDeadlineDate: '2026-10-20',
  registrationOpen: true,
  registrationMessage: '',
  lateRegistration: false,
  categories: [
    { id: 'branch-1', label: '1. Albina — Baon Tinay / Magastino' },
    { id: 'other', label: 'Other/Unsure' },
  ],
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
      'Organizer sign in',
    );
    expect(within(screen.getByRole('navigation', { name: 'Public' })).getByRole('link', { name: 'Organizer sign in' })).toHaveAttribute(
      'href',
      '/admin/login',
    );
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    await user.click(screen.getAllByRole('link', { name: 'Event' })[0]!);
    expect(await screen.findByText('Event destination')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Public' }).getElementsByTagName('a')[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('presents the approved reunion essentials, heritage wording, actions and metadata', async () => {
    const originalTitle = document.title;
    const router = createMemoryRouter(
      [
        { path: '/events/:slug', element: <EventPage /> },
        { path: '/about', element: <AboutPage /> },
      ],
      { initialEntries: ['/events/family-day'] },
    );
    const view = render(<RouterProvider router={router} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '1st Menay Bugtong - Wakat Alsem Clan Reunion',
    );
    expect(screen.getByText('One Family, Many Faces, New Connections')).toBeVisible();
    expect(screen.getByText(/Online preregistration deadline: October 20, 2026/)).toBeVisible();
    expect(screen.getByText('Associated names: Baon Tinay / Magastino')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start registration' })).toHaveAttribute(
      'href',
      '/events/family-day/register',
    );
    expect(screen.getAllByRole('link', { name: /directions|Google Maps/i })[0]).toHaveAttribute(
      'href',
      event.venueMapUrl,
    );
    expect(screen.getByRole('link', { name: 'Download invitation' })).toHaveAttribute(
      'download',
      'mb-wa-reunion-2026-invitation.png',
    );
    expect(document.title).toBe(`${event.title} | HelloEventHub`);
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://helloeventhub.online/events/family-day',
    );
    view.unmount();
    expect(document.title).toBe(originalTitle);
  });

  it('orients staff at login and directs attendees to the accountless public flow', () => {
    const router = createMemoryRouter([{ path: '/admin/login', element: <LoginPage /> }], {
      initialEntries: ['/admin/login'],
    });
    render(<RouterProvider router={router} />);

    expect(screen.getByRole('heading', { name: 'Organizer sign in' })).toBeVisible();
    expect(screen.getByText(/event organizers/)).toHaveTextContent('event organizers, admins, and committee staff');
    expect(screen.getByText(/event organizers/)).toHaveTextContent('register without an account');
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
