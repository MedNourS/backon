import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import { dim } from "./colors";
import { detectDbStatus } from "./db-status";
import { detectProject } from "./detect";
import { editSource, appendStatements } from "./ast-edit";
import { renderBlankSchema, renderTableBlock, requiredBuilders, tableIdentifier, type TableSpec } from "./templates/schema";

const PG_CORE_MODULE = "drizzle-orm/pg-core";

export interface ParsedColumn {
  key: string;
  /** Referenced table's JS identifier, when this column is a `.references(() => X.id)` foreign key. */
  references?: string;
}

export interface ParsedTable {
  identifier: string;
  sqlName: string;
  columns: ParsedColumn[];
}

/**
 * Reads every `export const <id> = pgTable("<name>", {...})` out of a real
 * schema.ts — used for the duplicate-name check in addTable(), the
 * dangling-reference check in removeTable(), and server-config's "which
 * table are you removing" / "reference another table?" prompts. Walks the
 * real AST (a throwaway in-memory ts-morph Project, same approach
 * ast-edit.ts's helpers use) rather than regexing the file, so a
 * hand-reformatted schema.ts (reordered columns, different quote style)
 * doesn't throw this off.
 */
export function parseSchemaTables(contents: string): ParsedTable[] {
  const { sourceFile } = editSourceForReading(contents);
  const tables: ParsedTable[] = [];

  for (const stmt of sourceFile.getVariableStatements()) {
    if (!stmt.isExported()) continue;
    const decl = stmt.getDeclarations()[0];
    if (!decl) continue;
    const init = decl.getInitializer();
    if (!init || !Node.isCallExpression(init)) continue;
    const callee = init.getExpression();
    if (!Node.isIdentifier(callee) || callee.getText() !== "pgTable") continue;

    const [sqlNameArg, columnsArg] = init.getArguments();
    const sqlName = sqlNameArg && Node.isStringLiteral(sqlNameArg) ? sqlNameArg.getLiteralValue() : "";

    const columns: ParsedColumn[] = [];
    if (columnsArg && Node.isObjectLiteralExpression(columnsArg)) {
      for (const prop of columnsArg.getProperties()) {
        if (!Node.isPropertyAssignment(prop)) continue;
        columns.push({ key: prop.getName(), references: findReferencedTable(prop) });
      }
    }

    tables.push({ identifier: decl.getName(), sqlName, columns });
  }

  return tables;
}

function findReferencedTable(propAssignment: Node): string | undefined {
  const init = Node.isPropertyAssignment(propAssignment) ? propAssignment.getInitializer() : undefined;
  if (!init) return undefined;
  for (const call of init.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr) || expr.getName() !== "references") continue;
    const arrowArg = call.getArguments()[0];
    if (!arrowArg || !Node.isArrowFunction(arrowArg)) continue;
    const body = arrowArg.getBody();
    if (Node.isPropertyAccessExpression(body) && Node.isIdentifier(body.getExpression())) {
      return body.getExpression().getText();
    }
  }
  return undefined;
}

// A read-only pass doesn't need editSource()'s write-back plumbing, just
// the same throwaway in-memory Project + parse step it uses internally.
function editSourceForReading(contents: string): { sourceFile: SourceFile } {
  let sourceFile!: SourceFile;
  editSource("schema.ts", contents, (_project, sf) => {
    sourceFile = sf;
  });
  return { sourceFile };
}

/** Adds every builder in `builders` to the shared `drizzle-orm/pg-core` import, merging into the existing declaration instead of creating a second one — unlike ast-edit.ts's ensureImports(), which is line-for-line/per-method by design (see its own doc comment), this one grows a single declaration's named-import set across repeated addTable() calls. */
function ensurePgCoreImport(sourceFile: SourceFile, builders: Set<string>): void {
  const wanted = [...builders].sort();
  const existing = sourceFile.getImportDeclaration((d) => d.getModuleSpecifierValue() === PG_CORE_MODULE);
  if (!existing) {
    sourceFile.addImportDeclaration({ moduleSpecifier: PG_CORE_MODULE, namedImports: wanted });
    return;
  }
  const already = new Set(existing.getNamedImports().map((ni) => ni.getName()));
  const missing = wanted.filter((name) => !already.has(name));
  if (missing.length > 0) existing.addNamedImports(missing);
}

/** The undo side of ensurePgCoreImport() — after a table's removed, prunes any pg-core builder no longer referenced by a surviving pgTable() call anywhere in the file, and drops the whole import if nothing's left. */
function prunePgCoreImport(sourceFile: SourceFile): void {
  const decl = sourceFile.getImportDeclaration((d) => d.getModuleSpecifierValue() === PG_CORE_MODULE);
  if (!decl) return;

  const used = new Set<string>();
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (Node.isIdentifier(expr)) used.add(expr.getText());
  }

  for (const named of decl.getNamedImports()) {
    if (!used.has(named.getName())) named.remove();
  }
  if (decl.getNamedImports().length === 0) decl.remove();
}

