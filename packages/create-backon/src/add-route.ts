import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { detectProject } from "./detect";
import { parseMountedRoutes, readEndpointsIndex } from "./endpoints-index";
import { toKebabCase } from "./prompts";
import { renderEndpointsIndex } from "./templates/base";
import { renderController, renderRoutes, renderServices } from "./templates/route";

export interface AddRouteResult {
  route: string;
  root: string;
  filesWritten: string[];
}

async function write(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

/**
 * Adds a single route to an already-scaffolded backon project: detects the
 * project's framework/language from its package.json, writes the same
 * controller/routes/services trio generateProject() would have written for
 * this route at scaffold time, and regenerates src/endpoints/index.<ext> so
 * the new route is mounted alongside whatever was already there.
 */
export async function addRoute(rawName: string, cwd: string = process.cwd()): Promise<AddRouteResult> {
  const route = toKebabCase(rawName);
  if (!route) {
    throw new Error("Route name can't be empty.");
  }

  const { root, framework, language, ext } = await detectProject(cwd);

  const endpointsDir = join(root, "src/endpoints");
  let dirEntries: string[];
  try {
    dirEntries = await readdir(endpointsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${endpointsDir} doesn't exist — is this a backon project?`);
    }
    throw err;
  }
  if (dirEntries.includes(route)) {
    throw new Error(`src/endpoints/${route} already exists.`);
  }

  const { path: indexPath, contents: indexContents } = await readEndpointsIndex(root, ext);
  const existingRoutes = parseMountedRoutes(indexContents);
  if (existingRoutes.includes(route)) {
    throw new Error(`"${route}" is already mounted in ${indexPath}.`);
  }

  const routeDir = join(endpointsDir, route);
  const filesWritten: string[] = [];
  const files: Array<[string, string]> = [
    [join(routeDir, `${route}.controller.${ext}`), renderController(route, framework)],
    [join(routeDir, `${route}.routes.${ext}`), renderRoutes(route, framework, language)],
    [join(routeDir, `${route}.services.${ext}`), renderServices(route, language)],
  ];

  for (const [path, contents] of files) {
    await write(path, contents);
    filesWritten.push(path);
  }

  const allRoutes = [...existingRoutes, route];
  await writeFile(indexPath, renderEndpointsIndex(framework, allRoutes));
  filesWritten.push(indexPath);

  return { route, root, filesWritten };
}
