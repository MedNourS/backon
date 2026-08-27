import type { Answers, DeployTarget, Framework, Language } from "../prompts";
import { camelCase } from "./route";
import { dbDependencies, dbDevDependencies, dbEnvVars, dbHasSchemaSupport, dbReadmeNote, dbTypeOnlyDevDependencies } from "./db";

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

  // Vercel's zero-config Hono/Express builder doesn't just need a default
  // export in the right file — it statically scans app.<ext>/index.<ext>/
  // server.<ext> for a literal `import ... from "hono"` (or "express") and
  // refuses to build without one ("Error: No entrypoint found which imports
  // hono", confirmed against a real failed build). createApp() wraps that
  // import inside @mednours/backon, so without this the scan finds nothing
  // no matter how correct the app itself is — this line exists only to be
  // found, nothing here calls it. Not needed (and left out) for any
  // non-vercel deployTarget.
  const detectionImport =
    deployTarget === "vercel"
      ? framework === "express"
        ? `// Vercel's build scans for this import to detect an Express app — see vercel.json.
import "express";
`
        : `// Vercel's build scans for this import to detect a Hono app — see vercel.json.
import "hono";
`
      : "";

  if (framework === "express") {
    return `${detectionImport}import { createApp, serveApiDocs } from "@mednours/backon/express";
import { endpoints } from "./endpoints";
import { exampleMiddleware } from "./middleware/example.middleware";

export const app = createApp();

app.use(exampleMiddleware);
app.use("/", endpoints);

serveApiDocs(app, "/docs", { title: "${projectName}" });
${defaultExport}`;
  }
  return `${detectionImport}import { createApp, serveApiDocs } from "@mednours/backon";
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
// runtime as local dev.
//
// `framework` explicitly pins Vercel's Framework Preset to "hono"/"express"
// (both valid slugs — checked against openapi.vercel.sh/vercel.json's own
// schema, not guessed) instead of leaving it to auto-detection. This is not
// optional: a real deployed project — src/app.ts importing createApp() from
// @mednours/backon, never `hono` directly — was confirmed live to fail
// Vercel's zero-config Hono auto-detect. It fell back to Project Settings
// showing Framework Preset "Other" and serving src/index.ts as a raw static
// file (content-type video/mp2t, the .ts-extension misdetection) instead of
// running it as a function — a real request against the deployed URL
// returned the literal unexecuted source of index.ts, not a response from
// the app. Because backon's whole point is wrapping `new Hono()`/
// `express()` behind createApp(), no entry file this CLI generates will ever
// contain a literal top-level `from "hono"`/`from "express"` import for a
// content-sniffing detector to find — so auto-detection can't be relied on
// for any backon-based project, and this override is the fix, not a
// workaround for one broken app.
export function renderVercelJson(framework: Framework): string {
  return `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "${framework}",
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

