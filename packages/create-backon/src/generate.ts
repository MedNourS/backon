import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Answers } from "./prompts";
import {
  renderAppTs,
  renderEndpointsIndex,
  renderEnvExample,
  renderExampleMiddleware,
  renderIndexTs,
  renderPackageJson,
  renderReadme,
  renderTsconfig,
} from "./templates/base";
import { renderController, renderRoutes, renderServices } from "./templates/route";
import { renderDbFile } from "./templates/db";

async function write(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

export interface GenerateResult {
  root: string;
  filesWritten: string[];
}

/**
 * Writes the whole scaffold to `<cwd>/<projectName>`. Pure file I/O, no
 * prompting — kept separate from prompts.ts so it can be tested directly
 * with a fixed Answers object instead of driving fake stdin.
 */
export async function generateProject(answers: Answers, cwd: string = process.cwd()): Promise<GenerateResult> {
  const root = join(cwd, answers.projectName);
  const filesWritten: string[] = [];

  const files: Array<[string, string]> = [
    [join(root, "index.ts"), renderIndexTs(answers.framework)],
    [join(root, ".env.example"), renderEnvExample(answers.db)],
    [join(root, "package.json"), renderPackageJson(answers.projectName, answers.framework, answers.db)],
    [join(root, "tsconfig.json"), renderTsconfig()],
    [join(root, "README.md"), renderReadme(answers)],
    [join(root, ".gitignore"), "node_modules/\ndist/\n*.log\n.env\n.env.local\n"],
    [join(root, "src/app.ts"), renderAppTs(answers.framework)],
    [join(root, "src/config/db.ts"), renderDbFile(answers.db)],
    [join(root, "src/middleware/example.middleware.ts"), renderExampleMiddleware(answers.framework)],
    [join(root, "src/endpoints/index.ts"), renderEndpointsIndex(answers.framework, answers.routes)],
  ];

  for (const route of answers.routes) {
    const dir = join(root, "src/endpoints", route);
    files.push(
      [join(dir, `${route}.controller.ts`), renderController(route, answers.framework)],
      [join(dir, `${route}.routes.ts`), renderRoutes(route, answers.framework)],
      [join(dir, `${route}.services.ts`), renderServices(route)]
    );
  }

  for (const [path, contents] of files) {
    await write(path, contents);
    filesWritten.push(path);
  }

  return { root, filesWritten };
}
