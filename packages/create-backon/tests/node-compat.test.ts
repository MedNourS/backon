import { afterEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// dist/cli.js is a build artifact (see package.json's "build" script), not
// checked into source — this only runs once it's been built, same as what
// `npx create-backon`/`npm create backon` would actually download and run.
// `bun run build` (or `prepublishOnly`, which does both) produces it; skip
// with a clear reason otherwise, rather than failing on a precondition
// this file doesn't control.
const cliEntry = join(import.meta.dir, "..", "dist", "cli.js");
const distExists = existsSync(cliEntry);

const cleanupDirs: string[] = [];
afterEach(async () => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeFakeProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-backon-node-compat-"));
  cleanupDirs.push(dir);
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "fake-proj",
      dependencies: { "@mednours/backon": "0.7.0", hono: "^4.0.0" },
      devDependencies: { typescript: "^5.0.0" },
    })
  );
  await mkdir(join(dir, "src/endpoints"), { recursive: true });
  await writeFile(
    join(dir, "src/endpoints/index.ts"),
    'import { Hono } from "@mednours/backon";\nexport const endpoints = new Hono();\n'
  );
  return dir;
}

describe("Node compatibility (built dist/cli.js)", () => {
  it.skipIf(!distExists)(
    "runs the bundled CLI's real add-route/list-routes flow under plain Node, not just Bun",
    async () => {
      const projectDir = await makeFakeProject();

      const addRoute = Bun.spawnSync(["node", cliEntry, "add-route", "users"], {
        cwd: projectDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      if (addRoute.exitCode !== 0) {
        throw new Error(`add-route failed (exit ${addRoute.exitCode}): ${addRoute.stderr.toString()}`);
      }
      expect(existsSync(join(projectDir, "src/endpoints/users/users.controller.ts"))).toBe(true);

      const listRoutes = Bun.spawnSync(["node", cliEntry, "list-routes"], {
        cwd: projectDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      if (listRoutes.exitCode !== 0) {
        throw new Error(`list-routes failed (exit ${listRoutes.exitCode}): ${listRoutes.stderr.toString()}`);
      }
      expect(listRoutes.stdout.toString()).toContain("users");
    },
    15000
  );

  if (!distExists) {
    console.warn("Skipping Node-compat test — run `bun run build` first to produce dist/cli.js.");
  }
});
