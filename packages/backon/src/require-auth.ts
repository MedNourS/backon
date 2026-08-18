import type { Context, Next } from "hono";
import type { Env } from "./types";
import { AppError } from "./error";
import { extractBearerToken, verifyJwt, type VerifyJwtOptions } from "./auth-core";

/**
 * Verifies a bearer JWT and stashes the decoded payload on the context as
 * `auth`, retrievable in any handler downstream via `c.get("auth")`. Throws
 * AppError(401, "unauthorized") if the header is missing, malformed, or the
 * token fails verification (bad signature, expired, wrong algorithm) —
 * createApp()'s error handler turns that into the standard error JSON shape,
 * same as any other AppError.
 *
 * This is verification only: issuing tokens (login, signup, refresh
 * rotation, revocation) is left to the consuming project, since that's
 * genuinely different per project and baking in an opinion there risks
 * being wrong for whatever project actually uses it. Apply it per-route or
 * per-group, not globally:
 *
 *   protectedRoutes.use("*", requireAuth({ secret: process.env.JWT_SECRET! }));
 */
export function requireAuth(options: VerifyJwtOptions) {
  return async function requireAuthMiddleware(c: Context<Env>, next: Next) {
    const token = extractBearerToken(c.req.header("authorization"));
    if (!token) {
      throw new AppError(401, "unauthorized", "Missing or malformed Authorization header");
    }

    try {
      const payload = await verifyJwt(token, options);
      c.set("auth", payload);
    } catch {
      throw new AppError(401, "unauthorized", "Invalid or expired token");
    }

    await next();
  };
}
