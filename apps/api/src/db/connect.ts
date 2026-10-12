import mongoose from 'mongoose';
import { ALL_MODELS } from './models.js';

mongoose.set('strictQuery', true);
// Prevent accidental unindexed creation in production; ensureIndexes() is explicit.
mongoose.set('autoIndex', false);

export async function connectDb(uri: string): Promise<typeof mongoose> {
  return mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000, maxPoolSize: 20 });
}

/**
 * Create declared indexes (safe on every start). `sync: true` also DROPS indexes not declared in code —
 * only used by the explicit `npm run ensure-indexes` script, so indexes added by hand in Atlas survive restarts.
 */
export async function ensureIndexes(opts: { sync?: boolean } = {}): Promise<void> {
  for (const model of ALL_MODELS) {
    await model.createCollection().catch(() => undefined);
    if (opts.sync) await model.syncIndexes();
    else await model.createIndexes();
  }
}

export function dbState(): 'connected' | 'disconnected' | 'connecting' | 'disconnecting' {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'] as const;
  return states[mongoose.connection.readyState as number] ?? 'disconnected';
}

/** Run fn inside a transaction with automatic retry on transient errors. */
export async function withTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
