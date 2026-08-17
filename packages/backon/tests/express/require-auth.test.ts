import { describe, expect, it } from "bun:test";
import request from "supertest";
import { sign } from "hono/jwt";
import { createApp, attachErrorHandler } from "../../src/express/create-app";
import { requireAuth } from "../../src/express/require-auth";

const SECRET = "test-secret-do-not-use-in-real-life";

function buildApp() {
  const app = createApp();
  app.use("/protected", requireAuth({ secret: SECRET }));
  app.get("/protected", (req, res) => res.json({ auth: res.locals.auth }));
  attachErrorHandler(app);
  return app;
}

async function signToken(overrides: Record<string, unknown> = {}, secret = SECRET) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return sign({ sub: "user_1", exp: nowSeconds + 60, ...overrides }, secret);
}

describe("requireAuth (Express)", () => {
  it("rejects a request with no Authorization header", async () => {
    const app = buildApp();
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("rejects a token signed with the wrong secret", async () => {
    const app = buildApp();
    const token = await signToken({}, "wrong-secret");
    const res = await request(app).get("/protected").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const app = buildApp();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await signToken({ exp: nowSeconds - 60 });
    const res = await request(app).get("/protected").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("accepts a valid token and exposes the decoded payload via res.locals.auth", async () => {
    const app = buildApp();
    const token = await signToken({ sub: "user_42" });
    const res = await request(app).get("/protected").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.auth.sub).toBe("user_42");
  });
});
