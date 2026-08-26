import { describe, expect, it, afterEach } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateProject } from "../src/generate";
import { addTable, removeTable, parseSchemaTables, formatTablesDashboard } from "../src/schema-edit";
import type { TableSpec } from "../src/templates/schema";

const cleanupDirs: string[] = [];

afterEach(async () => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-backon-schema-edit-test-"));
  cleanupDirs.push(dir);
  return dir;
}

const USERS_TABLE: TableSpec = {
  name: "users",
  includeId: true,
  columns: [
    { name: "email", type: "text", notNull: true, unique: true, defaultExpr: "" },
    { name: "is active", type: "boolean", notNull: true, unique: false, defaultExpr: ".default(true)" },
  ],
};

const POSTS_TABLE_REFERENCING_USERS: TableSpec = {
  name: "blog posts",
  includeId: true,
  columns: [
    { name: "title", type: "text", notNull: true, unique: false, defaultExpr: "" },
    { name: "author id", type: "integer", notNull: true, unique: false, defaultExpr: "", references: "users" },
  ],
};

describe("generateProject + neon/postgres schema scaffolding", () => {
  it("writes schema.ts + drizzle.config.ts + db scripts for neon", async () => {
    const cwd = await makeTmpDir();
    const { root, filesWritten } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "neon", routes: [], copyEnv: false },
      cwd
    );

    expect(filesWritten).toContain(join(root, "src/config/schema.ts"));
    expect(filesWritten).toContain(join(root, "drizzle.config.ts"));

    const schema = await readFile(join(root, "src/config/schema.ts"), "utf-8");
    expect(schema).toContain("No tables yet");
    expect(schema).toContain("export {};");

    const dbTs = await readFile(join(root, "src/config/db.ts"), "utf-8");
    expect(dbTs).toContain('import * as schema from "./schema";');
    expect(dbTs).toContain("drizzle(sql, { schema })");

    const pkgJson = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
    expect(pkgJson.devDependencies["drizzle-kit"]).toBeTruthy();
    expect(pkgJson.scripts["db:generate"]).toBe("drizzle-kit generate");
    expect(pkgJson.scripts["db:migrate"]).toBe("drizzle-kit migrate");
    expect(pkgJson.scripts["db:push"]).toBe("drizzle-kit push");
    expect(pkgJson.scripts["add-table"]).toBeTruthy();
    expect(pkgJson.scripts["remove-table"]).toBeTruthy();
  });

  it("writes the same schema scaffolding for postgres, with drizzle(pool, { schema })", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "postgres", routes: [], copyEnv: false },
      cwd
    );

    const dbTs = await readFile(join(root, "src/config/db.ts"), "utf-8");
    expect(dbTs).toContain('import * as schema from "./schema";');
    expect(dbTs).toContain("drizzle(pool, { schema })");

    const drizzleConfig = await readFile(join(root, "drizzle.config.ts"), "utf-8");
    expect(drizzleConfig).toContain('dialect: "postgresql"');
    expect(drizzleConfig).toContain('schema: "./src/config/schema.ts"');
  });

  it("does NOT write schema.ts/drizzle.config.ts/db scripts for sqlite or none", async () => {
    for (const db of ["sqlite", "none"] as const) {
      const cwd = await makeTmpDir();
      const { root, filesWritten } = await generateProject(
        { projectName: ".", framework: "hono", language: "typescript", db, routes: [], copyEnv: false },
        cwd
      );
      expect(filesWritten).not.toContain(join(root, "src/config/schema.ts"));
      expect(filesWritten).not.toContain(join(root, "drizzle.config.ts"));

      const pkgJson = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
      expect(pkgJson.devDependencies["drizzle-kit"]).toBeUndefined();
      expect(pkgJson.scripts["db:generate"]).toBeUndefined();
      expect(pkgJson.scripts["add-table"]).toBeUndefined();
    }
  });

  it("uses schema.js (no schema import in db.ts breaking) for a javascript neon project", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "javascript", db: "neon", routes: [], copyEnv: false },
      cwd
    );

    const schema = await readFile(join(root, "src/config/schema.js"), "utf-8");
    expect(schema).toContain("export {};");

    const drizzleConfig = await readFile(join(root, "drizzle.config.ts"), "utf-8");
    expect(drizzleConfig).toContain('schema: "./src/config/schema.js"');

    const pkgJson = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
    expect(pkgJson.devDependencies.typescript).toBeUndefined(); // JS mode still has zero TS deps
    expect(pkgJson.devDependencies["drizzle-kit"]).toBeTruthy(); // but still gets drizzle-kit
  });
});

