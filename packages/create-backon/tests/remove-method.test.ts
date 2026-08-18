import { describe, expect, it, afterEach } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addMethod } from "../src/add-method";
import { addRoute } from "../src/add-route";
import { generateProject } from "../src/generate";
import { removeMethod } from "../src/remove-method";
import { listEndpointsWithMethods } from "../src/route-methods";

const cleanupDirs: string[] = [];

afterEach(async () => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-backon-remove-method-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("removeMethod", () => {
  it("removes one method's block from all three files while leaving the others intact", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await addRoute("users", root);
    await addMethod("users", { verb: "get", path: "/", name: "list", needsBody: false, needsQuery: false }, root);
    await addMethod("users", { verb: "post", path: "/", name: "create", needsBody: true, needsQuery: false }, root);
    await addMethod(
      "users",
      { verb: "get", path: "/:id", name: "getById", needsBody: false, needsQuery: false },
      root
    );

    const { removed } = await removeMethod("users", "post", "/", root);
    expect(removed).toEqual({ verb: "post", path: "/", name: "create" });

    const summaries = await listEndpointsWithMethods(root);
    expect(summaries).toEqual([
      {
        route: "users",
        methods: [
          { verb: "get", path: "/", name: "list" },
          { verb: "get", path: "/:id", name: "getById" },
        ],
      },
    ]);

    const controller = await readFile(join(root, "src/endpoints/users/users.controller.ts"), "utf-8");
    expect(controller).not.toContain("export const create");
    expect(controller).not.toContain("createBodySchema");
    expect(controller).toContain("export const list");
    expect(controller).toContain("export const getById");

    const services = await readFile(join(root, "src/endpoints/users/users.services.ts"), "utf-8");
    expect(services).not.toContain("export async function create");
    expect(services).toContain("export async function list");
    expect(services).toContain("export async function getById");

    const routes = await readFile(join(root, "src/endpoints/users/users.routes.ts"), "utf-8");
    expect(routes).not.toContain('usersRoutes.post("/", controller.create);');
    expect(routes).toContain('usersRoutes.get("/", controller.list);');
    expect(routes).toContain('usersRoutes.get("/:id", controller.getById);');
  });

  it("resets all three files back to their blank shape when removing the last method", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await addRoute("users", root);
    await addMethod("users", { verb: "get", path: "/", name: "list", needsBody: false, needsQuery: false }, root);

    await removeMethod("users", "get", "/", root);

    const summaries = await listEndpointsWithMethods(root);
    expect(summaries).toEqual([{ route: "users", methods: [] }]);

    const controller = await readFile(join(root, "src/endpoints/users/users.controller.ts"), "utf-8");
    expect(controller).toContain("run `bun run add-method`");
    const routes = await readFile(join(root, "src/endpoints/users/users.routes.ts"), "utf-8");
    expect(routes).toContain("run `bun run add-method`");
    // The route is still mounted — removing its last method doesn't unmount it.
    expect(routes).toContain("usersRoutes");
  });

  it("throws when the verb+path isn't actually mounted", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await addRoute("users", root);
    await addMethod("users", { verb: "get", path: "/", name: "list", needsBody: false, needsQuery: false }, root);

    await expect(removeMethod("users", "delete", "/:id", root)).rejects.toThrow(/isn't mounted/);
  });

  it("doesn't leave the removed method's TODO comment orphaned onto the next method", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await addRoute("users", root);
    // "create" gets a leading "// TODO: replace with the real shape of ..."
    // comment directly above its body schema const, immediately followed
    // (no blank line) by "getById"'s own params schema const — the exact
    // adjacency that used to leave "create"'s comment behind, reattached to
    // "getById", once "create" itself was removed.
    await addMethod("users", { verb: "post", path: "/", name: "create", needsBody: true, needsQuery: false }, root);
    await addMethod("users", { verb: "get", path: "/:id", name: "getById", needsBody: false, needsQuery: false }, root);

    await removeMethod("users", "post", "/", root);

    const controller = await readFile(join(root, "src/endpoints/users/users.controller.ts"), "utf-8");
    expect(controller).not.toContain("create");
    expect(controller).not.toContain('replace with the real shape of "create"');
    expect(controller).toContain("export const getById");
  });

  it("removes only the removed method's own schema-type import from services.ts, leaving other methods' imports intact", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await addRoute("users", root);
    await addMethod("users", { verb: "post", path: "/", name: "create", needsBody: true, needsQuery: false }, root);
    await addMethod(
      "users",
      { verb: "put", path: "/:id", name: "update", needsBody: true, needsQuery: false },
      root
    );

    await removeMethod("users", "post", "/", root);

    const services = await readFile(join(root, "src/endpoints/users/users.services.ts"), "utf-8");
    expect(services).not.toContain("createBodySchema");
    expect(services).not.toContain("export async function create");
    expect(services).toContain("updateBodySchema");
    expect(services).toContain("export async function update");
  });

  it("finds and removes a mount line even after it's been hand-reformatted, as long as parseRouteMethods can still see it", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await addRoute("users", root);
    await addMethod("users", { verb: "post", path: "/", name: "create", needsBody: false, needsQuery: false }, root);
    await addMethod("users", { verb: "get", path: "/:id", name: "getById", needsBody: false, needsQuery: false }, root);

    // Old text-block removal matched the mount line by exact string
    // equality against routeMountLine()'s own literal output — a trailing
    // comment like this would have made it silently fail to find anything
    // to remove. AST-based removal matches by the controller.<name>
    // reference itself, so this keeps working.
    const routesPath = join(root, "src/endpoints/users/users.routes.ts");
    const original = await readFile(routesPath, "utf-8");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(routesPath, original.replace('usersRoutes.post("/", controller.create);', 'usersRoutes.post("/", controller.create); // reformatted by hand'));

    const { removed } = await removeMethod("users", "post", "/", root);
    expect(removed.name).toBe("create");

    const routes = await readFile(routesPath, "utf-8");
    expect(routes).not.toContain("controller.create");
    expect(routes).toContain('usersRoutes.get("/:id", controller.getById);');
  });
});
