import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectProject } from "./detect";
import { parseMountedRoutes, readEndpointsIndex } from "./endpoints-index";
import { parseRouteMethods } from "./route-methods";
import {
  controllerImports,
  renderControllerMethod,
  renderServiceMethod,
  routeMountLine,
  serviceImports,
  type MethodSpec,
} from "./templates/route";

export interface AddMethodResult {
  route: string;
  root: string;
  filesWritten: string[];
}

// The exact placeholder comment each blank file starts with — see
// templates/route.ts. Stripped the first time a real method lands, wherever
// it happens to sit in the file (start of controller.ts/services.ts, but
// mid-file in routes.ts, after the Router()/Hono() line).
const PLACEHOLDER_PATTERN = /\/\/ No (?:routes|methods) yet[^\n]*\n\n?/;

function stripPlaceholder(content: string): string {
  return content.replace(PLACEHOLDER_PATTERN, "");
}

/** Inserts any of importLines not already present, right after the file's existing leading import block. */
function ensureImports(content: string, importLines: string[]): string {
  const stripped = stripPlaceholder(content);
  const missing = importLines.filter((line) => !stripped.includes(line));
  if (missing.length === 0) return stripped;

  const lines = stripped.split("\n");
  let insertAt = 0;
  while (insertAt < lines.length && lines[insertAt]?.startsWith("import ")) insertAt++;
  lines.splice(insertAt, 0, ...missing);
  return lines.join("\n");
}

function appendBlock(content: string, block: string): string {
  const trimmed = content.replace(/\n+$/, "");
  return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}

/**
 * Adds one HTTP method to an already-mounted, already-blank-or-partial
 * endpoint: appends a defineRoute() export (with whatever params/body/query
 * schemas this method declares — params auto-derived from the path, body
 * and query left as TODO placeholders same as the old fixed scaffold did)
 * to the controller, a matching service function typed via z.infer, and
 * the route mount line. All three files are read fresh off disk first, so
 * this is safe to call repeatedly, or after the previous method's stub was
 * hand-edited.
 */
export async function addMethod(route: string, spec: MethodSpec, cwd: string = process.cwd()): Promise<AddMethodResult> {
  const { root, framework, language, ext } = await detectProject(cwd);

  const { contents: indexContents } = await readEndpointsIndex(root, ext);
  const mounted = parseMountedRoutes(indexContents);
  if (!mounted.includes(route)) {
    throw new Error(`"${route}" isn't mounted in src/endpoints/index.${ext} — add it first with \`bun run add-route\`.`);
  }

  const routeDir = join(root, "src/endpoints", route);
  const controllerPath = join(routeDir, `${route}.controller.${ext}`);
  const routesPath = join(routeDir, `${route}.routes.${ext}`);
  const servicesPath = join(routeDir, `${route}.services.${ext}`);

  const [controllerContents, routesContents, servicesContents] = await Promise.all([
    readFile(controllerPath, "utf-8"),
    readFile(routesPath, "utf-8"),
    readFile(servicesPath, "utf-8"),
  ]);

  const existing = parseRouteMethods(routesContents);
  if (existing.some((m) => m.name === spec.name)) {
    throw new Error(`"${spec.name}" is already used in ${controllerPath} — pick a different name.`);
  }
  if (existing.some((m) => m.verb === spec.verb && m.path === spec.path)) {
    throw new Error(`${spec.verb.toUpperCase()} ${spec.path} is already mounted in ${routesPath}.`);
  }

  const newController = appendBlock(ensureImports(controllerContents, controllerImports(route, framework)), renderControllerMethod(spec));
  const newRoutes = appendBlock(
    ensureImports(routesContents, [`import * as controller from "./${route}.controller";`]),
    routeMountLine(route, spec)
  );
  const newServices = appendBlock(ensureImports(servicesContents, serviceImports(route, spec, language)), renderServiceMethod(spec, language));

  await Promise.all([
    writeFile(controllerPath, newController),
    writeFile(routesPath, newRoutes),
    writeFile(servicesPath, newServices),
  ]);

  return { route, root, filesWritten: [controllerPath, routesPath, servicesPath] };
}
