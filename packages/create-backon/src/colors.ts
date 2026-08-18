import type { HttpVerb } from "./templates/route";

// Standard REST-tooling convention (Scalar, Postman, Insomnia all agree on
// roughly this mapping) — GET blue/cyan, POST green, PUT/PATCH amber,
// DELETE red. Plain ANSI codes rather than a new dependency: create-backon
// only depends on @clack/prompts today, and this is five lines.
const VERB_CODES: Record<HttpVerb, string> = {
  get: "36",
  post: "32",
  put: "33",
  patch: "35",
  delete: "31",
};

const RESET = "\x1b[0m";

export function colorVerb(verb: HttpVerb): string {
  const label = verb.toUpperCase().padEnd(6);
  const code = VERB_CODES[verb];
  return code ? `\x1b[${code}m${label}${RESET}` : label;
}

export function dim(text: string): string {
  return `\x1b[2m${text}${RESET}`;
}

/** Green — a status line that's actually fine (a DB driver with everything it needs, a clean doctor run). */
export function ok(text: string): string {
  return `\x1b[32m${text}${RESET}`;
}

/** Amber — a status line that needs attention, but isn't a hard failure. */
export function warn(text: string): string {
  return `\x1b[33m${text}${RESET}`;
}
