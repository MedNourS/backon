import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { createApp } from "../src/create-app";
import { defineRoute } from "../src/define-route";
import { generateOpenApiSpec, serveApiDocs } from "../src/openapi";

describe("generateOpenApiSpec", () => {
  it("builds a path entry per defineRoute()-wrapped route, converting :params to {params}", () => {
    const app = createApp();
    app.get(
      "/notes/:id",
      defineRoute(
        { params: z.object({ id: z.string() }), query: z.object({ verbose: z.string().optional() }) },
        (c) => c.json({})
      )
    );
    app.post("/notes", defineRoute({ body: z.object({ title: z.string().min(1) }) }, (c) => c.json({})));

    const spec = generateOpenApiSpec(app, { title: "Notes API", version: "1.2.3" }) as any;

    expect(spec.info).toEqual({ title: "Notes API", version: "1.2.3" });

    const getOp = spec.paths["/notes/{id}"].get;
    expect(getOp.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      { name: "verbose", in: "query", required: false, schema: { type: "string" } },
    ]);

    const postOp = spec.paths["/notes"].post;
    expect(postOp.requestBody.required).toBe(true);
    expect(postOp.requestBody.content["application/json"].schema.required).toEqual(["title"]);
  });

  it("skips routes that were never wrapped in defineRoute() — no schema, nothing to describe", () => {
    const app = createApp();
    app.get("/plain", (c) => c.json({ ok: true })); // not defineRoute()

    const spec = generateOpenApiSpec(app) as any;

    expect(spec.paths["/plain"]).toBeUndefined();
    expect(spec.paths["/health"]).toBeUndefined(); // createApp()'s own /health, same reasoning
  });

  it("picks up routes mounted through a nested .route() call, not just ones registered directly", () => {
    const app = createApp();
    const notes = new Hono();
    notes.get("/:id", defineRoute({ params: z.object({ id: z.string() }) }, (c) => c.json({})));
    app.route("/notes", notes);

    const spec = generateOpenApiSpec(app) as any;

    expect(spec.paths["/notes/{id}"]).toBeDefined();
  });
});

describe("serveApiDocs", () => {
  it("serves the spec as JSON and a page with the same spec embedded directly", async () => {
    const app = createApp();
    app.get("/ping", defineRoute({}, (c) => c.json({ pong: true })));
    serveApiDocs(app, "/docs", { title: "Ping API" });

    const specRes = await app.request("/docs/openapi.json");
    expect(specRes.status).toBe(200);
    const spec = (await specRes.json()) as any;
    expect(spec.paths["/ping"].get).toBeDefined();
    expect(spec.info.title).toBe("Ping API");

    const pageRes = await app.request("/docs");
    expect(pageRes.status).toBe(200);
    const html = await pageRes.text();
    expect(html).toContain("@scalar/api-reference");
    expect(html).toContain("Scalar.createApiReference");
    // The page embeds the document directly (no fetch back to the JSON
    // route), so the same paths/title show up right in the HTML.
    expect(html).toContain('"/ping"');
    expect(html).toContain("Ping API");
  });
});
