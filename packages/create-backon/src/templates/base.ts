import type { Answers, DeployTarget, Framework, Language } from "../prompts";
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
  // The Hono adapter's serve() is async as of @mednours/backon 0.7.0 (it
  // dynamically imports Bun.serve()/@hono/node-server depending which
  // runtime it's actually on) — top-level await works fine here since
  // generated projects are ESM ("type": "module" in their package.json).
  // The Express adapter's serve() stays synchronous (always app.listen()
  // under the hood, no runtime branching to speak of), so it's left
  // un-awaited rather than implying an async contract that isn't real.
  const call = framework === "express" ? "serve(app);" : "await serve(app);";
  return `import { serve } from "${backonImport}";
import { app } from "./src/app";

${call}
`;
}

// serveApiDocs() is called last, after every route is mounted — it reads
// the route table as it stands at call time, so anything registered after
// this line would be missing from /docs. Same live route this project's
// bun run docs script generates a static copy of; see generate-docs.<ext>.
//
// The default export (Vercel target only) is additive, not a replacement
// for index.ts's serve(app) — Vercel's zero-config Hono/Express support
// imports this file directly and calls the exported app's own request
// handler, bypassing serve()/index.ts entirely, while index.ts (and its
// serve() call) keeps working exactly as before for `bun run dev`/`start`
// anywhere else. src/app.<ext> is already one of Vercel's recognized entry
// paths — this export is the only thing it was missing.
export function renderAppTs(projectName: string, framework: Framework, deployTarget?: DeployTarget): string {
  const defaultExport =
    deployTarget === "vercel"
      ? `
// Vercel deploys straight from this export — see vercel.json.
export default app;
`
      : "";

  if (framework === "express") {
    return `import { createApp, serveApiDocs } from "@mednours/backon/express";
import { endpoints } from "./endpoints";
import { exampleMiddleware } from "./middleware/example.middleware";

export const app = createApp();

app.use(exampleMiddleware);
app.use("/", endpoints);

serveApiDocs(app, "/docs", { title: "${projectName}" });
${defaultExport}`;
  }
  return `import { createApp, serveApiDocs } from "@mednours/backon";
import { endpoints } from "./endpoints";
import { exampleMiddleware } from "./middleware/example.middleware";

export const app = createApp();

app.use("*", exampleMiddleware);
app.route("/", endpoints);

serveApiDocs(app, "/docs", { title: "${projectName}" });
${defaultExport}`;
}

// Vercel target only. bunVersion pins the Bun *major* version Vercel runs
// the deployed function on (currently "1.x" is the only valid value; minor/
// patch are managed by Vercel automatically) — kept in sync with this
// being a Bun-first framework, so the deployed function behaves the same
// runtime as local dev. Not required for the zero-config Hono/Express
// detection itself (that works on Vercel's default Node runtime too), but
// there's no reason to switch runtimes between local and deployed.
export function renderVercelJson(): string {
  return `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "bunVersion": "1.x"
}
`;
}

