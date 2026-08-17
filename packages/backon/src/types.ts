import type { Context } from "hono";

/**
 * Hono's own generics for per-request state (c.get/c.set). Extend this as
 * createApp() grows more built-in middleware that stashes request-scoped
 * data.
 */
export interface Env {
  Variables: {
    requestId: string;
  };
}

/**
 * BackonContext is, for now, a direct alias of Hono's own Context. That's a
 * deliberate choice, not an oversight: the real framework-agnostic boundary
 * (the seam that would let an Express adapter produce the same shape) only
 * gets designed once that adapter is actually being built. Guessing at that
 * abstraction now, before a second implementation exists to validate it
 * against, is how you end up rebuilding it anyway. Until then, this alias
 * exists so call sites already say `BackonContext` instead of `Context`,
 * which is the only part that needs to stay stable.
 */
export type BackonContext = Context<Env>;
