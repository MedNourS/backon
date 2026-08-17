import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { AppError } from "../error";
import { createContext, type BackonContext } from "./types";

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

/**
 * Unlike the Hono version, an Express handler doesn't return a Response —
 * it sends one as a side effect via ctx.json()/ctx.text() (which call
 * res.json()/res.send() under the hood) and the return value is ignored.
 * Handler bodies still read the same either way — `(c, { body }) =>
 * c.json({...})` — because ctx.json() does the right thing for whichever
 * engine is underneath, even though what "the right thing" means differs.
 */
export type RouteHandler<B, Q, P> = (
  c: BackonContext,
  data: RouteData<B, Q, P>
) => unknown | Promise<unknown>;

/**
 * Same contract as the Hono defineRoute: validates body/query/params
 * against zod schemas and throws AppError(400, ...) on failure. Requires
 * createApp()'s express.json() middleware to have already run so
 * req.body is parsed — see create-app.ts.
 */
export function defineRoute<B = undefined, Q = undefined, P = undefined>(
  schema: RouteSchema<B, Q, P>,
  handler: RouteHandler<B, Q, P>
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let body = undefined as B;
      let query = undefined as Q;
      let params = undefined as P;

      if (schema.body) {
        const parsed = schema.body.safeParse(req.body ?? {});
        if (!parsed.success) {
          throw new AppError(400, "invalid_body", "Request body failed validation", parsed.error.flatten());
        }
        body = parsed.data;
      }

      if (schema.query) {
        const parsed = schema.query.safeParse(req.query);
        if (!parsed.success) {
          throw new AppError(400, "invalid_query", "Query params failed validation", parsed.error.flatten());
        }
        query = parsed.data;
      }

      if (schema.params) {
        const parsed = schema.params.safeParse(req.params);
        if (!parsed.success) {
          throw new AppError(400, "invalid_params", "Route params failed validation", parsed.error.flatten());
        }
        params = parsed.data;
      }

      const ctx = createContext(req, res);
      await handler(ctx, { body, query, params });
    } catch (err) {
      next(err);
    }
  };
}
