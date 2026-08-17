import { describe, expect, it } from "bun:test";
import request from "supertest";
import { z } from "zod";
import { createApp, attachErrorHandler } from "../../src/express/create-app";
import { defineRoute } from "../../src/express/define-route";
import { AppError } from "../../src/error";

describe("express defineRoute", () => {
  it("passes parsed body/query/params to the handler", async () => {
    const app = createApp();
    app.post(
      "/greet/:id",
      defineRoute(
        {
          body: z.object({ name: z.string() }),
          query: z.object({ loud: z.string().optional() }),
          params: z.object({ id: z.string() }),
        },
        (c, { body, query, params }) =>
          c.json({ id: params.id, greeting: `hi ${body.name}`, loud: query.loud ?? "no" })
      )
    );
    attachErrorHandler(app);

    const res = await request(app)
      .post("/greet/42")
      .query({ loud: "yes" })
      .set("content-type", "application/json")
      .send({ name: "nour" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "42", greeting: "hi nour", loud: "yes" });
  });

  it("returns 400 with validation details when the body fails its schema", async () => {
    const app = createApp();
    app.post(
      "/greet",
      defineRoute({ body: z.object({ name: z.string() }) }, (c, { body }) => c.json({ hi: body.name }))
    );
    attachErrorHandler(app);

    const res = await request(app).post("/greet").set("content-type", "application/json").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_body");
  });

  it("lets a handler throw AppError for expected failure cases", async () => {
    const app = createApp();
    app.get(
      "/secret",
      defineRoute({}, () => {
        throw new AppError(403, "forbidden", "Not allowed");
      })
    );
    attachErrorHandler(app);

    const res = await request(app).get("/secret");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "forbidden", message: "Not allowed" } });
  });
});
