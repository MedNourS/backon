import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { serve, serveOnBun, serveOnNode } from "../src/serve";
import type { Env } from "../src/types";

// serve() itself just picks one of these two based on `typeof Bun`, and
// that check can't be faked from inside a test process Bun itself started
// (the `Bun` global isn't writable or deletable — see serve.ts's comment
// above serveOnBun/serveOnNode). So this file tests serve()'s default
// dispatch (Bun, since that's what `bun test` runs under) plus each
// runtime-specific implementation directly — serveOnNode() is real
// end-to-end coverage of the Node fallback path, not a mock, even though
// the test process is Bun: nothing in serveOnNode()'s body is
// runtime-conditional, it's just @hono/node-server, imported and called
// the same way Node would.

describe("serve", () => {
  it("starts the app via Bun.serve() by default and serves real requests", async () => {
    const app = new Hono<Env>();
    app.get("/ping", (c) => c.json({ ok: true }));

    const server = await serve(app, 0);
    const port = (server as unknown as { port: number }).port;
    expect(typeof port).toBe("number");

    const res = await fetch(`http://localhost:${port}/ping`);
    expect(await res.json()).toEqual({ ok: true });

    server.stop?.();
  });
});

describe("serveOnBun", () => {
  it("serves requests through Bun.serve()", async () => {
    const app = new Hono<Env>();
    app.get("/ping", (c) => c.json({ via: "bun" }));

    const server = await serveOnBun(app, 0);
    const port = (server as unknown as { port: number }).port;
    const res = await fetch(`http://localhost:${port}/ping`);
    expect(await res.json()).toEqual({ via: "bun" });

    server.stop?.();
  });
});

describe("serveOnNode", () => {
  it("serves requests through @hono/node-server", async () => {
    const app = new Hono<Env>();
    app.get("/ping", (c) => c.json({ via: "node" }));

    const server = await serveOnNode(app, 0);
    const address = (server as unknown as { address: () => { port: number } }).address();
    const res = await fetch(`http://localhost:${address.port}/ping`);
    expect(await res.json()).toEqual({ via: "node" });

    await new Promise<void>((resolve) => {
      server.close?.(() => resolve());
    });
  });
});