// Deliberately NOT built around importing src/app the way
// renderGenerateDocsScript() is — a client only needs to know verb/path/name
// per method and which of its body/query schemas exist, and all of that is
// already sitting in *.routes.<ext>/*.controller.<ext> as plain text (the
// exact same two facts route-methods.ts's parseRouteMethods()/
// detectMethodValidation() read off disk inside create-backon itself, just
// duplicated here in ~20 lines since a generated script can't import
// create-backon at runtime). No live app instance needed, so this can't fail
// because app.ts throws on a missing env var the way importing it would.
//
// The generated script re-discovers routes fresh every time it runs rather
// than being regenerated by add-route/add-method/remove-method — it reads
// src/endpoints/ at *run* time, so it never goes stale on its own; only
// client/api.<ext> (its output) needs a re-run after routes change, the
// same way `bun run docs` needs a re-run, not a re-scaffold.
//
// The generated output deliberately uses string concatenation (`+`) instead
// of template literals for building URLs — keeps this template's own
// authoring simple (no nested-backtick escaping between this file's
// template literal and the one it's generating) at the cost of slightly
// less idiomatic output code, a trade worth making for a script nobody is
// meant to hand-edit anyway (see the "auto-generated" header it writes).
export function renderGenerateClientScript(language: Language): string {
  const ext = language === "javascript" ? "js" : "ts";
  const typed = language === "javascript" ? "false" : "true";
  // Annotates this script's OWN helper function parameters when it's being
  // written as a .ts file — under the generated tsconfig's `strict: true`,
  // an untyped parameter is a noImplicitAny error, unlike generate-docs.ts
  // (which has no locally-defined functions to trigger it). Distinct from
  // TYPED above, which is about the *output* client's type annotations —
  // both happen to be driven by the same `language`, but conceptually one
  // is "is this script valid strict TS" and the other is "does the file it
  // writes have types".
  const ann = (t: string) => (language === "javascript" ? "" : `: ${t}`);

  return `// Regenerates client/api.${ext} from src/endpoints/ — reads *.routes.${ext}/*.controller.${ext}
// directly, the same source add-method/remove-method/server-config write to, so there's
// nothing to keep in sync by hand. Safe to re-run any time; nothing here needs updating
// when a route or method is added, removed, or modified — only its output does.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const EXT = "${ext}";
const TYPED = ${typed};

const root = process.cwd();
const endpointsDir = join(root, "src/endpoints");

const MOUNT_PATTERN = /endpoints\\.(?:route|use)\\("\\/([a-z0-9-]+)"/g;
const METHOD_PATTERN = /\\.(get|post|put|patch|delete)\\(\\s*"([^"]*)"\\s*,\\s*controller\\.(\\w+)\\s*\\)/g;

function paramNames(path${ann("string")}) {
  return Array.from(path.matchAll(/:([A-Za-z0-9_]+)/g)).map((m) => m[1]);
}

function camelCase(name${ann("string")}) {
  const parts = name.split("-");
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

// Builds a JS expression string for the full request path — literal
// segments as JSON string literals, :param segments as bare identifiers,
// joined with "+" — e.g. "/users/:id" becomes the text: "/users/" + id
function pathExpr(route${ann("string")}, method${ann("any")}) {
  const fullPath = "/" + route + (method.path === "/" ? "" : method.path);
  const pieces = [];
  let lastIndex = 0;
  const paramRe = /:([A-Za-z0-9_]+)/g;
  let match;
  while ((match = paramRe.exec(fullPath))) {
    if (match.index > lastIndex) pieces.push(JSON.stringify(fullPath.slice(lastIndex, match.index)));
    pieces.push(match[1]);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < fullPath.length) pieces.push(JSON.stringify(fullPath.slice(lastIndex)));
  return pieces.join(" + ");
}

function funcArgs(method${ann("any")}) {
  const args = paramNames(method.path).slice();
  if (method.needsBody) args.push("body");
  if (method.needsQuery) args.push("query");
  return args;
}

function typedFuncArgs(method${ann("any")}) {
  const parts = paramNames(method.path).map((name) => name + ": string");
  if (method.needsBody) parts.push("body: z.infer<typeof " + method.name + "BodySchema>");
  if (method.needsQuery) parts.push("query: z.infer<typeof " + method.name + "QuerySchema>");
  return parts.join(", ");
}

const indexContents = readFileSync(join(endpointsDir, "index." + EXT), "utf-8");
const routes = Array.from(indexContents.matchAll(MOUNT_PATTERN)).map((m) => m[1]);

const groups = [];
for (const route of routes) {
  let routesContents, controllerContents;
  try {
    routesContents = readFileSync(join(endpointsDir, route, route + ".routes." + EXT), "utf-8");
    controllerContents = readFileSync(join(endpointsDir, route, route + ".controller." + EXT), "utf-8");
  } catch {
    continue; // mounted but missing a file — \`bun run doctor\` already flags this, skip it here
  }

  const methods = Array.from(routesContents.matchAll(METHOD_PATTERN)).map((m) => ({
    verb: m[1],
    path: m[2],
    name: m[3],
    needsBody: controllerContents.includes(m[3] + "BodySchema"),
    needsQuery: controllerContents.includes(m[3] + "QuerySchema"),
  }));
  if (methods.length > 0) groups.push({ route, methods });
}

if (groups.length === 0) {
  console.log("No endpoints with methods yet — nothing to generate. Run \`bun run add-method\` first.");
  process.exit(0);
}

const importLines = [];
if (TYPED) {
  importLines.push('import type { z } from "zod";');
  const namesByModule = new Map();
  for (const group of groups) {
    const names = [];
    for (const m of group.methods) {
      if (m.needsBody) names.push(m.name + "BodySchema");
      if (m.needsQuery) names.push(m.name + "QuerySchema");
    }
    if (names.length > 0) namesByModule.set("../src/endpoints/" + group.route + "/" + group.route + ".controller", names);
  }
  for (const [modulePath, names] of namesByModule) {
    importLines.push('import type { ' + names.join(", ") + ' } from "' + modulePath + '";');
  }
}

const helperLines = [
  'const BASE_URL = (typeof process !== "undefined" && process.env.API_BASE_URL) || "";',
  "",
  TYPED ? "async function request<T>(path: string, init?: RequestInit): Promise<T> {" : "async function request(path, init) {",
  "  const res = await fetch(BASE_URL + path, {",
  "    ...init,",
  '    headers: { "Content-Type": "application/json", ...(init && init.headers ? init.headers : {}) },',
  "  });",
  "  if (!res.ok) {",
  TYPED ? "    const errBody: any = await res.json().catch(() => undefined);" : "    const errBody = await res.json().catch(() => undefined);",
  '    throw new Error((errBody && errBody.error && errBody.error.message) || ("Request to " + path + " failed with " + res.status));',
  "  }",
  TYPED ? "  return res.json() as Promise<T>;" : "  return res.json();",
  "}",
];

const groupBlocks = groups.map((group) => {
  const varName = camelCase(group.route) + "Api";
  const methodLines = group.methods.map((m) => {
    const signature = TYPED ? typedFuncArgs(m) : funcArgs(m).join(", ");
    const genericPrefix = TYPED ? "<T = unknown>" : "";

    let call = "request" + (TYPED ? "<T>" : "") + "(" + pathExpr(group.route, m);
    if (m.needsQuery) call += ' + "?" + new URLSearchParams(query' + (TYPED ? " as any" : "") + ").toString()";

    const initParts = [];
    if (m.verb !== "get") initParts.push('method: "' + m.verb.toUpperCase() + '"');
    if (m.needsBody) initParts.push("body: JSON.stringify(body)");
    if (initParts.length > 0) call += ", { " + initParts.join(", ") + " }";
    call += ")";

    return "  " + m.name + ": " + genericPrefix + "(" + signature + ") => " + call + ",";
  });
  return "export const " + varName + " = {\\n" + methodLines.join("\\n") + "\\n};";
});

const header =
  "// Auto-generated by \`bun run generate-client\` from src/endpoints/ — re-run after adding, removing,\\n" +
  "// or modifying methods (add-method/remove-method/server-config all count). Hand edits here are\\n" +
  "// overwritten on the next run.\\n\\n";

const output =
  header +
  (importLines.length > 0 ? importLines.join("\\n") + "\\n\\n" : "") +
  helperLines.join("\\n") +
  "\\n\\n" +
  groupBlocks.join("\\n\\n") +
  "\\n";

mkdirSync(join(root, "client"), { recursive: true });
const outPath = join(root, "client", "api." + EXT);
writeFileSync(outPath, output);
console.log(
  "Wrote " + outPath + " (" + groups.reduce((n, g) => n + g.methods.length, 0) + " method(s) across " + groups.length + " endpoint(s))"
);
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
  "include": ["index.ts", "src", "scripts", "client"]
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
  "include": ["index.js", "src", "scripts", "client"]
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
  // typechecked, so pulling those in would just be dead weight. drizzle-kit
  // is a CLI tool driven by schema.ts's shape, not by language, so it's
  // merged in either way via dbDevDependencies(db).
  const devDependencies: Record<string, string> =
    language === "javascript"
      ? { ...dbDevDependencies(db) }
      : framework === "express"
        ? {
            "@types/bun": "latest",
            "@types/express": "^4.17.21",
            typescript: "^5.7.2",
            ...dbDevDependencies(db),
            ...dbTypeOnlyDevDependencies(db),
          }
        : {
            "@types/bun": "latest",
            typescript: "^5.7.2",
            ...dbDevDependencies(db),
            ...dbTypeOnlyDevDependencies(db),
          };

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
    // Regenerates client/api.<ext> — a typed fetch client, one function per
    // mounted method, read straight off *.routes.<ext>/*.controller.<ext>
    // (the same files add-method/server-config write). client/ is a build
    // artifact like openapi.json/docs.html, not source — see .gitignore.
    "generate-client": `bun run scripts/generate-client.${ext}`,
  };
  if (language === "typescript") {
    scripts.typecheck = "tsc --noEmit";
  }
  if (dbHasSchemaSupport(db)) {
    // add-table/remove-table: thin aliases matching the add-route/add-method
    // pattern above. db:generate/db:migrate/db:push call drizzle-kit
    // directly (not create-backon) — schema.ts is a real drizzle-kit
    // config target, no wrapper needed.
    scripts["add-table"] = "bunx create-backon add-table";
    scripts["remove-table"] = "bunx create-backon remove-table";
    scripts["db:generate"] = "drizzle-kit generate";
    scripts["db:migrate"] = "drizzle-kit migrate";
    scripts["db:push"] = "drizzle-kit push";
  }

  const pkg = {
    name: projectName,
    version: "0.1.0",
    private: true,
    type: "module",
    // Node's package.json subpath imports (Bun resolves these too, both
    // locally and on Vercel's Bun runtime — no bundler-specific config
    // needed, unlike a tsconfig "paths" alias). Lets any file import the db
    // client as `import { db } from "#config/db"` regardless of how deep
    // it's nested under src/endpoints/, instead of a depth-counted
    // `../../config/db`. Verified against a real `bun run` and a real
    // `tsc --noEmit` (moduleResolution: "bundler" already resolves it).
    imports: {
      "#config/*": `./src/config/*.${ext}`,
    },
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
before). \`vercel.json\` pins the Bun runtime so the deployed function matches
local dev, and explicitly sets \`"framework"\` to \`"hono"\`/\`"express"\` — not
just cosmetic: Vercel's auto-detection for this looks for a file that
imports \`hono\`/\`express\` directly, which nothing generated here ever does
(everything goes through \`createApp()\` from \`@mednours/backon\` instead), so
without this pin Vercel falls back to Framework Preset "Other" and serves
\`index.${ext}\`'s raw source as a static file instead of running your app.
Connect the repo on [vercel.com/new](https://vercel.com/new) or run
\`vercel deploy\` — no other configuration needed. \`vercel dev\` runs it
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

function renderSchemaReadmeSection(ext: string): string {
  return `
### Table schema

\`src/config/schema.${ext}\` holds every table (empty until you add one — see below). \`bun run
add-table\`/\`bun run remove-table\` (also reachable from \`server-config\`'s menu) edit it for you —
picking a column type, nullability, uniqueness, a default, and whether it references another
table's \`id\`. This only ever edits \`schema.${ext}\` on disk; it never touches the actual database.

To apply a schema change for real:

\`\`\`
bun run db:generate   # writes a reviewable .sql migration under drizzle/ — no DB connection needed
bun run db:migrate    # applies pending migrations to DATABASE_URL
\`\`\`

\`bun run db:push\` applies \`schema.${ext}\` straight to the database with no migration file — faster
to iterate with early on (empty/throwaway dev database), but skips the reviewable, versioned trail
\`generate\`/\`migrate\` gives you. Switch to \`generate\`/\`migrate\` once there's real data, or before
deploying anywhere with staging/prod.
`;
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

Import the client from anywhere as \`import { db } from "#config/db";\` — a package.json subpath
import (\`imports\`), not a relative path, so it stays \`#config/db\` no matter how deeply nested the
importing file is under \`src/endpoints/\`. Bun resolves it the same way locally and on Vercel;
\`tsc --noEmit\` resolves it too, no extra tsconfig needed.
${dbHasSchemaSupport(answers.db) ? renderSchemaReadmeSection(ext) : ""}
## Routes

${routeList}

Each route folder follows the same shape: \`*.routes.${answers.language === "javascript" ? "js" : "ts"}\` wires HTTP
methods to controller functions, \`*.controller.${answers.language === "javascript" ? "js" : "ts"}\` validates the
request (via \`defineRoute\` from \`${backonImport}\`) and calls into
\`*.services.${answers.language === "javascript" ? "js" : "ts"}\`, which is where real data access belongs.

${renderDeploySection(answers.deployTarget, ext)}`;
}
