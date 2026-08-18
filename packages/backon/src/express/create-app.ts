import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { AppError } from "../error";
import { logger } from "../logger";
import { requestLogger } from "./logger";
import { trackRoutes } from "./router-registry";

export interface CreateAppOptions {
  /** Allowed CORS origins. Defaults to ALLOWED_ORIGINS env var (comma-separated), closed by default. */
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
 * Builds an Express app pre-wired with the same defaults as the Hono
 * createApp(): request logging, secure headers, an allowlisted CORS policy,
 * compression, a body size cap, and a /health route.
 *
 * NOTABLE DIFFERENCE FROM THE HONO VERSION: the central error handler is
 * NOT registered here. Express identifies error-handling middleware by its
 * 4-argument signature and only lets it catch errors from routes/middleware
 * registered BEFORE it — the opposite of Hono's onError(), which is
 * registration-order-independent. If the error handler were added here,
 * inside createApp(), it would never see errors from routes added
 * afterward in the project's own app.ts, exactly the routes it exists to
 * catch. `serve()` calls attachErrorHandler() automatically, right before
 * starting the server, once every route is guaranteed to already be
 * registered. When not using backon's serve() — e.g. wrapping this app for
 * a serverless handler or a supertest suite — call attachErrorHandler(app)
 * directly, after every route, before the app is used.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  // Instrumented before anything else is registered, so every route this
  // app (or a Router() mounted onto it) adds afterward — including /health
  // below — is tracked for generateOpenApiSpec(). See router-registry.ts.
  const app = trackRoutes(express());

  app.use(requestLogger);
  app.use(helmet());

  const allowedOrigins = resolveAllowedOrigins(options);
  app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));

  app.use(compression());
  app.use(express.json({ limit: options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES }));

  // Same reasoning as the Hono version's /health: registered before any
  // project-specific middleware, so it gets logging/security/CORS/compression
  // but nothing added afterward. Right default for a liveness check.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}

/**
 * The central error handler, kept separate from createApp() — see the
 * NOTABLE DIFFERENCE note above for why. Turns AppError into the standard
 * `{ error: { code, message, details? } }` shape with its own status code,
 * maps express.json()'s built-in payload-too-large error onto the same
 * shape as the Hono adapter's 413, and turns anything else into a generic
 * 500 without leaking internals.
 */
export function attachErrorHandler(app: Express): void {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      logger.warn(
        { requestId: res.locals.requestId, code: err.code, details: err.details },
        err.message
      );
      res
        .status(err.statusCode)
        .json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }

    const status =
      (err as { status?: number; statusCode?: number } | undefined)?.status ??
      (err as { statusCode?: number } | undefined)?.statusCode;
    if (status === 413) {
      res.status(413).json({ error: { code: "payload_too_large", message: "Request body too large" } });
      return;
    }

    logger.error({ requestId: res.locals.requestId, err }, "unhandled error");
    res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
  });
}
