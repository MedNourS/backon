import type { Framework } from "../prompts";

function pascalCase(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

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

export function renderRoutes(route: string, framework: Framework): string {
  if (framework === "express") {
    return `import { Router } from "@mednours/backon/express";
import * as controller from "./${route}.controller";

export const ${camelCase(route)}Routes = Router();

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

export function renderServices(route: string): string {
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
