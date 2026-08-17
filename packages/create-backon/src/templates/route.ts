import type { Framework, Language } from "../prompts";

function pascalCase(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// Not language-aware: defineRoute()'s body/query/params typing in TS comes
// entirely from generic inference (defineRoute<B, Q, P>(...)) — the
// generated code itself never writes an explicit type annotation, so this
// file is already valid JavaScript as-is. Only the file extension changes.
export function renderController(route: string, framework: Framework): string {
  const Route = pascalCase(route);
  const backonImport = framework === "express" ? "@mednours/backon/express" : "@mednours/backon";
  return `import { z } from "zod";
import { defineRoute } from "${backonImport}";
import * as service from "./${route}.services";

export const list = defineRoute({}, async (c) => {
  const items = await service.list();
  return c.json(items);
});

// TODO: replace with the real shape of a ${Route}
const create${Route}Schema = z.object({});

export const create = defineRoute({ body: create${Route}Schema }, async (c, { body }) => {
  const item = await service.create(body);
  return c.json(item, 201);
});
`;
}

export function renderRoutes(route: string, framework: Framework, language: Language): string {
  if (framework === "express") {
    // Router() takes no generic parameter either way — same content for
    // both languages, same reasoning as renderController above.
    return `import { Router } from "@mednours/backon/express";
import * as controller from "./${route}.controller";

export const ${camelCase(route)}Routes = Router();

${camelCase(route)}Routes.get("/", controller.list);
${camelCase(route)}Routes.post("/", controller.create);
`;
  }

  if (language === "javascript") {
    // `new Hono<Env>()` is TypeScript-only syntax (a generic type
    // argument) — not valid JavaScript, so the JS variant drops both the
    // `type Env` import and the `<Env>` argument. The Env generic only
    // affects c.get()/c.set() typing anyway, which doesn't exist in plain
    // JS regardless.
    return `import { Hono } from "@mednours/backon";
import * as controller from "./${route}.controller";

export const ${camelCase(route)}Routes = new Hono();

${camelCase(route)}Routes.get("/", controller.list);
${camelCase(route)}Routes.post("/", controller.create);
`;
  }

  return `import { Hono, type Env } from "@mednours/backon";
import * as controller from "./${route}.controller";

export const ${camelCase(route)}Routes = new Hono<Env>();

${camelCase(route)}Routes.get("/", controller.list);
${camelCase(route)}Routes.post("/", controller.create);
`;
}

export function renderServices(route: string, language: Language): string {
  if (language === "javascript") {
    return `// TODO: replace with real data access (see src/config/db.js)

export async function list() {
  return [];
}

export async function create(data) {
  return { id: crypto.randomUUID(), ...data };
}
`;
  }

  return `// TODO: replace with real data access (see src/config/db.ts)

export async function list() {
  return [];
}

export async function create(data: unknown) {
  return { id: crypto.randomUUID(), ...(data as object) };
}
`;
}

function camelCase(name: string): string {
  const [first, ...rest] = name.split("-");
  return [first, ...rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1))].join("");
}

export { camelCase };
