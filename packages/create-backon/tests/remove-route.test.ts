import { describe, expect, it, afterEach } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateProject } from "../src/generate";
import { addRoute } from "../src/add-route";
import { removeRoute } from "../src/remove-route";

const cleanupDirs: string[] = [];

afterEach(async () => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-backon-remove-route-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("removeRoute", () => {
  it("deletes the route folder and unmounts it, leaving other routes intact", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      {
        projectName: ".",
        framework: "hono",
        language: "typescript",
        db: "none",
        routes: ["telemetry", "users"],
        copyEnv: false,
      },
      cwd
    );

    const result = await removeRoute("users", root);

    expect(result.route).toBe("users");
    expect(result.removedDir).toBe(join(root, "src/endpoints/users"));

    // The folder is actually gone.
    await expect(readFile(join(root, "src/endpoints/users/users.routes.ts"), "utf-8")).rejects.toThrow();

    // The remaining route is still mounted, the removed one isn't.
    const endpointsIndex = await readFile(join(root, "src/endpoints/index.ts"), "utf-8");
    expect(endpointsIndex).toContain('endpoints.route("/telemetry", telemetryRoutes);');
    expect(endpointsIndex).not.toContain("usersRoutes");
    expect(endpointsIndex).not.toContain('"/users"');
  });

  it("undoes an addRoute() — round trip leaves the project back where it started", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "express", language: "javascript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    const before = await readFile(join(root, "src/endpoints/index.js"), "utf-8");

    await addRoute("orders", root);
    await removeRoute("orders", root);

    const after = await readFile(join(root, "src/endpoints/index.js"), "utf-8");
    expect(after).toBe(before);
    await expect(readFile(join(root, "src/endpoints/orders/orders.routes.js"), "utf-8")).rejects.toThrow();
  });

  it("refuses a route that isn't mounted", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );

    await expect(removeRoute("ghost", root)).rejects.toThrow(/isn't mounted/);
  });

  it("kebab-cases the route name before looking it up", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      {
        projectName: ".",
        framework: "hono",
        language: "typescript",
        db: "none",
        routes: ["shopping-cart"],
        copyEnv: false,
      },
      cwd
    );

    const result = await removeRoute("ShoppingCart", root);
    expect(result.route).toBe("shopping-cart");
  });

  it("refuses to run outside a backon project", async () => {
    const cwd = await makeTmpDir();
    await expect(removeRoute("users", cwd)).rejects.toThrow(/No package\.json found/);
  });
});
