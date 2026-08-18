# @mednours/backon

Opinionated backend framework wrapper for Bun. Two adapters, same names,
same JSON error shape, same defaults — pick per project:

- `@mednours/backon` (default export) — wraps [Hono](https://hono.dev)
- `@mednours/backon/express` — wraps [Express](https://expressjs.com); requires `express`, `cors`, `helmet`, and `compression` as peer dependencies in the consuming project

## Install

```
bun add @mednours/backon
```

## Quick start

```ts
import { createApp, defineRoute, serve } from "@mednours/backon";
import { z } from "zod";

const app = createApp();

app.get(
  "/hello",
  defineRoute({ query: z.object({ name: z.string().optional() }) }, (c, { query }) =>
    c.json({ message: `hello ${query.name ?? "world"}` })
  )
);

serve(app);
```

## What `createApp()` wires in by default

- Structured request logging ([pino](https://getpino.io)) with a request id on every response
- Secure response headers
- CORS locked to an `ALLOWED_ORIGINS` allowlist — closed by default, not open
- Response compression
- A 1mb request body size cap (413 on overflow)
- An auto-registered `GET /health`
- A central error handler: throw `AppError(statusCode, code, message, details?)` for expected failures, anything else becomes a generic 500 with internals never leaked to the client

## `defineRoute(schema, handler)`

Validates `body`/`query`/`params` against Zod schemas before the handler runs, and hands the handler already-parsed, typed data. On failure it throws `AppError(400, "invalid_body" | "invalid_query" | "invalid_params", ...)` with the Zod error attached as `details`, caught automatically by `createApp()`'s error handler.

```ts
app.post(
  "/users",
  defineRoute({ body: z.object({ name: z.string() }) }, async (c, { body }) => {
    return c.json({ id: crypto.randomUUID(), name: body.name }, 201);
  })
);
```

## `serve(app)`

Runs on Bun's native server (Express adapter: Node's http server via Express's own `app.listen`) with graceful shutdown wired to `SIGTERM`/`SIGINT` — new connections stop being accepted and in-flight requests finish before exit.

**Express-specific:** `serve(app)` also registers the central error handler. Do this *after* every route is registered, not inside `createApp()` — Express's error-handling middleware only catches errors from routes registered *before* it, the opposite of Hono's `onError()`. When not using this `serve()` (wrapping the app for a serverless platform, or a `supertest` suite), call `attachErrorHandler(app)` directly, after every route.

```ts
import { createApp, defineRoute, serve } from "@mednours/backon/express";
import { z } from "zod";

const app = createApp();

app.get(
  "/hello",
  defineRoute({ query: z.object({ name: z.string().optional() }) }, (c, { query }) =>
    c.json({ message: `hello ${query.name ?? "world"}` })
  )
);

serve(app); // attaches the error handler, then app.listen()
```

## `requireEnv(schema)`

Validates `process.env` against a Zod schema once, at startup, and returns the parsed (typed) result. Fails fast with every missing/invalid var named in one error, instead of the app booting cleanly and only crashing later on whichever request happens to touch a var nobody set.

```ts
import { z } from "zod";
import { requireEnv } from "@mednours/backon";

export const env = requireEnv(
  z.object({
    DATABASE_URL: z.string().url(),
    PORT: z.coerce.number().default(3000),
  })
);
```

## `requireAuth(options)`

Verifies a bearer JWT and makes the decoded payload available on the context — `c.get("auth")` (Hono) or `res.locals.auth` (Express, or `c.get("auth")` inside a `defineRoute` handler). Throws `AppError(401, "unauthorized", ...)` if the header is missing, malformed, or the token fails verification (bad signature, expired, wrong algorithm). Built on `hono/jwt` rather than a new dependency, since `hono` is already a hard dependency of this package regardless of which adapter is in use.

This is verification only — issuing tokens (login, signup, refresh rotation, revocation) is left to the consuming project, since that's genuinely different per project and baking in an opinion there risks being wrong for whatever actually uses it. The algorithm defaults to `HS256` and must be set explicitly rather than trusted from the token's own header — trusting that is how `alg: none` and algorithm-confusion attacks work.

```ts
import { requireAuth } from "@mednours/backon";

app.use("/api/*", requireAuth({ secret: process.env.JWT_SECRET! }));
app.get("/api/me", (c) => c.json({ auth: c.get("auth") }));
```

## `rateLimit(options)`

In-memory token-bucket rate limiter. Throws `AppError(429, "rate_limited", ...)` once a key exceeds `max` requests within `windowMs`, with a `Retry-After` header set to when the window resets. Defaults to 60 requests per minute, keyed by the caller's IP; override either with `options`.

**Per-process state** — resets on restart and doesn't share counts across multiple instances or serverless invocations. Fine for a single long-running server; for anything horizontally scaled, back it with Redis instead.

```ts
import { rateLimit } from "@mednours/backon";

app.use("/auth/login", rateLimit({ windowMs: 60_000, max: 5 })); // tighter limit on a login route
```

## `defineWebSocket(handlers)`

Registers a WebSocket route with `onOpen`/`onMessage`/`onClose` handlers, each getting a `ws` handle with `.send()`/`.close()`.

On Hono, the handshake happens at `Bun.serve()`'s own level (an HTTP upgrade, not an ordinary request/response cycle), so this only works with the `serve()` this package exports — it passes `hono/bun`'s websocket handler into `Bun.serve()` under the hood. Register it like any other route:

```ts
app.get("/ws", defineWebSocket({
  onMessage: (ws, data) => ws.send(`echo: ${data}`),
}));
```

On Express, there is no route-level concept of an HTTP upgrade — only the `ws` package's own server has one, and that server doesn't exist until `serve()` is actually listening. The signature differs slightly to reflect this: it takes `app` and a `path` instead of being handed to `app.get()`, and can be called any time before `serve()`.

```ts
import { defineWebSocket, serve } from "@mednours/backon/express";

defineWebSocket(app, "/ws", {
  onMessage: (ws, data) => ws.send(`echo: ${data}`),
});

serve(app); // attaches a WebSocketServer per registered path once the real http.Server exists
```

## `defineStream(handler)`

Registers a route that writes its response in chunks as they become available, instead of building one body in memory and returning it all at once — server-sent events, a large export, anything too slow or too big to buffer first. The handler gets a `write(chunk)` function.

```ts
app.get("/export", defineStream(async (c, write) => {
  for (const row of rows) await write(JSON.stringify(row) + "\n");
}));
```

Set a Content-Type via `c.header()` before the first `write()` if the default (left to the client to infer) isn't right for what's being sent.

## `defineUpload(options, handler)`

Parses a `multipart/form-data` request, validating each file against `maxFileSizeBytes`/`allowedMimeTypes` before the handler runs — the same "validate first, throw `AppError(400, ...)` on failure" contract as `defineRoute()`, just for files instead of a JSON body. Fields uploaded more than once under the same name all land under that field's array, so `files.avatar` is always an array, even with one file. MIME type checks compare only the base type, ignoring parameters like `;charset=utf-8` on the Content-Type header.

```ts
app.post(
  "/avatar",
  defineUpload(
    { maxFileSizeBytes: 2 * 1024 * 1024, allowedMimeTypes: ["image/png", "image/jpeg"] },
    async (c, { files }) => c.json({ uploaded: files.avatar.length })
  )
);
```

On Express, this is built on `multer` with in-memory storage (never written to disk — the handler decides what happens to the data), since Express has no built-in multipart parser the way Hono's `c.req.parseBody()` is. `multer` is an optional peer dependency, only required when `defineUpload` is actually used.

## `generateOpenApiSpec(app)` / `serveApiDocs(app, path, options)`

Builds an OpenAPI 3.0 document from the routes registered on `app`, using the same Zod schemas `defineRoute()` validates against — the spec is derived from the schemas actually enforced at runtime instead of a hand-written document that can drift out of sync with them. A route with no schema (a plain handler, `/health`, a WebSocket route) is skipped, since there is nothing to describe past its existence.

`serveApiDocs` mounts the document as JSON plus a rendered reference page built on [Scalar](https://github.com/scalar/scalar), loaded from a CDN rather than bundled as a dependency. Call it after every other route is registered, same registration-order rule as anything else reading the app's route table.

```ts
import { serveApiDocs } from "@mednours/backon";

serveApiDocs(app, "/docs", { title: "My API" });
// GET /docs/openapi.json -> the raw spec
// GET /docs              -> a rendered API reference page
```

`apiReferenceHtmlInline(spec, title?)`, the same rendered page `serveApiDocs` uses, is also exported directly — useful for a build step that writes the spec and the reference page to static files instead of serving them from a running app. It embeds the document straight into the page rather than pointing at a URL, so the result works when opened directly from disk (double-clicked, `file://`), not only when served over HTTP — a page that instead fetches a sibling `openapi.json` fails there, since a browser blocks one `file://` URL from fetching another:

```ts
import { writeFileSync } from "node:fs";
import { generateOpenApiSpec, apiReferenceHtmlInline } from "@mednours/backon";
import { app } from "./src/app";

const spec = generateOpenApiSpec(app, { title: "My API" });
writeFileSync("openapi.json", JSON.stringify(spec, null, 2));
writeFileSync("docs.html", apiReferenceHtmlInline(spec, "My API"));
```

`apiReferenceHtml(specUrl, title?)` is the URL-based counterpart, for a reference page that fetches its spec from a real HTTP path instead — this is what `serveApiDocs` used to use for its own page, before switching to the inline version to remove the extra request. Still useful directly for pointing a reference page at a spec hosted somewhere else.

On Express, routes are read from a registry `createApp()` and `Router()` (exported from `@mednours/backon/express`) both populate as routes are added — using Express's own unwrapped `express.Router()` instead means those routes won't appear in the generated spec.

```ts
import { createApp, Router, defineRoute, serveApiDocs, serve } from "@mednours/backon/express";

const app = createApp();
const users = Router();
users.get("/", defineRoute({}, (c) => c.json({ users: [] })));
app.use("/users", users);

serveApiDocs(app, "/docs", { title: "My API" });
serve(app);
```

## Requirements

Bun >= 1.3. This package ships TypeScript source directly (no build step) since it's Bun-only by design.

Part of the [backon monorepo](https://github.com/mednours/backon) — see [`create-backon`](https://www.npmjs.com/package/create-backon) to scaffold a new project on top of this.
