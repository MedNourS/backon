// No shebang here on purpose — the published bin is the bundled
// dist/cli.js esbuild produces (see package.json's "build" script), which
// gets its own "#!/usr/bin/env node" shebang from esbuild's --banner flag.
// A shebang on *this* file would end up duplicated as the bundle's second
// line (esbuild carries a source shebang straight through), which Node
// rejects outright — a shebang only means anything as a file's literal
// first line. Local dev (`bun run src/cli.ts`, the "start" script) doesn't
// need a shebang either; `bun run` executes the given file directly, it
// doesn't rely on the OS reading a shebang the way `./cli.ts` would.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { runPrompts } from "./prompts";
import { generateProject } from "./generate";
import { addRoute } from "./add-route";
import { removeRoute } from "./remove-route";
import { listRoutes } from "./list-routes";
import { runDoctor } from "./doctor";
import { addMethod } from "./add-method";
import { removeMethod } from "./remove-method";
import { detectDbStatus } from "./db-status";
import { detectProject } from "./detect";
import { addCrudMethods } from "./crud-scaffold";
import {
  detectMethodValidation,
  formatEndpointsDashboard,
  listEndpointsWithMethods,
  type EndpointMethod,
  type EndpointSummary,
} from "./route-methods";
import { HTTP_VERBS, paramNamesFromPath, pascalCase, type HttpVerb, type MethodSpec } from "./templates/route";
import { addTable, removeTable, parseSchemaTables, formatTablesDashboard, type ParsedTable } from "./schema-edit";
import { COLUMN_TYPES, columnIdentifier, tableIdentifier, type ColumnSpec, type ColumnType, type TableSpec } from "./templates/schema";

const ADD_ROUTE_SUBCOMMANDS = new Set(["add-route", "route"]);
const REMOVE_ROUTE_SUBCOMMANDS = new Set(["remove-route", "rm-route"]);
const LIST_ROUTES_SUBCOMMANDS = new Set(["list-routes", "routes"]);
const DOCTOR_SUBCOMMANDS = new Set(["doctor"]);
const ADD_METHOD_SUBCOMMANDS = new Set(["add-method", "method"]);
// project: a read-only overview (db status, endpoints, methods, doctor
// summary) — nothing here writes to disk. server-config: the interactive
// wrapper around add-route/remove-route/add-method/remove-method (plus
// modify, which neither standalone command offers) for managing endpoints
// without remembering individual subcommand names. Deliberately two
// separate commands rather than one combined dashboard — "just show me
// what's here" and "let me start changing things" are different intents,
// and collapsing them risks an accidental edit from someone who only
// wanted to look.
const PROJECT_SUBCOMMANDS = new Set(["project"]);
const SERVER_CONFIG_SUBCOMMANDS = new Set(["server-config"]);
const ADD_TABLE_SUBCOMMANDS = new Set(["add-table", "table"]);
const REMOVE_TABLE_SUBCOMMANDS = new Set(["remove-table", "rm-table"]);

