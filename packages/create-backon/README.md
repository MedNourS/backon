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

No Bun installed? `npx create-backon` and `npm create backon` both work too
— same scaffolder either way, generated projects still default to Bun
scripts (see [Running a generated project without Bun](#running-a-generated-project-without-bun)
if that's not an option).

Prompts for a project name (or `.` to scaffold into the current directory,
same as `bun create vite@latest .`), a framework (Hono or Express), a
language (TypeScript or JavaScript), a database (Neon, Postgres, SQLite, or
none — via [Drizzle](https://orm.drizzle.team)), where it's headed
([Vercel](#deploying-to-vercel), another Node/Bun host, local-only, or not
sure yet), whether to create `.env` from `.env.example` right away (default
yes — skips the manual `cp` step), and any number of routes, then generates:

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

Every route starts blank — a folder mounted in `src/endpoints/index.ts`
with zero HTTP methods wired up yet. `bun run add-method` (below) adds
them one at a time: each one appends a `defineRoute`-wrapped export to
`*.controller.ts` (from `@mednours/backon` or `@mednours/backon/express`,
depending on the framework picked), a matching function to `*.services.ts`
— typed via `z.infer` off whatever schema the method declared, so the
service layer doesn't just see `unknown` — and the mount line to
`*.routes.ts`. In JavaScript mode every file is generated without any
TypeScript-only syntax (no `import type`, no generics, no type
annotations) — generated files are genuinely plain JavaScript rather than
TypeScript with the types stripped, with JSDoc `@param` comments on the one
generated function (the example middleware) that would otherwise have had
a type annotation, so editors still get intellisense without requiring
TypeScript as a dependency.

Scaffolding into `.` (or any directory) refuses to run if the target
already has real files in it — a few common exceptions (`.git`,
`.gitignore`, `README.md`, `LICENSE`, editor folders) are allowed through so
running this right after `git init` on a fresh repo doesn't get blocked.

## Adding a route to an existing project

Re-running the full generator isn't the way to add one more route to an
already-scaffolded project. Every generated project's `package.json`
includes a script for this, so from inside the project:

```
bun run add-route users
```

`bun run` forwards `users` straight through, no `--` needed. Leave the name
off and it prompts for one:

```
bun run add-route
```

The same command also works outside a generated `package.json`, or for a
project scaffolded before this script existed:

```
bunx create-backon add-route users
```

(`bun create backon add-route users` also works — `bun create` forwards
extra arguments straight through. `route` works as a shorthand for
`add-route` either way, and `bun run add-route` is exactly this command
under a shorter name.)

It reads the project's own `package.json` to figure out whether it's
Hono or Express, TypeScript or JavaScript — no need to answer those again
— then writes a blank `src/endpoints/users/users.controller.ts` (or
`.routes`, `.services` — zero methods yet, same as the initial scaffold),
and regenerates `src/endpoints/index.ts` so the new route is mounted next
to the ones that were already there. It refuses to run outside a backon
project, refuses a route name whose folder already exists, and refuses a
name that's already mounted. Run `add-method` next to give the new route
an actual GET/POST/etc — or add `--crud` to wire up the standard five in
one go instead of one at a time:

```
bun run add-route users --crud
```

Adds `list` (GET /), `create` (POST /), `getById` (GET /:id), `update`
(PUT /:id), and `remove` (DELETE /:id) right after creating the route —
the exact same names `add-method`'s own suggestions already default to,
just all five at once. Leave `--crud` off (or say no to the "Scaffold
standard CRUD methods now?" prompt when running `add-route` with no name)
to get the usual blank endpoint instead.

## Adding a method to a route

Interactive, and separate from `add-route` on purpose — this is where the
per-endpoint work happens, while `add-route`/`remove-route` stay simple
whole-folder create/delete:

```
bun run add-method
```

or `bunx create-backon add-method` (`method` also works). It opens with a
dashboard of every endpoint already mounted and the methods each one
actually has right now — read straight off `*.routes.ts`, colored by verb
(GET/POST/PUT/PATCH/DELETE) — then walks through: which endpoint to add
to (or spin up a new blank one on the spot), the HTTP method, the path
(`/` or `/:id`, or anything else — path params are picked up automatically
from whatever `:name` segments show up), a name for the controller export
and matching service function (suggested — `list`, `create`, `getById`,
`update`, `remove` — but editable), and whether this method validates a
request body and/or query params. Path params always get a Zod schema
(auto-derived from the path itself — no guessing there); body and query
schemas start as `z.object({})` with a `TODO` comment, same convention as
everywhere else in the generated code, for filling in by hand. Loops until
told to stop, so a whole endpoint's worth of methods is normally one
`bun run add-method` session. Refuses a method name or a verb+path pair
that's already there.

Every file edit here (and in `remove-method`, below) goes through a real
TypeScript/JavaScript AST ([ts-morph](https://ts-morph.com)) rather than
matching raw text — an import is recognized as already present by its
actual structure, and a method's own statements are found by the exact
name `add-method` already enforces is unique per endpoint. A hand-reformatted
mount line or import doesn't throw either operation off.

## Removing a route

The undo for `add-route`:

```
bun run remove-route users
```

or directly:

```
bunx create-backon remove-route users
```

(`rm-route` also works.) Leave the name off to be prompted for one. Either
way, confirmation is required before anything is deleted — this removes
`src/endpoints/users/` and unmounts it from `src/endpoints/index.ts`.
Refuses if the route isn't currently mounted, rather than guessing at
deleting a folder that was never wired up.

## Listing routes

```
bun run list-routes
```

or `bunx create-backon list-routes` (`routes` also works). Read-only —
the same dashboard `add-method` opens with: every route mounted in
`src/endpoints/index.ts`, and the HTTP methods each one actually has,
colored by verb.

## Checking a project for drift

```
bun run doctor
```

or `bunx create-backon doctor`. Compares what's actually in
`src/endpoints/` against what `index.<ext>` mounts, and flags three things:
a route folder that exists but isn't mounted (an orphan), a mount in
`index.<ext>` pointing at a folder that's gone (dangling), and a route
folder missing one of its three expected files. This kind of drift usually
comes from hand-editing `index.ts`, deleting a route folder without using
`remove-route`, or copy-pasting a route folder without wiring it up.
`doctor` only reports issues — it doesn't fix them — and exits non-zero if
it finds any, so it's usable in a pre-commit hook or CI step.

## Project overview

```
bun run project
```

or `bunx create-backon project`. Read-only, one shot — not a loop, nothing
here writes to disk. Prints three things: the database driver actually wired
up in `src/config/db.<ext>` and whether it has what it needs (a config
check, not a live connection attempt — for Neon/Postgres that means
`DATABASE_URL` is set in `.env`; SQLite is always "ready" since it falls
back to `./dev.db`; "none" means no database is configured, which is also
"ready"), the same per-endpoint, per-method dashboard `list-routes` shows,
and a one-line doctor summary. Point of this command is answering "what's
actually going on in this project" in one glance, without needing to
remember which of `list-routes`/`doctor`/checking `.env` by hand to run.

## Managing endpoints and methods interactively

```
bun run server-config
```

or `bunx create-backon server-config`. The interactive alternative to
running `add-route`/`add-method`/`remove-route` individually — opens with
the same endpoint dashboard `project` shows, then a menu: add a new
endpoint (with the same "scaffold standard CRUD methods now?" prompt
`add-route` offers), remove one, add a method, remove a method, or modify a method
(change its path, name, or body/query validation in place — the one thing
none of the standalone commands offer, since it's a checked
remove-then-re-add rather than a new codegen path). Loops back to the menu
after each action, re-reading the endpoint list fresh every time, until
told to stop. `project` and `server-config` are deliberately two separate
commands rather than one combined dashboard — "show me what's here" and
"let me start changing things" are different intents, and an overview that
can also accidentally edit something isn't actually a safe overview.
`add-route`/`add-method`/`remove-route`/`list-routes`/`doctor` all keep
working exactly as documented above; `server-config` is a wrapper around
the same underlying logic, not a replacement for them.

## Generating API docs

Every generated project includes a `docs` script:

```
bun run docs
```

Writes `openapi.json` (built from the Zod schemas already passed to
`defineRoute()` across every route) and `docs.html` (a rendered reference
page, [Scalar](https://github.com/scalar/scalar), pointed at that spec) to
the project root. Both come from `scripts/generate-docs.<ext>`, generated
alongside everything else — it imports `src/app` directly rather than
starting a real server, so `bun run docs` works without anything listening
on a port. Both output files are build artifacts, not source, so they're in
the generated `.gitignore` by default.

This is separate from `serveApiDocs(app)` (documented in
[coding-with-backon.md](../../docs/coding-with-backon.md)), which mounts the
same spec and reference page as live routes on a running server instead of
writing them to disk — useful for CI, static hosting, or feeding the spec
into an external tool, where `serveApiDocs`'s live routes don't apply.

## Generating a typed API client

Every generated project also includes:

```
bun run generate-client
```

Writes `client/api.<ext>` — a fetch client with one function per mounted
method, grouped by endpoint (`usersApi.list()`, `usersApi.create(body)`,
`usersApi.getById(id)`, and so on), read directly off `*.routes.<ext>`/
`*.controller.<ext>` — the same files `add-method`/`remove-method`/
`server-config` already write, so there's nothing to keep in sync by hand.
Backed by `scripts/generate-client.<ext>`, generated alongside everything
else; unlike `generate-docs.<ext>` it doesn't import `src/app` — it reads
the endpoint files directly, so it can't fail because `app.ts` throws on a
missing env var. It also never goes stale on its own: it re-discovers
routes fresh every time it *runs*, so only its output needs a re-run after
routes or methods change, not the script itself.

In TypeScript projects, each generated function's body/query parameters
are typed via `z.infer<typeof theSchema>` against the schema the
controller already exports — imported by type, not re-declared, so the
client's argument types can't drift from what `defineRoute()` actually
validates. Response shape is deliberately not claimed beyond an optional
`<T = unknown>` generic per call (`usersApi.list<User[]>()`) — backon
doesn't validate responses, so nothing here pretends to know a shape it
can't verify. JavaScript projects get the same functions with no type
annotations. `client/` is a build artifact like `openapi.json`/`docs.html`,
not source, so it's in the generated `.gitignore` by default.

## Deploying to Vercel

Picking Vercel at the "Where's this headed?" prompt adds two things, both
additive — nothing about running the project locally changes:

- `src/app.<ext>` gets a default export (`export default app;`), which is
  all [Vercel's zero-config Hono/Express support](https://vercel.com/docs/frameworks/backend/hono)
  needs — it already lives at one of Vercel's recognized entry paths.
  `index.<ext>`'s `serve(app)` call is untouched and keeps working for
  `bun run dev`/`start` anywhere else; Vercel just never runs that file.
- `vercel.json` pins the [Bun runtime](https://vercel.com/docs/functions/runtimes/bun)
  (`{ "bunVersion": "1.x" }`), so the deployed function runs on the same
  runtime as local dev. Not required for the zero-config detection itself —
  only there so the runtime doesn't silently switch between local and
  deployed.

Connect the repo at [vercel.com/new](https://vercel.com/new) or run
`vercel deploy`; `vercel dev` runs it locally the same way it runs once
deployed. Missed the prompt, or already have a project? Add both by hand —
`export default app;` at the end of `src/app.<ext>`, and a `vercel.json`
with `{ "bunVersion": "1.x" }` — no need to re-scaffold.

## Running a generated project without Bun

Generated projects still default to Bun (`bun install`, `bun run dev`) —
that hasn't changed. But the underlying pieces are genuinely Node-capable
now, if Bun isn't an option:

- `@mednours/backon` itself (0.7.0+) runs on Node — its Hono adapter's
  `serve()` uses [`@hono/node-server`](https://github.com/honojs/node-server)
  under Node instead of `Bun.serve()`, detected automatically. Install it
  yourself (`npm install @hono/node-server`) — it's an optional peer
  dependency, so `npm install` alone won't pull it in.
- `create-backon` itself runs via `npx create-backon`/`npm create backon`
  now too, not just `bunx`/`bun create` — see the badge on
  [npmjs.com/package/create-backon](https://www.npmjs.com/package/create-backon)
  if in doubt about which runtimes are supported.
- The one piece that's still Bun-flavored: generated source uses
  extensionless relative imports (`./src/app`, not `./src/app.ts` or
  `./src/app.js`) — fine for Bun's bundler-style resolution, but plain
  `node index.ts`/`node index.js` refuses those outright (Node's ESM loader
  requires a real extension on every relative import, full stop — this
  isn't a TypeScript thing, it fails the exact same way in JavaScript
  mode). [`tsx`](https://github.com/privatenumber/tsx) resolves imports the
  same permissive way Bun does, so `npx tsx index.ts` (or `npx tsx watch
  index.ts` for the `bun run dev` equivalent) runs a generated project
  under plain Node with no other changes — verified against a real
  generated project, Hono and Express, TypeScript and JavaScript mode, all
  four combinations. `npm test` still needs a real Node test runner in
  place of `bun test`, which isn't wired up here — that part's on you.

## Requirements

Bun >= 1.3.

Part of the [backon monorepo](https://github.com/mednours/backon).
