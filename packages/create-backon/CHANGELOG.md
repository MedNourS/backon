# Changelog

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