async function promptForRouteName(introText: string): Promise<string> {
  p.intro(introText);
  const answer = await p.text({
    message: "Route name",
    placeholder: "e.g. users",
    validate: (value) => (!value ? "Required." : undefined),
  });
  if (p.isCancel(answer)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  return answer;
}

/** Shared by every "just added a CRUD set" log line, interactive or scripted. */
function logCrudResult(result: Awaited<ReturnType<typeof addCrudMethods>>): void {
  const skippedNote = result.skipped.length ? ` (skipped, already there: ${result.skipped.join(", ")})` : "";
  p.log.success(`Added CRUD methods to ${result.route}: ${result.added.join(", ") || "none"}${skippedNote}`);
}

async function runAddRoute(args: string[]): Promise<void> {
  const crudFlagIndex = args.indexOf("--crud");
  const withCrud = crudFlagIndex !== -1;
  const positional = withCrud ? args.filter((_, i) => i !== crudFlagIndex) : args;
  let [name] = positional;

  let interactive = false;
  if (!name) {
    interactive = true;
    name = await promptForRouteName("create-backon add-route");
    p.outro(`Adding ${name}...`);
  }

  const { route, root, filesWritten } = await addRoute(name);
  p.log.success(`Added src/endpoints/${route} (${filesWritten.length} files, no methods yet) in ${root}`);

  let scaffoldCrud = withCrud;
  if (!withCrud && interactive) {
    const answer = await p.confirm({
      message: "Scaffold standard CRUD methods now (list, create, getById, update, remove)?",
      initialValue: false,
    });
    scaffoldCrud = !p.isCancel(answer) && answer;
  }

  if (scaffoldCrud) {
    logCrudResult(await addCrudMethods(route, root));
  } else {
    p.log.info("Run `bun run add-method` to give it a GET/POST/etc.");
  }
}

async function runRemoveRoute(args: string[]): Promise<void> {
  let [name] = args;

  if (!name) {
    name = await promptForRouteName("create-backon remove-route");
  }

  const shouldRemove = await p.confirm({
    message: `Remove src/endpoints/${name} and unmount it? This deletes the folder.`,
    initialValue: false,
  });
  if (p.isCancel(shouldRemove) || !shouldRemove) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const { route, root, removedDir } = await removeRoute(name);
  p.log.success(`Removed ${removedDir} and unmounted "${route}" in ${root}`);
}

async function runListRoutes(): Promise<void> {
  const { root, routes } = await listRoutes();
  if (routes.length === 0) {
    p.log.info(`No routes mounted in ${root}.`);
    return;
  }
  const summaries = await listEndpointsWithMethods();
  p.note(formatEndpointsDashboard(summaries), `Endpoints in ${root}`);
}

async function runDoctorCommand(): Promise<void> {
  const { root, issues } = await runDoctor();
  if (issues.length === 0) {
    p.log.success(`No issues found in ${root}.`);
    return;
  }
  p.log.warn(`${issues.length} issue(s) found in ${root}:\n${issues.map((issue) => `  - ${issue.detail}`).join("\n")}`);
  process.exitCode = 1;
}

/**
 * Read-only: db status, every endpoint and its methods, and a doctor
 * summary, in one shot. No prompts, no writes — `bun run server-config` is
 * where anything actually changes.
 */
async function runProjectOverview(): Promise<void> {
  p.intro("create-backon project");

  const { root } = await detectProject();
  const dbStatus = await detectDbStatus();
  const summaries = await listEndpointsWithMethods();
  const { issues } = await runDoctor();

  p.note(dbStatus.summary, "Database");
  p.note(formatEndpointsDashboard(summaries), `Endpoints in ${root}`);

  if (issues.length > 0) {
    p.log.warn(`${issues.length} issue(s) between src/endpoints/ and index — run \`bun run doctor\` for details.`);
  } else {
    p.log.success("No drift between src/endpoints/ and index.");
  }

  p.outro("Manage endpoints and methods with `bun run server-config`.");
}

// ---------------------------------------------------------------------------
// add-table / remove-table / server-config's table actions — schema.ts's
// interactive editor. Gated to "neon"/"postgres" (the only two db choices
// schema.ts/drizzle.config.ts get scaffolded for — see templates/db.ts's
// hasSchemaSupport field); SQLite and "none" fail with a clear message
// rather than silently no-opping.
// ---------------------------------------------------------------------------

async function ensureSchemaSupport(): Promise<boolean> {
  const status = await detectDbStatus();
  if (status.driver === "neon" || status.driver === "postgres") return true;
  p.log.error(
    `Schema management needs a "neon" or "postgres" db driver (src/config/db reports "${status.driver}") — ` +
      `SQLite and "none" use a different schema dialect (or none at all) and aren't supported here yet.`
  );
  return false;
}

async function readSchemaTables(): Promise<ParsedTable[]> {
  const { root, ext } = await detectProject();
  try {
    const contents = await readFile(join(root, "src/config", `schema.${ext}`), "utf-8");
    return parseSchemaTables(contents);
  } catch {
    return [];
  }
}

/** Type-specific "does this column get a default?" question — returns a pre-rendered modifier fragment (see ColumnSpec.defaultExpr's doc comment), "" for none, or null if cancelled. */
async function promptDefaultExpr(type: ColumnType): Promise<string | null> {
  if (type === "timestamp") {
    const v = await p.confirm({ message: "Default to now()?", initialValue: false });
    if (p.isCancel(v)) return null;
    return v ? ".defaultNow()" : "";
  }
  if (type === "uuid") {
    const v = await p.confirm({ message: "Default to a random UUID?", initialValue: false });
    if (p.isCancel(v)) return null;
    return v ? ".defaultRandom()" : "";
  }
  if (type === "boolean") {
    const v = await p.select({
      message: "Default value",
      options: [
        { value: "none", label: "None" },
        { value: "true", label: "true" },
        { value: "false", label: "false" },
      ],
      initialValue: "none",
    });
    if (p.isCancel(v)) return null;
    return v === "none" ? "" : `.default(${v})`;
  }
  // text / integer
  const v = await p.text({
    message: "Default value (blank for none)",
    placeholder: type === "integer" ? "e.g. 0" : "e.g. pending",
  });
  if (p.isCancel(v)) return null;
  if (!v) return "";
  if (type === "integer") {
    const n = Number(v);
    if (Number.isNaN(n)) {
      p.log.warn(`"${v}" isn't a number — skipping the default.`);
      return "";
    }
    return `.default(${n})`;
  }
  return `.default(${JSON.stringify(v)})`;
}

/** Full column-collection loop for one table — stops on a blank column name, propagates a cancel as `null`. */
async function promptForColumns(existingTables: ParsedTable[]): Promise<ColumnSpec[] | null> {
  const columns: ColumnSpec[] = [];
  p.log.step("Add columns one at a time. Leave the name blank to finish.");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const nameProbe = await p.text({
      message: columns.length === 0 ? "Column name" : "Another column? (blank to finish)",
      placeholder: columns.length === 0 ? "e.g. email" : "",
    });
    if (p.isCancel(nameProbe)) return null;
    if (!nameProbe) break;

    const key = columnIdentifier(nameProbe);
    if (columns.some((c) => columnIdentifier(c.name) === key)) {
      p.log.error(`"${key}" is already a column on this table.`);
      continue;
    }

    let references: string | undefined;
    if (existingTables.length > 0) {
      const refChoice = await p.select({
        message: `Does "${nameProbe}" reference another table's id?`,
        options: [
          { value: "__none__", label: "No" },
          ...existingTables.map((t) => ({ value: t.identifier, label: t.identifier })),
        ],
        initialValue: "__none__",
      });
      if (p.isCancel(refChoice)) return null;
      if (refChoice !== "__none__") references = refChoice;
    }

    let type: ColumnType = "integer";
    let defaultExpr = "";
    if (!references) {
      const typeChoice = await p.select({
        message: "Column type",
        options: COLUMN_TYPES.map((t) => ({ value: t, label: t })),
      });
      if (p.isCancel(typeChoice)) return null;
      type = typeChoice;
      const expr = await promptDefaultExpr(type);
      if (expr === null) return null;
      defaultExpr = expr;
    }

    const notNull = await p.confirm({ message: "Required (NOT NULL)?", initialValue: true });
    if (p.isCancel(notNull)) return null;
    const unique = await p.confirm({ message: "Unique?", initialValue: false });
    if (p.isCancel(unique)) return null;

    columns.push({ name: nameProbe, type, notNull, unique, defaultExpr, references });
  }

  return columns;
}

