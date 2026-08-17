import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Framework, Language } from "./prompts";

export interface DetectedProject {
  root: string;
  framework: Framework;
  language: Language;
  ext: "ts" | "js";
}

/**
 * Figures out framework/language for an already-scaffolded backon project
 * by reading its package.json, rather than asking again — the answers are
 * already implied by what generateProject() wrote the first time around.
 */
export async function detectProject(cwd: string = process.cwd()): Promise<DetectedProject> {
  const pkgPath = join(cwd, "package.json");

  let raw: string;
  try {
    raw = await readFile(pkgPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No package.json found in ${cwd} — run this from a project created by \`bun create backon\`.`);
    }
    throw err;
  }

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(raw);
  } catch {
    throw new Error(`Couldn't parse ${pkgPath} as JSON.`);
  }

  const dependencies = pkg.dependencies ?? {};
  const devDependencies = pkg.devDependencies ?? {};

  if (!dependencies["@mednours/backon"]) {
    throw new Error(`${cwd} doesn't look like a backon project — package.json has no "@mednours/backon" dependency.`);
  }

  const framework: Framework = dependencies.express ? "express" : "hono";
  const language: Language = devDependencies.typescript ? "typescript" : "javascript";
  const ext: "ts" | "js" = language === "javascript" ? "js" : "ts";

  return { root: cwd, framework, language, ext };
}
