import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from './components/Layout';
import { Spinner } from './components/ui';
import { SessionProvider } from './lib/session';
import Landing from './pages/public/Landing';
import EventPage from './pages/public/EventPage';
import RegisterPage from './pages/public/RegisterPage';
import SuccessPage from './pages/public/SuccessPage';
import ManagePage from './pages/public/ManagePage';
import PrivacyPage from './pages/public/PrivacyPage';
import ContactPage from './pages/public/ContactPage';
import AboutPage from './pages/public/AboutPage';
import NotFound from './pages/public/NotFound';

// Admin UI is code-split so public visitors don't download it.
const AdminRoot = lazy(() => import('./pages/admin/routes'));

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<Spinner />}>{children}</Suspense>;
const EVENT_PATH = '/events/mb-wa-reunion-2026';

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/reunion', element: <Navigate to={EVENT_PATH} replace /> },
      { path: '/reunion/register', element: <Navigate to={`${EVENT_PATH}/register`} replace /> },
      { path: '/events/alsem-reunion-2026', element: <Navigate to={EVENT_PATH} replace /> },
      { path: '/events/alsem-reunion-2026/register', element: <Navigate to={`${EVENT_PATH}/register`} replace /> },
      { path: '/events/:slug', element: <EventPage /> },
      { path: '/events/:slug/register', element: <RegisterPage /> },
      { path: '/registration/success', element: <SuccessPage /> },
      { path: '/registration/manage', element: <ManagePage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/contact', element: <ContactPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/admin/*',
    element: (
      <SessionProvider>
        <S>
          <AdminRoot />
        </S>
      </SessionProvider>
    ),
  },
]);

