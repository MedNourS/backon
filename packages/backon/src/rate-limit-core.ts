/**
 * Plain in-memory token-bucket limiter, shared by the Hono and Express
 * rate-limit middleware — the bucket bookkeeping is identical, only how
 * each framework reads a request and reports 429 differs.
 *
 * NOTE: this is per-process state. It resets on restart and does not share
 * counts across multiple instances (a multi-dyno deploy, serverless
 * functions, etc). Fine for a single long-running server; for anything
 * horizontally scaled, back this with Redis instead — this class exists to
 * make that swap easy (same `check()` contract), not to rule it out.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  /** Milliseconds until this key's window resets. Only meaningful when allowed is false. */
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private checksSinceSweep = 0;

  constructor(
    private readonly windowMs: number,
    private readonly max: number
  ) {}

  check(key: string, now: number = Date.now()): RateLimitCheckResult {
    this.maybeSweep(now);

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > this.max) {
      return { allowed: false, retryAfterMs: bucket.resetAt - now };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Opportunistic cleanup so long-lived processes don't accumulate one bucket per distinct key forever. */
  private maybeSweep(now: number): void {
    this.checksSinceSweep += 1;
    if (this.checksSinceSweep < 1000) return;
    this.checksSinceSweep = 0;

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
