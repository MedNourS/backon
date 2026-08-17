import { describe, expect, it } from "bun:test";
import request from "supertest";
import { createApp, attachErrorHandler } from "../../src/express/create-app";
import { rateLimit } from "../../src/express/rate-limit";

describe("rateLimit (Express)", () => {
  it("allows requests under the limit and blocks once it's exceeded", async () => {
    const app = createApp();
    app.use("/limited", rateLimit({ windowMs: 60_000, max: 2, keyGenerator: () => "fixed-key" }));
    app.get("/limited", (_req, res) => res.json({ ok: true }));
    attachErrorHandler(app);

    const first = await request(app).get("/limited");
    const second = await request(app).get("/limited");
    const third = await request(app).get("/limited");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe("rate_limited");
    expect(third.headers["retry-after"]).toBeTruthy();
  });
});
