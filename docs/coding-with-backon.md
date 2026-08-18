# Coding with backon

`create-backon` (the CLI — `bun create backon`, `add-route`, `remove-route`,
`list-routes`, `doctor`) only manages boilerplate: it writes files that
follow a pattern, and keeps `src/endpoints/index.<ext>` in sync with what's
on disk. It doesn't know anything about a project's actual business logic,
and it was never meant to — that part is written by hand, against
`@mednours/backon` itself.

This is the part that was missing: what the framework actually provides to
write with, once the CLI's job is done.

## The building blocks

Everything below is real, current backon 0.3.0 API — read straight from
`packages/backon/src`, not recalled from memory, and every code sample in
this document has actually been run against the published package.

### `createApp()`

```ts
import { createApp } from "@mednours/backon"; // or "@mednours/backon/express"

const app = createApp({
  allowedOrigins: ["https://example.com"], // optional — defaults to ALLOWED_ORIGINS env var, closed if unset
  bodyLimitBytes: 2 * 1024 * 1024,          // optional — defaults to 1mb
});
```

Wires, in order: request logging, secure headers, CORS (allowlist, closed by
default — nothing gets through until an origin is set), response
compression, a body size cap, a `/health` route, and a central error
handler. All of that runs before any project-specific middleware and routes.

One real difference between the two engines, worth knowing when not using
`serve()`: Hono's `createApp()` registers its error handler immediately,
because `onError()` is registration-order-independent. Express can't do
that — Express identifies error-handling middleware by its 4-argument
signature and only lets it catch errors from routes registered *before* it,
so the Express `createApp()` does **not** attach one. `serve()` calls
`attachErrorHandler(app)` automatically, after every route is registered.
When exporting the app for something other than `serve()` — a serverless
handler, a `supertest` suite — call `attachErrorHandler(app)` directly,
after every route.

### `defineRoute(schema, handler)`

The actual validation layer. `schema` is three optional Zod schemas:

```ts
export interface RouteSchema<B, Q, P> {
  body?: ZodType<B>;
  query?: ZodType<Q>;
  params?: ZodType<P>;
}
```

Skip whatever isn't needed — an empty `{}` means "no validation, just run
the handler." On failure it throws `AppError(400, "invalid_body" |
"invalid_query" | "invalid_params", ...)` with the Zod error's `.flatten()`
output as `details`, so no hand-written "if invalid, return 400" code is
ever needed:

```ts
import { z } from "zod";
import { defineRoute } from "@mednours/backon";

export const createNote = defineRoute(
  { body: z.object({ title: z.string().min(1) }) },
  async (c, { body }) => {
    const note = { id: crypto.randomUUID(), title: body.title };
    return c.json(note, 201);
  }
);
```

A bad body actually returns:

```json
{"error":{"code":"invalid_body","message":"Request body failed validation","details":{"formErrors":[],"fieldErrors":{"title":["Required"]}}}}
```

### `BackonContext`

The `c` a handler receives. Same four methods regardless of which framework
is underneath — `json`, `text`, `header`, `get`/`set` — because that's the
actual surface handlers use day to day:

```ts
c.json(data, status?)   // send JSON
c.text(data, status?)   // send plain text
c.header(name, value)   // set a response header
c.get(key)               // read request-scoped state (e.g. c.get("auth"))
c.set(key, value)        // write request-scoped state
```

On Hono, `BackonContext` is a direct alias of Hono's own `Context` — the
handler literally returns a `Response`. On Express, there's no `Response` to
return: `c.json()`/`c.text()` send the response as a side effect via
`res.json()`/`res.send()`, and the handler's return value is ignored. The
handler *code* reads identically either way; what happens underneath
doesn't. For anything past that shared surface — cookies, redirects, or
whatever `defineStream`/`defineUpload`/`defineWebSocket` (below) don't
cover — the Express context exposes `.raw.req`/`.raw.res` as an escape
hatch to the real Express objects; Hono's context provides the same by
using its native methods directly, since `BackonContext` *is* the Hono
context there.

### `serve(app, port?)`

Starts the app (Bun's native server for Hono, `app.listen` for Express) and
wires graceful shutdown — on `SIGTERM`/`SIGINT`, stop accepting new
connections, let in-flight requests finish, then exit. Port defaults to the
`PORT` env var, then `3000`.

### `AppError`

The one error type backon's error handler treats as "expected":

```ts
import { AppError } from "@mednours/backon";

