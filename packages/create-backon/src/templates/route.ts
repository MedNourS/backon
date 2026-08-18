import type { Framework, Language } from "../prompts";

export function pascalCase(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function camelCase(name: string): string {
  const [first, ...rest] = name.split("-");
  return [first, ...rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1))].join("");
}

export type HttpVerb = "get" | "post" | "put" | "patch" | "delete";

export const HTTP_VERBS: readonly HttpVerb[] = ["get", "post", "put", "patch", "delete"];

export interface MethodSpec {
  verb: HttpVerb;
  /** e.g. "/" or "/:id" — path params come straight from this, nothing else derives them. */
  path: string;
  /** Identifier for the controller export and the matching service function. Caller's job to keep it unique. */
  name: string;
  needsBody: boolean;
  needsQuery: boolean;
}

/** Path params come straight from the URL pattern — no guessing needed, unlike body/query shape. */
export function paramNamesFromPath(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}

// ---------------------------------------------------------------------------
// Blank endpoint — an endpoint folder with zero methods wired yet. This is
// what every route starts as now, whether it comes from the initial
// `bun create backon` route prompt or a later `add-route`: methods are
// always a deliberate second step via `bun run add-method`, rather than
// guessing that every route wants a GET-list/POST-create pair.
// ---------------------------------------------------------------------------

const PLACEHOLDER_COMMENT = "// No methods yet — run `bun run add-method` to add one.";

export function renderBlankController(): string {
  return `${PLACEHOLDER_COMMENT}\n`;
}

export function renderBlankRoutes(route: string, framework: Framework, language: Language): string {
  const varName = `${camelCase(route)}Routes`;

  if (framework === "express") {
    return `import { Router } from "@mednours/backon/express";

export const ${varName} = Router();

${PLACEHOLDER_COMMENT}
`;
  }

  if (language === "javascript") {
    return `import { Hono } from "@mednours/backon";

export const ${varName} = new Hono();

${PLACEHOLDER_COMMENT}
`;
  }

  return `import { Hono, type Env } from "@mednours/backon";

export const ${varName} = new Hono<Env>();

${PLACEHOLDER_COMMENT}
`;
}

export function renderBlankServices(): string {
  return `// No routes yet — service functions land here as methods are added via \`bun run add-method\`.\n`;
}

// ---------------------------------------------------------------------------
// Per-method codegen — appended to an existing endpoint's three files by
// add-method.ts, one HTTP method at a time. Handler signature is always
// `(c, { body, query, params })`, regardless of which schemas this method
// actually declares (defineRoute always hands back all three, unused ones
// just come through as undefined) — keeping it uniform means no conditional
// destructuring to get right, and the generated tsconfig has neither
// noUnusedLocals nor noUnusedParameters on, so an unused destructured name
// is not a compile error.
// ---------------------------------------------------------------------------

function defaultServiceReturn(spec: MethodSpec): string {
  const { verb, needsBody } = spec;
  const hasParams = paramNamesFromPath(spec.path).length > 0;

  if (verb === "get" && !hasParams) return "return [];";
  if (verb === "get") return "return null; // TODO: fetch the real record";
  if (verb === "post") return needsBody ? "return { id: crypto.randomUUID(), ...body };" : "return { id: crypto.randomUUID() };";
  if (verb === "put" || verb === "patch") return needsBody ? "return { ...params, ...body };" : "return { ...params };";
  return "return { success: true };"; // delete
}

/** Positional args the controller passes to the matching service function — only what this method actually declared. */
function serviceCallArgs(spec: MethodSpec): string[] {
  const args: string[] = [];
  if (paramNamesFromPath(spec.path).length > 0) args.push("params");
  if (spec.needsBody) args.push("body");
  if (spec.needsQuery) args.push("query");
  return args;
}

/** Matching typed parameter list for the service function itself (TS only — see renderServiceMethod). */
function serviceParamList(spec: MethodSpec): string {
  const parts: string[] = [];
  if (paramNamesFromPath(spec.path).length > 0) parts.push(`params: z.infer<typeof ${spec.name}ParamsSchema>`);
  if (spec.needsBody) parts.push(`body: z.infer<typeof ${spec.name}BodySchema>`);
  if (spec.needsQuery) parts.push(`query: z.infer<typeof ${spec.name}QuerySchema>`);
  return parts.join(", ");
}

export function controllerImports(route: string, framework: Framework): string[] {
  const backonImport = framework === "express" ? "@mednours/backon/express" : "@mednours/backon";
  return [`import { z } from "zod";`, `import { defineRoute } from "${backonImport}";`, `import * as service from "./${route}.services";`];
}

export function renderControllerMethod(spec: MethodSpec): string {
  const paramNames = paramNamesFromPath(spec.path);
  const lines: string[] = [];

  if (paramNames.length > 0) {
    const shape = paramNames.map((name) => `${name}: z.string()`).join(", ");
    lines.push(`export const ${spec.name}ParamsSchema = z.object({ ${shape} });`);
  }
  if (spec.needsBody) {
    lines.push(`// TODO: replace with the real shape of "${spec.name}"'s request body`);
    lines.push(`export const ${spec.name}BodySchema = z.object({});`);
  }
  if (spec.needsQuery) {
    lines.push(`// TODO: replace with the real shape of "${spec.name}"'s query params`);
    lines.push(`export const ${spec.name}QuerySchema = z.object({});`);
  }

  const schemaEntries: string[] = [];
  if (paramNames.length > 0) schemaEntries.push(`params: ${spec.name}ParamsSchema`);
  if (spec.needsBody) schemaEntries.push(`body: ${spec.name}BodySchema`);
  if (spec.needsQuery) schemaEntries.push(`query: ${spec.name}QuerySchema`);
  const schemaObject = schemaEntries.length > 0 ? `{ ${schemaEntries.join(", ")} }` : "{}";

  const callArgs = serviceCallArgs(spec).join(", ");
  const status = spec.verb === "post" ? ", 201" : "";

  lines.push(
    `export const ${spec.name} = defineRoute(${schemaObject}, async (c, { body, query, params }) => {`,
    `  const result = await service.${spec.name}(${callArgs});`,
    `  return c.json(result${status});`,
    `});`
  );

  return lines.join("\n");
}

export function routeMountLine(route: string, spec: MethodSpec): string {
  return `${camelCase(route)}Routes.${spec.verb}("${spec.path}", controller.${spec.name});`;
}

export function serviceImports(route: string, spec: MethodSpec, language: Language): string[] {
  if (language === "javascript") return [];
  const imports: string[] = [`import type { z } from "zod";`];
  const named: string[] = [];
  if (paramNamesFromPath(spec.path).length > 0) named.push(`${spec.name}ParamsSchema`);
  if (spec.needsBody) named.push(`${spec.name}BodySchema`);
  if (spec.needsQuery) named.push(`${spec.name}QuerySchema`);
  if (named.length > 0) imports.push(`import type { ${named.join(", ")} } from "./${route}.controller";`);
  return imports;
}

export function renderServiceMethod(spec: MethodSpec, language: Language): string {
  const ext = language === "javascript" ? "js" : "ts";
  const argList = language === "javascript" ? serviceCallArgs(spec).join(", ") : serviceParamList(spec);
  return `// TODO: replace with real data access (see src/config/db.${ext})
export async function ${spec.name}(${argList}) {
  ${defaultServiceReturn(spec)}
}`;
}
