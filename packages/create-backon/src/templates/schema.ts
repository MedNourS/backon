import { toKebabCase } from "../prompts";
import { camelCase } from "./route";

/**
 * The column types offered by `add-table`/`server-config`'s table editor.
 * Deliberately a curated subset of what drizzle-orm/pg-core actually
 * offers, not the full set (no jsonb, arrays, enums, numeric/decimal,
 * varchar-with-length, etc. — those still work fine, they just have to be
 * hand-added to schema.ts, same "escape hatch, not a lock-in" approach
 * obfuscateTailwind()/frontonCompression() use elsewhere in this monorepo).
 * Every one of these, plus the modifier chains below, was checked against a
 * real `tsc --noEmit` run against real drizzle-orm/pg-core types before
 * this went in, not assumed from docs.
 */
export const COLUMN_TYPES = ["text", "integer", "boolean", "timestamp", "uuid"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export interface ColumnSpec {
  /** Raw name as typed, e.g. "Login Count" — sqlName/jsKey are both derived from this. */
  name: string;
  type: ColumnType;
  notNull: boolean;
  unique: boolean;
  /**
   * Pre-rendered modifier chain fragment for a default value, e.g.
   * `.default(true)`, `.defaultNow()`, `.defaultRandom()` — empty string
   * means no default. Kept pre-rendered (rather than a structured value)
   * because each column type's default looks nothing like the others
   * (timestamp/uuid use a no-arg method, text/integer/boolean take a
   * literal), so there's no shared shape worth modeling.
   */
  defaultExpr: string;
  /**
   * A referenced table's JS identifier, e.g. "users" — when set, this
   * column is always rendered as `integer(...).references(() => X.id)`
   * regardless of `type`, matching the idiomatic Drizzle FK pattern (an
   * `integer` column referencing another table's `serial` primary key).
   * Verified against a real `tsc --noEmit`.
   */
  references?: string;
}

export interface TableSpec {
  /** Raw name as typed, e.g. "Blog Posts" — identifier/sqlName are both derived from this. */
  name: string;
  /** Whether to prepend `id: serial("id").primaryKey()` — on by default, matches near-universal convention. */
  includeId: boolean;
  columns: ColumnSpec[];
}

export function tableIdentifier(name: string): string {
  return camelCase(toKebabCase(name));
}

export function tableSqlName(name: string): string {
  return toKebabCase(name).replace(/-/g, "_");
}

export function columnIdentifier(name: string): string {
  return camelCase(toKebabCase(name));
}

function columnSqlName(name: string): string {
  return toKebabCase(name).replace(/-/g, "_");
}

/** Which drizzle-orm/pg-core builder functions a table actually needs — used to keep the shared import declaration minimal and merge-friendly across repeated add-table calls. */
export function requiredBuilders(table: TableSpec): Set<string> {
  const builders = new Set<string>(["pgTable"]);
  if (table.includeId) builders.add("serial");
  for (const col of table.columns) {
    builders.add(col.references ? "integer" : col.type);
  }
  return builders;
}

function renderColumnLine(col: ColumnSpec): string {
  const key = columnIdentifier(col.name);
  const sqlName = columnSqlName(col.name);

  let expr: string;
  if (col.references) {
    expr = `integer("${sqlName}").references(() => ${col.references}.id)`;
  } else {
    expr = `${col.type}("${sqlName}")`;
  }

  if (col.notNull) expr += ".notNull()";
  if (col.unique) expr += ".unique()";
  if (col.defaultExpr) expr += col.defaultExpr;

  return `  ${key}: ${expr},`;
}

/**
 * Renders one `export const <identifier> = pgTable(...)` block — appended
 * as-is to schema.ts by schema-edit.ts's ts-morph layer, the same
 * append-real-statements approach templates/route.ts's method codegen
 * uses.
 */
export function renderTableBlock(table: TableSpec): string {
  const identifier = tableIdentifier(table.name);
  const sqlName = tableSqlName(table.name);
  const lines: string[] = [];
  if (table.includeId) lines.push(`  id: serial("id").primaryKey(),`);
  for (const col of table.columns) lines.push(renderColumnLine(col));

  return `export const ${identifier} = pgTable("${sqlName}", {
${lines.join("\n")}
});`;
}

export function renderBlankSchema(): string {
  // The trailing `export {};` matters: a .ts file with zero import/export
  // statements is a *script* to TypeScript, not a module, and db.ts's
  // `import * as schema from "./schema"` fails to compile against a script
  // file (`error TS2306: File '...' is not a module`) — caught against a
  // real `tsc --noEmit` on a freshly scaffolded project, not assumed.
  return `// No tables yet — add one via \`bun run add-table\` (or server-config's
// "Add a database table"). Each table becomes a real pgTable(...) export
// here, picked up automatically by both db.ts's schema import and
// drizzle-kit (see drizzle.config.ts) — nothing else needs to be told
// about a new table by hand.

export {};
`;
}

/**
 * drizzle-kit's own config file, not one of backon's generated project
 * files in the usual sense — drizzle-kit reads this directly, by
 * convention, from the project root. `dialect: "postgresql"` is correct
 * for both the "neon" and "postgres" db choices: neon-http still speaks
 * the Postgres wire dialect over HTTP, so schema.ts, migrations, and this
 * config are identical between the two — only db.ts's client construction
 * differs (see templates/db.ts).
 */
export function renderDrizzleConfig(ext: "ts" | "js"): string {
  // The guard-then-use shape (rather than a TS-only `!` non-null assertion)
  // matches templates/db.ts's neon/postgres templates exactly, and for the
  // same reason: this file is generated for JavaScript projects too, where
  // `!` isn't valid syntax at all. TypeScript's control-flow narrowing
  // still applies to `process.env.DATABASE_URL` across the two statements
  // below, same as it already does in db.ts.
  return `import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required (see src/config/db.${ext})");
}

export default defineConfig({
  schema: "./src/config/schema.${ext}",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
`;
}
