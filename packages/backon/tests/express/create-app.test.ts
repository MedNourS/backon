import { describe, expect, it } from "bun:test";
import request from "supertest";
import { createApp, attachErrorHandler } from "../../src/express/create-app";

describe("express createApp", () => {
  it("responds 200 on the built-in /health route", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("applies secure headers by default (via helmet)", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("attaches a request id header", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("rejects requests over the body size limit with the standard shape (via attachErrorHandler)", async () => {
    const app = createApp({ bodyLimitBytes: 10 });
    app.post("/echo", (req, res) => res.json(req.body));
    attachErrorHandler(app);

    const res = await request(app)
      .post("/echo")
      .set("content-type", "application/json")
      .send({ payload: "this is definitely more than ten bytes" });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: { code: "payload_too_large", message: "Request body too large" } });
  });

  it("turns an unhandled error into a generic 500 with the standard shape (via attachErrorHandler)", async () => {
    const app = createApp();
    app.get("/boom", () => {
      throw new Error("kaboom");
    });
    attachErrorHandler(app);

    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "internal_error", message: "Something went wrong" } });
  });

  it("does NOT catch route errors if attachErrorHandler is never called — Express, not Hono", async () => {
    const app = createApp();
    app.get("/boom", () => {
      throw new Error("kaboom");
    });
    // deliberately no attachErrorHandler(app) here

    // Express's own default handler takes over and returns a 500 with an
    // HTML body, not backon's JSON shape — this documents the ordering
    // requirement rather than silently hoping someone remembers it.
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).not.toEqual({ error: { code: "internal_error", message: "Something went wrong" } });
  });
});
