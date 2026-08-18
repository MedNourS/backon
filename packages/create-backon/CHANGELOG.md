# Changelog

## 0.9.0

- `create-backon` itself now runs via `npx create-backon`/`npm create backon`, not just `bunx`/`bun create` — the published `bin` is now a real `esbuild`-bundled `dist/cli.js` (Node-valid ESM, `#!/usr/bin/env node` shebang) instead of raw `src/cli.ts`, which only Bun could execute directly (Bun runs `.ts` natively; Node can't, and can't honor a `bun` shebang either). `bun create backon`/`bunx create-backon` still work exactly the same, unaffected — same bundle either way.
- The generated `index.ts`/`index.js` now `await`s `serve(app)` on the Hono adapter, matching `@mednours/backon` 0.7.0's `serve()` becoming async there (unaffected on the Express adapter, whose `serve()` stays synchronous).
- New "Running a generated project without Bun" README section: `@mednours/backon` 0.7.0+ genuinely runs under Node now (`@hono/node-server`, an optional peer dependency), and `create-backon` itself runs via `npx`, but a generated project's own source still uses extensionless relative imports the way Bun's bundler-style resolution expects — plain `node index.ts` refuses those (Node's ESM loader requires real extensions, TypeScript or not). [`tsx`](https://github.com/privatenumber/tsx) resolves the same permissive way Bun does, so `npx tsx index.ts` runs a generated project under plain Node with no other changes — verified against all four framework/language combinations. Generated projects still default to Bun; this isn't a change to that default, just documentation of what's actually possible without it.

## 0.8.0

- Add a "Where's this headed?" prompt during scaffolding — Vercel, another Node/Bun host, local/self-hosted only, or not sure yet. Picking Vercel adds a default export to `src/app.<ext>` (`export default app;`, additive — `index.<ext>`'s `serve()` keeps working locally exactly as before) so Vercel's zero-config Hono/Express support deploys it directly, a `vercel.json` pinning the Bun runtime (`{ "bunVersion": "1.x" }`), `.vercel` in `.gitignore`, and a "Deploying" section in the generated README. The other three answers don't change any generated code — `index.<ext>` already calls `serve(app)`, which listens on `PORT` and works on any Node/Bun host as-is — they only change what the README's "Deploying" section says. `deployTarget` is optional on the `Answers` type generateProject() takes, defaulting to the same behavior as "local"/"not sure yet".

## 0.7.0

- Add `add-method` — an interactive command for building up one endpoint's HTTP methods at a time, separate from `add-route`/`remove-route` (which stay simple whole-folder create/delete). Opens with a dashboard of every mounted endpoint and the methods it already has (colored by verb), then walks through endpoint, verb, path, name, and whether the method validates a body/query — path params are auto-derived from the path itself, body/query schemas start as a `TODO`-commented `z.object({})` like the rest of the generated scaffolding. Loops until told to stop.
- `bun run list-routes` now shows the same per-method, colored dashboard instead of just a flat list of route names.
- Routes now start blank — `add-route` and the initial `bun create backon` route prompt both write an endpoint with zero HTTP methods wired (just a mounted, empty `Router()`/`Hono()` instance) instead of a fixed GET-list/POST-create pair. Methods are always a deliberate second step via `add-method`.
- The service function each `add-method`-added method gets is typed via `z.infer<typeof theSchema>` off whatever body/query/params schema the method declared (the schema itself is exported from the controller for this), instead of the old fixed pair's `data: unknown`. JavaScript-mode projects are unaffected — there's nothing to type there.

## 0.6.2

- Fix: the generated `src/app.ts`/`src/app.js` never actually called `serveApiDocs()`, so `/docs` 404'd on the dev server even though `bun run docs` (the static generator) worked fine — the two were never wired together. `serveApiDocs(app, "/docs", { title })` is now called by default, last, after every route is mounted, so both the live `/docs` page and the static `bun run docs` output are available out of the box.

## 0.6.1

- Fix: the generated `bun run docs` script wrote a `docs.html` that fetched `openapi.json` from a URL, which failed with Scalar's "Document could not be loaded" error when the file was opened directly (double-clicked, `file://`) rather than served over HTTP — a browser blocks one `file://` URL from fetching another. `docs.html` now embeds the spec directly via `@mednours/backon`'s new `apiReferenceHtmlInline()` (requires `@mednours/backon` 0.5.0 or later), so it works either way.

## 0.6.0

- Add a `docs` script to every generated project (`bun run docs`) — writes `openapi.json` and a rendered `docs.html` reference page to disk from the app's own routes, without starting a server. Backed by a new `scripts/generate-docs.<ext>` file that imports `src/app` directly and calls `generateOpenApiSpec()`/`apiReferenceHtml()` (requires `@mednours/backon` 0.4.0 or later, which exports `apiReferenceHtml`). `openapi.json` and `docs.html` are added to the generated `.gitignore` by default, as generated build output. `scripts/` is included in the generated `tsconfig.json`/`jsconfig.json` so `bun run typecheck` covers it too.

## 0.5.0

- Generated projects now get `add-route`, `remove-route`, `list-routes`, and `doctor` scripts in their own `package.json`, so `bun run add-route users` works from inside a project without remembering the full `bunx create-backon add-route users` invocation. `bun run` forwards extra arguments straight through with no `--` separator needed. The underlying `bunx create-backon <command>` form still works everywhere, including in projects scaffolded before this change.

## 0.4.0

- Add `remove-route <name>` (alias `rm-route`) — the undo for `add-route`. Deletes the route's folder and unmounts it from `src/endpoints/index.<ext>`. Refuses if the route isn't currently mounted.
- Add `list-routes` (alias `routes`) — read-only, prints every route currently mounted in a project.
- Add `doctor` — checks `src/endpoints/` for drift against what `index.<ext>` actually mounts: a folder that exists but isn't wired up, a mount pointing at a folder that's gone, or a route folder missing one of its three expected files. Read-only; reports issues and exits non-zero if it finds any, doesn't fix them.
- Add a "Create .env from .env.example now?" confirm prompt during scaffolding (default yes) — skips the manual `cp .env.example .env` step most projects need immediately after generating.

## 0.3.0

- Add `bun create backon add-route <name>` (alias `route`) — adds a single route to an already-scaffolded project instead of requiring a full re-scaffold. Detects the project's framework and language from its `package.json`, writes the same controller/routes/services trio the full generator would have, and regenerates `src/endpoints/index.<ext>` with the new route mounted alongside whatever was already there. Run it with no name to be prompted for one interactively. Refuses to run outside a backon project, refuses a route whose folder already exists, and refuses a name that's already mounted.

## 0.2.0

- Add a language prompt (TypeScript/JavaScript) — JavaScript mode generates genuinely plain JS (no stripped type annotations, no generics), with JSDoc `@param` comments where a type annotation would otherwise have been, and a `jsconfig.json` instead of `tsconfig.json`.
- Add `.` as a valid project name, same as `bun create vite@latest .` — scaffolds directly into the current directory instead of creating a new subdirectory. The generated `package.json` name and README title fall back to the current directory's own name, since `.` isn't a valid npm package name.
- Add a safety check before writing: refuses to scaffold into a directory that already has real files in it (a short allowlist — `.git`, `.gitignore`, `README.md`, `LICENSE`, common editor folders — doesn't count, so this doesn't get in the way right after `git init`).

## 0.1.2

- Prompt copy cleanup: drop the "the ecosystem you already know" hint on the Express option, and the telemetry-specific default route name/placeholder.

## 0.1.1

- Add a framework prompt (Hono/Express) — generates the matching project either way, with framework-specific templates and `package.json` dependencies.
- Fix: remove the `@mednours/backon: workspace:*` dependency. It only resolves inside the monorepo, and publishing with `npm publish` (rather than `bun publish`) doesn't rewrite it to a real version, so `bun create backon` failed for anyone outside the monorepo. create-backon never actually needed this dependency in the first place — it only appears inside generated string templates, not in the CLI's own code.

## 0.1.0

- Initial release: prompts for project name, database (Neon/Postgres/SQLite/none via Drizzle), and routes; generates a Hono-backed project.
