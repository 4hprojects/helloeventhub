import type { Router } from 'express';
import type { AppDeps } from '../app-deps.js';
import { reportRoutes } from './reports.js';
import { staffRoutes } from './staff.js';
import { syncRoutes } from './sync.js';
import { venueAdminRoutes } from './venueAdmin.js';

/** Routers added by release phase. `admin` routers are mounted under /admin behind CSRF + admin auth (once). */
export function extraRoutes(deps: AppDeps): { admin: Router[]; other: Array<[string, Router]> } {
  return {
    admin: [reportRoutes(deps), venueAdminRoutes(deps), staffRoutes(deps)],
    other: [['/sync', syncRoutes(deps)]],
  };
}
