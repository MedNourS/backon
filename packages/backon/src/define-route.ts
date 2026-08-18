import type { ZodType } from "zod";
import { AppError } from "./error";
import type { BackonContext } from "./types";

/** Zod schemas for the parts of a request worth validating. All optional — skip whatever isn't needed. */
export interface RouteSchema<B = undefined, Q = undefined, P = undefined> {
  body?: ZodType<B>;
  query?: ZodType<Q>;
  params?: ZodType<P>;
}

export interface RouteData<B, Q, P> {
  body: B;
  query: Q;
  params: P;
}

export type RouteHandler<B, Q, P> = (
  c: BackonContext,
  data: RouteData<B, Q, P>
) => Response | Promise<Response>;

/** A defineRoute()-wrapped handler, carrying its own schema for generateOpenApiSpec() to read back later. */
export interface RouteHandlerFn {
  (c: BackonContext): Promise<Response>;
  __backonRouteSchema?: RouteSchema<unknown, unknown, unknown>;
}

/**
 * Wraps a handler with request validation against zod schemas. On failure,
 * throws AppError(400, ...) with the zod error attached as `details` —
 * createApp()'s error handler turns that into the standard error JSON shape,
 * so individual routes never write their own "if invalid, return 400" code.
 *
 * The schema is also attached to the returned function as
 * `__backonRouteSchema`, purely for generateOpenApiSpec() to read back —
 * nothing about validation depends on it.
 *
 * Usage in a *.controller.ts file:
 *
 *   const getTelemetry = defineRoute(
 *     { query: z.object({ deviceId: z.string() }) },
 *     async (c, { query }) => c.json({ deviceId: query.deviceId })
 *   );
 */
export function defineRoute<B = undefined, Q = undefined, P = undefined>(
  schema: RouteSchema<B, Q, P>,
  handler: RouteHandler<B, Q, P>
): RouteHandlerFn {
  const wrapped: RouteHandlerFn = async (c: BackonContext): Promise<Response> => {
    let body = undefined as B;
    let query = undefined as Q;
    let params = undefined as P;

    if (schema.body) {
      const raw = await c.req.json().catch(() => ({}));
      const parsed = schema.body.safeParse(raw);
      if (!parsed.success) {
        throw new AppError(400, "invalid_body", "Request body failed validation", parsed.error.flatten());
      }
      body = parsed.data;
    }

    if (schema.query) {
      const raw = c.req.query();
      const parsed = schema.query.safeParse(raw);
      if (!parsed.success) {
        throw new AppError(400, "invalid_query", "Query params failed validation", parsed.error.flatten());
      }
      query = parsed.data;
    }

    if (schema.params) {
      const raw = c.req.param();
      const parsed = schema.params.safeParse(raw);
      if (!parsed.success) {
        throw new AppError(400, "invalid_params", "Route params failed validation", parsed.error.flatten());
      }
      params = parsed.data;
    }

    return handler(c, { body, query, params });
  };
  wrapped.__backonRouteSchema = schema as RouteSchema<unknown, unknown, unknown>;
  return wrapped;
}
