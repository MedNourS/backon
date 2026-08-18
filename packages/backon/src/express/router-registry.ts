/**
 * Backs generateOpenApiSpec() on the Express adapter. Express's own router
 * tree (app._router.stack) is undocumented, version-specific, and awkward
 * to walk correctly through nested Router() mounts — reconstructing a
 * mount's full path from its compiled matching regexp is lossy in general.
 * Rather than reflect into that, backon's own Router() (exported from
 * @mednours/backon/express instead of express directly) and createApp()'s
 * returned app both get instrumented here: every get/post/put/patch/delete
 * call records its own path, method, and schema (if any); every use(prefix,
 * subRouter) call records the mount so the full path can be composed by
 * simple string concatenation, not regexp decoding.
 */

export type MountEntry =
  | { type: "route"; method: string; path: string; schema?: unknown }
  | { type: "mount"; prefix: string; target: TrackedRouter };

export interface TrackedRouter {
  __backonEntries: MountEntry[];
}

const TRACKED_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

function isTracked(value: unknown): value is TrackedRouter {
  // An Express app or Router() instance is itself a callable function, not
  // a plain object — `typeof` on either is "function", so both need
  // accepting here, not just "object".
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  return Array.isArray((value as TrackedRouter).__backonEntries);
}

/** Wraps get/post/put/patch/delete/use on an Express app or Router, delegating to the real method in every case. */
export function trackRoutes<T extends object>(target: T): T & TrackedRouter {
  if (isTracked(target)) return target;

  const tracked = target as T & TrackedRouter;
  tracked.__backonEntries = [];

  for (const method of TRACKED_METHODS) {
    const original = (tracked as Record<string, unknown>)[method];
    if (typeof original !== "function") continue;
    const boundOriginal = original.bind(tracked);
    (tracked as Record<string, unknown>)[method] = (path: unknown, ...handlers: unknown[]) => {
      // Express overloads .get() specifically: called with a single
      // argument, it's a settings getter (`app.get('query parser fn')`),
      // not a route — Express's own lazy router init calls it that way
      // internally. Only handlers.length > 0 is ever a real registration.
      if (typeof path === "string" && handlers.length > 0) {
        const last = handlers[handlers.length - 1] as { __backonRouteSchema?: unknown } | undefined;
        tracked.__backonEntries.push({ type: "route", method, path, schema: last?.__backonRouteSchema });
      }
      return boundOriginal(path, ...handlers);
    };
  }

  const originalUse = (tracked as Record<string, unknown>).use;
  if (typeof originalUse === "function") {
    const boundUse = originalUse.bind(tracked);
    (tracked as Record<string, unknown>).use = (...args: unknown[]) => {
      if (typeof args[0] === "string" && isTracked(args[1])) {
        tracked.__backonEntries.push({ type: "mount", prefix: args[0], target: args[1] });
      }
      return boundUse(...args);
    };
  }

  return tracked;
}

function joinPaths(prefix: string, path: string): string {
  const joined = `${prefix.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  return joined.replace(/\/+$/, "") || "/";
}

/** Recursively resolves every tracked route to its full path, following mount entries down through nested routers. */
export function collectRoutes(
  root: TrackedRouter,
  prefix = ""
): Array<{ method: string; path: string; schema?: unknown }> {
  const results: Array<{ method: string; path: string; schema?: unknown }> = [];
  for (const entry of root.__backonEntries) {
    if (entry.type === "route") {
      results.push({ method: entry.method, path: joinPaths(prefix, entry.path), schema: entry.schema });
    } else {
      results.push(...collectRoutes(entry.target, joinPaths(prefix, entry.prefix)));
    }
  }
  return results;
}
