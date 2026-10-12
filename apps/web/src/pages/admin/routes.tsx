import { Route, Routes } from 'react-router-dom';
import NotFound from '../public/NotFound';
import AccountPage from './AccountPage';
import { AdminEventLayout, AdminHome, RequireAuth } from './AdminShell';
import DashboardPage from './DashboardPage';
import LoginPage from './LoginPage';
import NewRegistrationPage from './NewRegistrationPage';
import RegistrationDetailPage from './RegistrationDetailPage';
import RegistrationsPage from './RegistrationsPage';
import SettingsPage from './SettingsPage';
import { phaseRoutes } from './phaseRoutes';

export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<AdminHome />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="events/:eventId" element={<AdminEventLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="registrations" element={<RegistrationsPage />} />
          <Route path="registrations/new" element={<NewRegistrationPage />} />
          <Route path="registrations/:registrationId" element={<RegistrationDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          {phaseRoutes()}
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
