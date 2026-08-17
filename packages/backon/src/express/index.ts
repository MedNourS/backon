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
 * same reasoning as re-exporting Hono from the default export.
 */
export { Router } from "express";
