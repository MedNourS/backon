import type { Context, Next } from "hono";
import type { Env } from "./types";
import { AppError } from "./error";
import { RateLimiter } from "./rate-limit-core";

export interface RateLimitOptions {
  /** Window size in ms. Defaults to 60_000 (1 minute). */
  windowMs?: number;
  /** Max requests allowed per key within the window. Defaults to 60. */
  max?: number;
  /** How to derive the bucket key from a request. Defaults to the caller's IP. */
  keyGenerator?: (c: Context<Env>) => string;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 60;

/**
 * In-memory token-bucket rate limiter. Throws AppError(429, "rate_limited")
 * once a key exceeds `max` requests in the current window, with a
 * Retry-After header set to when the window resets.
 *
 * NOTE: per-process state — resets on restart, and doesn't share counts
 * across multiple instances or serverless invocations. Fine for a single
 * long-running server; for anything horizontally scaled, swap in a
 * Redis-backed limiter instead.
 *
 * Apply per-route or per-group, not necessarily globally — a login route
 * usually wants a tighter limit than the rest of the API:
 *
 *   auth.use("/login", rateLimit({ windowMs: 60_000, max: 5 }));
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const limiter = new RateLimiter(options.windowMs ?? DEFAULT_WINDOW_MS, options.max ?? DEFAULT_MAX);
  const keyGenerator = options.keyGenerator ?? defaultKey;

  return async function rateLimitMiddleware(c: Context<Env>, next: Next) {
    const result = limiter.check(keyGenerator(c));
    if (!result.allowed) {
      c.header("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
      throw new AppError(429, "rate_limited", "Too many requests", {
        retryAfterMs: result.retryAfterMs,
      });
    }
    await next();
  };
}

function defaultKey(c: Context<Env>): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown"
  );
}
