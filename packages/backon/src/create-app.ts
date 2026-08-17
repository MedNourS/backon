import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";
import { compress } from "hono/compress";
import { bodyLimit } from "hono/body-limit";
import { AppError } from "./error";
import { logger, requestLogger } from "./logger";
import type { Env } from "./types";

export interface CreateAppOptions {
  /**
   * Allowed CORS origins. Defaults to the ALLOWED_ORIGINS env var
   * (comma-separated), and to no origins at all if that's unset — closed by
   * default rather than wide open.
   */
  allowedOrigins?: string[];
  /** Max request body size in bytes. Defaults to 1mb. */
  bodyLimitBytes?: number;
}

const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024; // 1mb

function resolveAllowedOrigins(options: CreateAppOptions): string[] {
  if (options.allowedOrigins) return options.allowedOrigins;
  const fromEnv = process.env.ALLOWED_ORIGINS;
  return fromEnv ? fromEnv.split(",").map((origin) => origin.trim()) : [];
}

/**
 * Builds a Hono app pre-wired with backon's opinionated defaults: request
 * logging, secure headers, CORS locked to an allowlist, response
 * compression, a body size cap, a /health route, and a central error handler
 * that turns AppError (or anything else) into a consistent JSON shape.
 *
 * This is the "small opinionated helpers" layer agreed on for v1 — enough to
 * be worth having your own package instead of importing hono directly,
 * without trying to cover every possible use case up front.
 */
export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono<Env>();

  app.use("*", requestLogger);
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: resolveAllowedOrigins(options),
    })
  );
  app.use("*", compress());
  app.use(
    "*",
    bodyLimit({
      maxSize: options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES,
      onError: (c) =>
        c.json({ error: { code: "payload_too_large", message: "Request body too large" } }, 413),
    })
  );

  // Registered here, before createApp() returns, so it always gets the
  // middleware above (logging, secure headers, CORS, compression, body
  // limit). It deliberately does NOT get middleware you add afterward in
  // your own app.ts (app.use('*', yourMiddleware) only wraps routes
  // registered after that call) — verified by hand, this is Hono's own
  // registration-order behavior, not something backon adds. That's the
  // right default for a liveness check: an uptime monitor shouldn't get
  // blocked by app-specific middleware like auth. If you want /health
  // behind your own middleware too, register your own route instead of
  // relying on this one.
  app.get("/health", (c) => c.json({ status: "ok" }));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      logger.warn({ requestId: c.get("requestId"), code: err.code, details: err.details }, err.message);
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        err.statusCode as any
      );
    }

    logger.error({ requestId: c.get("requestId"), err }, "unhandled error");
    return c.json({ error: { code: "internal_error", message: "Something went wrong" } }, 500);
  });

  return app;
}
