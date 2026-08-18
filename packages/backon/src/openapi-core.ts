import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodType } from "zod";

export interface OpenApiOptions {
  /** Defaults to "API". */
  title?: string;
  /** Defaults to "0.1.0". */
  version?: string;
  description?: string;
}

export interface RouteSchemaLike {
  body?: ZodType<unknown>;
  query?: ZodType<unknown>;
  params?: ZodType<unknown>;
}

export interface CollectedRoute {
  method: string;
  path: string;
  schema?: RouteSchemaLike;
}

/** Converts a framework's own param syntax (Hono and Express both use `:id`) to OpenAPI's `{id}`. */
export function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function paramNames(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}

function buildOperation(path: string, schema: RouteSchemaLike): Record<string, unknown> {
  const operation: Record<string, unknown> = { responses: { "200": { description: "Success" } } };
  const parameters: unknown[] = [];

  if (schema.params) {
    const jsonSchema = zodToJsonSchema(schema.params, { target: "openApi3" }) as Record<string, any>;
    for (const name of paramNames(path)) {
      parameters.push({
        name,
        in: "path",
        required: true,
        schema: jsonSchema.properties?.[name] ?? { type: "string" },
      });
    }
  }

  if (schema.query) {
    const jsonSchema = zodToJsonSchema(schema.query, { target: "openApi3" }) as Record<string, any>;
    const required = new Set(jsonSchema.required ?? []);
    for (const [name, propSchema] of Object.entries(jsonSchema.properties ?? {})) {
      parameters.push({ name, in: "query", required: required.has(name), schema: propSchema });
    }
  }

  if (parameters.length) operation.parameters = parameters;

  if (schema.body) {
    operation.requestBody = {
      required: true,
      content: { "application/json": { schema: zodToJsonSchema(schema.body, { target: "openApi3" }) } },
    };
  }

  return operation;
}

/**
 * Builds an OpenAPI 3.0 document from a flat list of routes, each carrying
 * the same Zod schema defineRoute() validates against — the spec is derived
 * from the schemas actually enforced at runtime instead of a hand-written
 * document that can drift out of sync with them. A route with no schema
 * (a plain handler, /health, a WebSocket route) is skipped, since there is
 * nothing to describe past its existence.
 */
export function buildOpenApiDocument(routes: CollectedRoute[], options: OpenApiOptions): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    if (!route.schema) continue;
    const openApiPath = toOpenApiPath(route.path);
    paths[openApiPath] ??= {};
    paths[openApiPath][route.method.toLowerCase()] = buildOperation(route.path, route.schema);
  }

  return {
    openapi: "3.0.3",
    info: {
      title: options.title ?? "API",
      version: options.version ?? "0.1.0",
      ...(options.description ? { description: options.description } : {}),
    },
    paths,
  };
}

function pageShell(title: string, config: Record<string, unknown>): string {
  // showDeveloperTools defaults to "localhost" in Scalar itself, which shows
  // a Configure/Share/Deploy toolbar above the reference — promotion for
  // Scalar's own hosted account, unrelated to this document. Off by default
  // here since it renders whether or not the project uses Scalar's service.
  const fullConfig = { showDeveloperTools: "never", ...config };
  return `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="api-reference"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference("#api-reference", ${JSON.stringify(fullConfig)});
    </script>
  </body>
</html>
`;
}

/**
 * A minimal page that renders an OpenAPI document with Scalar (loaded from a
 * CDN, not bundled as a dependency), fetching the document from `specUrl` —
 * a real HTTP path the page can reach at render time, e.g. what
 * `serveApiDocs()` mounts. Uses `Scalar.createApiReference()`, the
 * documented initialization API — an older pattern (a magic script tag with
 * a `data-url` attribute) is no longer reliable across Scalar versions and
 * fails outright when the page is opened as a local file rather than served
 * over HTTP, since fetching one `file://` URL from another is blocked by the
 * browser. For that case, use `apiReferenceHtmlInline()` instead.
 */
export function apiReferenceHtml(specUrl: string, title = "API Reference"): string {
  return pageShell(title, { url: specUrl });
}

/**
 * Same rendered page as `apiReferenceHtml()`, but with the OpenAPI document
 * embedded directly in the page instead of fetched from a URL — no request
 * happens at render time, so this works when the file is opened straight
 * from disk (double-clicked, `file://`) and not just when served over HTTP.
 * This is what a static-generation script (writing the page to disk rather
 * than serving it from a running app) should use.
 */
export function apiReferenceHtmlInline(spec: Record<string, unknown>, title = "API Reference"): string {
  return pageShell(title, { content: spec });
}
