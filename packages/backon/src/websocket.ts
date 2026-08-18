import type { Context } from "hono";
import type { WSContext, WSMessageReceive } from "hono/ws";
import type { Env } from "./types";

/** Handlers for one WebSocket route. `ws.send()`/`ws.close()` match the shape the Express adapter's handlers get, too. */
export interface WebSocketHandlers {
  onOpen?: (ws: WSContext) => void;
  onMessage?: (ws: WSContext, data: WSMessageReceive) => void;
  onClose?: (ws: WSContext) => void;
}

/**
 * Registers a WebSocket route. The handshake happens at Bun.serve()'s own
 * level (an HTTP upgrade, not an ordinary request/response cycle), which is
 * why this only works when the app is actually run with this package's
 * serve() on Bun — it passes hono/bun's own websocket handler into
 * Bun.serve() so the upgrade can actually happen. `@hono/node-server`
 * support for the same handshake isn't wired up here yet, so a
 * defineWebSocket() route throws a clear error at request time (not at
 * startup — the rest of the app still runs) if it's ever actually hit
 * under Node, rather than failing in some more confusing way.
 *
 * hono/bun is imported dynamically, at request time, specifically so
 * *importing* this module (and therefore @mednours/backon's main index,
 * which re-exports defineWebSocket) doesn't itself crash under Node —
 * hono/bun touches the `Bun` global at module scope, so a static import at
 * the top of this file would throw the moment anything imported this
 * package at all, whether or not the project actually uses WebSockets.
 *
 * Register it like any other route:
 *
 *   app.get("/ws", defineWebSocket({
 *     onMessage: (ws, data) => ws.send(`echo: ${data}`),
 *   }));
 */
export function defineWebSocket(handlers: WebSocketHandlers) {
  return async (c: Context<Env>) => {
    if (typeof Bun === "undefined") {
      throw new Error(
        "defineWebSocket() only works when this app is running on Bun — it relies on hono/bun's upgrade " +
          "handshake, which backon doesn't yet have a Node equivalent for. Run this project on Bun, or drop the " +
          "WebSocket route for a Node deploy."
      );
    }
    const { upgradeWebSocket } = await import("hono/bun");
    const handler = upgradeWebSocket(() => ({
      onOpen: (_event, ws) => handlers.onOpen?.(ws),
      onMessage: (event, ws) => handlers.onMessage?.(ws, event.data),
      onClose: (_event, ws) => handlers.onClose?.(ws),
    }));
    return handler(c, async () => {});
  };
}
