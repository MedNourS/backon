import { describe, expect, it } from "bun:test";
import { createApp } from "../src/create-app";
import { rateLimit } from "../src/rate-limit";

describe("rateLimit (Hono)", () => {
  it("allows requests under the limit and blocks once it's exceeded", async () => {
    const app = createApp();
    app.use("/limited", rateLimit({ windowMs: 60_000, max: 2 }));
    app.get("/limited", (c) => c.json({ ok: true }));

    const first = await app.request("/limited");
    const second = await app.request("/limited");
    const third = await app.request("/limited");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);

    const body = (await third.json()) as { error: { code: string } };
    expect(body.error.code).toBe("rate_limited");
    expect(third.headers.get("retry-after")).toBeTruthy();
  });

  it("tracks separate keys independently via a custom keyGenerator", async () => {
    const app = createApp();
    app.use("/limited", rateLimit({ windowMs: 60_000, max: 1, keyGenerator: (c) => c.req.header("x-user") ?? "anon" }));
    app.get("/limited", (c) => c.json({ ok: true }));

    const userA1 = await app.request("/limited", { headers: { "x-user": "a" } });
    const userB1 = await app.request("/limited", { headers: { "x-user": "b" } });
    const userA2 = await app.request("/limited", { headers: { "x-user": "a" } });

    expect(userA1.status).toBe(200);
    expect(userB1.status).toBe(200); // different key, unaffected by user A's usage
    expect(userA2.status).toBe(429); // user A's second request within the same window
  });
});
