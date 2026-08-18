import { addMethod } from "./add-method";
import { listEndpointsWithMethods } from "./route-methods";
import type { MethodSpec } from "./templates/route";

/**
 * The standard REST five — list/create/getById/update/remove — named to
 * match exactly what `add-method`'s own name-suggestion logic
 * (suggestMethodName in cli.ts) already produces for GET /, POST /,
 * GET /:id, PUT /:id, DELETE /:id. Not a new convention, just all five of
 * an existing one applied at once instead of one at a time.
 */
export const CRUD_METHOD_SPECS: readonly MethodSpec[] = [
  { verb: "get", path: "/", name: "list", needsBody: false, needsQuery: false },
  { verb: "post", path: "/", name: "create", needsBody: true, needsQuery: false },
  { verb: "get", path: "/:id", name: "getById", needsBody: false, needsQuery: false },
  { verb: "put", path: "/:id", name: "update", needsBody: true, needsQuery: false },
  { verb: "delete", path: "/:id", name: "remove", needsBody: false, needsQuery: false },
];

export interface AddCrudMethodsResult {
  route: string;
  /** Method names actually written. */
  added: string[];
  /** Method names skipped because the endpoint already had a same-name method, or something already mounted at that verb+path. */
  skipped: string[];
}

/**
 * Adds the standard CRUD_METHOD_SPECS set to an already-mounted endpoint,
 * via addMethod() — the exact same codegen a manual `add-method` run
 * produces, just five calls run in sequence instead of one at a time.
 * Sequential on purpose: addMethod() reads all three of an endpoint's files
 * fresh off disk on every call, so firing five in parallel at the same
 * endpoint would have them race on stale reads and clobber each other.
 *
 * Any of the five that would collide with a method the endpoint already has
 * (same name, or the same verb+path already mounted) is skipped rather than
 * failing the whole batch — this makes it safe to run on an endpoint that
 * already has some hand-added methods, e.g. re-running it after removing
 * just "remove" to get the other four without erroring on the four that are
 * already there.
 */
export async function addCrudMethods(route: string, cwd: string = process.cwd()): Promise<AddCrudMethodsResult> {
  const summaries = await listEndpointsWithMethods(cwd);
  const existing = [...(summaries.find((s) => s.route === route)?.methods ?? [])];

  const added: string[] = [];
  const skipped: string[] = [];

  for (const spec of CRUD_METHOD_SPECS) {
    const collides = existing.some((m) => m.name === spec.name || (m.verb === spec.verb && m.path === spec.path));
    if (collides) {
      skipped.push(spec.name);
      continue;
    }
    await addMethod(route, spec, cwd);
    added.push(spec.name);
    existing.push({ verb: spec.verb, path: spec.path, name: spec.name });
  }

  return { route, added, skipped };
}
