import type { ClientSession, Types } from 'mongoose';
import { AuditLog } from '../db/models.js';

export interface Actor {
  type: 'public' | 'owner' | 'admin' | 'system' | 'device';
  id?: string;
  label?: string;
}

export interface AuditEntry {
  organizationId?: Types.ObjectId;
  eventId?: Types.ObjectId;
  actor: Actor;
  action: string;
  subjectType: string;
  subjectId: string;
  /** Minimized: field names, counts and IDs only — never contact values. */
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export async function audit(entry: AuditEntry, session?: ClientSession): Promise<void> {
  await AuditLog.create(
    [
      {
        organizationId: entry.organizationId,
        eventId: entry.eventId,
        actorType: entry.actor.type,
        actorId: entry.actor.id,
        action: entry.action,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId,
        metadata: entry.metadata ?? {},
        requestId: entry.requestId,
      },
    ],
    { session },
  );
}
