import { describe, expect, it, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateProject } from "../src/generate";
import { runDoctor } from "../src/doctor";

const cleanupDirs: string[] = [];

afterEach(async () => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-backon-doctor-test-"));
  cleanupDirs.push(dir);
  return dir;
}

describe("runDoctor", () => {
  it("reports no issues for a freshly generated project", async () => {
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

    const { issues } = await runDoctor(root);
    expect(issues).toEqual([]);
  });

  it("flags a dangling mount — index.ts mounts a route whose folder doesn't exist", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await writeFile(
      join(root, "src/endpoints/index.ts"),
      `import { Hono } from "@mednours/backon";\nimport { telemetryRoutes } from "./telemetry/telemetry.routes";\n\nexport const endpoints = new Hono();\n\nendpoints.route("/telemetry", telemetryRoutes);\n`
    );

    const { issues } = await runDoctor(root);
    expect(issues).toContainEqual(
      expect.objectContaining({ kind: "dangling-mount", route: "telemetry" })
    );
  });

  it("flags an orphaned folder — a route folder that exists but isn't mounted", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: ["telemetry"], copyEnv: false },
      cwd
    );
    await mkdir(join(root, "src/endpoints/orphan"), { recursive: true });
    await writeFile(join(root, "src/endpoints/orphan/orphan.controller.ts"), "// stub\n");
    await writeFile(join(root, "src/endpoints/orphan/orphan.routes.ts"), "// stub\n");
    await writeFile(join(root, "src/endpoints/orphan/orphan.services.ts"), "// stub\n");

    const { issues } = await runDoctor(root);
    expect(issues).toContainEqual(expect.objectContaining({ kind: "orphaned-folder", route: "orphan" }));
    // The pre-existing, correctly-mounted route stays clean.
    expect(issues.some((issue) => issue.route === "telemetry")).toBe(false);
  });

  it("flags a missing file inside an otherwise-mounted route folder", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: ["telemetry"], copyEnv: false },
      cwd
    );
    await unlink(join(root, "src/endpoints/telemetry/telemetry.services.ts"));

    const { issues } = await runDoctor(root);
    expect(issues).toContainEqual(
      expect.objectContaining({ kind: "missing-file", route: "telemetry" })
    );
  });

  it("refuses to run outside a backon project", async () => {
    const cwd = await makeTmpDir();
    await expect(runDoctor(cwd)).rejects.toThrow(/No package\.json found/);
  });
});
