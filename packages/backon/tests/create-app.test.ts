import { describe, expect, it } from "bun:test";
import { createApp } from "../src/create-app";

describe("createApp", () => {
  it("responds 200 on the built-in /health route", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("applies secure headers by default", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("attaches a request id header", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("rejects requests over the body size limit", async () => {
    const app = createApp({ bodyLimitBytes: 10 });
    app.post("/echo", async (c) => c.json(await c.req.json()));
    const res = await app.request("/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: "this is definitely more than ten bytes" }),
    });
    expect(res.status).toBe(413);
  });

  it("turns an unhandled error into a generic 500 with the standard shape", async () => {
    const app = createApp();
    app.get("/boom", () => {
      throw new Error("kaboom");
    });
    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "internal_error", message: "Something went wrong" },
    });
  });
});
