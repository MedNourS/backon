export { createApp } from "./create-app";
export type { CreateAppOptions } from "./create-app";

export { serve } from "./serve";

export { defineRoute } from "./define-route";
export type { RouteSchema, RouteData, RouteHandler } from "./define-route";

export { AppError } from "./error";
export type { ErrorResponseBody } from "./error";

export { logger } from "./logger";

export type { BackonContext, Env } from "./types";

/**
 * Re-exported so generated projects (and anything you build on backon)
 * never need to depend on 'hono' directly, even for the parts backon
 * doesn't add opinions to yet — like building a sub-router with
 * `new Hono()` for a single resource's routes.
 */
export { Hono } from "hono";
export type { Next } from "hono";
