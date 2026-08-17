import * as p from "@clack/prompts";

export type DbChoice = "neon" | "postgres" | "sqlite" | "none";

export interface Answers {
  projectName: string;
  db: DbChoice;
  routes: string[];
}

function bail(): never {
  p.cancel("Cancelled.");
  process.exit(0);
}

function toKebabCase(input: string): string {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export async function runPrompts(): Promise<Answers> {
  p.intro("create-backon");

  const projectName = await p.text({
    message: "Project name",
    placeholder: "my-api",
    validate: (value) => {
      if (!value) return "Required.";
      if (!/^[a-z0-9-]+$/.test(value)) return "Lowercase letters, numbers, and hyphens only.";
      return undefined;
    },
  });
  if (p.isCancel(projectName)) bail();

  const db = await p.select({
    message: "Database",
    options: [
      { value: "neon", label: "Neon", hint: "serverless Postgres — matches a Vercel deploy" },
      { value: "postgres", label: "Postgres", hint: "local/self-hosted — dev or a long-running server only" },
      { value: "sqlite", label: "SQLite", hint: "local dev only" },
      { value: "none", label: "None", hint: "empty db.ts stub, wire it up later" },
    ],
  });
  if (p.isCancel(db)) bail();

  const routes: string[] = [];
  p.log.step("Add routes one at a time. Leave the name blank when you're done.");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const name = await p.text({
      message: routes.length === 0 ? "Route name (e.g. telemetry)" : "Another route? (blank to finish)",
      placeholder: routes.length === 0 ? "telemetry" : "",
    });
    if (p.isCancel(name)) bail();
    if (!name) break;
    routes.push(toKebabCase(name));
  }

  p.outro(`Scaffolding ${projectName}...`);

  return {
    projectName: projectName as string,
    db: db as DbChoice,
    routes,
  };
}
