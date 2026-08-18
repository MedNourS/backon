import type { Express } from "express";
import {
  buildOpenApiDocument,
  apiReferenceHtmlInline,
  type OpenApiOptions,
  type CollectedRoute,
} from "../openapi-core";
import { collectRoutes, type TrackedRouter } from "./router-registry";

/**
 * Reads every route recorded by trackRoutes() (see router-registry.ts) —
 * meaning createApp()'s own app, and any @mednours/backon/express Router()
 * mounted onto it — and builds an OpenAPI document from whichever ones
 * were wrapped in defineRoute(), the only ones carrying a schema.
 */
export function generateOpenApiSpec(app: Express, options: OpenApiOptions = {}): Record<string, unknown> {
  const routes = collectRoutes(app as unknown as TrackedRouter) as CollectedRoute[];
  return buildOpenApiDocument(routes, options);
}

/**
 * Mounts two routes: the OpenAPI document itself as JSON, and a page that
 * renders it. The page embeds the document directly rather than fetching it
 * from the JSON route — one less request, and it keeps working if the JSON
 * route is ever removed or renamed. Call after every other route is
 * registered on `app` — routes added afterward won't be reflected in
 * either.
 *
 *   serveApiDocs(app, "/docs", { title: "My API" });
 */
export function serveApiDocs(app: Express, path = "/docs", options: OpenApiOptions = {}): void {
  const specPath = `${path}/openapi.json`;
  app.get(specPath, (_req, res) => res.json(generateOpenApiSpec(app, options)));
  app.get(path, (_req, res) =>
    res.type("html").send(apiReferenceHtmlInline(generateOpenApiSpec(app, options), options.title))
  );
}