describe("addTable / removeTable", () => {
  async function scaffoldNeon(): Promise<string> {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "neon", routes: [], copyEnv: false },
      cwd
    );
    return root;
  }

  it("appends a real pgTable export and merges the pg-core import across repeated calls", async () => {
    const root = await scaffoldNeon();

    await addTable(USERS_TABLE, root);
    const afterUsers = await readFile(join(root, "src/config/schema.ts"), "utf-8");
    expect(afterUsers).toContain("export const users = pgTable(");
    expect(afterUsers).toContain('id: serial("id").primaryKey(),');
    expect(afterUsers).toContain('email: text("email").notNull().unique(),');
    expect(afterUsers).toContain('isActive: boolean("is_active").notNull().default(true),');
    expect(afterUsers).not.toContain("No tables yet"); // placeholder stripped
    // Single merged import, not two separate declarations.
    expect((afterUsers.match(/from "drizzle-orm\/pg-core"/g) ?? []).length).toBe(1);

    await addTable(POSTS_TABLE_REFERENCING_USERS, root);
    const afterPosts = await readFile(join(root, "src/config/schema.ts"), "utf-8");
    expect(afterPosts).toContain("export const blogPosts = pgTable(");
    expect(afterPosts).toContain('authorId: integer("author_id").references(() => users.id).notNull(),');
    expect((afterPosts.match(/from "drizzle-orm\/pg-core"/g) ?? []).length).toBe(1);
    expect(afterPosts).toMatch(/import \{[^}]*integer[^}]*\} from "drizzle-orm\/pg-core"/);
  });

  it("refuses a duplicate table name", async () => {
    const root = await scaffoldNeon();
    await addTable(USERS_TABLE, root);
    await expect(addTable(USERS_TABLE, root)).rejects.toThrow(/already a table/);
  });

  it("refuses a column referencing an unknown table", async () => {
    const root = await scaffoldNeon();
    await expect(addTable(POSTS_TABLE_REFERENCING_USERS, root)).rejects.toThrow(/references unknown table/);
  });

  it("refuses on a sqlite project with a clear message", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "sqlite", routes: [], copyEnv: false },
      cwd
    );
    await expect(addTable(USERS_TABLE, root)).rejects.toThrow(/neon.*or.*postgres/i);
  });

  it("parseSchemaTables reads back identifiers, sql names, columns, and references", async () => {
    const root = await scaffoldNeon();
    await addTable(USERS_TABLE, root);
    await addTable(POSTS_TABLE_REFERENCING_USERS, root);

    const contents = await readFile(join(root, "src/config/schema.ts"), "utf-8");
    const tables = parseSchemaTables(contents);

    expect(tables).toHaveLength(2);
    const users = tables.find((t) => t.identifier === "users")!;
    expect(users.sqlName).toBe("users");
    expect(users.columns.map((c) => c.key)).toEqual(["id", "email", "isActive"]);

    const posts = tables.find((t) => t.identifier === "blogPosts")!;
    expect(posts.sqlName).toBe("blog_posts");
    const authorCol = posts.columns.find((c) => c.key === "authorId")!;
    expect(authorCol.references).toBe("users");
  });

  it("refuses to remove a table another table still references", async () => {
    const root = await scaffoldNeon();
    await addTable(USERS_TABLE, root);
    await addTable(POSTS_TABLE_REFERENCING_USERS, root);

    await expect(removeTable("users", root)).rejects.toThrow(/still referenced by: blogPosts/);
  });

  it("removes a table and prunes pg-core builders nothing else uses", async () => {
    const root = await scaffoldNeon();
    await addTable(USERS_TABLE, root);
    await addTable(POSTS_TABLE_REFERENCING_USERS, root);

    await removeTable("blogPosts", root);
    const afterRemove = await readFile(join(root, "src/config/schema.ts"), "utf-8");
    expect(afterRemove).not.toContain("blogPosts");
    expect(afterRemove).not.toContain("integer"); // only blogPosts used integer — pruned
    expect(afterRemove).toContain("export const users = pgTable(");
  });

  it("resets schema.ts to the blank stub when the last table is removed", async () => {
    const root = await scaffoldNeon();
    await addTable(USERS_TABLE, root);
    await removeTable("users", root);

    const afterRemove = await readFile(join(root, "src/config/schema.ts"), "utf-8");
    expect(afterRemove).toContain("No tables yet");
    expect(afterRemove).toContain("export {};");
  });

  it("refuses to remove a table that doesn't exist", async () => {
    const root = await scaffoldNeon();
    await addTable(USERS_TABLE, root);
    await expect(removeTable("nonexistent", root)).rejects.toThrow(/No table "nonexistent"/);
  });
});

describe("formatTablesDashboard", () => {
  it('shows "No tables yet." for an empty list', () => {
    expect(formatTablesDashboard([])).toContain("No tables yet.");
  });

  it("lists tables, columns, and references", () => {
    const output = formatTablesDashboard([
      { identifier: "users", sqlName: "users", columns: [{ key: "id" }, { key: "email" }] },
      {
        identifier: "blogPosts",
        sqlName: "blog_posts",
        columns: [{ key: "id" }, { key: "authorId", references: "users" }],
      },
    ]);
    expect(output).toContain("users (users)");
    expect(output).toContain("blogPosts (blog_posts)");
    expect(output).toContain("references users.id");
  });
});
