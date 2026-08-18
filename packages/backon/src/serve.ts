import type { Hono } from "hono";
import { logger } from "./logger";
import type { Env } from "./types";

/** The bits of Bun's/`@hono/node-server`'s return value shutdown actually needs — not either library's real type, just the overlap. */
interface StoppableServer {
  stop?: () => void;
  close?: (callback?: (err?: Error) => void) => void;
}

/**
 * Starts the app — `Bun.serve()` when running under Bun (the default, and
 * the faster of the two), `@hono/node-server`'s `serve()` when running
 * under Node — and wires graceful shutdown either way: on SIGTERM/SIGINT,
 * stop accepting new connections, let in-flight requests finish, then
 * exit. Matters for zero-downtime deploys — without this, a deploy or
 * restart can cut off requests mid-flight.
 *
 * Both `hono/bun` (for the websocket handler Bun.serve() needs to complete
 * a defineWebSocket() route's upgrade handshake) and `@hono/node-server`
 * are dynamically imported, and only on the runtime that actually needs
 * them — `hono/bun` throws immediately on import under Node (it touches
 * the `Bun` global at module scope), so it can't be a static import at the
 * top of this file the way it used to be, or importing @mednours/backon at
 * all would crash under Node before serve() was ever called. This is also
 * why serve() is async now, unlike earlier versions — see the 0.7.0
 * CHANGELOG entry.
 *
 * `@hono/node-server` is an optional peer dependency: Bun-only projects
 * never need it installed at all, and `npm install @hono/node-server` is
 * only required the first time this actually runs under Node.
 */
export async function serve(app: Hono<Env>, port: number = Number(process.env.PORT) || 3000) {
  const isBun = typeof Bun !== "undefined";
  const server: StoppableServer = isBun ? await serveOnBun(app, port) : await serveOnNode(app, port);

  logger.info({ port, runtime: isBun ? "bun" : "node" }, "backon app listening");

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    // Bun.serve()'s stop() and @hono/node-server's close() are both
    // "stop accepting new connections, let in-flight ones finish" — same
    // intent, different method name depending which one is present.
    server.stop?.();
    server.close?.();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server;
}

// Exported (not just internal to serve()) mainly so each runtime's path can
// be exercised directly in tests without needing to fake away the `Bun`
// global — it isn't writable/deletable, so a test can't actually simulate
// "no Bun" from inside a process Bun itself started. Calling serveOnNode()
// straight from a Bun-run test still genuinely exercises the same code
// this function runs under real Node — nothing in its body is
// runtime-conditional. Also usable directly by anyone who wants to skip
// the detection, e.g. a Node-only serverless entry point.

export async function serveOnBun(app: Hono<Env>, port: number): Promise<StoppableServer> {
  const { websocket } = await import("hono/bun");
  return Bun.serve({ fetch: app.fetch, websocket, port });
}

export async function serveOnNode(app: Hono<Env>, port: number): Promise<StoppableServer> {
  let nodeServer: typeof import("@hono/node-server");
  try {
    nodeServer = await import("@hono/node-server");
  } catch {
    throw new Error(
      "serve() needs @hono/node-server to run under Node — install it with `npm install @hono/node-server` " +
        "(or your package manager's equivalent). Bun doesn't need this; it uses Bun.serve() instead."
    );
  }
  return nodeServer.serve({ fetch: app.fetch, port });
}