/** Full table-collection flow: name (unless `forcedName` came from a CLI arg), the id-column question, then promptForColumns(). Returns null on cancel. */
async function collectTableSpec(existingTables: ParsedTable[], forcedName?: string): Promise<TableSpec | null> {
  let name = forcedName;
  if (name) {
    const id = tableIdentifier(name);
    if (existingTables.some((t) => t.identifier === id)) {
      p.log.error(`"${id}" already exists.`);
      return null;
    }
  } else {
    const answer = await p.text({
      message: "New table name",
      placeholder: "e.g. users",
      validate: (value) => {
        if (!value) return "Required.";
        if (existingTables.some((t) => t.identifier === tableIdentifier(value))) {
          return `"${tableIdentifier(value)}" already exists.`;
        }
        return undefined;
      },
    });
    if (p.isCancel(answer)) return null;
    name = answer;
  }

  const includeId = await p.confirm({
    message: "Add an auto-increment id primary key column?",
    initialValue: true,
  });
  if (p.isCancel(includeId)) return null;

  const columns = await promptForColumns(existingTables);
  if (columns === null) return null;

  return { name, includeId, columns };
}

async function runAddTable(args: string[]): Promise<void> {
  p.intro("create-backon add-table");
  if (!(await ensureSchemaSupport())) return;

  const [forcedName] = args;
  let existingTables = await readSchemaTables();
  let first = true;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const spec = await collectTableSpec(existingTables, first ? forcedName : undefined);
    first = false;
    if (!spec) {
      p.cancel("Cancelled.");
      return;
    }

    try {
      const { filePath, identifier } = await addTable(spec);
      p.log.success(`Added table "${identifier}" to ${filePath}. Run \`bun run db:generate\` to create a migration for it.`);
      existingTables = await readSchemaTables();
    } catch (err) {
      p.log.error(err instanceof Error ? err.message : String(err));
    }

    const again = await p.confirm({ message: "Add another table?", initialValue: false });
    if (p.isCancel(again) || !again) break;
  }

  p.outro("Done.");
}

