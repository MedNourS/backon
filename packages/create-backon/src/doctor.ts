import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { detectProject } from "./detect";
import { parseMountedRoutes, readEndpointsIndex } from "./endpoints-index";

export type DoctorIssueKind = "dangling-mount" | "orphaned-folder" | "missing-file";

export interface DoctorIssue {
  kind: DoctorIssueKind;
  route: string;
  detail: string;
}

export interface DoctorResult {
  root: string;
  issues: DoctorIssue[];
}

const ROUTE_FILE_SUFFIXES = ["controller", "routes", "services"] as const;

/**
 * Checks src/endpoints/ for drift between what's on disk and what
 * index.<ext> actually mounts — the kind of thing that creeps in from
 * hand-editing index.ts, an interrupted addRoute()/removeRoute(), or
 * copy-pasting a route folder without wiring it up. Read-only; reports
 * issues, doesn't fix them.
 */
export async function runDoctor(cwd: string = process.cwd()): Promise<DoctorResult> {
  const { root, ext } = await detectProject(cwd);
  const endpointsDir = join(root, "src/endpoints");
  const { contents } = await readEndpointsIndex(root, ext);
  const mounted = new Set(parseMountedRoutes(contents));

  const dirents = await readdir(endpointsDir, { withFileTypes: true }).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  });
  const folders = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  const folderSet = new Set(folders);

  const issues: DoctorIssue[] = [];

  for (const route of mounted) {
    if (!folderSet.has(route)) {
      issues.push({
        kind: "dangling-mount",
        route,
        detail: `index.${ext} mounts "/${route}" but src/endpoints/${route}/ doesn't exist.`,
      });
    }
  }

  for (const route of folders) {
    if (!mounted.has(route)) {
      issues.push({
        kind: "orphaned-folder",
        route,
        detail: `src/endpoints/${route}/ exists but isn't mounted in index.${ext}.`,
      });
    }

    for (const suffix of ROUTE_FILE_SUFFIXES) {
      const filePath = join(endpointsDir, route, `${route}.${suffix}.${ext}`);
      try {
        await access(filePath);
      } catch {
        issues.push({ kind: "missing-file", route, detail: `${filePath} is missing.` });
      }
    }
  }

  return { root, issues };
}
