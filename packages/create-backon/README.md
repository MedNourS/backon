# create-backon

Scaffolds a new backend project on [@mednours/backon](https://www.npmjs.com/package/@mednours/backon) —
like `bun create vite@latest`, but for a consistent controller/routes/services
backend layout. Prompts for Hono or Express and generates the matching
project either way.

## Usage

```
bun create backon
```

Or, without the `bun create` shorthand:

```
bunx create-backon
```

Prompts for a project name (or `.` to scaffold into the current directory,
same as `bun create vite@latest .`), a framework (Hono or Express), a
language (TypeScript or JavaScript), a database (Neon, Postgres, SQLite, or
none — via [Drizzle](https://orm.drizzle.team)), whether to create `.env`
from `.env.example` right away (default yes — skips the manual `cp` step),
and any number of routes, then generates:

```
my-api/
  index.ts        (or .js in JavaScript mode)
  .env.example
  tsconfig.json    (jsconfig.json in JavaScript mode)
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
`*.controller.ts` validates the request via `defineRoute` (from
`@mednours/backon` or `@mednours/backon/express`, depending on the
framework you picked) and calls into `*.services.ts`, which is where real
data access belongs. In JavaScript mode every file is generated without any
TypeScript-only syntax (no `import type`, no generics, no type
annotations) — it's not TypeScript with the types stripped, it's meant to
be genuinely plain JavaScript, with JSDoc `@param` comments on the one
generated function (the example middleware) that would otherwise have had
a type annotation, so editors still get intellisense without requiring
TypeScript as a dependency.

Scaffolding into `.` (or any directory) refuses to run if the target
already has real files in it — a few common exceptions (`.git`,
`.gitignore`, `README.md`, `LICENSE`, editor folders) are allowed through so
running this right after `git init` on a fresh repo doesn't get blocked.

## Adding a route to an existing project

Re-running the full generator isn't the way to add one more route to a
project you already scaffolded. Use the `add-route` subcommand instead,
from inside the project:

```
bunx create-backon add-route users
```

(`bun create backon add-route users` also works — `bun create` forwards
extra arguments straight through. `route` works as a shorthand for
`add-route` either way.) Leave the name off and it'll prompt for one:

```
bunx create-backon add-route
```

It reads the project's own `package.json` to figure out whether it's
Hono or Express, TypeScript or JavaScript — no need to answer those again
— then writes `src/endpoints/users/users.controller.ts` (or `.routes`,
`.services`, matching whatever the rest of the project already generates),
and regenerates `src/endpoints/index.ts` so the new route is mounted next
to the ones that were already there. It refuses to run outside a backon
project, refuses a route name whose folder already exists, and refuses a
name that's already mounted.

## Removing a route

The undo for `add-route`:

```
bunx create-backon remove-route users
```

(`rm-route` also works.) Leave the name off to be prompted for one. Either
way you'll be asked to confirm before anything is deleted — this removes
`src/endpoints/users/` and unmounts it from `src/endpoints/index.ts`.
Refuses if the route isn't currently mounted, rather than guessing at
deleting a folder that was never wired up.

## Listing routes

```
bunx create-backon list-routes
```

(`routes` also works.) Read-only — prints every route currently mounted in
`src/endpoints/index.ts`.

## Checking a project for drift

```
bunx create-backon doctor
```

Compares what's actually in `src/endpoints/` against what `index.<ext>`
mounts, and flags three things: a route folder that exists but isn't
mounted (an orphan), a mount in `index.<ext>` pointing at a folder that's
gone (dangling), and a route folder missing one of its three expected
files. This kind of drift usually comes from hand-editing `index.ts`,
deleting a route folder without using `remove-route`, or copy-pasting a
route folder without wiring it up. `doctor` only reports issues — it
doesn't fix them — and exits non-zero if it finds any, so it's usable in
a pre-commit hook or CI step.

## Requirements

Bun >= 1.3.

Part of the [backon monorepo](https://github.com/mednours/backon).
