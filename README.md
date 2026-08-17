# backon

[![CI](https://github.com/mednours/backon/actions/workflows/ci.yml/badge.svg)](https://github.com/mednours/backon/actions/workflows/ci.yml)

A small backend toolkit for Bun, published as two packages:

- **[`@mednours/backon`](packages/backon)** — an opinionated wrapper over Hono (default) or Express (via `@mednours/backon/express`), with baked-in security headers, CORS, request logging, body size limits, Zod-validated routes, and consistent error handling.
- **[`create-backon`](packages/create-backon)** — a CLI that scaffolds a new project on `@mednours/backon`, prompting for a framework (Hono / Express), a database (Neon / Postgres / SQLite / none, via Drizzle), and routes, and generating a controller/routes/services layout per route.

## Quick start

```
bun create backon
cd my-api
bun install
bun run dev
```

See each package's own README for details. This repo is a Bun workspace — `bun install` at the root installs both packages together for local development.
