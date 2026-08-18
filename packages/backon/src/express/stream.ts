import type { Request, Response, NextFunction } from "express";
import { createContext, type BackonContext } from "./types";

export type StreamWriter = (chunk: string | Uint8Array) => void;

/**
 * Same contract as the Hono defineStream: the handler writes chunks as they
 * become available instead of returning one body all at once. Underneath,
 * this is just res.write() — Node's response object is a writable stream
 * regardless of any framework sitting on top of it.
 *
 *   app.get("/export", defineStream(async (c, write) => {
 *     for (const row of rows) write(JSON.stringify(row) + "\n");
 *   }));
 *
 * Set a Content-Type via c.header() before the first write() if the default
 * (left to the browser/client to infer) isn't right for what's being sent.
 */
export function defineStream(handler: (c: BackonContext, write: StreamWriter) => Promise<void> | void) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = createContext(req, res);
      await handler(ctx, (chunk) => {
        res.write(chunk);
      });
      res.end();
    } catch (err) {
      next(err);
    }
  };
}