function removeTableStatement(sourceFile: SourceFile, identifier: string): boolean {
  for (const stmt of sourceFile.getVariableStatements()) {
    const decls = stmt.getDeclarations();
    if (decls.length === 1 && decls[0]!.getName() === identifier) {
      stmt.remove();
      return true;
    }
  }
  return false;
}

async function requireNeonOrPostgres(cwd: string): Promise<void> {
  const status = await detectDbStatus(cwd);
  if (status.driver === "neon" || status.driver === "postgres") return;
  throw new Error(
    `Schema management needs a "neon" or "postgres" db driver (src/config/db reports "${status.driver}") — ` +
      `SQLite and "none" use a different schema dialect (or none at all) and aren't supported by add-table/remove-table yet.`
  );
}

async function readSchemaFile(root: string, ext: "ts" | "js"): Promise<{ path: string; contents: string }> {
  const path = join(root, "src/config", `schema.${ext}`);
  try {
    return { path, contents: await readFile(path, "utf-8") };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `${path} doesn't exist. This project's db.ts predates schema scaffolding — add a src/config/schema.${ext} ` +
          `by hand (see the README's Database section) before using add-table.`
      );
    }
    throw err;
  }
}

export interface AddTableResult {
  root: string;
  identifier: string;
  filePath: string;
}

/**
 * Appends one real `pgTable(...)` export to schema.ts — merges into the
 * shared drizzle-orm/pg-core import rather than duplicating it (see
 * ensurePgCoreImport()), and only ever edits schema.ts on disk. Never runs
 * drizzle-kit, never touches the actual database — generate/migrate/push
 * stay separate, explicit commands, same reasoning db-status.ts's own doc
 * comment gives for why it never makes a live connection either.
 */
export async function addTable(spec: TableSpec, cwd: string = process.cwd()): Promise<AddTableResult> {
  await requireNeonOrPostgres(cwd);
  const { root, ext } = await detectProject(cwd);
  const { path, contents } = await readSchemaFile(root, ext);

  const identifier = tableIdentifier(spec.name);
  const existingTables = parseSchemaTables(contents);
  if (existingTables.some((t) => t.identifier === identifier)) {
    throw new Error(`"${identifier}" is already a table in ${path}.`);
  }
  for (const col of spec.columns) {
    if (col.references && !existingTables.some((t) => t.identifier === col.references)) {
      throw new Error(`Column "${col.name}" references unknown table "${col.references}".`);
    }
  }

  const withoutPlaceholder = contents.includes(renderBlankSchema()) ? contents.replace(renderBlankSchema(), "") : contents;

  const updated = editSource(path, withoutPlaceholder, (_project, sourceFile) => {
    ensurePgCoreImport(sourceFile, requiredBuilders(spec));
    appendStatements(sourceFile, renderTableBlock(spec));
  });

  await writeFile(path, updated);
  return { root, identifier, filePath: path };
}

export interface RemoveTableResult {
  root: string;
  identifier: string;
  filePath: string;
}

/** server-config/project's "Database tables" note — same spirit as route-methods.ts's formatEndpointsDashboard(). */
export function formatTablesDashboard(tables: ParsedTable[]): string {
  if (tables.length === 0) return dim("No tables yet.");
  return tables
    .map((t) => {
      if (t.columns.length === 0) return `${t.identifier} (${t.sqlName})\n  ${dim("(no columns)")}`;
      const lines = t.columns.map((c) => `  ${c.key}${c.references ? dim(` → references ${c.references}.id`) : ""}`);
      return `${t.identifier} (${t.sqlName})\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

/**
 * The undo for addTable(): removes one table's `pgTable(...)` export and
 * prunes any pg-core builder import nothing else still uses. Refuses to
 * remove a table another table's column still `.references()` — leaving
 * that in place would compile to a runtime `ReferenceError` the moment
 * drizzle tries to resolve it, so this is caught here instead of at
 * `drizzle-kit generate` time.
 */
export async function removeTable(identifier: string, cwd: string = process.cwd()): Promise<RemoveTableResult> {
  await requireNeonOrPostgres(cwd);
  const { root, ext } = await detectProject(cwd);
  const { path, contents } = await readSchemaFile(root, ext);

  const tables = parseSchemaTables(contents);
  const target = tables.find((t) => t.identifier === identifier);
  if (!target) {
    throw new Error(`No table "${identifier}" found in ${path}.`);
  }

  const referencedBy = tables.filter((t) => t.identifier !== identifier && t.columns.some((c) => c.references === identifier));
  if (referencedBy.length > 0) {
    throw new Error(
      `Can't remove "${identifier}" — still referenced by: ${referencedBy.map((t) => t.identifier).join(", ")}. ` +
        `Remove those columns/tables first.`
    );
  }

  if (tables.length === 1) {
    await writeFile(path, renderBlankSchema());
    return { root, identifier, filePath: path };
  }

  const updated = editSource(path, contents, (_project, sourceFile) => {
    removeTableStatement(sourceFile, identifier);
    prunePgCoreImport(sourceFile);
  });

  await writeFile(path, updated);
  return { root, identifier, filePath: path };
}
