import { describe, expect, it, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectDbStatus } from "../src/db-status";
import { generateProject } from "../src/generate";

const cleanupDirs: string[] = [];

afterEach(async () => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-backon-db-status-test-"));
  cleanupDirs.push(dir);
  return dir;
}

// Strips ANSI color codes so assertions can check plain text.
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("detectDbStatus", () => {
  it('reports "none" as always ready, with no .env needed', async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    const status = await detectDbStatus(root);
    expect(status.driver).toBe("none");
    expect(status.ready).toBe(true);
    expect(stripAnsi(status.summary)).toContain("no database configured");
  });

  it("reports neon as ready once DATABASE_URL is set in .env", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "neon", routes: [], copyEnv: false },
      cwd
    );

    const notReady = await detectDbStatus(root);
    expect(notReady.driver).toBe("neon");
    expect(notReady.ready).toBe(false);
    expect(notReady.envFileExists).toBe(false);
    expect(stripAnsi(notReady.summary)).toContain("DATABASE_URL missing");

    await writeFile(join(root, ".env"), "DATABASE_URL=postgres://user:pass@host/db\n");
    const ready = await detectDbStatus(root);
    expect(ready.ready).toBe(true);
    expect(ready.envFileExists).toBe(true);
    expect(stripAnsi(ready.summary)).toContain("DATABASE_URL is set");
  });

  it("reports postgres the same way as neon (both hard-require DATABASE_URL)", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "postgres", routes: [], copyEnv: false },
      cwd
    );
    const status = await detectDbStatus(root);
    expect(status.driver).toBe("postgres");
    expect(status.ready).toBe(false);
  });

  it("reports sqlite as always ready, defaulting to ./dev.db when DATABASE_URL isn't set", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "sqlite", routes: [], copyEnv: false },
      cwd
    );
    const status = await detectDbStatus(root);
    expect(status.driver).toBe("sqlite");
    expect(status.ready).toBe(true);
    expect(stripAnsi(status.summary)).toContain("./dev.db");
  });

  it('flags a hand-edited db file as "custom" rather than guessing', async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await writeFile(join(root, "src/config/db.ts"), "export const db = myCustomClient();\n");
    const status = await detectDbStatus(root);
    expect(status.driver).toBe("custom");
    expect(status.ready).toBe("unknown");
  });

  it('flags a missing db file as "missing" rather than throwing', async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await rm(join(root, "src/config/db.ts"));
    const status = await detectDbStatus(root);
    expect(status.driver).toBe("missing");
    expect(status.ready).toBe("unknown");
  });
});
