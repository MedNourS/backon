import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectProject } from "./detect";
import { parseMountedRoutes, readEndpointsIndex } from "./endpoints-index";
import { parseRouteMethods } from "./route-methods";
import { renderBlankController, renderBlankRoutes, renderBlankServices, routeMountLine, type HttpVerb } from "./templates/route";

export interface RemoveMethodResult {
  route: string;
  root: string;
  removed: { verb: HttpVerb; path: string; name: string };
}

/**
 * addMethod() appends each method as its own \n\n-delimited block (see
 * appendBlock() in add-method.ts) — imports/the Router()-or-Hono()
 * declaration are their own leading block, then one block per method, in
 * insertion order, nothing else in between. That's what makes this safe:
 * find the one block matching the predicate and drop it, leaving every
 * other block (including the leading one) untouched.
 */
function removeBlock(content: string, matches: (block: string) => boolean): string {
  const blocks = content.split(/\n\n+/);
  const index = blocks.findIndex(matches);
  if (index === -1) return content;
  blocks.splice(index, 1);
  const joined = blocks.filter((b) => b.length > 0).join("\n\n");
  return joined ? `${joined}\n` : "";
}

/**
 * The undo for addMethod(): strips one method's mount line from
 * *.routes.<ext>, its defineRoute() export (plus any params/body/query
 * schema consts) from *.controller.<ext>, and its matching function from
 * *.services.<ext>. Identified by verb+path, the same pair addMethod()
 * itself refuses to let collide — not by name alone, since two different
 * verb/path pairs could theoretically end up with the same name checked
 * against different endpoints (name uniqueness is only enforced per
 * endpoint, not globally).
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

  const expectedMountLine = routeMountLine(route, { verb, path, name, needsBody: false, needsQuery: false });

  const newController = removeBlock(controllerContents, (block) => block.includes(`export const ${name} = defineRoute(`));
  const newRoutes = removeBlock(routesContents, (block) => block.trim() === expectedMountLine);
  const newServices = removeBlock(servicesContents, (block) => block.includes(`export async function ${name}(`));

  await Promise.all([
    writeFile(controllerPath, newController),
    writeFile(routesPath, newRoutes),
    writeFile(servicesPath, newServices),
  ]);

  return { route, root, removed: match };
}
