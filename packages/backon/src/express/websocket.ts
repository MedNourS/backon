import type { Server } from "node:http";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket, type RawData } from "ws";

/** Handlers for one WebSocket route. `ws.send()`/`ws.close()` match the shape the Hono adapter's handlers get, too. */
export interface WebSocketHandlers {
  onOpen?: (ws: WebSocket, req: IncomingMessage) => void;
  onMessage?: (ws: WebSocket, data: RawData) => void;
  onClose?: (ws: WebSocket) => void;
}

interface PendingRegistration {
  path: string;
  handlers: WebSocketHandlers;
}

const pending = new WeakMap<object, PendingRegistration[]>();

/**
 * Registers a WebSocket route. Unlike Hono's version, this can't be
 * registered as a normal GET route — Express has no route-level concept of
 * an HTTP upgrade, only `ws`'s own server does, and that server doesn't
 * exist until serve() has actually started listening. Call this on `app`
 * any time before serve(); it's wired up once serve() has a real
 * http.Server to attach to:
 *
 *   defineWebSocket(app, "/ws", {
 *     onMessage: (ws, data) => ws.send(`echo: ${data}`),
 *   });
 */
export function defineWebSocket(app: object, path: string, handlers: WebSocketHandlers): void {
  const list = pending.get(app) ?? [];
  list.push({ path, handlers });
  pending.set(app, list);
}

/** Called by serve() once the real http.Server exists — attaches one `ws` WebSocketServer per registered path. */
export function attachWebSockets(app: object, server: Server): void {
  for (const { path, handlers } of pending.get(app) ?? []) {
    const wss = new WebSocketServer({ server, path });
    wss.on("connection", (ws, req) => {
      handlers.onOpen?.(ws, req);
      if (handlers.onMessage) ws.on("message", (data) => handlers.onMessage?.(ws, data));
      if (handlers.onClose) ws.on("close", () => handlers.onClose?.(ws));
    });
  }
}
