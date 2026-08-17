import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger";

/**
 * Express equivalent of the Hono requestLogger: attaches/reuses a request
 * id and logs one line per request. Express doesn't have Hono's
 * `await next()` continuation model, so this listens for the 'finish'
 * event on the response instead of wrapping next() — that fires once the
 * response has actually been sent, whichever code path sent it.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = req.header("x-request-id") ?? randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const start = performance.now();
  res.on("finish", () => {
    const durationMs = Math.round(performance.now() - start);
    logger.info(
      { requestId, method: req.method, path: req.path, status: res.statusCode, durationMs },
      "request"
    );
  });

  next();
}
