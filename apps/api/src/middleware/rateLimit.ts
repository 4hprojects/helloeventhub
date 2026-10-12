import { rateLimit, type Options, type Store, type ClientRateLimitInfo } from 'express-rate-limit';
import type { Request } from 'express';
import { RateLimit } from '../db/models.js';
import { HttpError } from '../lib/errors.js';

/** MongoDB-backed store so limits hold across multiple app instances. */
class MongoStore implements Store {
  windowMs = 60_000;
  constructor(public prefix: string) {}
  init(options: Options) {
    this.windowMs = options.windowMs;
  }
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const id = `${this.prefix}:${key}`;
    const now = new Date();
    // Reset an expired window, then increment atomically.
    await RateLimit.updateOne({ _id: id, resetAt: { $lte: now } }, { $set: { hits: 0, resetAt: new Date(now.getTime() + this.windowMs) } });
    const doc = await RateLimit.findOneAndUpdate(
      { _id: id },
      { $inc: { hits: 1 }, $setOnInsert: { resetAt: new Date(now.getTime() + this.windowMs) } },
      { upsert: true, new: true },
    ).lean();
    return { totalHits: doc!.hits, resetTime: doc!.resetAt };
  }
  async decrement(key: string) {
    await RateLimit.updateOne({ _id: `${this.prefix}:${key}` }, { $inc: { hits: -1 } });
  }
  async resetKey(key: string) {
    await RateLimit.deleteOne({ _id: `${this.prefix}:${key}` });
  }
}

export function limiter(name: string, windowMs: number, limit: number, keyGenerator?: (req: Request) => string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new MongoStore(name),
    keyGenerator: keyGenerator ?? ((req) => req.clientIp ?? req.ip ?? 'unknown'),
    passOnStoreError: true,
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'rate_limited', 'Too many requests. Please wait a few minutes and try again.')),
  });
}

/** Imperative counter for conditional limits inside handlers. Returns true when the limit is exceeded. */
export async function hitLimit(prefix: string, key: string, windowMs: number, limit: number): Promise<boolean> {
  const store = new MongoStore(prefix);
  store.windowMs = windowMs;
  const { totalHits } = await store.increment(key);
  return totalHits > limit;
}
