import { stream as honoStream } from "hono/streaming";
import type { BackonContext } from "./types";

export type StreamWriter = (chunk: string | Uint8Array) => Promise<void>;

/**
 * Registers a route that writes its response in chunks as they become
 * available, instead of building one body in memory and returning it all at
 * once — server-sent events, a large export, anything too slow or too big
 * to buffer first.
 *
 *   app.get("/export", defineStream(async (c, write) => {
 *     for (const row of rows) await write(JSON.stringify(row) + "\n");
 *   }));
 *
 * Set a Content-Type via c.header() before the first write() if the default
 * (left to the browser/client to infer) isn't right for what's being sent.
 */
export function defineStream(handler: (c: BackonContext, write: StreamWriter) => Promise<void>) {
  return (c: BackonContext) =>
    honoStream(c, async (s) => {
      await handler(c, async (chunk) => {
        await s.write(chunk);
      });
    });
}
