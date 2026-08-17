import type { Answers, Framework, Language } from "../prompts";
import { camelCase } from "./route";
import { dbDependencies, dbEnvVars, dbReadmeNote } from "./db";

// renderIndexTs/renderAppTs/renderEndpointsIndex are intentionally NOT
// language-aware: none of them contain TypeScript-only syntax (no type
// annotations, no `import type`, no generics), so the exact same content is
// valid whether it ends up in a .ts or a .js file. Only the file extension
// generate.ts writes them under changes between languages. Keeping one
// function instead of two identical ones avoids drift between copies that
// would otherwise need to stay in sync forever.

export function renderIndexTs(framework: Framework): string {
  const backonImport = framework === "express" ? "@mednours/backon/express" : "@mednours/backon";
  return `import { serve } from "${backonImport}";
import { app } from "./src/app";

serve(app);
`;
}

export function renderAppTs(framework: Framework): string {
  if (framework === "express") {
    return `import { createApp } from "@mednours/backon/express";
import { endpoints } from "./endpoints";
import { exampleMiddleware } from "./middleware/example.middleware";

export const app = createApp();

app.use(exampleMiddleware);
app.use("/", endpoints);
`;
  }
  return `import { createApp } from "@mednours/backon";
import { endpoints } from "./endpoints";
import { exampleMiddleware } from "./middleware/example.middleware";

export const app = createApp();

app.use("*", exampleMiddleware);
app.route("/", endpoints);
`;
}

export function renderExampleMiddleware(framework: Framework, language: Language): string {
  if (framework === "express") {
    if (language === "javascript") {
      return `/**
 * Example middleware, just to show the pattern — stamps a request-start
 * timestamp onto res.locals. Error handling, request logging, secure
 * headers, CORS, and the request body size limit are already wired into
 * createApp() by backon itself; you don't need your own
 * error.middleware.js unless you want to override that default behavior.
 *
 * This is plain Express middleware (req, res, next), not backon's
 * BackonContext — that wrapper only exists inside defineRoute() handlers.
 * Middleware always operates at the framework's own layer. (Also: Express
 * middleware can't safely set a response header after calling next() — by
 * then the response may already be sent — which is why this demonstrates
 * res.locals instead of a header.)
 *
 * @param {import("@mednours/backon/express").Request} req
 * @param {import("@mednours/backon/express").Response} res
 * @param {import("@mednours/backon/express").NextFunction} next
 */
export function exampleMiddleware(req, res, next) {
  res.locals.requestStartedAt = Date.now();
  next();
}
`;
    }
    return `import type { Request, Response, NextFunction } from "@mednours/backon/express";

/**
 * Example middleware, just to show the pattern — stamps a request-start
 * timestamp onto res.locals. Error handling, request logging, secure
 * headers, CORS, and the request body size limit are already wired into
 * createApp() by backon itself; you don't need your own
 * error.middleware.ts unless you want to override that default behavior.
 *
 * This is plain Express middleware (req, res, next), not backon's
 * BackonContext — that wrapper only exists inside defineRoute() handlers.
 * Middleware always operates at the framework's own layer. (Also: Express
 * middleware can't safely set a response header after calling next() — by
 * then the response may already be sent — which is why this demonstrates
 * res.locals instead of a header.)
 */
export function exampleMiddleware(req: Request, res: Response, next: NextFunction) {
  res.locals.requestStartedAt = Date.now();
  next();
}
`;
  }

  if (language === "javascript") {
    return `/**
 * Example middleware, just to show the pattern — adds a response-time
 * header. Error handling, request logging, secure headers, CORS, and the
 * request body size limit are already wired into createApp() by backon
 * itself; you don't need your own error.middleware.js unless you want to
 * override that default behavior.
 *
 * @param {import("@mednours/backon").BackonContext} c
 * @param {import("@mednours/backon").Next} next
 */
export async function exampleMiddleware(c, next) {
  const start = performance.now();
  await next();
  c.header("x-response-time-ms", String(Math.round(performance.now() - start)));
}
`;
  }
  return `import type { Next } from "@mednours/backon";
import type { BackonContext } from "@mednours/backon";

/**
 * Example middleware, just to show the pattern — adds a response-time
 * header. Error handling, request logging, secure headers, CORS, and the
 * request body size limit are already wired into createApp() by backon
 * itself; you don't need your own error.middleware.ts unless you want to
 * override that default behavior.
 */
export async function exampleMiddleware(c: BackonContext, next: Next) {
  const start = performance.now();
  await next();
  c.header("x-response-time-ms", String(Math.round(performance.now() - start)));
}
`;
}

