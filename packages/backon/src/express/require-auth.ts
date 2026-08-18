import type { Request, Response, NextFunction } from "express";
import { AppError } from "../error";
import { extractBearerToken, verifyJwt, type VerifyJwtOptions } from "../auth-core";

/**
 * Express equivalent of the Hono requireAuth: verifies a bearer JWT and
 * stashes the decoded payload on res.locals.auth — readable via
 * `c.get("auth")` in a defineRoute handler (BackonContext.get() reads
 * res.locals) or directly as `res.locals.auth` in plain Express middleware.
 * Calls next(AppError(401, "unauthorized")) on a missing, malformed, or
 * invalid token; requires attachErrorHandler(app) to be registered
 * downstream (serve() does this automatically — see create-app.ts).
 *
 * Verification only, same as the Hono version — issuing tokens is left to
 * the consuming project. Apply per-route or per-router, not necessarily
 * globally.
 */
export function requireAuth(options: VerifyJwtOptions) {
  return async function requireAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    const token = extractBearerToken(req.header("authorization"));
    if (!token) {
      next(new AppError(401, "unauthorized", "Missing or malformed Authorization header"));
      return;
    }

    try {
      res.locals.auth = await verifyJwt(token, options);
    } catch {
      next(new AppError(401, "unauthorized", "Invalid or expired token"));
      return;
    }

    next();
  };
}
