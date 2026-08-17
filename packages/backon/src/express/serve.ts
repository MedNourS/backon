import type { Express } from "express";
import { attachErrorHandler } from "./create-app";
import { logger } from "../logger";

/**
 * Starts the app on Node's http server (via Express's own app.listen) and
 * wires graceful shutdown, same contract as the Hono adapter's serve().
 *
 * Also calls attachErrorHandler(app) first — see the note on createApp()
 * for why that can't happen until every route is registered. If you're not
 * using this serve() (e.g. exporting the app for a serverless platform or a
 * supertest suite), call attachErrorHandler(app) yourself instead.
 */
export function serve(app: Express, port: number = Number(process.env.PORT) || 3000) {
  attachErrorHandler(app);

  const server = app.listen(port, () => {
    logger.info({ port }, "backon app listening");
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0)); // stop accepting new connections; in-flight requests finish, then exit
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server;
}
