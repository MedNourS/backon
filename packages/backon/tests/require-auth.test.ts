import { describe, expect, it } from "bun:test";
import { sign } from "hono/jwt";
import { createApp } from "../src/create-app";
import { requireAuth } from "../src/require-auth";

const SECRET = "test-secret-do-not-use-in-real-life";

function buildApp() {
  const app = createApp();
  app.use("/protected", requireAuth({ secret: SECRET }));
  app.get("/protected", (c) => c.json({ auth: c.get("auth") }));
  return app;
}

async function signToken(overrides: Record<string, unknown> = {}, secret = SECRET) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return sign({ sub: "user_1", exp: nowSeconds + 60, ...overrides }, secret);
}

describe("requireAuth (Hono)", () => {
  it("rejects a request with no Authorization header", async () => {
    const app = buildApp();
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("rejects a malformed Authorization header (no Bearer scheme)", async () => {
    const app = buildApp();
    const token = await signToken();
    const res = await app.request("/protected", { headers: { authorization: token } });
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const app = buildApp();
    const token = await signToken({}, "wrong-secret");
    const res = await app.request("/protected", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const app = buildApp();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await signToken({ exp: nowSeconds - 60 });
    const res = await app.request("/protected", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });

  it("accepts a valid token and exposes the decoded payload via c.get('auth')", async () => {
    const app = buildApp();
    const token = await signToken({ sub: "user_42" });
    const res = await app.request("/protected", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { auth: { sub: string } };
    expect(body.auth.sub).toBe("user_42");
  });
});
