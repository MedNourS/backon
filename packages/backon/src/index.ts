export { createApp } from "./create-app";
export type { CreateAppOptions } from "./create-app";

export { serve } from "./serve";

export { defineRoute } from "./define-route";
export type { RouteSchema, RouteData, RouteHandler } from "./define-route";

export { AppError } from "./error";
export type { ErrorResponseBody } from "./error";

export { logger } from "./logger";

export { requireEnv } from "./require-env";

export { requireAuth } from "./require-auth";
export type { VerifyJwtOptions } from "./auth-core";

export { rateLimit } from "./rate-limit";
export type { RateLimitOptions } from "./rate-limit";

export { defineWebSocket } from "./websocket";
export type { WebSocketHandlers } from "./websocket";

export { defineStream } from "./stream";
export type { StreamWriter } from "./stream";

export { defineUpload } from "./upload";
export type { UploadOptions, UploadHandler } from "./upload";

export { generateOpenApiSpec, serveApiDocs } from "./openapi";
export type { OpenApiOptions } from "./openapi";
export { apiReferenceHtml, apiReferenceHtmlInline } from "./openapi-core";

export type { BackonContext, Env } from "./types";

/**
 * Re-exported so generated projects (and anything built on backon) never
 * need to depend on 'hono' directly, even for the parts backon doesn't add
 * opinions to yet — like building a sub-router with `new Hono()` for a
 * single resource's routes.
 */
export { Hono } from "hono";
export type { Next } from "hono";