throw new AppError(404, "note_not_found", `No note with id ${id}`);
// optionally a 4th arg for `details`, same as defineRoute's own validation errors
```

Every response — from `defineRoute`'s own validation, from a manually thrown
`AppError`, or from an actual bug — comes back in the same shape:

```ts
interface ErrorResponseBody {
  error: { code: string; message: string; details?: unknown };
}
```

Anything that *isn't* an `AppError` (a real exception, a bug) gets logged at
error level and turned into a generic `{"error":{"code":"internal_error",...}}`
500 — internals never leak to the client by accident.

### `requireEnv(schema)`

Validates `process.env` once, at startup, against a Zod schema. Typically in
`src/config/env.ts`:

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

`env.DATABASE_URL` is typed as `string`, not `string | undefined` — the app
fails fast at boot with every missing/invalid var named at once, instead of
crashing later on whichever request happens to touch an unset var first.

### `requireAuth(options)`

Bearer JWT verification middleware. Apply it per-route or per-router, not
globally — most APIs have public routes too:

```ts
import { requireAuth } from "@mednours/backon";

app.get(
  "/whoami",
  requireAuth({ secret: process.env.JWT_SECRET! }), // options.alg defaults to HS256
  defineRoute({}, (c) => c.json({ auth: c.get("auth") }))
);
```

Verified live: no token → `401 {"error":{"code":"unauthorized",...}}`; a
valid token → the decoded payload is on `c.get("auth")`. This is
verification only — issuing tokens (login, refresh, revocation) is
deliberately left to the consuming project, since that's genuinely
project-specific.

### `rateLimit(options)`

In-memory token-bucket limiter, applied the same way:

```ts
import { rateLimit } from "@mednours/backon";

app.get(
  "/limited",
  rateLimit({ windowMs: 60_000, max: 2 }), // defaults: 60s window, 60 max
  defineRoute({}, (c) => c.json({ ok: true }))
);
```

Verified live against `max: 2` — the first two requests return `200`, the
third returns `429` with a `Retry-After` header. Per-process state: resets
on restart, doesn't share counts across multiple instances. Fine for one
long-running server; swap in something Redis-backed for anything
horizontally scaled.

### `defineWebSocket(handlers)`

Registers a WebSocket route with `onOpen`/`onMessage`/`onClose` handlers.
Each handler gets a `ws` value with `.send()`/`.close()`.

```ts
app.get("/ws", defineWebSocket({
  onMessage: (ws, data) => ws.send(`echo: ${data}`),
}));
```

Verified live against a real `WebSocket` client — a message sent to `/ws`
comes back as `echo: <message>`. On Hono the handshake happens at
`Bun.serve()`'s own level (an HTTP upgrade, not an ordinary request/response
cycle), which is why this only works through this package's own `serve()`
— it passes `hono/bun`'s upgrade handler into `Bun.serve()` so the upgrade
can happen at all.

On Express there is no route-level concept of an HTTP upgrade — only the
`ws` package's own server has one, and that server doesn't exist until
`serve()` is actually listening. The signature reflects this difference: it
takes `app` and a `path` rather than being handed to `app.get()`, and can be
called any time before `serve()` runs:

```ts
import { defineWebSocket, serve } from "@mednours/backon/express";

defineWebSocket(app, "/ws", {
  onMessage: (ws, data) => ws.send(`echo: ${data}`),
});

