import { describe, expect, it } from "bun:test";
import request from "supertest";
import { z } from "zod";
import { createApp, attachErrorHandler } from "../../src/express/create-app";
import { defineRoute } from "../../src/express/define-route";
import { Router } from "../../src/express/router";
import { generateOpenApiSpec, serveApiDocs } from "../../src/express/openapi";

describe("express generateOpenApiSpec", () => {
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
    app.get("/plain", (_req, res) => res.json({ ok: true }));

    const spec = generateOpenApiSpec(app) as any;

    expect(spec.paths["/plain"]).toBeUndefined();
    expect(spec.paths["/health"]).toBeUndefined();
  });

  it("picks up routes mounted through a Router() nested with app.use(), composing the full path", () => {
    const app = createApp();
    const notes = Router();
    notes.get("/:id", defineRoute({ params: z.object({ id: z.string() }) }, (c) => c.json({})));
    app.use("/notes", notes);

    const spec = generateOpenApiSpec(app) as any;

    expect(spec.paths["/notes/{id}"]).toBeDefined();
  });
});

describe("express serveApiDocs", () => {
  it("serves the spec as JSON and a page with the same spec embedded directly", async () => {
    const app = createApp();
    app.get("/ping", defineRoute({}, (c) => c.json({ pong: true })));
    serveApiDocs(app, "/docs", { title: "Ping API" });
    attachErrorHandler(app);

    const specRes = await request(app).get("/docs/openapi.json");
    expect(specRes.status).toBe(200);
    expect(specRes.body.paths["/ping"].get).toBeDefined();
    expect(specRes.body.info.title).toBe("Ping API");

    const pageRes = await request(app).get("/docs");
    expect(pageRes.status).toBe(200);
    expect(pageRes.text).toContain("@scalar/api-reference");
    expect(pageRes.text).toContain("Scalar.createApiReference");
    // The page embeds the document directly (no fetch back to the JSON
    // route), so the same paths/title show up right in the HTML.
    expect(pageRes.text).toContain('"/ping"');
    expect(pageRes.text).toContain("Ping API");
  });
});
