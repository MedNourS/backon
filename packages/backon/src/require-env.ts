import type { ZodType } from "zod";

/**
 * Validates process.env against a Zod schema once, at startup, and returns
 * the parsed result. Fails fast with every missing/invalid var named in one
 * error, instead of the app booting cleanly and only crashing later on
 * whichever request happens to be the first to touch a var nobody set.
 *
 * Usage, typically in src/config/env.ts:
 *
 *   import { z } from "zod";
 *   import { requireEnv } from "@mednours/backon";
 *
 *   export const env = requireEnv(z.object({
 *     DATABASE_URL: z.string().url(),
 *     PORT: z.coerce.number().default(3000),
 *   }));
 *
 * `env.DATABASE_URL` is then typed as `string`, not `string | undefined` —
 * everywhere else in the app can trust it's actually there.
 */
export function requireEnv<T>(schema: ZodType<T>): T {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
