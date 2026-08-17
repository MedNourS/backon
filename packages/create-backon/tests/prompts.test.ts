import { describe, expect, it, beforeEach, spyOn, mock } from "bun:test";

// runPrompts() drives @clack/prompts' text()/select() interactively — this
// mocks that module so the test controls exactly what "was typed" at each
// prompt, in call order, without touching real stdin. mock.module() has to
// run before prompts.ts is imported anywhere, so the import below is
// dynamic and happens after the mock is registered.
const CANCEL = Symbol("cancel");
let textQueue: unknown[] = [];
let selectQueue: unknown[] = [];

mock.module("@clack/prompts", () => ({
  intro: () => {},
  outro: () => {},
  cancel: () => {},
  log: { step: () => {} },
  isCancel: (value: unknown) => value === CANCEL,
  text: async () => textQueue.shift(),
  select: async () => selectQueue.shift(),
}));

const { runPrompts } = await import("../src/prompts");

beforeEach(() => {
  textQueue = [];
  selectQueue = [];
});

describe("runPrompts", () => {
  it("collects project name, framework, db, and a single route", async () => {
    textQueue = ["my-api", "telemetry", ""]; // project name, first route, blank to finish
    selectQueue = ["hono", "neon"]; // framework, db

    const answers = await runPrompts();

    expect(answers).toEqual({
      projectName: "my-api",
      framework: "hono",
      db: "neon",
      routes: ["telemetry"],
    });
  });

  it("kebab-cases a route name typed in another case", async () => {
    textQueue = ["my-api", "UserProfile", ""];
    selectQueue = ["express", "none"];

    const answers = await runPrompts();

    expect(answers.framework).toBe("express");
    expect(answers.routes).toEqual(["user-profile"]);
  });

  it("collects multiple routes until a blank entry ends the loop", async () => {
    textQueue = ["my-api", "telemetry", "users", ""];
    selectQueue = ["hono", "sqlite"];

    const answers = await runPrompts();

    expect(answers.routes).toEqual(["telemetry", "users"]);
  });

  it("returns no routes when the very first route prompt is left blank", async () => {
    textQueue = ["my-api", ""];
    selectQueue = ["hono", "postgres"];

    const answers = await runPrompts();

    expect(answers.routes).toEqual([]);
    expect(answers.db).toBe("postgres");
  });

  it("exits without returning when a prompt is cancelled", async () => {
    const exitSpy = spyOn(process, "exit").mockImplementation(((() => {
      throw new Error("process.exit called");
    }) as unknown) as (code?: number) => never);

    textQueue = [CANCEL]; // project name prompt itself is cancelled
    selectQueue = [];

    await expect(runPrompts()).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalled();

    exitSpy.mockRestore();
  });
});
