import { upgradeWebSocket } from "hono/bun";
import type { WSContext, WSMessageReceive } from "hono/ws";

/** Handlers for one WebSocket route. `ws.send()`/`ws.close()` match the shape the Express adapter's handlers get, too. */
export interface WebSocketHandlers {
  onOpen?: (ws: WSContext) => void;
  onMessage?: (ws: WSContext, data: WSMessageReceive) => void;
  onClose?: (ws: WSContext) => void;
}

/**
 * Registers a WebSocket route. The handshake happens at Bun.serve()'s own
 * level (an HTTP upgrade, not an ordinary request/response cycle), which is
 * why this only works with the serve() this package exports — it passes
 * hono/bun's own websocket handler into Bun.serve() so the upgrade can
 * actually happen. Register it like any other route:
 *
 *   app.get("/ws", defineWebSocket({
 *     onMessage: (ws, data) => ws.send(`echo: ${data}`),
 *   }));
 */
export function defineWebSocket(handlers: WebSocketHandlers) {
  return upgradeWebSocket(() => ({
    onOpen: (_event, ws) => handlers.onOpen?.(ws),
    onMessage: (event, ws) => handlers.onMessage?.(ws, event.data),
    onClose: (_event, ws) => handlers.onClose?.(ws),
  }));
}
