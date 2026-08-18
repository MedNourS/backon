# Changelog

## 0.5.0

- Fix: the reference page `serveApiDocs()`/`apiReferenceHtml()` rendered used a legacy Scalar auto-init pattern (a `<script id="api-reference" data-url="...">` tag) that isn't reliable across Scalar versions and fails outright — Scalar's own "Document could not be loaded" error — when the page is opened as a local file instead of served over HTTP, since a browser blocks one `file://` URL from fetching another. Both `apiReferenceHtml()` and the new `apiReferenceHtmlInline()` now use `Scalar.createApiReference()`, the documented initialization API.
- Add `apiReferenceHtmlInline(spec, title?)` — same rendered page, with the OpenAPI document embedded directly instead of fetched from a URL. `serveApiDocs()`'s own `/docs` page now uses this internally (one less request, and it keeps working if the JSON route is ever renamed). This is also what a static-generation script should use — see `create-backon`'s `bun run docs` script, which hit this exact bug and is now fixed by it.

## 0.4.0

- Export `apiReferenceHtml(specUrl, title?)` directly from both adapters. It was already used internally by `serveApiDocs()`; exporting it lets a build script render the same reference page to a static file without needing a live server — see `create-backon`'s new `bun run docs` script.

## 0.3.0

- Add `defineWebSocket(handlers)` — WebSocket routes for both adapters. Hono runs on `hono/bun`'s upgrade handler via this package's own `serve()`; Express attaches a `ws` `WebSocketServer` once the real `http.Server` exists.
- Add `defineStream(handler)` — chunked-response routes for both adapters, for server-sent events, large exports, or anything too slow or too big to buffer into one response body.
- Add `defineUpload(options, handler)` — `multipart/form-data` parsing for both adapters, validating each file against `maxFileSizeBytes`/`allowedMimeTypes` before the handler runs. Express version built on `multer` (memory storage, now an optional peer dependency).
- Add `generateOpenApiSpec(app)` / `serveApiDocs(app, path, options)` — an OpenAPI 3.0 document built from `defineRoute()`'s own Zod schemas, plus a rendered reference page (Scalar, loaded from a CDN). Express's version reads a route registry populated by `createApp()` and the newly exported `Router()` wrapper, since Express's own internal router has no stable, documented way to walk nested mounts.
- Export `Router` from `@mednours/backon/express` — wraps `express.Router()` so routes registered on it are visible to `generateOpenApiSpec`. Using unwrapped `express.Router()` still works for routing; its routes just won't appear in the generated spec.

## 0.2.0

- Add `requireEnv(schema)` — validates `process.env` against a Zod schema once at startup, fails fast with every missing/invalid var named instead of the app booting cleanly and crashing later.
- Add `requireAuth(options)` — bearer JWT verification middleware for both adapters, built on `hono/jwt`. Verification only; issuing tokens is left to the consuming project.
- Add `rateLimit(options)` — in-memory token-bucket rate limiter for both adapters, 429 with a `Retry-After` header once a key exceeds its limit.

## 0.1.0

- Initial release: Hono adapter (`createApp`, `defineRoute`, `serve`, `AppError`, structured logging) plus an Express adapter with the same names and error shape, under `@mednours/backon/express`.
