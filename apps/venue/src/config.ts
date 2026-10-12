import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  VENUE_PORT: z.coerce.number().int().default(8080),
  VENUE_HOST: z.string().default('0.0.0.0'),
  VENUE_DATA_DIR: z.string().default('./data'),
  VENUE_BACKUP_DIR: z.string().default('./backups'),
  CLOUD_BASE_URL: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),
  CLOUD_EVENT_ID: z.string().optional().transform((v) => v || undefined),
  CLOUD_DEVICE_TOKEN: z.string().optional().transform((v) => v || undefined),
  SYNC_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),
  BACKUP_INTERVAL_MS: z.coerce.number().int().min(10_000).default(600_000),
  VENUE_TLS_CERT: z.string().optional().transform((v) => v || undefined),
  VENUE_TLS_KEY: z.string().optional().transform((v) => v || undefined),
});

export type VenueConfig = z.output<typeof schema> & { dbPath: string; cloudConfigured: boolean };

export function loadVenueConfig(env: NodeJS.ProcessEnv = process.env): VenueConfig {
  const c = schema.parse(env);
  return {
    ...c,
    dbPath: path.resolve(c.VENUE_DATA_DIR, 'venue.sqlite'),
    cloudConfigured: !!(c.CLOUD_BASE_URL && c.CLOUD_EVENT_ID && c.CLOUD_DEVICE_TOKEN),
  };
}
