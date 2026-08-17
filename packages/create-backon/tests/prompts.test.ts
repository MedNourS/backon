import { describe, expect, it, beforeEach, spyOn, mock } from "bun:test";

// runPrompts() drives @clack/prompts' text()/select()/confirm() interactively
// — this mocks that module so the test controls exactly what "was typed" at
// each prompt, in call order, without touching real stdin. mock.module() has
// to run before prompts.ts is imported anywhere, so the import below is
// dynamic and happens after the mock is registered.
//
// Call order in prompts.ts: text(projectName), select(framework),
// select(language), select(db), confirm(copyEnv), then text() in a loop for
// routes.
const CANCEL = Symbol("cancel");
let textQueue: unknown[] = [];
let selectQueue: unknown[] = [];
let confirmQueue: unknown[] = [];

mock.module("@clack/prompts", () => ({
  intro: () => {},
  outro: () => {},
  cancel: () => {},
  log: { step: () => {} },
  isCancel: (value: unknown) => value === CANCEL,
  // Runs the real `validate` callback runPrompts() passed in, so these
  // tests actually exercise the validation logic (does "." pass? does
  // garbage still get rejected?) instead of just proving a queued value
  // flows through untouched.
  text: async (opts: { validate?: (value: unknown) => string | undefined }) => {
    const value = textQueue.shift();
    if (value !== CANCEL && opts?.validate) {
      const error = opts.validate(value);
      if (error) throw new Error(`validation rejected ${JSON.stringify(value)}: ${error}`);
    }
    return value;
  },
  select: async () => selectQueue.shift(),
  confirm: async () => confirmQueue.shift(),
}));

const { runPrompts } = await import("../src/prompts");

beforeEach(() => {
  textQueue = [];
  selectQueue = [];
  confirmQueue = [];
});

describe("runPrompts", () => {
  it("collects project name, framework, language, db, copyEnv, and a single route", async () => {
    textQueue = ["my-api", "telemetry", ""]; // project name, first route, blank to finish
    selectQueue = ["hono", "typescript", "neon"]; // framework, language, db
    confirmQueue = [true]; // copyEnv

    const answers = await runPrompts();

    expect(answers).toEqual({
      projectName: "my-api",
      framework: "hono",
      language: "typescript",
      db: "neon",
      routes: ["telemetry"],
      copyEnv: true,
    });
  });

  it("kebab-cases a route name typed in another case, and collects a javascript/express choice", async () => {
    textQueue = ["my-api", "UserProfile", ""];
    selectQueue = ["express", "javascript", "none"];
    confirmQueue = [false];

    const answers = await runPrompts();

    expect(answers.framework).toBe("express");
    expect(answers.language).toBe("javascript");
    expect(answers.routes).toEqual(["user-profile"]);
    expect(answers.copyEnv).toBe(false);
  });

  it("collects multiple routes until a blank entry ends the loop", async () => {
    textQueue = ["my-api", "telemetry", "users", ""];
    selectQueue = ["hono", "typescript", "sqlite"];
    confirmQueue = [true];

    const answers = await runPrompts();

    expect(answers.routes).toEqual(["telemetry", "users"]);
  });

  it("returns no routes when the very first route prompt is left blank", async () => {
    textQueue = ["my-api", ""];
    selectQueue = ["hono", "typescript", "postgres"];
    confirmQueue = [true];

    const answers = await runPrompts();

    expect(answers.routes).toEqual([]);
    expect(answers.db).toBe("postgres");
  });

  it('accepts "." as the project name, to scaffold into the current directory', async () => {
    textQueue = [".", ""];
    selectQueue = ["hono", "typescript", "none"];
    confirmQueue = [true];

    const answers = await runPrompts();

    expect(answers.projectName).toBe(".");
  });

  it("still rejects an invalid project name (uppercase/spaces/etc)", async () => {
    textQueue = ["Not Valid!"];
    selectQueue = [];
    confirmQueue = [];

    await expect(runPrompts()).rejects.toThrow(/validation rejected/);
  });

  it("exits without returning when a prompt is cancelled", async () => {
    const exitSpy = spyOn(process, "exit").mockImplementation(((() => {
      throw new Error("process.exit called");
    }) as unknown) as (code?: number) => never);

    textQueue = [CANCEL]; // project name prompt itself is cancelled
    selectQueue = [];
    confirmQueue = [];

    await expect(runPrompts()).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("exits without returning when the copyEnv confirm prompt is cancelled", async () => {
    const exitSpy = spyOn(process, "exit").mockImplementation(((() => {
      throw new Error("process.exit called");
    }) as unknown) as (code?: number) => never);

    textQueue = ["my-api"];
    selectQueue = ["hono", "typescript", "none"];
    confirmQueue = [CANCEL];

    await expect(runPrompts()).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalled();

    exitSpy.mockRestore();
  });
});
