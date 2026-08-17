import { detectProject } from "./detect";
import { parseMountedRoutes, readEndpointsIndex } from "./endpoints-index";

export interface ListRoutesResult {
  root: string;
  routes: string[];
}

/** Read-only: what's actually mounted in src/endpoints/index.<ext> right now. */
export async function listRoutes(cwd: string = process.cwd()): Promise<ListRoutesResult> {
  const { root, ext } = await detectProject(cwd);
  const { contents } = await readEndpointsIndex(root, ext);
  return { root, routes: parseMountedRoutes(contents) };
}
