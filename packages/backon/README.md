# @mednours/backon

Opinionated backend framework wrapper for Bun. Two adapters, same names,
same JSON error shape, same defaults — pick per project:

- `@mednours/backon` (default export) — wraps [Hono](https://hono.dev)
- `@mednours/backon/express` — wraps [Express](https://expressjs.com); requires `express`, `cors`, `helmet`, and `compression` as peer dependencies in your own project

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

Validates `body`/`query`/`params` against Zod schemas before your handler runs, and hands the handler already-parsed, typed data. On failure it throws `AppError(400, "invalid_body" | "invalid_query" | "invalid_params", ...)` with the Zod error attached as `details`, caught automatically by `createApp()`'s error handler.

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

**Express-specific:** `serve(app)` also registers the central error handler for you. Do this *after* every route is registered, not inside `createApp()` — Express's error-handling middleware only catches errors from routes registered *before* it, the opposite of Hono's `onError()`. If you're not using this `serve()` (wrapping the app for a serverless platform, or a `supertest` suite), call `attachErrorHandler(app)` yourself, after your routes.

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

## Requirements

Bun >= 1.3. This package ships TypeScript source directly (no build step) since it's Bun-only by design.

Part of the [backon monorepo](https://github.com/mednours/backon) — see [`create-backon`](https://www.npmjs.com/package/create-backon) to scaffold a new project on top of this.
