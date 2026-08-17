import { describe, expect, it, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateProject } from "../src/generate";
import { listRoutes } from "../src/list-routes";

const cleanupDirs: string[] = [];

afterEach(async () => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-backon-list-routes-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("listRoutes", () => {
  it("returns every route mounted in index.<ext>, in mount order", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      {
        projectName: ".",
        framework: "hono",
        language: "typescript",
        db: "none",
        routes: ["telemetry", "user-profiles"],
        copyEnv: false,
      },
      cwd
    );

    const { routes } = await listRoutes(root);
    expect(routes).toEqual(["telemetry", "user-profiles"]);
  });

  it("returns an empty list for a project with no routes", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );

    const { routes } = await listRoutes(root);
    expect(routes).toEqual([]);
  });

  it("works the same for an express project's endpoints.use(...) mounts", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      {
        projectName: ".",
        framework: "express",
        language: "javascript",
        db: "none",
        routes: ["billing"],
        copyEnv: false,
      },
      cwd
    );

    const { routes } = await listRoutes(root);
    expect(routes).toEqual(["billing"]);
  });

  it("refuses to run outside a backon project", async () => {
    const cwd = await makeTmpDir();
    await expect(listRoutes(cwd)).rejects.toThrow(/No package\.json found/);
  });
});
