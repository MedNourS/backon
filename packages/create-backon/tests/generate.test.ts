import { describe, expect, it, afterEach } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  it("writes the base skeleton with no routes (hono, typescript)", async () => {
    const cwd = await makeTmpDir();
    const { root, filesWritten } = await generateProject(
      { projectName: "my-api", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );

    expect(root).toBe(join(cwd, "my-api"));
    expect(filesWritten.length).toBe(10);

    const appTs = await readFile(join(root, "src/app.ts"), "utf-8");
    expect(appTs).toContain('import { createApp } from "@mednours/backon"');

    const dbTs = await readFile(join(root, "src/config/db.ts"), "utf-8");
    expect(dbTs).toContain("export const db = undefined;");

    // TypeScript mode gets a tsconfig, not a jsconfig.
    expect(await readFile(join(root, "tsconfig.json"), "utf-8")).toContain('"strict": true');
  });

  it("writes controller/routes/services per route and wires endpoints/index.ts (hono)", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      {
        projectName: "my-api",
        framework: "hono",
        language: "typescript",
        db: "neon",
        routes: ["telemetry", "user-profiles"],
        copyEnv: false,
      },
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
    expect(pkgJson.devDependencies["typescript"]).toBeTruthy();
    expect(pkgJson.scripts.typecheck).toBe("tsc --noEmit");
  });

  it("writes controller/routes/services per route and wires endpoints/index.ts (express)", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      {
        projectName: "my-api",
        framework: "express",
        language: "typescript",
        db: "sqlite",
        routes: ["telemetry"],
        copyEnv: false,
      },
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
      const { root } = await generateProject(
        { projectName: "my-api", framework: "hono", language: "typescript", db, routes: [], copyEnv: false },
        cwd
      );
      const dbTs = await readFile(join(root, "src/config/db.ts"), "utf-8");
      expect(dbTs.length).toBeGreaterThan(0);
    }
  });

  it("generates plain JavaScript with no TypeScript-only syntax when language is javascript", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      {
        projectName: "my-api",
        framework: "hono",
        language: "javascript",
        db: "none",
        routes: ["telemetry"],
        copyEnv: false,
      },
      cwd
    );

    // .js files exist, .ts files don't.
    await readFile(join(root, "index.js"), "utf-8");
    await readFile(join(root, "src/app.js"), "utf-8");
    await readFile(join(root, "src/config/db.js"), "utf-8");
    await expect(readFile(join(root, "index.ts"), "utf-8")).rejects.toThrow();

    // jsconfig.json instead of tsconfig.json.
    const jsconfig = await readFile(join(root, "jsconfig.json"), "utf-8");
    expect(jsconfig).toContain('"allowJs": true');
    await expect(readFile(join(root, "tsconfig.json"), "utf-8")).rejects.toThrow();

    // No TypeScript-only syntax anywhere in the generated .js files.
    const middleware = await readFile(join(root, "src/middleware/example.middleware.js"), "utf-8");
    expect(middleware).not.toContain("import type");
    expect(middleware).not.toContain(": BackonContext");

    const routesFile = await readFile(join(root, "src/endpoints/telemetry/telemetry.routes.js"), "utf-8");
    expect(routesFile).not.toContain("<Env>");
    expect(routesFile).not.toContain("type Env");
    expect(routesFile).toContain("new Hono()");

    const services = await readFile(join(root, "src/endpoints/telemetry/telemetry.services.js"), "utf-8");
    expect(services).not.toContain(": unknown");
    expect(services).not.toContain("as object");

    // No TypeScript devDependency, no typecheck script.
    const pkgJson = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
    expect(pkgJson.devDependencies.typescript).toBeUndefined();
    expect(pkgJson.scripts.typecheck).toBeUndefined();
    expect(pkgJson.scripts.dev).toBe("bun run --watch index.js");
  });

  it('scaffolds into the current directory when projectName is "."', async () => {
    const cwd = await makeTmpDir();
    const { root, filesWritten } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );

    expect(root).toBe(cwd);
    expect(filesWritten.length).toBe(10);

    // package.json's "name" falls back to the directory's own basename,
    // not the literal ".", since "." isn't a valid npm package name.
    const pkgJson = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
    const expectedName = cwd.split("/").pop();
    expect(pkgJson.name).toBe(expectedName);

    const readme = await readFile(join(root, "README.md"), "utf-8");
    expect(readme.startsWith(`# ${expectedName}`)).toBe(true);
  });

  it('allows scaffolding into "." when it only has ignorable entries (.git, README.md, etc)', async () => {
    const cwd = await makeTmpDir();
    await mkdir(join(cwd, ".git"));
    await writeFile(join(cwd, "README.md"), "# placeholder\n");
    await writeFile(join(cwd, ".gitignore"), "node_modules/\n");

    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );

    expect(root).toBe(cwd);
    // The generator's own README.md write should have overwritten the placeholder.
    const readme = await readFile(join(root, "README.md"), "utf-8");
    expect(readme).toContain("Generated by `create-backon`");
  });

  it("refuses to scaffold into a non-empty directory that has real files in it", async () => {
    const cwd = await makeTmpDir();
    await writeFile(join(cwd, "existing-file.txt"), "don't clobber me");

    await expect(
      generateProject(
        { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
        cwd
      )
    ).rejects.toThrow(/already has files/);
  });

  it("writes .env from .env.example when copyEnv is true, and skips it when false", async () => {
    const cwdWith = await makeTmpDir();
    const { root: rootWith, filesWritten } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "sqlite", routes: [], copyEnv: true },
      cwdWith
    );
    expect(filesWritten.length).toBe(11); // one more than the copyEnv:false base skeleton
    const env = await readFile(join(rootWith, ".env"), "utf-8");
    const envExample = await readFile(join(rootWith, ".env.example"), "utf-8");
    expect(env).toBe(envExample);

    const cwdWithout = await makeTmpDir();
    const { root: rootWithout } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "sqlite", routes: [], copyEnv: false },
      cwdWithout
    );
    await expect(readFile(join(rootWithout, ".env"), "utf-8")).rejects.toThrow();
  });
});
