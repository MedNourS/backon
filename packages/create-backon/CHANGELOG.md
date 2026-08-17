# Changelog

## 0.1.2

- Prompt copy cleanup: drop the "the ecosystem you already know" hint on the Express option, and the telemetry-specific default route name/placeholder.

## 0.1.1

- Add a framework prompt (Hono/Express) — generates the matching project either way, with framework-specific templates and `package.json` dependencies.
- Fix: remove the `@mednours/backon: workspace:*` dependency. It only resolves inside the monorepo, and publishing with `npm publish` (rather than `bun publish`) doesn't rewrite it to a real version, so `bun create backon` failed for anyone outside the monorepo. create-backon never actually needed this dependency in the first place — it only appears inside generated string templates, not in the CLI's own code.

## 0.1.0

- Initial release: prompts for project name, database (Neon/Postgres/SQLite/none via Drizzle), and routes; generates a Hono-backed project.
