# Changelog

## 0.7.0

**Breaking:** `serve(app)` (Hono adapter) is now `async` — `await` it. The Express adapter's `serve()` is unaffected, still synchronous.

- The Hono adapter now runs on Node too, not just Bun: `serve(app)` runs `Bun.serve()` when the process is on Bun (the default, and the faster of the two), or [`@hono/node-server`](https://github.com/honojs/node-server)'s `serve()` when it's on Node instead, detected automatically at call time. `@hono/node-server` is a new *optional* peer dependency — install it yourself (`npm install @hono/node-server`) only if the app actually runs on Node; Bun-only projects need nothing extra. `serve()` had to become async to support this — it dynamically imports whichever of `hono/bun`/`@hono/node-server` the current runtime actually needs, rather than a static import that would otherwise crash at *module load time* under whichever runtime it doesn't match (`hono/bun` touches Bun's global the moment it's imported, which used to make importing `@mednours/backon` at all — not just calling `serve()` — throw immediately under Node, since `defineWebSocket` statically imported it and `index.ts` re-exports `defineWebSocket`).
- `defineWebSocket()` (Hono adapter) still only actually works on Bun — there's no Node equivalent wired up yet — but a route registered with it now throws a clear error the moment it's hit under Node, instead of crashing the whole package at import time regardless of whether the route is ever used.
- This package now ships a real `dist/` build for Node consumers (`tsc` for declarations, `esbuild` for the actual JS — plain `tsc` alone can't emit Node-valid ESM here, since the source's extensionless relative imports are fine under `moduleResolution: "bundler"` but rejected outright by Node's runtime resolver). Bun consumers are unaffected: package.json's new `"bun"` export condition resolves straight to this package's TypeScript source, same zero-build-step experience as before. This was a real gap, not just an unused code path — Node explicitly refuses its own native TypeScript execution for anything under `node_modules`, so previously, an `@mednours/backon` `dependencies` entry could not be imported under Node *at all*, regardless of `serve()`.
- `engines` now lists `"node": ">=18.14.1"` alongside the existing `"bun": ">=1.3.0"` — the floor `@hono/node-server` itself supports.

## 0.6.0

- Fix: the rendered reference page (`apiReferenceHtml()`, `apiReferenceHtmlInline()`, and `serveApiDocs()`'s own `/docs` route) showed a "Developer Tools" toolbar with Configure/Share/Deploy buttons above the content on `localhost` — Scalar's `showDeveloperTools` option defaults to `"localhost"`, and it's promotion for Scalar's own hosted account, unrelated to the document being viewed. Now set to `"never"` by default.

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