export function renderEndpointsIndex(framework: Framework, routes: string[]): string {
  const imports = routes
    .map((route) => `import { ${camelCase(route)}Routes } from "./${route}/${route}.routes";`)
    .join("\n");

  if (framework === "express") {
    const mounts = routes.map((route) => `endpoints.use("/${route}", ${camelCase(route)}Routes);`).join("\n");
    return `import { Router } from "@mednours/backon/express";
${imports}

export const endpoints = Router();

${mounts}
`;
  }

  const mounts = routes.map((route) => `endpoints.route("/${route}", ${camelCase(route)}Routes);`).join("\n");
  return `import { Hono } from "@mednours/backon";
${imports}

export const endpoints = new Hono();

${mounts}
`;
}

export function renderEnvExample(db: Answers["db"]): string {
  return `PORT=3000
ALLOWED_ORIGINS=
${dbEnvVars(db)}`;
}

export function renderTsconfig(): string {
  return `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "allowJs": false
  },
  "include": ["index.ts", "src"]
}
`;
}

/**
 * JavaScript-mode counterpart to renderTsconfig(): no build step and no
 * `tsc --noEmit` script to run against it, but a jsconfig.json still gets
 * editors (VS Code and anything else that reads it) path resolution and
 * JSDoc-based intellisense on the @param annotations in the generated
 * middleware, without requiring TypeScript as a dependency or enforcing
 * type errors on every file.
 */
export function renderJsconfig(): string {
  return `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "checkJs": false,
    "allowJs": true
  },
  "include": ["index.js", "src"]
}
`;
}

export function renderPackageJson(
  projectName: string,
  framework: Framework,
  language: Language,
  db: Answers["db"]
): string {
  const ext = language === "javascript" ? "js" : "ts";

  const dependencies: Record<string, string> =
    framework === "express"
      ? {
          "@mednours/backon": "latest",
          express: "^4.21.0",
          cors: "^2.8.5",
          helmet: "^8.0.0",
          compression: "^1.7.5",
          zod: "^3.24.1",
          ...dbDependencies(db),
        }
      : {
          "@mednours/backon": "latest",
          hono: "^4.6.14",
          zod: "^3.24.1",
          ...dbDependencies(db),
        };

  // JavaScript mode intentionally has zero TypeScript-related devDependencies
  // (no `typescript`, no `@types/*`) — there's nothing being compiled or
  // typechecked, so pulling those in would just be dead weight.
  const devDependencies: Record<string, string> =
    language === "javascript"
      ? {}
      : framework === "express"
        ? { "@types/bun": "latest", "@types/express": "^4.17.21", typescript: "^5.7.2" }
        : { "@types/bun": "latest", typescript: "^5.7.2" };

  const scripts: Record<string, string> = {
    dev: `bun run --watch index.${ext}`,
    start: `bun run index.${ext}`,
    test: "bun test",
  };
  if (language === "typescript") {
    scripts.typecheck = "tsc --noEmit";
  }

  const pkg = {
    name: projectName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts,
    dependencies,
    devDependencies,
  };

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function renderReadme(answers: Answers): string {
  const routeList = answers.routes.length
    ? answers.routes.map((route) => `- \`src/endpoints/${route}/\``).join("\n")
    : "- (none yet — add one under src/endpoints/)";

  const backonImport = answers.framework === "express" ? "@mednours/backon/express" : "@mednours/backon";
  const languageLabel = answers.language === "javascript" ? "JavaScript" : "TypeScript";

  return `# ${answers.projectName}

Generated by \`create-backon\` (${answers.framework}, ${languageLabel}).

## Getting started

\`\`\`
bun install
cp .env.example .env   # fill in real values
bun run dev
\`\`\`

## Database: ${answers.db}

${dbReadmeNote(answers.db)}

## Routes

${routeList}

Each route folder follows the same shape: \`*.routes.${answers.language === "javascript" ? "js" : "ts"}\` wires HTTP
methods to controller functions, \`*.controller.${answers.language === "javascript" ? "js" : "ts"}\` validates the
request (via \`defineRoute\` from \`${backonImport}\`) and calls into
\`*.services.${answers.language === "javascript" ? "js" : "ts"}\`, which is where real data access belongs.
`;
}
