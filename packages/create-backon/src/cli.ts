#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { runPrompts } from "./prompts";
import { generateProject } from "./generate";
import { addRoute } from "./add-route";
import { removeRoute } from "./remove-route";
import { listRoutes } from "./list-routes";
import { runDoctor } from "./doctor";

const ADD_ROUTE_SUBCOMMANDS = new Set(["add-route", "route"]);
const REMOVE_ROUTE_SUBCOMMANDS = new Set(["remove-route", "rm-route"]);
const LIST_ROUTES_SUBCOMMANDS = new Set(["list-routes", "routes"]);
const DOCTOR_SUBCOMMANDS = new Set(["doctor"]);

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
  p.log.success(`Added src/endpoints/${route} (${filesWritten.length} files) in ${root}`);
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
  p.log.info(`Routes mounted in ${root}:\n${routes.map((route) => `  - ${route}`).join("\n")}`);
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

  await runScaffold();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
