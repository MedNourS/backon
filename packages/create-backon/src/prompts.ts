import * as p from "@clack/prompts";

export type DbChoice = "neon" | "postgres" | "sqlite" | "none";
export type Framework = "hono" | "express";
export type Language = "typescript" | "javascript";

export interface Answers {
  projectName: string;
  framework: Framework;
  language: Language;
  db: DbChoice;
  routes: string[];
  copyEnv: boolean;
}

function bail(): never {
  p.cancel("Cancelled.");
  process.exit(0);
}

export function toKebabCase(input: string): string {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export async function runPrompts(): Promise<Answers> {
  p.intro("create-backon");

  const projectName = await p.text({
    message: 'Project name (or "." to scaffold into the current directory)',
    placeholder: "my-api",
    validate: (value) => {
      if (!value) return "Required.";
      if (value === ".") return undefined;
      if (!/^[a-z0-9-]+$/.test(value)) {
        return 'Lowercase letters, numbers, and hyphens only (or "." for the current directory).';
      }
      return undefined;
    },
  });
  if (p.isCancel(projectName)) bail();

  const framework = await p.select({
    message: "Framework",
    options: [
      { value: "hono", label: "Hono", hint: "faster, runs anywhere — Bun, edge, serverless" },
      { value: "express", label: "Express" },
    ],
  });
  if (p.isCancel(framework)) bail();

  const language = await p.select({
    message: "Language",
    options: [
      { value: "typescript", label: "TypeScript" },
      { value: "javascript", label: "JavaScript" },
    ],
  });
  if (p.isCancel(language)) bail();

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

  const copyEnv = await p.confirm({
    message: "Create .env from .env.example now?",
    initialValue: true,
  });
  if (p.isCancel(copyEnv)) bail();

  const routes: string[] = [];
  p.log.step("Add routes one at a time. Leave the name blank when you're done.");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const name = await p.text({
      message: routes.length === 0 ? "Route name" : "Another route? (blank to finish)",
      placeholder: routes.length === 0 ? "e.g. users" : "",
    });
    if (p.isCancel(name)) bail();
    if (!name) break;
    routes.push(toKebabCase(name));
  }

  p.outro(`Scaffolding ${projectName}...`);

  return {
    projectName: projectName as string,
    framework: framework as Framework,
    language: language as Language,
    db: db as DbChoice,
    routes,
    copyEnv: copyEnv as boolean,
  };
}
