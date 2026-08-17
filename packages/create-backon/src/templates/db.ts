import type { DbChoice } from "../prompts";

export interface DbTemplate {
  /** Contents of src/config/db.ts */
  file: string;
  /** Extra runtime dependencies the generated package.json needs. */
  dependencies: Record<string, string>;
  /** Line(s) appended to .env.example. */
  envVars: string;
  /** One-line note surfaced in the generated README so the caveats aren't silently lost. */
  readmeNote: string;
}

const TEMPLATES: Record<DbChoice, DbTemplate> = {
  neon: {
    file: `import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required (Neon connection string)");
}

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql);
`,
    dependencies: {
      "drizzle-orm": "^0.38.2",
      "@neondatabase/serverless": "^0.10.4",
    },
    envVars: "DATABASE_URL=postgres://user:password@ep-example-123456.us-east-2.aws.neon.tech/dbname?sslmode=require\n",
    readmeNote:
      "Uses Neon's HTTP driver — no connection pooling to manage, which is what makes it safe to use from serverless functions (e.g. Vercel).",
  },
  postgres: {
    file: `import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// NOTE: this pooled connection is for local dev or a long-running server
// (Docker, a VPS, Render, etc). It is NOT safe to use as-is on Vercel
// serverless functions — each cold start can open a new connection until
// you exhaust the database's connection limit. Use the "neon" db option
// instead for serverless deploys.

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool);
`,
    dependencies: {
      "drizzle-orm": "^0.38.2",
      pg: "^8.13.1",
    },
    envVars: "DATABASE_URL=postgres://user:password@localhost:5432/dbname\n",
    readmeNote:
      "Pooled Postgres connection — fine for local dev or a long-running server, NOT safe as-is on Vercel serverless functions (connection pool exhaustion on cold starts). Use Neon for serverless deploys.",
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
    envVars: "DATABASE_URL=./dev.db\n",
    readmeNote: "Local file-based SQLite — for local dev only, not for a serverless deploy target.",
  },
  none: {
    file: `// No database configured yet. Wire up a real client here — e.g. one of
// the neon/postgres/sqlite variants this CLI can also generate — and
// export it as \`db\` so src/endpoints/*/*.services.ts can import it.

export const db = undefined;
`,
    dependencies: {},
    envVars: "",
    readmeNote: "No database configured. src/config/db.ts is an empty stub.",
  },
};

export function renderDbFile(db: DbChoice): string {
  return TEMPLATES[db].file;
}

export function dbDependencies(db: DbChoice): Record<string, string> {
  return TEMPLATES[db].dependencies;
}

export function dbEnvVars(db: DbChoice): string {
  return TEMPLATES[db].envVars;
}

export function dbReadmeNote(db: DbChoice): string {
  return TEMPLATES[db].readmeNote;
}
