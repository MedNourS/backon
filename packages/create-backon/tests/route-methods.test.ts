import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addMethod } from "../src/add-method";
import { addRoute } from "../src/add-route";
import { generateProject } from "../src/generate";
import { formatEndpointsDashboard, listEndpointsWithMethods, parseRouteMethods } from "../src/route-methods";

const cleanupDirs: string[] = [];

afterEach(async () => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "create-backon-route-methods-test-"));
  cleanupDirs.push(dir);
  return dir;
}

// Strips ANSI color codes so dashboard assertions can check plain text.
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("parseRouteMethods", () => {
  it("extracts verb/path/name from generated mount lines", () => {
    const contents = `import { Hono, type Env } from "@mednours/backon";
import * as controller from "./users.controller";

export const usersRoutes = new Hono<Env>();

usersRoutes.get("/", controller.list);
usersRoutes.post("/", controller.create);
usersRoutes.delete("/:id", controller.remove);
`;
    expect(parseRouteMethods(contents)).toEqual([
      { verb: "get", path: "/", name: "list" },
      { verb: "post", path: "/", name: "create" },
      { verb: "delete", path: "/:id", name: "remove" },
    ]);
  });

  it("returns nothing for a blank routes file", () => {
    expect(parseRouteMethods("export const usersRoutes = new Hono();\n")).toEqual([]);
  });
});

describe("listEndpointsWithMethods / formatEndpointsDashboard", () => {
  it("reflects what's actually mounted and wired on disk", async () => {
    const cwd = await makeTmpDir();
    const { root } = await generateProject(
      { projectName: ".", framework: "hono", language: "typescript", db: "none", routes: [], copyEnv: false },
      cwd
    );
    await addRoute("users", root);
    await addRoute("books", root);
    await addMethod("users", { verb: "get", path: "/", name: "list", needsBody: false, needsQuery: false }, root);
    await addMethod("users", { verb: "post", path: "/", name: "create", needsBody: true, needsQuery: false }, root);

    const summaries = await listEndpointsWithMethods(root);
    expect(summaries).toEqual([
      { route: "users", methods: [{ verb: "get", path: "/", name: "list" }, { verb: "post", path: "/", name: "create" }] },
      { route: "books", methods: [] },
    ]);

    const dashboard = stripAnsi(formatEndpointsDashboard(summaries));
    expect(dashboard).toContain("users");
    expect(dashboard).toContain("GET");
    expect(dashboard).toContain("→ list");
    expect(dashboard).toContain("POST");
    expect(dashboard).toContain("→ create");
    expect(dashboard).toContain("books");
    expect(dashboard).toContain("(no methods yet)");
  });

  it("shows a plain message with no endpoints at all", () => {
    expect(stripAnsi(formatEndpointsDashboard([]))).toContain("No endpoints yet");
  });
});