export function renderExampleMiddleware(framework: Framework, language: Language): string {
  if (framework === "express") {
    if (language === "javascript") {
      return `/**
 * Example middleware, just to show the pattern — stamps a request-start
 * timestamp onto res.locals. Error handling, request logging, secure
 * headers, CORS, and the request body size limit are already wired into
 * createApp() by backon itself; a separate
 * error.middleware.js is only needed to override that default behavior.
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
 * createApp() by backon itself; a separate
 * error.middleware.ts is only needed to override that default behavior.
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
 * itself; a separate error.middleware.js is only needed to override that
 * default behavior.
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
 * itself; a separate error.middleware.ts is only needed to override that
 * default behavior.
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

// Not language-aware, same reasoning as renderIndexTs/renderAppTs above: no
// type annotations, so the same content is valid JS or TS. Imports "../src/app"
// rather than starting the server, so running this doesn't require anything
// to be listening — generateOpenApiSpec() only needs the app's routes
// registered, which happens at import time.
//
// docs.html embeds the spec directly (apiReferenceHtmlInline), rather than
// pointing at ./openapi.json the way the live serveApiDocs() page does —
// this file gets opened straight from disk as often as it's served over
// HTTP, and a browser blocks one file:// URL from fetching another, so a
// URL-based page would fail exactly there.
export function renderGenerateDocsScript(projectName: string, framework: Framework): string {
  const backonImport = framework === "express" ? "@mednours/backon/express" : "@mednours/backon";
  return `import { writeFileSync } from "node:fs";
import { generateOpenApiSpec, apiReferenceHtmlInline } from "${backonImport}";
import { app } from "../src/app";

const spec = generateOpenApiSpec(app, { title: "${projectName}", version: "0.1.0" });
writeFileSync("openapi.json", JSON.stringify(spec, null, 2));
writeFileSync("docs.html", apiReferenceHtmlInline(spec, "${projectName}"));

console.log("Wrote openapi.json and docs.html");
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
  "include": ["index.ts", "src", "scripts"]
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
  "include": ["index.js", "src", "scripts"]
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
    // Thin aliases over `bunx create-backon <subcommand>` — running
    // `bun run add-route users` from inside the project is shorter than
    // remembering the create-backon invocation, and bun forwards extra
    // arguments (like the route name) straight through without needing
    // a `--` separator.
    "add-route": "bunx create-backon add-route",
    "add-method": "bunx create-backon add-method",
    "remove-route": "bunx create-backon remove-route",
    "list-routes": "bunx create-backon list-routes",
    doctor: "bunx create-backon doctor",
    // project: read-only overview (db status, endpoints, methods, doctor
    // summary). server-config: the interactive manager for actually
    // changing endpoints/methods — add/remove/modify, without needing to
    // remember which of the individual subcommands above does what.
    project: "bunx create-backon project",
    "server-config": "bunx create-backon server-config",
    docs: `bun run scripts/generate-docs.${ext}`,
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

function renderDeploySection(deployTarget: DeployTarget | undefined, ext: string): string {
  switch (deployTarget) {
    case "vercel":
      return `## Deploying

Set up for [Vercel](https://vercel.com)'s zero-config Hono/Express support:
\`src/app.${ext}\` has a default export (Vercel deploys straight from it,
bypassing \`index.${ext}\`/\`serve()\` — those keep working locally exactly as
before), and \`vercel.json\` pins the Bun runtime so the deployed function
matches local dev. Connect the repo on [vercel.com/new](https://vercel.com/new)
or run \`vercel deploy\` — no other configuration needed. \`vercel dev\` runs it
locally the same way it'll run once deployed.
`;
    case "node":
      return `## Deploying

No deploy-specific files here — \`index.${ext}\` calls \`serve(app)\`, which
listens on \`PORT\` (see \`.env.example\`) wherever it's run. That's what
Render, Railway, Fly, a plain VPS, or any other Node/Bun host expects: point
the platform's start command at \`bun run start\` (or \`bun run index.${ext}\`)
and set \`PORT\`/your database env vars in its dashboard.
`;
    case "local":
      return `## Deploying

Not set up for a specific host — \`bun run start\` runs \`index.${ext}\`, which
listens on \`PORT\` (see \`.env.example\`). Point any Node/Bun-capable host's
start command at that when you're ready.
`;
    default:
      return `## Deploying

Not decided yet — \`index.${ext}\` already calls \`serve(app)\`, listening on
\`PORT\` (see \`.env.example\`), which is all most Node/Bun hosts need. For
[Vercel](https://vercel.com) specifically, add a default export to
\`src/app.${ext}\` (\`export default app;\`) and a \`vercel.json\` with
\`{ "bunVersion": "1.x" }\` — or re-run \`create-backon\` and pick Vercel to get
both for free.
`;
  }
}

export function renderReadme(answers: Answers): string {
  const routeList = answers.routes.length
    ? answers.routes.map((route) => `- \`src/endpoints/${route}/\``).join("\n")
    : "- (none yet — add one under src/endpoints/)";

  const backonImport = answers.framework === "express" ? "@mednours/backon/express" : "@mednours/backon";
  const languageLabel = answers.language === "javascript" ? "JavaScript" : "TypeScript";
  const ext = answers.language === "javascript" ? "js" : "ts";

  return `# ${answers.projectName}

Generated by \`create-backon\` (${answers.framework}, ${languageLabel}).

## Getting started

\`\`\`
bun install
cp .env.example .env   # fill in real values
bun run dev
\`\`\`

Once running, \`http://localhost:3000/docs\` has a live API reference for
every route added via \`defineRoute\` — \`bun run docs\` also writes the same
document to \`openapi.json\`/\`docs.html\` on disk, for CI or static hosting.

## Database: ${answers.db}

${dbReadmeNote(answers.db)}

## Routes

${routeList}

Each route folder follows the same shape: \`*.routes.${answers.language === "javascript" ? "js" : "ts"}\` wires HTTP
methods to controller functions, \`*.controller.${answers.language === "javascript" ? "js" : "ts"}\` validates the
request (via \`defineRoute\` from \`${backonImport}\`) and calls into
\`*.services.${answers.language === "javascript" ? "js" : "ts"}\`, which is where real data access belongs.

${renderDeploySection(answers.deployTarget, ext)}`;
}
