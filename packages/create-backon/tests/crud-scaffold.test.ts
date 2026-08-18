import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addMethod } from "../src/add-method";
import { addRoute } from "../src/add-route";
import { addCrudMethods } from "../src/crud-scaffold";
import { generateProject } from "../src/generate";
import { listEndpointsWithMethods } from "../src/route-methods";

const cleanupDirs: string[] = [];

afterEach(async () => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-backon-crud-scaffold-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("addCrudMethods", () => {
  it("wires up the standard five on a blank endpoint", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await addRoute("users", root);

    const result = await addCrudMethods("users", root);
    expect(result.added).toEqual(["list", "create", "getById", "update", "remove"]);
    expect(result.skipped).toEqual([]);

    const summaries = await listEndpointsWithMethods(root);
    const methods = summaries.find((s) => s.route === "users")?.methods;
    expect(methods).toEqual([
      { verb: "get", path: "/", name: "list" },
      { verb: "post", path: "/", name: "create" },
      { verb: "get", path: "/:id", name: "getById" },
      { verb: "put", path: "/:id", name: "update" },
      { verb: "delete", path: "/:id", name: "remove" },
    ]);
  });

  it("skips methods that would collide with what's already there instead of failing the whole batch", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await addRoute("users", root);
    // Same name AND same verb+path as two of the standard five, hand-added first.
    await addMethod("users", { verb: "get", path: "/", name: "list", needsBody: false, needsQuery: false }, root);
    await addMethod("users", { verb: "delete", path: "/:id", name: "destroy", needsBody: false, needsQuery: false }, root);

    const result = await addCrudMethods("users", root);
    // "list" collides by name+verb+path; "remove" collides by verb+path with "destroy".
    expect(result.skipped).toEqual(["list", "remove"]);
    expect(result.added).toEqual(["create", "getById", "update"]);

    const summaries = await listEndpointsWithMethods(root);
    const methods = summaries.find((s) => s.route === "users")?.methods ?? [];
    expect(methods).toHaveLength(5); // list, destroy (pre-existing) + create, getById, update (newly added)
  });

  it("is a no-op batch (all skipped) when every standard method is already there", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await addRoute("users", root);
    await addCrudMethods("users", root);

    const second = await addCrudMethods("users", root);
    expect(second.added).toEqual([]);
    expect(second.skipped).toEqual(["list", "create", "getById", "update", "remove"]);
  });
});
