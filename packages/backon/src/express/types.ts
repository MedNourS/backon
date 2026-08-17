import type { Request, Response } from "express";

/**
 * The Express-flavored BackonContext. Same names as the Hono-flavored one
 * (json/text/header/get/set) so a handler written against either reads the
 * same way, but the two are genuinely different types from two different
 * subpath exports (`backon` vs `backon/express`) — there's no shared
 * interface forcing them into one shape. That's a deliberate choice: the
 * only surface that needs to match is what handlers actually use day to
 * day (send a JSON/text response, set a header, read/write a request-scoped
 * variable). Anything past that — streaming, cookies, file uploads,
 * redirects — behaves differently enough between the two engines that
 * pretending otherwise would just move the leak somewhere less visible.
 * Use `.raw` to drop down to the real Express req/res for those cases.
 */
export interface BackonContext {
  req: {
    method: string;
    path: string;
    header(name: string): string | undefined;
  };
  json(data: unknown, status?: number): Response;
  text(data: string, status?: number): Response;
  header(name: string, value: string): void;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  /** Escape hatch to the real Express request/response. */
  raw: { req: Request; res: Response };
}

export function createContext(req: Request, res: Response): BackonContext {
  return {
    req: {
      method: req.method,
      path: req.path,
      header: (name) => req.header(name),
    },
    json: (data, status) => res.status(status ?? 200).json(data),
    text: (data, status) => res.status(status ?? 200).type("text/plain").send(data),
    header: (name, value) => {
      res.setHeader(name, value);
    },
    get: (key) => res.locals[key],
    set: (key, value) => {
      res.locals[key] = value;
    },
    raw: { req, res },
  };
}
