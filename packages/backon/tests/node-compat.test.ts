import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

// dist/ is a build artifact (see package.json's "build" script), not
// checked into source — this only runs once it's been built, same as any
// consumer would actually get it. `bun run build` before `bun test` (or
// `prepublishOnly`, which does both) produces it; skip with a clear reason
// otherwise, rather than failing on a precondition this file doesn't
// control.
const distEntry = join(import.meta.dir, "..", "dist", "index.js");
const distExists = existsSync(distEntry);

describe("Node compatibility (built dist/)", () => {
  it.skipIf(!distExists)(
    "imports and actually serves a request under plain Node, not just Bun",
    async () => {
      const proc = Bun.spawnSync(["node", join(import.meta.dir, "fixtures", "node-e2e.mjs")], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = proc.stdout.toString();
      const stderr = proc.stderr.toString();
      if (proc.exitCode !== 0) {
        throw new Error(`node-e2e.mjs failed (exit ${proc.exitCode}).\nstdout: ${stdout}\nstderr: ${stderr}`);
      }
      expect(stdout).toContain("PASS");
    },
    15000
  );

  if (!distExists) {
    console.warn("Skipping Node-compat test — run `bun run build` first to produce dist/.");
  }
});
