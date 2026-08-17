import type { Request, Response, NextFunction } from "express";
import { AppError } from "../error";
import { RateLimiter } from "../rate-limit-core";

export interface RateLimitOptions {
  /** Window size in ms. Defaults to 60_000 (1 minute). */
  windowMs?: number;
  /** Max requests allowed per key within the window. Defaults to 60. */
  max?: number;
  /** How to derive the bucket key from a request. Defaults to the caller's IP. */
  keyGenerator?: (req: Request) => string;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 60;

/**
 * Express equivalent of the Hono rateLimit(): same in-memory token-bucket
 * limiter, same per-process caveat (see rate-limit-core.ts), calls
 * next(AppError(429, "rate_limited")) once a key exceeds `max` requests in
 * the current window, with a Retry-After header set to when it resets.
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const limiter = new RateLimiter(options.windowMs ?? DEFAULT_WINDOW_MS, options.max ?? DEFAULT_MAX);
  const keyGenerator = options.keyGenerator ?? defaultKey;

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const result = limiter.check(keyGenerator(req));
    if (!result.allowed) {
      res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
      next(new AppError(429, "rate_limited", "Too many requests", { retryAfterMs: result.retryAfterMs }));
      return;
    }
    next();
  };
}

function defaultKey(req: Request): string {
  return req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
}
