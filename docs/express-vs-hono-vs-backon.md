# Express vs Hono vs backon

## The short version

Express and Hono are the two real choices — they're actual web frameworks with different designs. backon isn't a third competitor to either of them; it's a thin, opinionated layer that sits on top of whichever one gets picked, so every project built with it gets the same security defaults, the same error shape, and the same folder structure, regardless of which framework is underneath. Picking Hono or Express is still a real decision. Picking backon isn't instead of that decision — it's on top of it.

## Express vs Hono, architecturally

Express is from 2010. It predates the `fetch` API, predates Web Streams, predates most of what's now considered a JavaScript runtime standard. It runs on Node's own `http` module, dispatches through a linear middleware chain, and its ecosystem (thousands of `express-*` packages) exists because Express itself is deliberately minimal — almost everything a project would want is a separate dependency. That ecosystem size is Express's real advantage: whatever a project needs, someone has already built an Express middleware for it, and most Node.js tutorials, Stack Overflow answers, and AI training data skew toward Express because there's twelve years more of it in the wild.

Hono is from 2022, built directly on Web Standard APIs (`Request`, `Response`, `fetch`) instead of Node-specific ones. That's why it runs unmodified on Bun, Deno, Cloudflare Workers, and other edge runtimes, not just Node — it isn't wrapping Node's `http` module the way Express is, it's an implementation of the same interfaces those runtimes already speak natively. Its router is also a meaningfully different piece of engineering (a trie-based router with a small number of specialized implementations Hono picks between depending on the route patterns registered), which is most of why it beats Express on raw throughput.

## Is Hono actually faster? Real numbers

Yes, on a synthetic "hello world" benchmark — which is what a framework comparison can actually measure fairly, since a real app's bottleneck is almost always the database, not the framework.

From [fastify/benchmarks](https://github.com/fastify/benchmarks) (community-maintained, framework-neutral, last updated August 4, 2026 — as current as it gets), running `autocannon -c 100 -d 40 -p 10` against a bare hello-world route on each framework, Linux x64, Node.js v24.19.0:

```
Express   34,096 req/s
Koa       48,134 req/s
Hono      52,586 req/s
Fastify   59,603 req/s
```

Hono handles about 1.5x the requests per second Express does, on identical hardware, for a route that does nothing but return a string. Fastify edges out Hono here, worth knowing since it exists, but it doesn't run outside Node.js the way Hono does, which is a real tradeoff for anything meant to run on the edge.

The important caveat, stated by the benchmark's own authors: this measures framework overhead, not a real application. The moment a route does a database query, calls an external API, or does any real I/O, that work dominates the response time and the 1.5x gap between Express and Hono becomes a rounding error. Framework throughput matters most for a huge volume of cheap requests (a redirect service, an edge middleware, a health check endpoint hit by thousands of monitors) and matters least for a typical CRUD backend where every request touches a database anyway.

## Where does backon's own overhead fit in?

backon doesn't change which of these two engines actually runs the requests — Hono through backon gets Hono's router and Hono's throughput ceiling; Express through backon gets Express's. What backon adds on top, for every request, regardless of which framework was picked: request logging, a request ID, secure response headers, a CORS check, response compression, and a body size check. That's real work, not free, but it's the same handful of lightweight middleware most projects meant for production would add to a bare Express or Hono app anyway — backon isn't adding overhead that wouldn't otherwise be paid, it's just making sure it doesn't get forgotten.

backon's own overhead hasn't been benchmarked specifically (that would take building and running a real comparison, a fair thing to ask for separately). Rather than hand over a number that was never measured: `bun add -d autocannon` and point it at `bun run dev` gives a number for the actual code in a given project, which is more useful than a number for a hello-world route anyway.

## Choosing Hono or Express for a given project

Hono, if the project might ever run on the edge (Cloudflare Workers, Vercel Edge Functions, Deno Deploy), if raw throughput matters, or for a fresh start with no existing reason to need Express's ecosystem specifically.

Express, for a team more comfortable in it, for a project that needs a specific `express-*` middleware without a Hono equivalent, or when joining an existing Express codebase where consistency with what's already there matters more than raw throughput.

Both get the same `createApp()`, `defineRoute()`, `requireAuth()`, `rateLimit()`, `requireEnv()`, and error shape through backon — the framework choice doesn't change how route handlers get written day to day, just which engine executes them.

## First lines with backon

The fast path is the CLI — it asks for a project name, framework, language, database, and routes, then generates the whole layout:

```
bun create backon
```

Answering the prompts (Hono or Express, TypeScript or JavaScript, a database or none, however many routes are wanted) leads straight to:

```
cd my-api
bun install
bun run dev
```

That's a running server with a `/health` route, secure headers, CORS, compression, and a body size limit already wired in, plus one example route per name given to the prompt.

To see what backon actually looks like without the generator, here's a complete app by hand — Hono flavor:

```ts
import { createApp, defineRoute, serve } from "@mednours/backon";
import { z } from "zod";

const app = createApp();

app.get(
  "/hello",
  defineRoute(
    { query: z.object({ name: z.string().optional() }) },
    (c, { query }) => c.json({ message: `hello ${query.name ?? "world"}` })
  )
);

await serve(app);
```

`createApp()` produces an app with logging/security/CORS/compression already wired in and a `/health` route for free. `defineRoute()` validates the request against a Zod schema before the handler ever runs — a bad query/body/params gets the caller a `400` with the validation error attached, automatically, with no separate check to write. `serve()` starts it and wires graceful shutdown.

The same app on Express reads almost identically — same function names, same validation behavior, same error shape, different engine underneath:

```ts
import { createApp, defineRoute, serve } from "@mednours/backon/express";
import { z } from "zod";

const app = createApp();

app.get(
  "/hello",
  defineRoute(
    { query: z.object({ name: z.string().optional() }) },
    (c, { query }) => c.json({ message: `hello ${query.name ?? "world"}` })
  )
);

serve(app);
```

The only difference in that example is the import path: `@mednours/backon` for Hono, `@mednours/backon/express` for Express.

## Beyond the basics

Once the request layer is working: `requireAuth({ secret })` verifies a bearer JWT and hands the decoded payload to the handler; `rateLimit({ windowMs, max })` throttles a route (a login endpoint is the obvious candidate); `requireEnv(schema)` validates `.env` once at startup instead of finding out a variable is missing when the first request that needs it crashes. Past that, `defineWebSocket`, `defineStream`, and `defineUpload` cover WebSocket routes, chunked responses, and file uploads, and `serveApiDocs(app)` generates an OpenAPI reference page from the schemas already passed to `defineRoute()` — see [coding-with-backon.md](./coding-with-backon.md) for all of these in detail. Everything here is opt-in — apply it to the specific routes that need it, not globally, the same way any other middleware gets added.

Sources:
- [Hono documentation](https://hono.dev/docs)
- [fastify/benchmarks](https://github.com/fastify/benchmarks)
