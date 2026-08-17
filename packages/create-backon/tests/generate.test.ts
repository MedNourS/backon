import { describe, expect, it, afterEach } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateProject } from "../src/generate";

const cleanupDirs: string[] = [];

afterEach(async () => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-backon-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("generateProject", () => {
  it("writes the base skeleton with no routes (hono)", async () => {
    const cwd = await makeTmpDir();
    const { root, filesWritten } = await generateProject(
      { projectName: "my-api", framework: "hono", db: "none", routes: [] },
      cwd
    );

    expect(root).toBe(join(cwd, "my-api"));
    expect(filesWritten.length).toBe(10);

    const appTs = await readFile(join(root, "src/app.ts"), "utf-8");
    expect(appTs).toContain('import { createApp } from "@mednours/backon"');

    const dbTs = await readFile(join(root, "src/config/db.ts"), "utf-8");
    expect(dbTs).toContain("export const db = undefined;");
  });

  it("writes controller/routes/services per route and wires endpoints/index.ts (hono)", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: "my-api", framework: "hono", db: "neon", routes: ["telemetry", "user-profiles"] },
      cwd
    );

    const controller = await readFile(join(root, "src/endpoints/telemetry/telemetry.controller.ts"), "utf-8");
    expect(controller).toContain('import { defineRoute } from "@mednours/backon"');

    const routes = await readFile(join(root, "src/endpoints/telemetry/telemetry.routes.ts"), "utf-8");
    expect(routes).toContain("telemetryRoutes");
    expect(routes).toContain('import { Hono, type Env } from "@mednours/backon"');

    const endpointsIndex = await readFile(join(root, "src/endpoints/index.ts"), "utf-8");
    expect(endpointsIndex).toContain('import { telemetryRoutes } from "./telemetry/telemetry.routes";');
    expect(endpointsIndex).toContain('import { userProfilesRoutes } from "./user-profiles/user-profiles.routes";');
    expect(endpointsIndex).toContain('endpoints.route("/telemetry", telemetryRoutes);');
    expect(endpointsIndex).toContain('endpoints.route("/user-profiles", userProfilesRoutes);');

    const dbTs = await readFile(join(root, "src/config/db.ts"), "utf-8");
    expect(dbTs).toContain("drizzle-orm/neon-http");

    const pkgJson = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
    expect(pkgJson.dependencies["@mednours/backon"]).toBeTruthy();
    expect(pkgJson.dependencies["hono"]).toBeTruthy();
    expect(pkgJson.dependencies["express"]).toBeUndefined();
    expect(pkgJson.dependencies["@neondatabase/serverless"]).toBeTruthy();
    expect(pkgJson.dependencies["drizzle-orm"]).toBeTruthy();
  });

  it("writes controller/routes/services per route and wires endpoints/index.ts (express)", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: "my-api", framework: "express", db: "sqlite", routes: ["telemetry"] },
      cwd
    );

    const appTs = await readFile(join(root, "src/app.ts"), "utf-8");
    expect(appTs).toContain('import { createApp } from "@mednours/backon/express"');
    expect(appTs).toContain('app.use("/", endpoints);');

    const controller = await readFile(join(root, "src/endpoints/telemetry/telemetry.controller.ts"), "utf-8");
    expect(controller).toContain('import { defineRoute } from "@mednours/backon/express"');

    const routes = await readFile(join(root, "src/endpoints/telemetry/telemetry.routes.ts"), "utf-8");
    expect(routes).toContain('import { Router } from "@mednours/backon/express"');
    expect(routes).toContain("telemetryRoutes");

    const endpointsIndex = await readFile(join(root, "src/endpoints/index.ts"), "utf-8");
    expect(endpointsIndex).toContain('import { Router } from "@mednours/backon/express"');
    expect(endpointsIndex).toContain('endpoints.use("/telemetry", telemetryRoutes);');

    const pkgJson = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
    expect(pkgJson.dependencies["@mednours/backon"]).toBeTruthy();
    expect(pkgJson.dependencies["express"]).toBeTruthy();
    expect(pkgJson.dependencies["cors"]).toBeTruthy();
    expect(pkgJson.dependencies["helmet"]).toBeTruthy();
    expect(pkgJson.dependencies["compression"]).toBeTruthy();
    expect(pkgJson.dependencies["hono"]).toBeUndefined();
    expect(pkgJson.devDependencies["@types/express"]).toBeTruthy();
  });

  it("generates a valid db.ts variant for each db choice", async () => {
    for (const db of ["neon", "postgres", "sqlite", "none"] as const) {
      const cwd = await makeTmpDir();
      const { root } = await generateProject({ projectName: "my-api", framework: "hono", db, routes: [] }, cwd);
      const dbTs = await readFile(join(root, "src/config/db.ts"), "utf-8");
      expect(dbTs.length).toBeGreaterThan(0);
    }
  });
});
