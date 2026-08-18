import type { Hono } from "hono";
import { websocket } from "hono/bun";
import { logger } from "./logger";
import type { Env } from "./types";

/**
 * Starts the app on Bun's native server and wires graceful shutdown: on
 * SIGTERM/SIGINT, stop accepting new connections, let in-flight requests
 * finish, then exit. Matters for zero-downtime deploys — without this, a
 * deploy or restart can cut off requests mid-flight.
 *
 * Also passes hono/bun's own websocket handler into Bun.serve() — needed
 * for any defineWebSocket() route to actually complete its upgrade
 * handshake, and harmless when there are none.
 */
export function serve(app: Hono<Env>, port: number = Number(process.env.PORT) || 3000) {
  const server = Bun.serve({ fetch: app.fetch, websocket, port });
  logger.info({ port }, "backon app listening");

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    server.stop(); // stop accepting new connections; lets in-flight requests finish
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server;
}
