import { Route } from 'react-router-dom';
import DuplicatesPage from './DuplicatesPage';
import EmailsPage from './EmailsPage';
import ExportsPage from './ExportsPage';
import SnapshotsPage from './SnapshotsPage';
import StaffPage from './StaffPage';
import VenuePage from './VenuePage';

/** Routes added by later release phases (P0.5 reports, P1 venue). */
export function phaseRoutes() {
  return (
    <>
      <Route path="exports" element={<ExportsPage />} />
      <Route path="duplicates" element={<DuplicatesPage />} />
      <Route path="snapshots" element={<SnapshotsPage />} />
      <Route path="emails" element={<EmailsPage />} />
      <Route path="venue" element={<VenuePage />} />
      <Route path="staff" element={<StaffPage />} />
    </>
  );
}
