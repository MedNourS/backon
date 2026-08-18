export { createApp, attachErrorHandler } from "./create-app";
export type { CreateAppOptions } from "./create-app";

export { serve } from "./serve";

export { defineRoute } from "./define-route";
export type { RouteSchema, RouteData, RouteHandler } from "./define-route";

export { AppError } from "../error";
export type { ErrorResponseBody } from "../error";

export { logger } from "../logger";

export { requireEnv } from "../require-env";

export { requireAuth } from "./require-auth";
export type { VerifyJwtOptions } from "../auth-core";

export { rateLimit } from "./rate-limit";
export type { RateLimitOptions } from "./rate-limit";

export type { BackonContext } from "./types";

export { Router } from "./router";

/**
 * Request/Response/NextFunction are for writing plain Express middleware
 * itself — BackonContext only exists inside defineRoute() handlers,
 * middleware always operates at the framework's own req/res/next layer,
 * there's no getting around that by wrapping it.
 */
export type { Request, Response, NextFunction } from "express";

export { defineWebSocket } from "./websocket";
export type { WebSocketHandlers } from "./websocket";

export { defineStream } from "./stream";
export type { StreamWriter } from "./stream";

export { defineUpload } from "./upload";
export type { UploadOptions, UploadHandler } from "./upload";

export { generateOpenApiSpec, serveApiDocs } from "./openapi";
export type { OpenApiOptions } from "../openapi-core";
export { apiReferenceHtml, apiReferenceHtmlInline } from "../openapi-core";
