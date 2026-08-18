// Run with plain `node` (not bun) against the built dist/ — see
// tests/node-compat.test.ts, which spawns this. Proves two things real
// unit tests can't from inside a Bun-run test process: that importing the
// package's compiled output doesn't crash under Node (the original bug —
// a static `hono/bun` import anywhere in the module graph used to blow up
// at import time, before any code ran), and that createApp()/serve()
// actually serve a real request end to end via @hono/node-server.
import { createApp, serve } from "../../dist/index.js";

const app = createApp();
app.get("/ping", (c) => c.json({ ok: true, runtime: typeof Bun === "undefined" ? "node" : "bun" }));

const server = await serve(app, 0);
const address = server.address();
const res = await fetch(`http://localhost:${address.port}/ping`);
const body = await res.json();

server.close();

if (body.ok && body.runtime === "node") {
  console.log("PASS");
  process.exit(0);
} else {
  console.error("FAIL", body);
  process.exit(1);
}
