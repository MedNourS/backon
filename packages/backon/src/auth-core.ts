import { verify } from "hono/jwt";
import type { JWTPayload } from "hono/utils/jwt/types";
import type { SignatureAlgorithm } from "hono/utils/jwt/jwa";

/**
 * Shared by the Hono and Express requireAuth() middleware — the actual JWT
 * verification is identical, only how each framework reads the incoming
 * request and reports failure differs. Built on hono/jwt's verify() rather
 * than a new dependency, since hono is already a hard dependency of backon
 * regardless of which framework (Hono or Express) a project picked.
 */
export interface VerifyJwtOptions {
  /** Secret used to verify the token's signature. */
  secret: string;
  /**
   * Algorithm to verify with. Defaults to HS256. Deliberately not inferred
   * from the token's own header — trusting that is how "alg: none" and
   * algorithm-confusion attacks work, so backon always verifies against an
   * algorithm the server chose, never one the token claims for itself.
   */
  alg?: SignatureAlgorithm;
}

const DEFAULT_ALG: SignatureAlgorithm = "HS256";

/** Verifies a JWT's signature and standard claims (exp/nbf/iat), returns its payload. Throws on any failure. */
export function verifyJwt(token: string, options: VerifyJwtOptions): Promise<JWTPayload> {
  return verify(token, options.secret, options.alg ?? DEFAULT_ALG);
}

/** Pulls the token out of a `Bearer <token>` Authorization header, or undefined if it's missing/malformed. */
export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
}
