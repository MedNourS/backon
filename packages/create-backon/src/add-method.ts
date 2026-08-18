import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editSource, ensureImports, appendStatements } from "./ast-edit";
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
// templates/route.ts. Stripped as plain text before the AST layer below
// ever sees the file: a file that's only a comment (no statements yet) has
// nothing for ensureImports()/appendStatements() to attach it to, and this
// comment isn't code that needs AST-accurate handling anyway.
const PLACEHOLDER_PATTERN = /\/\/ No (?:routes|methods) yet[^\n]*\n\n?/;

function stripPlaceholder(content: string): string {
  return content.replace(PLACEHOLDER_PATTERN, "");
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
 *
 * Every file edit goes through ast-edit.ts's ts-morph helpers: an import is
 * only added if the real AST doesn't already have one covering it (not
 * whether an identical line of text happens to appear anywhere), and the
 * new method's code is appended as real parsed statements rather than
 * spliced-in text — so this stays correct even if the file was previously
 * hand-reformatted in a way that would have thrown off a text-based check.
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

  const newController = editSource(controllerPath, stripPlaceholder(controllerContents), (project, sourceFile) => {
    ensureImports(sourceFile, project, controllerImports(route, framework));
    appendStatements(sourceFile, renderControllerMethod(spec));
  });

  const newRoutes = editSource(routesPath, stripPlaceholder(routesContents), (project, sourceFile) => {
    ensureImports(sourceFile, project, [`import * as controller from "./${route}.controller";`]);
    appendStatements(sourceFile, routeMountLine(route, spec));
  });

  const newServices = editSource(servicesPath, stripPlaceholder(servicesContents), (project, sourceFile) => {
    ensureImports(sourceFile, project, serviceImports(route, spec, language));
    appendStatements(sourceFile, renderServiceMethod(spec, language));
  });

  await Promise.all([
    writeFile(controllerPath, newController),
    writeFile(routesPath, newRoutes),
    writeFile(servicesPath, newServices),
  ]);

  return { route, root, filesWritten: [controllerPath, routesPath, servicesPath] };
}
