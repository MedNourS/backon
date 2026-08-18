import type { Hono } from "hono";
import { buildOpenApiDocument, apiReferenceHtmlInline, type OpenApiOptions, type CollectedRoute } from "./openapi-core";
import type { RouteHandlerFn } from "./define-route";

export type { OpenApiOptions };

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);

/**
 * Reads every route registered on `app` (including ones mounted through
 * nested `.route()` calls, since Hono copies a sub-app's own route entries
 * onto the parent) and builds an OpenAPI document from whichever ones were
 * wrapped in defineRoute() — those are the only ones carrying a schema.
 */
export function generateOpenApiSpec(app: Hono<any>, options: OpenApiOptions = {}): Record<string, unknown> {
  const routes: CollectedRoute[] = app.routes
    .filter((route) => HTTP_METHODS.has(route.method.toLowerCase()))
    .map((route) => ({
      method: route.method,
      path: route.path,
      schema: (route.handler as RouteHandlerFn).__backonRouteSchema,
    }));

  return buildOpenApiDocument(routes, options);
}

/**
 * Mounts two routes: the OpenAPI document itself as JSON, and a page that
 * renders it. The page embeds the document directly rather than fetching it
 * from the JSON route — one less request, and it keeps working if the JSON
 * route is ever removed or renamed. Call after every other route is
 * registered — same registration-order rule as any other route reading from
 * `app.routes`.
 *
 *   serveApiDocs(app, "/docs", { title: "My API" });
 */
export function serveApiDocs(app: Hono<any>, path = "/docs", options: OpenApiOptions = {}): void {
  const specPath = `${path}/openapi.json`;
  app.get(specPath, (c) => c.json(generateOpenApiSpec(app, options)));
  app.get(path, (c) => c.html(apiReferenceHtmlInline(generateOpenApiSpec(app, options), options.title)));
}