async function runRemoveTable(args: string[]): Promise<void> {
  p.intro("create-backon remove-table");
  if (!(await ensureSchemaSupport())) return;

  const existingTables = await readSchemaTables();
  if (existingTables.length === 0) {
    p.log.info("No tables yet.");
    return;
  }

  const [forcedName] = args;
  let identifier: string;
  if (forcedName) {
    identifier = tableIdentifier(forcedName);
    if (!existingTables.some((t) => t.identifier === identifier)) {
      p.log.error(`No table "${identifier}" found.`);
      return;
    }
  } else {
    const choice = await p.select({
      message: "Remove which table?",
      options: existingTables.map((t) => ({ value: t.identifier, label: `${t.identifier} (${t.columns.length} columns)` })),
    });
    if (p.isCancel(choice)) {
      p.cancel("Cancelled.");
      return;
    }
    identifier = choice;
  }

  const confirmed = await p.confirm({
    message: `Remove table "${identifier}" from schema.ts? This only edits the file — nothing is dropped from the actual database until you run a migration.`,
    initialValue: false,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled.");
    return;
  }

  try {
    const { filePath } = await removeTable(identifier);
    p.log.success(`Removed "${identifier}" from ${filePath}. Run \`bun run db:generate\` to create a migration for this change.`);
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
  }

  p.outro("Done.");
}

/** server-config's single-shot version of runAddTable() — no internal "add another?" loop, since runServerConfig()'s own while loop already re-shows state and re-prompts after every action. */
async function serverConfigAddTable(existingTables: ParsedTable[]): Promise<void> {
  const spec = await collectTableSpec(existingTables);
  if (!spec) {
    p.cancel("Cancelled.");
    return;
  }
  const { filePath, identifier } = await addTable(spec);
  p.log.success(`Added table "${identifier}" to ${filePath}. Run \`bun run db:generate\` next.`);
}

async function serverConfigRemoveTable(existingTables: ParsedTable[]): Promise<void> {
  if (existingTables.length === 0) {
    p.log.info("No tables yet.");
    return;
  }
  const choice = await p.select({
    message: "Remove which table?",
    options: existingTables.map((t) => ({ value: t.identifier, label: `${t.identifier} (${t.columns.length} columns)` })),
  });
  if (p.isCancel(choice)) {
    p.cancel("Cancelled.");
    return;
  }
  const confirmed = await p.confirm({
    message: `Remove table "${choice}" from schema.ts? Nothing is dropped from the actual database until you run a migration.`,
    initialValue: false,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled.");
    return;
  }
  const { filePath } = await removeTable(choice);
  p.log.success(`Removed "${choice}" from ${filePath}. Run \`bun run db:generate\` next.`);
}

function suggestMethodName(verb: HttpVerb, path: string): string {
  const params = paramNamesFromPath(path);
  if (verb === "get" && params.length === 0) return "list";
  if (verb === "get") return `getBy${pascalCase(params[0] ?? "id")}`;
  if (verb === "post") return "create";
  if (verb === "put" || verb === "patch") return "update";
  return "remove";
}

const IDENTIFIER_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Interactive, loops until the user's done: shows every endpoint and the
 * methods it already has (colored by verb), then either picks one to add
 * to or spins up a new blank one, then walks through verb/path/name/schema
 * choices for a single method. Kept separate from add-route/remove-route on
 * purpose — those stay simple whole-endpoint create/delete for scripted use.
 */
async function runAddMethod(): Promise<void> {
  p.intro("create-backon add-method");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { root, routes } = await listRoutes();
    const summaries = await listEndpointsWithMethods();
    p.note(formatEndpointsDashboard(summaries), `Endpoints in ${root}`);

    const routeChoice = await p.select({
      message: "Add a method to which endpoint?",
      options: [
        ...routes.map((route) => ({ value: route, label: route })),
        { value: "__new__", label: "+ New blank endpoint" },
      ],
    });
    if (p.isCancel(routeChoice)) {
      p.cancel("Cancelled.");
      return;
    }

    let route = routeChoice;
    if (route === "__new__") {
      const name = await p.text({
        message: "New endpoint name",
        placeholder: "e.g. users",
        validate: (value) => (!value ? "Required." : undefined),
      });
      if (p.isCancel(name)) {
        p.cancel("Cancelled.");
        return;
      }
      const added = await addRoute(name);
      route = added.route;
      p.log.success(`Added blank endpoint src/endpoints/${route}`);
    }

    const verb = await p.select({
      message: "HTTP method",
      options: HTTP_VERBS.map((v) => ({ value: v, label: v.toUpperCase() })),
    });
    if (p.isCancel(verb)) {
      p.cancel("Cancelled.");
      return;
    }

    const defaultPath = verb === "get" || verb === "post" ? "/" : "/:id";
    const path = await p.text({
      message: "Path (relative to this endpoint's mount)",
      placeholder: defaultPath,
      initialValue: defaultPath,
      validate: (value) => (!value.startsWith("/") ? 'Must start with "/".' : undefined),
    });
    if (p.isCancel(path)) {
      p.cancel("Cancelled.");
      return;
    }

    const existingMethods = summaries.find((s) => s.route === route)?.methods ?? [];
    const defaultName = suggestMethodName(verb, path);
    const name = await p.text({
      message: "Name (controller export + service function)",
      placeholder: defaultName,
      initialValue: defaultName,
      validate: (value) => {
        if (!IDENTIFIER_PATTERN.test(value)) return "Must be a valid identifier.";
        if (existingMethods.some((m) => m.name === value)) return `"${value}" is already used in this endpoint.`;
        return undefined;
      },
    });
    if (p.isCancel(name)) {
      p.cancel("Cancelled.");
      return;
    }

    let needsBody = false;
    if (verb === "post" || verb === "put" || verb === "patch") {
      const answer = await p.confirm({ message: "Validate a request body?", initialValue: true });
      if (p.isCancel(answer)) {
        p.cancel("Cancelled.");
        return;
      }
      needsBody = answer;
    }

    const needsQuery = await p.confirm({ message: "Validate query params?", initialValue: false });
    if (p.isCancel(needsQuery)) {
      p.cancel("Cancelled.");
      return;
    }

    const spec: MethodSpec = { verb, path, name, needsBody, needsQuery };
    try {
      const { filesWritten } = await addMethod(route, spec);
      p.log.success(`Added ${verb.toUpperCase()} ${path} → ${name} in src/endpoints/${route} (${filesWritten.length} files)`);
    } catch (err) {
      p.log.error(err instanceof Error ? err.message : String(err));
    }

    const again = await p.confirm({ message: "Add another method?", initialValue: true });
    if (p.isCancel(again) || !again) break;
  }

  p.outro("Done.");
}

// ---------------------------------------------------------------------------
// server-config: the interactive endpoint/method manager. Each of these is
// a single, self-contained step (no intro/outro of its own, no "add
// another?" loop of its own) — runServerConfig()'s own while loop is what
// repeats, and it re-reads the endpoint list fresh every iteration so any
// step's changes are immediately visible to the next one.
// ---------------------------------------------------------------------------

async function serverConfigAddEndpoint(): Promise<void> {
  const name = await p.text({
    message: "New endpoint name",
    placeholder: "e.g. users",
    validate: (value) => (!value ? "Required." : undefined),
  });
  if (p.isCancel(name)) {
    p.cancel("Cancelled.");
    return;
  }
  const { route, filesWritten } = await addRoute(name);
  p.log.success(`Added src/endpoints/${route} (${filesWritten.length} files, no methods yet).`);

  const scaffoldCrud = await p.confirm({
    message: "Scaffold standard CRUD methods now (list, create, getById, update, remove)?",
    initialValue: false,
  });
  if (!p.isCancel(scaffoldCrud) && scaffoldCrud) {
    logCrudResult(await addCrudMethods(route));
  }
}

async function serverConfigRemoveEndpoint(summaries: EndpointSummary[]): Promise<void> {
  if (summaries.length === 0) {
    p.log.info("No endpoints yet.");
    return;
  }
  const route = await p.select({
    message: "Remove which endpoint?",
    options: summaries.map((s) => ({ value: s.route, label: s.route })),
  });
  if (p.isCancel(route)) {
    p.cancel("Cancelled.");
    return;
  }
  const confirmed = await p.confirm({
    message: `Remove src/endpoints/${route} and unmount it? This deletes the folder.`,
    initialValue: false,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled.");
    return;
  }
  const { removedDir } = await removeRoute(route);
  p.log.success(`Removed ${removedDir}.`);
}

async function serverConfigAddMethod(summaries: EndpointSummary[]): Promise<void> {
  const routeChoice = await p.select({
    message: "Add a method to which endpoint?",
    options: [
      ...summaries.map((s) => ({ value: s.route, label: s.route })),
      { value: "__new__", label: "+ New blank endpoint" },
    ],
  });
  if (p.isCancel(routeChoice)) {
    p.cancel("Cancelled.");
    return;
  }

  let route = routeChoice;
  let existingMethods = summaries.find((s) => s.route === route)?.methods ?? [];
  if (route === "__new__") {
    const name = await p.text({
      message: "New endpoint name",
      placeholder: "e.g. users",
      validate: (value) => (!value ? "Required." : undefined),
    });
    if (p.isCancel(name)) {
      p.cancel("Cancelled.");
      return;
    }
    const added = await addRoute(name);
    route = added.route;
    existingMethods = [];
    p.log.success(`Added blank endpoint src/endpoints/${route}`);
  }

  const verb = await p.select({
    message: "HTTP method",
    options: HTTP_VERBS.map((v) => ({ value: v, label: v.toUpperCase() })),
  });
  if (p.isCancel(verb)) {
    p.cancel("Cancelled.");
    return;
  }

  const defaultPath = verb === "get" || verb === "post" ? "/" : "/:id";
  const path = await p.text({
    message: "Path (relative to this endpoint's mount)",
    placeholder: defaultPath,
    initialValue: defaultPath,
    validate: (value) => (!value.startsWith("/") ? 'Must start with "/".' : undefined),
  });
  if (p.isCancel(path)) {
    p.cancel("Cancelled.");
    return;
  }

  const defaultName = suggestMethodName(verb, path);
  const name = await p.text({
    message: "Name (controller export + service function)",
    placeholder: defaultName,
    initialValue: defaultName,
    validate: (value) => {
      if (!IDENTIFIER_PATTERN.test(value)) return "Must be a valid identifier.";
      if (existingMethods.some((m) => m.name === value)) return `"${value}" is already used in this endpoint.`;
      return undefined;
    },
  });
  if (p.isCancel(name)) {
    p.cancel("Cancelled.");
    return;
  }

  let needsBody = false;
  if (verb === "post" || verb === "put" || verb === "patch") {
    const answer = await p.confirm({ message: "Validate a request body?", initialValue: true });
    if (p.isCancel(answer)) {
      p.cancel("Cancelled.");
      return;
    }
    needsBody = answer;
  }

  const needsQuery = await p.confirm({ message: "Validate query params?", initialValue: false });
  if (p.isCancel(needsQuery)) {
    p.cancel("Cancelled.");
    return;
  }

  const spec: MethodSpec = { verb, path, name, needsBody, needsQuery };
  const { filesWritten } = await addMethod(route, spec);
  p.log.success(`Added ${verb.toUpperCase()} ${path} → ${name} in src/endpoints/${route} (${filesWritten.length} files)`);
}

/** Endpoints with at least one method — remove/modify both operate on an existing method, so an endpoint with none isn't a valid choice for either. */
async function selectEndpointWithMethods(summaries: EndpointSummary[], message: string): Promise<EndpointSummary | null> {
  const withMethods = summaries.filter((s) => s.methods.length > 0);
  if (withMethods.length === 0) {
    p.log.info("No methods yet — add one first.");
    return null;
  }
  const route = await p.select({
    message,
    options: withMethods.map((s) => ({ value: s.route, label: s.route })),
  });
  if (p.isCancel(route)) {
    p.cancel("Cancelled.");
    return null;
  }
  return withMethods.find((s) => s.route === route) ?? null;
}

async function selectMethod(endpoint: EndpointSummary, message: string): Promise<EndpointMethod | null> {
  const choice = await p.select({
    message,
    options: endpoint.methods.map((m) => ({
      value: `${m.verb}:${m.path}`,
      label: `${m.verb.toUpperCase()} ${m.path} → ${m.name}`,
    })),
  });
  if (p.isCancel(choice)) {
    p.cancel("Cancelled.");
    return null;
  }
  // Split on the FIRST colon only — a path itself can contain no colons
  // outside of :param segments, but this keeps the parse correct even if
  // that ever changes, since verb never contains one.
  const [verb, path] = choice.split(/:(.*)/s) as [HttpVerb, string];
  return endpoint.methods.find((m) => m.verb === verb && m.path === path) ?? null;
}

async function serverConfigRemoveMethod(summaries: EndpointSummary[]): Promise<void> {
  const endpoint = await selectEndpointWithMethods(summaries, "Remove a method from which endpoint?");
  if (!endpoint) return;
  const method = await selectMethod(endpoint, "Remove which method?");
  if (!method) return;

  const confirmed = await p.confirm({
    message: `Remove ${method.verb.toUpperCase()} ${method.path} (${method.name}) from ${endpoint.route}?`,
    initialValue: false,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled.");
    return;
  }

  const { removed } = await removeMethod(endpoint.route, method.verb, method.path);
  p.log.success(`Removed ${removed.verb.toUpperCase()} ${removed.path} (${removed.name}) from src/endpoints/${endpoint.route}.`);
}

/** Edits a method's verb/path/name/validation in place: a checked removeMethod() + addMethod() pair, not a separate codegen path. */
async function serverConfigModifyMethod(summaries: EndpointSummary[]): Promise<void> {
  const endpoint = await selectEndpointWithMethods(summaries, "Modify a method on which endpoint?");
  if (!endpoint) return;
  const old = await selectMethod(endpoint, "Modify which method?");
  if (!old) return;

  const { needsBody: oldNeedsBody, needsQuery: oldNeedsQuery } = await detectMethodValidation(endpoint.route, old.name);
  const others = endpoint.methods.filter((m) => m !== old);

  const verb = await p.select({
    message: "HTTP method",
    initialValue: old.verb,
    options: HTTP_VERBS.map((v) => ({ value: v, label: v.toUpperCase() })),
  });
  if (p.isCancel(verb)) {
    p.cancel("Cancelled.");
    return;
  }

  const path = await p.text({
    message: "Path (relative to this endpoint's mount)",
    initialValue: old.path,
    validate: (value) => (!value.startsWith("/") ? 'Must start with "/".' : undefined),
  });
  if (p.isCancel(path)) {
    p.cancel("Cancelled.");
    return;
  }

  const name = await p.text({
    message: "Name (controller export + service function)",
    initialValue: old.name,
    validate: (value) => {
      if (!IDENTIFIER_PATTERN.test(value)) return "Must be a valid identifier.";
      if (others.some((m) => m.name === value)) return `"${value}" is already used in this endpoint.`;
      return undefined;
    },
  });
  if (p.isCancel(name)) {
    p.cancel("Cancelled.");
    return;
  }

  // Checked before anything on disk changes — removeMethod() below is only
  // safe to run once we know addMethod() won't then fail on a collision.
  if (others.some((m) => m.verb === verb && m.path === path)) {
    p.log.error(`${verb.toUpperCase()} ${path} is already used by another method on this endpoint.`);
    return;
  }

  let needsBody = false;
  if (verb === "post" || verb === "put" || verb === "patch") {
    const answer = await p.confirm({ message: "Validate a request body?", initialValue: oldNeedsBody });
    if (p.isCancel(answer)) {
      p.cancel("Cancelled.");
      return;
    }
    needsBody = answer;
  }

  const needsQuery = await p.confirm({ message: "Validate query params?", initialValue: oldNeedsQuery });
  if (p.isCancel(needsQuery)) {
    p.cancel("Cancelled.");
    return;
  }

  await removeMethod(endpoint.route, old.verb, old.path);
  const { filesWritten } = await addMethod(endpoint.route, { verb, path, name, needsBody, needsQuery });
  p.log.success(
    `Updated src/endpoints/${endpoint.route}: ${old.verb.toUpperCase()} ${old.path} → ${verb.toUpperCase()} ${path} (${name}), ${filesWritten.length} files touched.`
  );
}

async function runServerConfig(): Promise<void> {
  p.intro("create-backon server-config");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { root } = await detectProject();
    const summaries = await listEndpointsWithMethods();
    p.note(formatEndpointsDashboard(summaries), `Endpoints in ${root}`);

    const dbStatus = await detectDbStatus();
    const schemaCapable = dbStatus.driver === "neon" || dbStatus.driver === "postgres";
    if (schemaCapable) {
      p.note(formatTablesDashboard(await readSchemaTables()), "Database tables");
    }

    const action = await p.select({
      message: "What do you want to do?",
      options: [
        { value: "add-endpoint", label: "Add a new endpoint" },
        { value: "remove-endpoint", label: "Remove an endpoint" },
        { value: "add-method", label: "Add a method" },
        { value: "remove-method", label: "Remove a method" },
        { value: "modify-method", label: "Modify a method" },
        { value: "add-table", label: "Add a database table" },
        { value: "remove-table", label: "Remove a database table" },
        { value: "exit", label: "Exit" },
      ],
    });
    if (p.isCancel(action) || action === "exit") break;

    try {
      switch (action) {
        case "add-endpoint":
          await serverConfigAddEndpoint();
          break;
        case "remove-endpoint":
          await serverConfigRemoveEndpoint(summaries);
          break;
        case "add-method":
          await serverConfigAddMethod(summaries);
          break;
        case "remove-method":
          await serverConfigRemoveMethod(summaries);
          break;
        case "modify-method":
          await serverConfigModifyMethod(summaries);
          break;
        case "add-table":
          if (await ensureSchemaSupport()) await serverConfigAddTable(await readSchemaTables());
          break;
        case "remove-table":
          if (await ensureSchemaSupport()) await serverConfigRemoveTable(await readSchemaTables());
          break;
      }
    } catch (err) {
      p.log.error(err instanceof Error ? err.message : String(err));
    }
  }

  p.outro("Done.");
}

async function runScaffold(): Promise<void> {
  const answers = await runPrompts();
  const { root, filesWritten } = await generateProject(answers);

  const nextSteps =
    answers.projectName === "." ? "bun install\nbun run dev" : `cd ${answers.projectName}\nbun install\nbun run dev`;
  p.note(nextSteps, "Next steps");
  p.log.success(`Wrote ${filesWritten.length} files to ${root}`);
}

async function main() {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (subcommand && ADD_ROUTE_SUBCOMMANDS.has(subcommand)) {
    await runAddRoute(rest);
    return;
  }
  if (subcommand && REMOVE_ROUTE_SUBCOMMANDS.has(subcommand)) {
    await runRemoveRoute(rest);
    return;
  }
  if (subcommand && LIST_ROUTES_SUBCOMMANDS.has(subcommand)) {
    await runListRoutes();
    return;
  }
  if (subcommand && DOCTOR_SUBCOMMANDS.has(subcommand)) {
    await runDoctorCommand();
    return;
  }
  if (subcommand && ADD_METHOD_SUBCOMMANDS.has(subcommand)) {
    await runAddMethod();
    return;
  }
  if (subcommand && PROJECT_SUBCOMMANDS.has(subcommand)) {
    await runProjectOverview();
    return;
  }
  if (subcommand && SERVER_CONFIG_SUBCOMMANDS.has(subcommand)) {
    await runServerConfig();
    return;
  }
  if (subcommand && ADD_TABLE_SUBCOMMANDS.has(subcommand)) {
    await runAddTable(rest);
    return;
  }
  if (subcommand && REMOVE_TABLE_SUBCOMMANDS.has(subcommand)) {
    await runRemoveTable(rest);
    return;
  }

  await runScaffold();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
