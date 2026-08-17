import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Matches the two shapes renderEndpointsIndex() ever generates:
//   endpoints.route("/telemetry", telemetryRoutes);   (hono)
//   endpoints.use("/telemetry", telemetryRoutes);     (express)
// Shared by add-route/remove-route/list-routes/doctor so all four agree on
// what "mounted" means by reading the same file the same way, instead of
// four copies of this regex drifting apart over time.
const MOUNT_PATTERN = /endpoints\.(?:route|use)\("\/([a-z0-9-]+)"/g;

export function parseMountedRoutes(indexContents: string): string[] {
  const routes: string[] = [];
  for (const match of indexContents.matchAll(MOUNT_PATTERN)) {
    routes.push(match[1]);
  }
  return routes;
}

export interface EndpointsIndexFile {
  path: string;
  contents: string;
}

export async function readEndpointsIndex(root: string, ext: "ts" | "js"): Promise<EndpointsIndexFile> {
  const path = join(root, "src/endpoints", `index.${ext}`);
  let contents: string;
  try {
    contents = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${path} doesn't exist — is this a backon project?`);
    }
    throw err;
  }
  return { path, contents };
}
