import 'express-session';
import type { Role } from '@heh/contracts';
import type { Types } from 'mongoose';
import type { EventDoc } from './db/models.js';

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    userId?: string;
    authAt?: number;
    owner?: { registrationId: string; eventId: string; expiresAt: number };
  }
}

declare global {
   
  namespace Express {
    interface Request {
      requestId: string;
      /** Real visitor IP (see middleware/clientIp.ts). */
      clientIp: string;
      admin?: {
        userId: Types.ObjectId;
        publicId: string;
        email: string;
        name: string;
      };
      eventAccess?: { event: EventDoc; role: Role };
    }
  }
}
export {};
