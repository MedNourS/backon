// No shebang here on purpose — the published bin is the bundled
// dist/cli.js esbuild produces (see package.json's "build" script), which
// gets its own "#!/usr/bin/env node" shebang from esbuild's --banner flag.
// A shebang on *this* file would end up duplicated as the bundle's second
// line (esbuild carries a source shebang straight through), which Node
// rejects outright — a shebang only means anything as a file's literal
// first line. Local dev (`bun run src/cli.ts`, the "start" script) doesn't
// need a shebang either; `bun run` executes the given file directly, it
// doesn't rely on the OS reading a shebang the way `./cli.ts` would.
import * as p from "@clack/prompts";
import { runPrompts } from "./prompts";
import { generateProject } from "./generate";
import { addRoute } from "./add-route";
import { removeRoute } from "./remove-route";
import { listRoutes } from "./list-routes";
import { runDoctor } from "./doctor";
import { addMethod } from "./add-method";
import { formatEndpointsDashboard, listEndpointsWithMethods } from "./route-methods";
import { HTTP_VERBS, paramNamesFromPath, pascalCase, type HttpVerb, type MethodSpec } from "./templates/route";

const ADD_ROUTE_SUBCOMMANDS = new Set(["add-route", "route"]);
const REMOVE_ROUTE_SUBCOMMANDS = new Set(["remove-route", "rm-route"]);
const LIST_ROUTES_SUBCOMMANDS = new Set(["list-routes", "routes"]);
const DOCTOR_SUBCOMMANDS = new Set(["doctor"]);
const ADD_METHOD_SUBCOMMANDS = new Set(["add-method", "method"]);

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

async function runAddRoute(args: string[]): Promise<void> {
  let [name] = args;

  if (!name) {
    name = await promptForRouteName("create-backon add-route");
    p.outro(`Adding ${name}...`);
  }

  const { route, root, filesWritten } = await addRoute(name);
  p.log.success(`Added src/endpoints/${route} (${filesWritten.length} files, no methods yet) in ${root}`);
  p.log.info("Run `bun run add-method` to give it a GET/POST/etc.");
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

  await runScaffold();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
