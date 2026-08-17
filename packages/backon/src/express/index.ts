export { createApp, attachErrorHandler } from "./create-app";
export type { CreateAppOptions } from "./create-app";

export { serve } from "./serve";

export { defineRoute } from "./define-route";
export type { RouteSchema, RouteData, RouteHandler } from "./define-route";

export { AppError } from "../error";
export type { ErrorResponseBody } from "../error";

export { logger } from "../logger";

export type { BackonContext } from "./types";

/**
 * Re-exported so generated projects never depend on 'express' directly,
 * same reasoning as re-exporting Hono from the default export. Request/
 * Response/NextFunction are for writing plain Express middleware itself —
 * BackonContext only exists inside defineRoute() handlers, middleware
 * always operates at the framework's own req/res/next layer, there's no
 * getting around that by wrapping it.
 */
export { Router } from "express";
export type { Request, Response, NextFunction } from "express";
