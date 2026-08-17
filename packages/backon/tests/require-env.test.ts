import { describe, expect, it, afterEach } from "bun:test";
import { z } from "zod";
import { requireEnv } from "../src/require-env";

const ENV_KEYS = ["TEST_REQUIRED_URL", "TEST_OPTIONAL_PORT"];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("requireEnv", () => {
  it("returns the parsed, typed env when validation passes", () => {
    process.env.TEST_REQUIRED_URL = "https://example.com";

    const env = requireEnv(
      z.object({
        TEST_REQUIRED_URL: z.string().url(),
        TEST_OPTIONAL_PORT: z.coerce.number().default(3000),
      })
    );

    expect(env.TEST_REQUIRED_URL).toBe("https://example.com");
    expect(env.TEST_OPTIONAL_PORT).toBe(3000);
  });

  it("applies a value that was actually set instead of the default", () => {
    process.env.TEST_REQUIRED_URL = "https://example.com";
    process.env.TEST_OPTIONAL_PORT = "8080";

    const env = requireEnv(
      z.object({
        TEST_REQUIRED_URL: z.string().url(),
        TEST_OPTIONAL_PORT: z.coerce.number().default(3000),
      })
    );

    expect(env.TEST_OPTIONAL_PORT).toBe(8080);
  });

  it("throws a single error naming every missing/invalid var, instead of booting cleanly", () => {
    // TEST_REQUIRED_URL deliberately left unset.
    let thrown: Error | undefined;
    try {
      requireEnv(z.object({ TEST_REQUIRED_URL: z.string().url() }));
    } catch (err) {
      thrown = err as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toContain("TEST_REQUIRED_URL");
  });
});
