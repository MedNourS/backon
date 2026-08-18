import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Answers } from "./prompts";
import {
  renderAppTs,
  renderEndpointsIndex,
  renderEnvExample,
  renderExampleMiddleware,
  renderGenerateDocsScript,
  renderIndexTs,
  renderJsconfig,
  renderPackageJson,
  renderReadme,
  renderTsconfig,
} from "./templates/base";
import { renderBlankController, renderBlankRoutes, renderBlankServices } from "./templates/route";
import { renderDbFile } from "./templates/db";

async function write(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

// Entries a target directory is allowed to already have without tripping
// the "not empty" guard below — mirrors the ignore-list scaffolders like
// `bun create vite` use, so running this right after `git init` (or in a
// fresh GitHub-created repo that already has a README/.gitignore/LICENSE)
// doesn't get blocked over nothing.
const IGNORABLE_ENTRIES = new Set([
  ".git",
  ".gitignore",
  ".github",
  ".idea",
  ".vscode",
  ".DS_Store",
  "LICENSE",
  "LICENSE.md",
  "README.md",
]);

async function ensureSafeToWrite(root: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return; // doesn't exist yet — nothing to worry about
    throw err;
  }

  const meaningful = entries.filter((name) => !IGNORABLE_ENTRIES.has(name));
  if (meaningful.length > 0) {
    const shown = meaningful.slice(0, 5).join(", ") + (meaningful.length > 5 ? ", ..." : "");
    throw new Error(
      `Refusing to scaffold into ${root} — it already has files in it (${shown}). Clear it out first, or pick an empty/new directory.`
    );
  }
}

export interface GenerateResult {
  root: string;
  filesWritten: string[];
}

/**
 * Writes the whole scaffold to `<cwd>/<projectName>` — or straight into
 * `cwd` itself when projectName is ".", the same convention
 * `bun create vite@latest .` uses. In that case the actual package name
 * (used in package.json and the README) falls back to the current
 * directory's own name, since "." isn't a valid npm package name.
 *
 * Pure file I/O, no prompting — kept separate from prompts.ts so it can be
 * tested directly with a fixed Answers object instead of driving fake
 * stdin.
 */
export async function generateProject(answers: Answers, cwd: string = process.cwd()): Promise<GenerateResult> {
  const root = answers.projectName === "." ? cwd : join(cwd, answers.projectName);
  const packageName = answers.projectName === "." ? basename(root) || "app" : answers.projectName;
  const readmeAnswers: Answers = { ...answers, projectName: packageName };
  const ext = answers.language === "javascript" ? "js" : "ts";

  await ensureSafeToWrite(root);

  const filesWritten: string[] = [];

  const files: Array<[string, string]> = [
    [join(root, `index.${ext}`), renderIndexTs(answers.framework)],
    [join(root, ".env.example"), renderEnvExample(answers.db)],
    ...(answers.copyEnv ? ([[join(root, ".env"), renderEnvExample(answers.db)]] as Array<[string, string]>) : []),
    [join(root, "package.json"), renderPackageJson(packageName, answers.framework, answers.language, answers.db)],
    answers.language === "javascript"
      ? [join(root, "jsconfig.json"), renderJsconfig()]
      : [join(root, "tsconfig.json"), renderTsconfig()],
    [join(root, "README.md"), renderReadme(readmeAnswers)],
    [join(root, ".gitignore"), "node_modules/\ndist/\n*.log\n.env\n.env.local\nopenapi.json\ndocs.html\n"],
    [join(root, `src/app.${ext}`), renderAppTs(packageName, answers.framework)],
    [join(root, `src/config/db.${ext}`), renderDbFile(answers.db)],
    [
      join(root, `src/middleware/example.middleware.${ext}`),
      renderExampleMiddleware(answers.framework, answers.language),
    ],
    [join(root, `src/endpoints/index.${ext}`), renderEndpointsIndex(answers.framework, answers.routes)],
    [join(root, `scripts/generate-docs.${ext}`), renderGenerateDocsScript(packageName, answers.framework)],
  ];

  // Every route starts blank (no methods wired) — `bun run add-method` adds
  // them one at a time afterward. See templates/route.ts for why.
  for (const route of answers.routes) {
    const dir = join(root, "src/endpoints", route);
    files.push(
      [join(dir, `${route}.controller.${ext}`), renderBlankController()],
      [join(dir, `${route}.routes.${ext}`), renderBlankRoutes(route, answers.framework, answers.language)],
      [join(dir, `${route}.services.${ext}`), renderBlankServices()]
    );
  }

  for (const [path, contents] of files) {
    await write(path, contents);
    filesWritten.push(path);
  }

  return { root, filesWritten };
}
