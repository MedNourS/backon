import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { dim, ok, warn } from "./colors";
import { detectProject } from "./detect";
import type { DbChoice } from "./prompts";

export interface DbStatus {
  /**
   * Which driver's actually wired up in src/config/db.<ext> — read from the
   * file's own imports rather than remembered from scaffold time, since
   * there's nowhere the original `bun create backon` db choice is
   * persisted. "custom" means the file doesn't match any of the four
   * generated shapes (hand-edited past recognition); "missing" means
   * src/config/db.<ext> doesn't exist at all.
   */
  driver: DbChoice | "custom" | "missing";
  /** Whether .env exists in the project root at all. */
  envFileExists: boolean;
  /**
   * Whether this driver has what it needs to run right now, best guess.
   * "none" and "sqlite" (DATABASE_URL optional there — defaults to
   * ./dev.db) are always ready; "neon"/"postgres" need a non-empty
   * DATABASE_URL in .env; "custom"/"missing" can't be assessed at all.
   */
  ready: boolean | "unknown";
  /** One-line, human-readable, pre-colored summary — this is what actually gets rendered. */
  summary: string;
}

// Matches exactly the driver-identifying import each db.ts template in
// templates/db.ts actually has — read off the file's real imports rather
// than anything remembered from scaffold time, since the original choice
// isn't persisted anywhere.
const DRIVER_SIGNATURES: Array<[string, DbChoice]> = [
  ["drizzle-orm/neon-http", "neon"],
  ["drizzle-orm/node-postgres", "postgres"],
  ["drizzle-orm/bun-sqlite", "sqlite"],
];

function detectDriver(dbFileContents: string): DbChoice | "custom" {
  for (const [signature, driver] of DRIVER_SIGNATURES) {
    if (dbFileContents.includes(signature)) return driver;
  }
  if (dbFileContents.includes("No database configured yet")) return "none";
  return "custom";
}

function parseEnvValue(envContents: string, key: string): string | undefined {
  const match = envContents.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

/**
 * Config-check only, on purpose — no network call or file-existence probe
 * against the actual database is attempted. Reports the driver wired up in
 * src/config/db.<ext> and whether the env var it needs is set in .env.
 * Fast, and behaves the same for every provider; a live connectivity test
 * would need separate driver-specific logic (TCP for Postgres, HTTPS for
 * Neon, a file stat for SQLite) for comparatively little extra signal, and
 * would turn every `bun run project` into a network call.
 */
export async function detectDbStatus(cwd: string = process.cwd()): Promise<DbStatus> {
  const { root, ext } = await detectProject(cwd);

  let dbFileContents: string | undefined;
  try {
    dbFileContents = await readFile(join(root, "src/config", `db.${ext}`), "utf-8");
  } catch {
    dbFileContents = undefined;
  }

  const driver = dbFileContents === undefined ? "missing" : detectDriver(dbFileContents);

  let envContents = "";
  let envFileExists = true;
  try {
    envContents = await readFile(join(root, ".env"), "utf-8");
  } catch {
    envFileExists = false;
  }

  const databaseUrl = parseEnvValue(envContents, "DATABASE_URL");

  if (driver === "missing") {
    return { driver, envFileExists, ready: "unknown", summary: warn("src/config/db file not found.") };
  }
  if (driver === "custom") {
    return {
      driver,
      envFileExists,
      ready: "unknown",
      summary: `${dim("custom")} — src/config/db has been hand-edited, can't tell you its status here.`,
    };
  }
  if (driver === "none") {
    return { driver, envFileExists, ready: true, summary: dim("none — no database configured.") };
  }
  if (driver === "sqlite") {
    const path = databaseUrl ?? "./dev.db";
    return { driver, envFileExists, ready: true, summary: `${ok("sqlite")} — using ${path}.` };
  }

  // neon / postgres both hard-require DATABASE_URL — db.ts itself throws at
  // import time without one, so "missing-env" here means the app won't boot.
  if (databaseUrl) {
    return { driver, envFileExists, ready: true, summary: `${ok(driver)} — DATABASE_URL is set in .env.` };
  }
  return {
    driver,
    envFileExists,
    ready: false,
    summary: `${warn(driver)} — DATABASE_URL missing from .env${
      envFileExists ? "" : " (no .env file)"
    }; src/config/db.ts will throw at startup until it's set.`,
  };
}
