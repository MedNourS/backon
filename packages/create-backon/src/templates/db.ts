import type { DbChoice } from "../prompts";

export interface DbTemplate {
  /** Contents of src/config/db.ts */
  file: string;
  /** Extra runtime dependencies the generated package.json needs. */
  dependencies: Record<string, string>;
  /** Extra dev-only dependencies the generated package.json needs (drizzle-kit — a CLI tool, not runtime code). Merged in regardless of language, same as `dependencies`. */
  devDependencies: Record<string, string>;
  /** Extra dev-only *type declaration* dependencies (e.g. @types/pg) — merged in for TypeScript projects only, mirroring how @types/bun/@types/express are already excluded from JavaScript-mode devDependencies in renderPackageJson(). */
  typeOnlyDevDependencies: Record<string, string>;
  /** Line(s) appended to .env.example. */
  envVars: string;
  /** One-line note surfaced in the generated README so the caveats aren't silently lost. */
  readmeNote: string;
  /** Whether this driver gets src/config/schema.ts + drizzle.config.ts + db:generate/db:migrate/db:push scripts — true for neon/postgres (same pg-core dialect), false for sqlite/none (see schema-edit.ts's requireNeonOrPostgres()). */
  hasSchemaSupport: boolean;
}

// drizzle-kit is genuinely the same for "neon" and "postgres" — both speak
// dialect: "postgresql", both point at the same schema.ts, both use the
// same DATABASE_URL-shaped dbCredentials.url (see templates/schema.ts's
// renderDrizzleConfig()) — only db.ts's client construction differs.
const DRIZZLE_KIT_DEV_DEPENDENCY = { "drizzle-kit": "^0.31.0" };

const TEMPLATES: Record<DbChoice, DbTemplate> = {
  neon: {
    file: `import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required (Neon connection string)");
}

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });
`,
    dependencies: {
      "drizzle-orm": "^0.38.2",
      "@neondatabase/serverless": "^0.10.4",
    },
    devDependencies: DRIZZLE_KIT_DEV_DEPENDENCY,
    // @neondatabase/serverless ships its own types — no @types/* needed.
    typeOnlyDevDependencies: {},
    envVars: "DATABASE_URL=postgres://user:password@ep-example-123456.us-east-2.aws.neon.tech/dbname?sslmode=require\n",
    readmeNote:
      "Uses Neon's HTTP driver — no connection pooling to manage, which is what makes it safe to use from serverless functions (e.g. Vercel).",
    hasSchemaSupport: true,
  },
  postgres: {
    file: `import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// NOTE: this pooled connection is for local dev or a long-running server
// (Docker, a VPS, Render, etc). It is NOT safe to use as-is on Vercel
// serverless functions — each cold start can open a new connection until
// the database's connection limit is exhausted. Use the "neon" db option
// instead for serverless deploys.

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
`,
    dependencies: {
      "drizzle-orm": "^0.38.2",
      pg: "^8.13.1",
    },
    devDependencies: DRIZZLE_KIT_DEV_DEPENDENCY,
    // pg doesn't ship its own types (unlike @neondatabase/serverless) — without
    // this, a freshly scaffolded TypeScript "postgres" project fails
    // `tsc --noEmit` out of the box with TS7016 on `import { Pool } from "pg"`.
    // Caught via a real `bun run typecheck` on a real scaffold, not assumed.
    typeOnlyDevDependencies: { "@types/pg": "^8.23.1" },
    envVars: "DATABASE_URL=postgres://user:password@localhost:5432/dbname\n",
    readmeNote:
      "Pooled Postgres connection — fine for local dev or a long-running server, NOT safe as-is on Vercel serverless functions (connection pool exhaustion on cold starts). Use Neon for serverless deploys.",
    hasSchemaSupport: true,
  },
  sqlite: {
    file: `import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";

// NOTE: local dev only. A serverless function's filesystem is ephemeral —
// this file won't persist between invocations if deployed as-is.

const sqlite = new Database(process.env.DATABASE_URL ?? "./dev.db");

export const db = drizzle(sqlite);
`,
    dependencies: {
      "drizzle-orm": "^0.38.2",
    },
    devDependencies: {},
    typeOnlyDevDependencies: {},
    envVars: "DATABASE_URL=./dev.db\n",
    readmeNote:
      "Local file-based SQLite — for local dev only, not for a serverless deploy target. No schema.ts/add-table support yet — SQLite uses a different set of drizzle-orm column builders (sqlite-core, not pg-core), hand-write a schema with drizzle-orm/sqlite-core if you need one.",
    hasSchemaSupport: false,
  },
  none: {
    file: `// No database configured yet. Wire up a real client here — e.g. one of
// the neon/postgres/sqlite variants this CLI can also generate — and
// export it as \`db\`. Any service file can then do
// \`import { db } from "#config/db";\` (see package.json's "imports" field
// and the README's Database section) regardless of how deep it's nested.

export const db = undefined;
`,
    dependencies: {},
    devDependencies: {},
    typeOnlyDevDependencies: {},
    envVars: "",
    readmeNote: "No database configured. src/config/db.ts is an empty stub.",
    hasSchemaSupport: false,
  },
};

export function renderDbFile(db: DbChoice): string {
  return TEMPLATES[db].file;
}

export function dbDependencies(db: DbChoice): Record<string, string> {
  return TEMPLATES[db].dependencies;
}

export function dbDevDependencies(db: DbChoice): Record<string, string> {
  return TEMPLATES[db].devDependencies;
}

export function dbTypeOnlyDevDependencies(db: DbChoice): Record<string, string> {
  return TEMPLATES[db].typeOnlyDevDependencies;
}

export function dbEnvVars(db: DbChoice): string {
  return TEMPLATES[db].envVars;
}

export function dbReadmeNote(db: DbChoice): string {
  return TEMPLATES[db].readmeNote;
}

export function dbHasSchemaSupport(db: DbChoice): boolean {
  return TEMPLATES[db].hasSchemaSupport;
}
