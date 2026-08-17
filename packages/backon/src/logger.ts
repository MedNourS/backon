import { randomUUID } from "node:crypto";
import pino from "pino";
import type { Context, Next } from "hono";
import type { Env } from "./types";

/**
 * Structured logger. pino instead of console.log because it's fast enough to
 * leave on in production and gives us structured (JSON) lines for free —
 * console.log output is not something you can query later.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});

/**
 * Attaches a request id (reusing an inbound x-request-id header if the
 * platform already set one, e.g. a reverse proxy) and logs one line per
 * request with method, path, status, and duration. Runs first in the
 * middleware stack so it wraps everything else, including errors.
 */
export async function requestLogger(c: Context<Env>, next: Next) {
  const requestId = c.req.header("x-request-id") ?? randomUUID();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);

  const start = performance.now();
  await next();
  const durationMs = Math.round(performance.now() - start);

  logger.info(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    },
    "request"
  );
}
