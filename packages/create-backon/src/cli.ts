#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { runPrompts } from "./prompts";
import { generateProject } from "./generate";

async function main() {
  const answers = await runPrompts();
  const { root, filesWritten } = await generateProject(answers);

  p.note(`cd ${answers.projectName}\nbun install\nbun run dev`, "Next steps");
  p.log.success(`Wrote ${filesWritten.length} files to ${root}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
