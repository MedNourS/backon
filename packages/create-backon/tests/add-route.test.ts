import { describe, expect, it, afterEach } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateProject } from "../src/generate";
import { addRoute } from "../src/add-route";
import { detectProject } from "../src/detect";

const cleanupDirs: string[] = [];

afterEach(async () => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-backon-add-route-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("detectProject", () => {
  it("detects hono/typescript from a generated project's package.json", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    const detected = await detectProject(root);
    expect(detected).toEqual({ root, framework: "hono", language: "typescript", ext: "ts" });
  });

  it("detects express/javascript from a generated project's package.json", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "express", language: "javascript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    const detected = await detectProject(root);
    expect(detected).toEqual({ root, framework: "express", language: "javascript", ext: "js" });
  });

  it("refuses a directory with no package.json", async () => {
    const cwd = await makeTmpDir();
    await expect(detectProject(cwd)).rejects.toThrow(/No package\.json found/);
  });

  it("refuses a package.json that isn't a backon project", async () => {
    const cwd = await makeTmpDir();
    await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "unrelated", dependencies: {} }));
    await expect(detectProject(cwd)).rejects.toThrow(/doesn't look like a backon project/);
  });
});

describe("addRoute", () => {
  it("adds a route to an existing hono/typescript project alongside one already there", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: ["telemetry"], copyEnv: false },
      cwd
    );

    const result = await addRoute("UserProfile", root);

    expect(result.route).toBe("user-profile");
    expect(result.filesWritten).toHaveLength(4); // controller, routes, services, index

    // add-route now writes a blank endpoint (no methods) — add-method fills
    // in the real imports/exports once a GET/POST/etc. actually gets added.
    const controller = await readFile(join(root, "src/endpoints/user-profile/user-profile.controller.ts"), "utf-8");
    expect(controller).toContain("run `bun run add-method`");

    const routesFile = await readFile(join(root, "src/endpoints/user-profile/user-profile.routes.ts"), "utf-8");
    expect(routesFile).toContain("userProfileRoutes");
    expect(routesFile).toContain('import { Hono, type Env } from "@mednours/backon"');
    expect(routesFile).toContain("run `bun run add-method`");

    const services = await readFile(join(root, "src/endpoints/user-profile/user-profile.services.ts"), "utf-8");
    expect(services).toContain("`bun run add-method`");

    // Both the pre-existing route and the new one are mounted.
    const endpointsIndex = await readFile(join(root, "src/endpoints/index.ts"), "utf-8");
    expect(endpointsIndex).toContain('endpoints.route("/telemetry", telemetryRoutes);');
    expect(endpointsIndex).toContain('endpoints.route("/user-profile", userProfileRoutes);');
    expect(endpointsIndex).toContain('import { telemetryRoutes } from "./telemetry/telemetry.routes";');
    expect(endpointsIndex).toContain('import { userProfileRoutes } from "./user-profile/user-profile.routes";');
  });

  it("adds a route to an existing express project using endpoints.use(...)", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "express", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );

    await addRoute("billing", root);

    const routesFile = await readFile(join(root, "src/endpoints/billing/billing.routes.ts"), "utf-8");
    expect(routesFile).toContain('import { Router } from "@mednours/backon/express"');

    const endpointsIndex = await readFile(join(root, "src/endpoints/index.ts"), "utf-8");
    expect(endpointsIndex).toContain('import { Router } from "@mednours/backon/express"');
    expect(endpointsIndex).toContain('endpoints.use("/billing", billingRoutes);');
  });

  it("adds a plain-JavaScript route (no TypeScript-only syntax) to a javascript project", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "javascript", db: "none", routes: [], copyEnv: false },
      cwd
    );

    await addRoute("orders", root);

    const routesFile = await readFile(join(root, "src/endpoints/orders/orders.routes.js"), "utf-8");
    expect(routesFile).toContain("new Hono()");
    expect(routesFile).not.toContain("<Env>");
    expect(routesFile).not.toContain("type Env");

    const services = await readFile(join(root, "src/endpoints/orders/orders.services.js"), "utf-8");
    expect(services).not.toContain(": unknown");
    expect(services).not.toContain("as object");

    const endpointsIndex = await readFile(join(root, "src/endpoints/index.js"), "utf-8");
    expect(endpointsIndex).toContain('endpoints.route("/orders", ordersRoutes);');

    // No stray .ts files got written into a javascript project.
    await expect(readFile(join(root, "src/endpoints/orders/orders.routes.ts"), "utf-8")).rejects.toThrow();
  });

  it("refuses a route name that's already mounted, even if its folder is missing", async () => {
    // Simulates corrupted/hand-edited state: index.ts already mounts
    // "telemetry" but nothing wrote src/endpoints/telemetry/ (e.g. someone
    // edited index.ts by hand). The already-exists check in this case can't
    // fire since there's no folder, so this specifically exercises the
    // "already mounted" guard.
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await writeFile(
      join(root, "src/endpoints/index.ts"),
      `import { Hono } from "@mednours/backon";\nimport { telemetryRoutes } from "./telemetry/telemetry.routes";\n\nexport const endpoints = new Hono();\n\nendpoints.route("/telemetry", telemetryRoutes);\n`
    );

    await expect(addRoute("telemetry", root)).rejects.toThrow(/already mounted/);
  });

  it("refuses a route folder that already exists on disk even if not mounted", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await mkdir(join(root, "src/endpoints/telemetry"), { recursive: true });

    await expect(addRoute("telemetry", root)).rejects.toThrow(/already exists/);
  });

  it("refuses to run outside a backon project", async () => {
    const cwd = await makeTmpDir();
    await expect(addRoute("users", cwd)).rejects.toThrow(/No package\.json found/);
  });

  it("kebab-cases the route name the same way the interactive prompt does", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );

    const result = await addRoute("Shopping Cart", root);
    expect(result.route).toBe("shopping-cart");
  });
});
