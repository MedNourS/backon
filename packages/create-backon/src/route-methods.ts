import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { colorVerb, dim } from "./colors";
import { detectProject } from "./detect";
import { parseMountedRoutes, readEndpointsIndex } from "./endpoints-index";
import type { HttpVerb } from "./templates/route";

export interface EndpointMethod {
  verb: HttpVerb;
  path: string;
  /** The controller export / service function name this method calls into. */
  name: string;
}

export interface EndpointSummary {
  route: string;
  methods: EndpointMethod[];
}

// Matches exactly what routeMountLine() in templates/route.ts generates:
//   usersRoutes.get("/", controller.list);
//   usersRoutes.post("/", controller.create);
// Shared here so the dashboard (add-method) and list-routes read mount lines
// the same way instead of two regexes drifting apart.
const METHOD_MOUNT_PATTERN = /\.(get|post|put|patch|delete)\(\s*"([^"]*)"\s*,\s*controller\.(\w+)\s*\)/g;

export function parseRouteMethods(routesFileContents: string): EndpointMethod[] {
  const methods: EndpointMethod[] = [];
  for (const match of routesFileContents.matchAll(METHOD_MOUNT_PATTERN)) {
    const [, verb, path, name] = match;
    if (verb && path !== undefined && name) {
      methods.push({ verb: verb as HttpVerb, path, name });
    }
  }
  return methods;
}

/**
 * Whether a given method actually declared a body/query schema — read off
 * whether *.controller.<ext> exports `<name>BodySchema`/`<name>QuerySchema`,
 * since addMethod() only ever emits those consts when the method's own
 * needsBody/needsQuery was true (see renderControllerMethod in
 * templates/route.ts). Nothing else remembers those two booleans after the
 * fact — this is how the "modify a method" flow prefills its confirm
 * prompts with what the method already has, instead of defaulting both back
 * to false every time.
 */
export async function detectMethodValidation(
  route: string,
  name: string,
  cwd: string = process.cwd()
): Promise<{ needsBody: boolean; needsQuery: boolean }> {
  const { root, ext } = await detectProject(cwd);
  const controllerPath = join(root, "src/endpoints", route, `${route}.controller.${ext}`);
  const contents = await readFile(controllerPath, "utf-8");
  return {
    needsBody: contents.includes(`export const ${name}BodySchema`),
    needsQuery: contents.includes(`export const ${name}QuerySchema`),
  };
}

/**
 * Every endpoint currently mounted in src/endpoints/index.<ext>, with the
 * HTTP methods each one's own *.routes.<ext> file actually wires up right
 * now — the same "what's real on disk" read doctor.ts does, rather than
 * anything add-method itself remembers, so this stays correct even after
 * hand-edits.
 */
export async function listEndpointsWithMethods(cwd: string = process.cwd()): Promise<EndpointSummary[]> {
  const { root, ext } = await detectProject(cwd);
  const { contents } = await readEndpointsIndex(root, ext);
  const routes = parseMountedRoutes(contents);

  const summaries: EndpointSummary[] = [];
  for (const route of routes) {
    const routesFilePath = join(root, "src/endpoints", route, `${route}.routes.${ext}`);
    let routesFileContents: string;
    try {
      routesFileContents = await readFile(routesFilePath, "utf-8");
    } catch {
      summaries.push({ route, methods: [] });
      continue;
    }
    summaries.push({ route, methods: parseRouteMethods(routesFileContents) });
  }
  return summaries;
}

/** Plain-text dashboard: every endpoint, and every method it actually has right now, colored by verb. */
export function formatEndpointsDashboard(summaries: EndpointSummary[]): string {
  if (summaries.length === 0) return dim("No endpoints yet.");

  return summaries
    .map(({ route, methods }) => {
      if (methods.length === 0) return `${route}\n  ${dim("(no methods yet)")}`;
      const lines = methods.map((m) => `  ${colorVerb(m.verb)} ${m.path}  ${dim(`→ ${m.name}`)}`);
      return `${route}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}
