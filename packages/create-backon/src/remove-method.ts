import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editSource, removeControllerMethod, removeRouteMount, removeServiceMethod } from "./ast-edit";
import { detectProject } from "./detect";
import { parseMountedRoutes, readEndpointsIndex } from "./endpoints-index";
import { parseRouteMethods } from "./route-methods";
import { renderBlankController, renderBlankRoutes, renderBlankServices, type HttpVerb } from "./templates/route";

export interface RemoveMethodResult {
  route: string;
  root: string;
  removed: { verb: HttpVerb; path: string; name: string };
}

/**
 * The undo for addMethod(): strips one method's mount line from
 * *.routes.<ext>, its defineRoute() export (plus any params/body/query
 * schema consts) from *.controller.<ext>, and its matching function (plus
 * its now-unused schema-type import, if any) from *.services.<ext>.
 * Identified by verb+path, the same pair addMethod() itself refuses to let
 * collide — not by name alone, since two different verb/path pairs could
 * theoretically end up with the same name checked against different
 * endpoints (name uniqueness is only enforced per endpoint, not globally).
 *
 * Every removal goes through ast-edit.ts's ts-morph helpers, which find
 * each method's statements by their actual declared/exported name — the
 * same uniqueness addMethod() enforces — rather than by which \n\n-
 * delimited block of text they happen to sit in. That matters because
 * parseRouteMethods() (used above to confirm the method exists) reads
 * mount lines with a lenient regex that tolerates reformatting; the old
 * text-block removal required an exact line match after that same
 * reformatting and could silently fail to find anything to remove, leaving
 * the controller/services files changed but the route still mounted.
 *
 * Removing the last method on an endpoint resets all three files back to
 * their blank, freshly-scaffolded shape (renderBlank*()) rather than
 * leaving behind an import block with nothing left to import for — the
 * same state addRoute() itself would have written.
 */
export async function removeMethod(
  route: string,
  verb: HttpVerb,
  path: string,
  cwd: string = process.cwd()
): Promise<RemoveMethodResult> {
  const { root, framework, language, ext } = await detectProject(cwd);

  const { contents: indexContents } = await readEndpointsIndex(root, ext);
  const mounted = parseMountedRoutes(indexContents);
  if (!mounted.includes(route)) {
    throw new Error(`"${route}" isn't mounted in src/endpoints/index.${ext}.`);
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
  const match = existing.find((m) => m.verb === verb && m.path === path);
  if (!match) {
    throw new Error(`${verb.toUpperCase()} ${path} isn't mounted in ${routesPath}.`);
  }
  const { name } = match;

  if (existing.length === 1) {
    await Promise.all([
      writeFile(controllerPath, renderBlankController()),
      writeFile(routesPath, renderBlankRoutes(route, framework, language)),
      writeFile(servicesPath, renderBlankServices()),
    ]);
    return { route, root, removed: match };
  }

  const newController = editSource(controllerPath, controllerContents, (_project, sourceFile) => {
    removeControllerMethod(sourceFile, name);
  });
  const newRoutes = editSource(routesPath, routesContents, (_project, sourceFile) => {
    removeRouteMount(sourceFile, name);
  });
  const newServices = editSource(servicesPath, servicesContents, (_project, sourceFile) => {
    removeServiceMethod(sourceFile, name);
  });

  await Promise.all([
    writeFile(controllerPath, newController),
    writeFile(routesPath, newRoutes),
    writeFile(servicesPath, newServices),
  ]);

  return { route, root, removed: match };
}