serve(app); // attaches a WebSocketServer per registered path once the real http.Server exists
```

### `defineStream(handler)`

Registers a route that writes its response in chunks as they arrive, rather
than building one body in memory and returning it whole — server-sent
events, a large export, anything too slow or too big to buffer first. The
handler receives a `write(chunk)` function.

```ts
app.get("/export", defineStream(async (c, write) => {
  for (const row of rows) await write(JSON.stringify(row) + "\n");
}));
```

Verified live with `curl -N` — chunks arrive as they're written, not all at
once at the end. Set a Content-Type via `c.header()` before the first
`write()` if the default (left to the client to infer) isn't right for what's
being sent.

### `defineUpload(options, handler)`

Parses a `multipart/form-data` request, validating each file against
`maxFileSizeBytes`/`allowedMimeTypes` before the handler runs — the same
"validate first, throw `AppError(400, ...)` on failure" contract as
`defineRoute()`, just for files instead of a JSON body:

```ts
app.post(
  "/avatar",
  defineUpload(
    { maxFileSizeBytes: 2 * 1024 * 1024, allowedMimeTypes: ["image/png", "image/jpeg"] },
    async (c, { files }) => c.json({ uploaded: files.avatar.length })
  )
);
```

`files.avatar` is always an array, even for a single file — multiple files
uploaded under the same field name all land in that field's array. MIME
checks compare only the base type, ignoring parameters like
`;charset=utf-8` that a real Content-Type header can carry (found via a
live upload that was wrongly rejected before this fix, not by inspection).

Verified live: an allowed file under the size limit is accepted, an
oversized file returns `400 file_too_large`, a disallowed type returns `400
unsupported_file_type`. On Express, this is built on `multer` with
in-memory storage — nothing written to disk, since the handler decides what
happens to the data — because Express has no built-in multipart parser the
way Hono's `c.req.parseBody()` is. `multer` is an optional peer dependency,
only required when `defineUpload` is actually used.

### `generateOpenApiSpec(app)` / `serveApiDocs(app, path, options)`

Builds an OpenAPI 3.0 document from the routes registered on `app`, reusing
the same Zod schemas `defineRoute()` validates against — the spec is
derived from the schemas actually enforced at runtime instead of a
hand-written document that can drift out of sync with them. A route with no
schema (a plain handler, `/health`, a WebSocket route) is skipped.

```ts
import { serveApiDocs } from "@mednours/backon";

serveApiDocs(app, "/docs", { title: "My API" });
// GET /docs/openapi.json -> the raw spec
// GET /docs              -> a rendered reference page (Scalar, from a CDN)
```

Call after every other route is registered — this reads the route table as
it stands at call time. On Express, routes are read from a registry that
`createApp()` and `Router()` (exported from `@mednours/backon/express`)
both populate as routes are added, since Express's own internal router has
no stable, documented way to walk nested mounts. Registering routes on an
unwrapped `express.Router()` still works for routing; those routes just
won't appear in the generated spec.

```ts
import { createApp, Router, defineRoute, serveApiDocs, serve } from "@mednours/backon/express";

const app = createApp();
const users = Router();
users.get("/", defineRoute({}, (c) => c.json({ users: [] })));
app.use("/users", users);

serveApiDocs(app, "/docs", { title: "My API" });
serve(app);
```

Verified live: `GET /docs/openapi.json` returns a spec with `/users` in
`paths`; `GET /docs` returns an HTML page with that same document embedded
directly (via `apiReferenceHtmlInline()`, below) rather than fetched from
the JSON route — one less request, and the page keeps working even if the
JSON route is renamed or removed later.

`generateOpenApiSpec()` reads the route table `createApp()`/`Router()` build
at import time — it needs the app's routes registered, not a running server,
so it works from a plain script too. `apiReferenceHtmlInline(spec, title?)`
(the page `serveApiDocs` renders) is exported for the same reason: a build
step that writes both files to disk instead of serving them live. It embeds
the spec directly rather than pointing at a URL, which matters here — a
page that instead fetches a sibling `openapi.json` fails when opened
straight from disk (double-clicked, `file://`), since a browser blocks one
`file://` URL from fetching another. (An earlier version of this script
used a URL-based page and hit exactly that failure — Scalar's own "Document
could not be loaded" error — the first time it was opened directly instead
of served over HTTP.)

