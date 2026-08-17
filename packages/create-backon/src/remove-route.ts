import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectProject } from "./detect";
import { parseMountedRoutes, readEndpointsIndex } from "./endpoints-index";
import { toKebabCase } from "./prompts";
import { renderEndpointsIndex } from "./templates/base";

export interface RemoveRouteResult {
  route: string;
  root: string;
  removedDir: string;
}

/**
 * The undo for addRoute(): unmounts the route from src/endpoints/index.<ext>
 * and deletes its folder. Refuses if the route isn't currently mounted,
 * rather than silently deleting an orphaned folder that was never wired up
 * — that's what `doctor` is for.
 */
export async function removeRoute(rawName: string, cwd: string = process.cwd()): Promise<RemoveRouteResult> {
  const route = toKebabCase(rawName);
  if (!route) {
    throw new Error("Route name can't be empty.");
  }

  const { root, framework, ext } = await detectProject(cwd);
  const { path: indexPath, contents } = await readEndpointsIndex(root, ext);

  const mounted = parseMountedRoutes(contents);
  if (!mounted.includes(route)) {
    throw new Error(`"${route}" isn't mounted in ${indexPath} — nothing to remove.`);
  }

  const remaining = mounted.filter((name) => name !== route);
  await writeFile(indexPath, renderEndpointsIndex(framework, remaining));

  const removedDir = join(root, "src/endpoints", route);
  await rm(removedDir, { recursive: true, force: true });

  return { route, root, removedDir };
}
