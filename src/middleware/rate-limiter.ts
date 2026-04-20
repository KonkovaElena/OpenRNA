import { type NextFunction, type Request, type Response } from "express";

/**
 * Token-bucket rate limiter — per-IP by default, per-API-key when available.
 * No external dependencies (no Redis). Suitable for single-instance deployments.
 *
 * Design: Each client gets a bucket of `maxTokens` tokens. One token is consumed
 * per request. Tokens refill at `refillRate` tokens/second. When the bucket is
 * empty the request is rejected with 429 Too Many Requests.
 */
export interface RateLimiterOptions {
  maxTokens?: number;      // default: 100
  refillRate?: number;     // tokens per second, default: 10
  windowMs?: number;       // cleanup interval for stale buckets, default: 60_000
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export function rateLimiter(options: RateLimiterOptions = {}) {
  const maxTokens = options.maxTokens ?? 100;
  const refillRate = options.refillRate ?? 10;
  const windowMs = options.windowMs ?? 60_000;

  const buckets = new Map<string, TokenBucket>();

  // Periodic cleanup of stale buckets to prevent memory leak
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > windowMs * 5) {
        buckets.delete(key);
      }
    }
  }, windowMs);
  cleanup.unref(); // don't prevent process exit

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientKey = req.header("x-api-key") ?? req.ip ?? "unknown";
    const now = Date.now();

    let bucket = buckets.get(clientKey);
    if (!bucket) {
      bucket = { tokens: maxTokens, lastRefill: now };
      buckets.set(clientKey, bucket);
    }

    // Refill tokens
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const retryAfter = Math.ceil((1 - bucket.tokens) / refillRate);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Too many requests. Please retry later.",
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    bucket.tokens -= 1;
    next();
  };
}