```ts
import { writeFileSync } from "node:fs";
import { generateOpenApiSpec, apiReferenceHtmlInline } from "@mednours/backon";
import { app } from "./src/app";

const spec = generateOpenApiSpec(app, { title: "My API" });
writeFileSync("openapi.json", JSON.stringify(spec, null, 2));
writeFileSync("docs.html", apiReferenceHtmlInline(spec, "My API"));
```

This is exactly what `create-backon`'s generated `bun run docs` script does
— see the next section. `apiReferenceHtml(specUrl, title?)` is the
URL-based counterpart, for a page that fetches its spec from a real HTTP
path — useful for pointing a reference page at a spec hosted elsewhere, but
not for a file written to disk.

## Writing a route entirely by hand

This is what `add-route` actually generates, laid out explicitly to make
extending or deviating from it straightforward. A `notes` resource, Hono
flavor (Express reads almost identically — see the CLI-generated
`*.routes.ts` for the exact diff):

```ts
// src/endpoints/notes/notes.services.ts
export async function list() {
  return []; // swap for a real query
}
export async function create(data: { title: string }) {
  return { id: crypto.randomUUID(), ...data };
}
```

```ts
// src/endpoints/notes/notes.controller.ts
import { z } from "zod";
import { defineRoute } from "@mednours/backon";
import * as service from "./notes.services";

export const list = defineRoute({}, async (c) => {
  const items = await service.list();
  return c.json(items);
});

const createNoteSchema = z.object({ title: z.string().min(1) });

export const create = defineRoute({ body: createNoteSchema }, async (c, { body }) => {
  const item = await service.create(body);
  return c.json(item, 201);
});
```

```ts
// src/endpoints/notes/notes.routes.ts
import { Hono, type Env } from "@mednours/backon";
import * as controller from "./notes.controller";

export const notesRoutes = new Hono<Env>();
notesRoutes.get("/", controller.list);
notesRoutes.post("/", controller.create);
```

```ts
// src/endpoints/index.ts
import { Hono } from "@mednours/backon";
import { notesRoutes } from "./notes/notes.routes";

export const endpoints = new Hono();
endpoints.route("/notes", notesRoutes);
```

That's exactly what `add-route notes` writes. Once this shape is
understood, editing any of it by hand — adding a `PATCH`, adding a nested
resource, changing validation — is just editing a normal file. The CLI
never needs to be involved again for that route.

### Adding something the pattern doesn't cover

A lookup by ID with a hand-thrown 404, added straight into the controller
above:

```ts
export const getOne = defineRoute(
  { params: z.object({ id: z.string() }) },
  async (c, { params }) => {
    const note = await service.findById(params.id);
    if (!note) {
      throw new AppError(404, "note_not_found", `No note with id ${params.id}`);
    }
    return c.json(note);
  }
);
```

and in `notes.routes.ts`: `notesRoutes.get("/:id", controller.getOne);`.
Nothing here is generated — it's just backon's own primitives, used the same
way anywhere else in the app.

### Custom middleware

Not every cross-cutting concern is `requireAuth` or `rateLimit`. Writing one
is a plain Hono/Express middleware function — a response-timing header,
verified live:

```ts
import type { BackonContext, Next } from "@mednours/backon";

export async function timing(c: BackonContext, next: Next) {
  const start = performance.now();
  await next();
  c.header("x-response-time-ms", String(Math.round(performance.now() - start)));
}

app.use("*", timing); // or app.use("/notes/*", timing) for one resource
```

## Where the CLI actually helps

`bun create backon` scaffolds the shell once. `add-route`/`remove-route`
keep the controller/routes/services trio and `index.<ext>` in sync so that
wiring doesn't need hand-editing for routine CRUD resources. `doctor`
catches it when that sync drifts (a folder that got deleted by hand, a
stray mount). None of that reaches into `*.services.ts` or writes real
logic — that part was always meant to be written the way the example above
was, directly against
`createApp`/`defineRoute`/`AppError`/`requireAuth`/`rateLimit` and the
WebSocket/streaming/upload/OpenAPI helpers above. The CLI removes the
boilerplate around that code, not the code itself.
