import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addMethod } from "../src/add-method";
import { addRoute } from "../src/add-route";
import { generateProject } from "../src/generate";

const cleanupDirs: string[] = [];

afterEach(async () => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-backon-add-method-test-"));
  cleanupDirs.push(dir);
  return dir;
}

async function makeBlankHonoProject() {
  const cwd = await makeTmpDir();
  const { root } = await generateProject(
    { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
    cwd
  );
  await addRoute("users", root);
  return root;
}

describe("addMethod", () => {
  it("adds a param-less GET with no schema at all", async () => {
    const root = await makeBlankHonoProject();
    await addMethod("users", { verb: "get", path: "/", name: "list", needsBody: false, needsQuery: false }, root);

    const controller = await readFile(join(root, "src/endpoints/users/users.controller.ts"), "utf-8");
    expect(controller).toContain('import { z } from "zod";');
    expect(controller).toContain('import { defineRoute } from "@mednours/backon";');
    expect(controller).toContain('import * as service from "./users.services";');
    expect(controller).toContain("export const list = defineRoute({}, async (c, { body, query, params }) => {");
    expect(controller).toContain("service.list()");

    const routes = await readFile(join(root, "src/endpoints/users/users.routes.ts"), "utf-8");
    expect(routes).toContain('import * as controller from "./users.controller";');
    expect(routes).toContain('usersRoutes.get("/", controller.list);');
    expect(routes).not.toContain("run `bun run add-method`"); // placeholder cleared

    const services = await readFile(join(root, "src/endpoints/users/users.services.ts"), "utf-8");
    expect(services).toContain("export async function list() {");
    expect(services).toContain("return [];");
  });

  it("wires a POST body schema through to a z.infer-typed service parameter", async () => {
    const root = await makeBlankHonoProject();
    await addMethod("users", { verb: "post", path: "/", name: "create", needsBody: true, needsQuery: false }, root);

    const controller = await readFile(join(root, "src/endpoints/users/users.controller.ts"), "utf-8");
    expect(controller).toContain("export const createBodySchema = z.object({});");
    expect(controller).toContain("export const create = defineRoute({ body: createBodySchema }, async (c, { body, query, params }) => {");
    expect(controller).toContain("service.create(body)");
    expect(controller).toContain("c.json(result, 201)"); // POST defaults to 201

    const services = await readFile(join(root, "src/endpoints/users/users.services.ts"), "utf-8");
    expect(services).toContain('import type { z } from "zod";');
    expect(services).toContain('import type { createBodySchema } from "./users.controller";');
    expect(services).toContain("export async function create(body: z.infer<typeof createBodySchema>) {");
    expect(services).not.toContain(": unknown");
    expect(services).not.toContain("as object");
  });

  it("auto-derives a params schema from :id in the path, typed via z.infer", async () => {
    const root = await makeBlankHonoProject();
    await addMethod("users", { verb: "delete", path: "/:id", name: "remove", needsBody: false, needsQuery: false }, root);

    const controller = await readFile(join(root, "src/endpoints/users/users.controller.ts"), "utf-8");
    expect(controller).toContain("export const removeParamsSchema = z.object({ id: z.string() });");
    expect(controller).toContain("export const remove = defineRoute({ params: removeParamsSchema }, async (c, { body, query, params }) => {");

    const routes = await readFile(join(root, "src/endpoints/users/users.routes.ts"), "utf-8");
    expect(routes).toContain('usersRoutes.delete("/:id", controller.remove);');

    const services = await readFile(join(root, "src/endpoints/users/users.services.ts"), "utf-8");
    expect(services).toContain('import type { removeParamsSchema } from "./users.controller";');
    expect(services).toContain("export async function remove(params: z.infer<typeof removeParamsSchema>) {");
  });

  it("keeps JavaScript-mode services untyped (no type-only imports, no z.infer)", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "javascript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await addRoute("users", root);
    await addMethod("users", { verb: "post", path: "/", name: "create", needsBody: true, needsQuery: false }, root);

    const services = await readFile(join(root, "src/endpoints/users/users.services.js"), "utf-8");
    expect(services).not.toContain("import type");
    expect(services).not.toContain("z.infer");
    expect(services).toContain("export async function create(body) {");
  });

  it("accumulates multiple methods in the same files without clobbering earlier ones", async () => {
    const root = await makeBlankHonoProject();
    await addMethod("users", { verb: "get", path: "/", name: "list", needsBody: false, needsQuery: false }, root);
    await addMethod("users", { verb: "post", path: "/", name: "create", needsBody: true, needsQuery: false }, root);
    await addMethod("users", { verb: "get", path: "/:id", name: "getById", needsBody: false, needsQuery: false }, root);

    const controller = await readFile(join(root, "src/endpoints/users/users.controller.ts"), "utf-8");
    // Each import line appears exactly once even though three methods were added.
    expect(controller.match(/import \{ z \} from "zod";/g)?.length).toBe(1);
    expect(controller).toContain("export const list = defineRoute");
    expect(controller).toContain("export const create = defineRoute");
    expect(controller).toContain("export const getById = defineRoute");

    const routes = await readFile(join(root, "src/endpoints/users/users.routes.ts"), "utf-8");
    expect(routes).toContain('usersRoutes.get("/", controller.list);');
    expect(routes).toContain('usersRoutes.post("/", controller.create);');
    expect(routes).toContain('usersRoutes.get("/:id", controller.getById);');
  });

  it("refuses a duplicate method name", async () => {
    const root = await makeBlankHonoProject();
    await addMethod("users", { verb: "get", path: "/", name: "list", needsBody: false, needsQuery: false }, root);
    await expect(
      addMethod("users", { verb: "get", path: "/all", name: "list", needsBody: false, needsQuery: false }, root)
    ).rejects.toThrow(/already used/);
  });

  it("refuses a duplicate verb+path pair", async () => {
    const root = await makeBlankHonoProject();
    await addMethod("users", { verb: "get", path: "/", name: "list", needsBody: false, needsQuery: false }, root);
    await expect(
      addMethod("users", { verb: "get", path: "/", name: "listAgain", needsBody: false, needsQuery: false }, root)
    ).rejects.toThrow(/already mounted/);
  });

  it("refuses a route that isn't mounted", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await expect(
      addMethod("ghost", { verb: "get", path: "/", name: "list", needsBody: false, needsQuery: false }, root)
    ).rejects.toThrow(/isn't mounted/);
  });
});
