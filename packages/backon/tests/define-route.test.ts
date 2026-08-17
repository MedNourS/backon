import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createApp } from "../src/create-app";
import { defineRoute } from "../src/define-route";
import { AppError } from "../src/error";

describe("defineRoute", () => {
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

    const res = await app.request("/greet/42?loud=yes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "nour" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "42", greeting: "hi nour", loud: "yes" });
  });

  it("returns 400 with validation details when the body fails its schema", async () => {
    const app = createApp();
    app.post(
      "/greet",
      defineRoute({ body: z.object({ name: z.string() }) }, (c, { body }) => c.json({ hi: body.name }))
    );

    const res = await app.request("/greet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("invalid_body");
  });

  it("lets a handler throw AppError for expected failure cases", async () => {
    const app = createApp();
    app.get(
      "/secret",
      defineRoute({}, () => {
        throw new AppError(403, "forbidden", "Not allowed");
      })
    );

    const res = await app.request("/secret");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "forbidden", message: "Not allowed" } });
  });
});
