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
});
