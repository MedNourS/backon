# create-backon

Scaffolds a new backend project on [@mednours/backon](https://www.npmjs.com/package/@mednours/backon) —
like `bun create vite@latest`, but for a consistent controller/routes/services
backend layout. Currently generates a Hono-backed project; `@mednours/backon`
also has an Express adapter, but this CLI doesn't have a framework prompt for
it yet.

## Usage

```
bun create backon
```

Or, without the `bun create` shorthand:

```
bunx create-backon
```

Prompts for a project name, a database (Neon, Postgres, SQLite, or none — via
[Drizzle](https://orm.drizzle.team)), and any number of routes, then generates:

```
my-api/
  index.ts
  .env.example
  src/
    app.ts
    config/db.ts
    middleware/example.middleware.ts
    endpoints/
      index.ts
      <route>/
        <route>.controller.ts
        <route>.routes.ts
        <route>.services.ts
```

Each route's `*.routes.ts` wires HTTP methods to controller functions,
`*.controller.ts` validates the request via `@mednours/backon`'s
`defineRoute` and calls into `*.services.ts`, which is where real data
access belongs.

## Requirements

Bun >= 1.3.

Part of the [backon monorepo](https://github.com/mednours/backon).
