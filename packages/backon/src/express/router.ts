import { Router as expressRouter, type Router as ExpressRouterType } from "express";
import { trackRoutes, type TrackedRouter } from "./router-registry";

/**
 * Same as Express's own Router() in every way that matters at runtime —
 * this calls it directly — but instrumented so generateOpenApiSpec() can
 * walk the route tree it produces. Exported from @mednours/backon/express
 * instead of importing Router from 'express' directly is what makes that
 * tracking possible; both behave identically otherwise.
 */
export function Router(...args: Parameters<typeof expressRouter>): ExpressRouterType & TrackedRouter {
  return trackRoutes(expressRouter(...args));
}
