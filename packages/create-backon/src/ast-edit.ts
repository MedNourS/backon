import { Node, Project, type SourceFile } from "ts-morph";

/**
 * The AST-based replacement for the old ensureImports()/appendBlock()
 * (add-method.ts) and removeBlock() (remove-method.ts) pair — both used to
 * find "this method's code" by splitting file content on blank lines and
 * matching text, which only works if nothing nearby ever gets reformatted.
 * ts-morph gives real statement/import identity instead: an import is
 * recognized as already present by its actual module+specifier structure
 * (not by whether an identical line of text happens to appear anywhere in
 * the file), and a method's statements are found and removed by the exact
 * name addMethod()/removeMethod() already enforce is unique per endpoint —
 * so a hand-reformatted quote style, semicolon, or import order doesn't
 * make either operation silently miss its target.
 *
 * One throwaway in-memory Project per file edit — these are cheap and
 * short-lived (one per addMethod()/removeMethod() call), not shared across
 * the CLI's lifetime.
 */
function makeProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, checkJs: false },
  });
}

export function loadSource(path: string, contents: string): { project: Project; sourceFile: SourceFile } {
  const project = makeProject();
  const sourceFile = project.createSourceFile(path, contents);
  return { project, sourceFile };
}

/** Load → mutate → print, in one call — the shape every add-method.ts/remove-method.ts edit follows. */
export function editSource(path: string, contents: string, mutate: (project: Project, sourceFile: SourceFile) => void): string {
  const { project, sourceFile } = loadSource(path, contents);
  mutate(project, sourceFile);
  return printSource(sourceFile);
}

interface ParsedImportLine {
  moduleSpecifier: string;
  isTypeOnly: boolean;
  namespaceImport?: string;
  namedImports: string[];
}

/** Parses one raw `import ... from "...";` line (as templates/route.ts already produces) into its real structure, via a disposable scratch file in the same project. */
function parseImportLine(project: Project, line: string): ParsedImportLine {
  const scratch = project.createSourceFile("__scratch_import__.ts", line, { overwrite: true });
  const decl = scratch.getImportDeclarations()[0];
  if (!decl) throw new Error(`Not a valid import statement: ${line}`);
  const parsed: ParsedImportLine = {
    moduleSpecifier: decl.getModuleSpecifierValue(),
    isTypeOnly: decl.isTypeOnly(),
    namespaceImport: decl.getNamespaceImport()?.getText(),
    namedImports: decl.getNamedImports().map((ni) => ni.getName()),
  };
  project.removeSourceFile(scratch);
  return parsed;
}

/**
 * Adds each of `lines` to `sourceFile` unless a declaration already covers
 * it — checked by real import structure, not raw text. Each line becomes
 * its own new import declaration when nothing already covers it (mirrors
 * the old one-declaration-per-addMethod-call granularity, just checked more
 * accurately — this doesn't merge into an existing *different* named-import
 * declaration from the same module, since remove-method.ts's cleanup relies
 * on each method's schema-type import staying in its own declaration).
 */
export function ensureImports(sourceFile: SourceFile, project: Project, lines: string[]): void {
  for (const line of lines) {
    const spec = parseImportLine(project, line);
    const alreadyPresent = sourceFile.getImportDeclarations().some((d) => {
      if (d.getModuleSpecifierValue() !== spec.moduleSpecifier) return false;
      if (d.isTypeOnly() !== spec.isTypeOnly) return false;
      if (spec.namespaceImport) return d.getNamespaceImport()?.getText() === spec.namespaceImport;
      const names = new Set(d.getNamedImports().map((ni) => ni.getName()));
      return spec.namedImports.length > 0 && spec.namedImports.every((n) => names.has(n));
    });
    if (alreadyPresent) continue;

    sourceFile.addImportDeclaration({
      moduleSpecifier: spec.moduleSpecifier,
      isTypeOnly: spec.isTypeOnly,
      ...(spec.namespaceImport ? { namespaceImport: spec.namespaceImport } : { namedImports: spec.namedImports }),
    });
  }
}

/** Appends a method's generated code (from templates/route.ts) as real statements at the end of the file. */
export function appendStatements(sourceFile: SourceFile, code: string): void {
  sourceFile.addStatements(`\n${code}`);
}

/**
 * Removes a method's schema consts (nameParamsSchema/BodySchema/QuerySchema)
 * and its defineRoute() export from a controller file — found by exact
 * declared name, the same uniqueness addMethod() already enforces per
 * endpoint, rather than by which \n\n-delimited block of text they happen
 * to sit in. Returns whether anything was actually removed, so the caller
 * can tell "nothing there" apart from "removed everything there was".
 */
export function removeControllerMethod(sourceFile: SourceFile, name: string): boolean {
  const targets = new Set([name, `${name}ParamsSchema`, `${name}BodySchema`, `${name}QuerySchema`]);
  let removed = false;
  for (const stmt of sourceFile.getVariableStatements()) {
    const decls = stmt.getDeclarations();
    if (decls.length === 1 && targets.has(decls[0]!.getName())) {
      stmt.remove();
      removed = true;
    }
  }
  // renderControllerMethod() puts a "// TODO: replace with the real shape
  // of ..." comment directly above a body/query schema const, with no
  // blank line between them. When a method's schema const sits right next
  // to ANOTHER statement in the same group (e.g. paramsSchema directly
  // above bodySchema, no blank line), ts-morph's leading-trivia detection
  // can attribute that comment to more than one statement, and .remove()
  // above doesn't reliably take it with it — it survives, reattached as
  // leading trivia on whatever statement now comes next. Sweep for it
  // explicitly, matched by this method's own name (never another method's,
  // since the name is unique per endpoint) rather than by position, and
  // only AFTER the statement removals above, once each surviving
  // statement's leading trivia is no longer ambiguous.
  if (removed) stripOrphanedTodoComment(sourceFile, name);
  return removed;
}

function stripOrphanedTodoComment(sourceFile: SourceFile, name: string): void {
  const marker = `replace with the real shape of "${name}"`;
  const ranges: Array<{ pos: number; end: number }> = [];
  for (const stmt of sourceFile.getStatements()) {
    for (const range of stmt.getLeadingCommentRanges()) {
      if (range.getText().includes(marker)) ranges.push({ pos: range.getPos(), end: range.getEnd() });
    }
  }
  // Remove furthest-in-the-file first, so an earlier removal never shifts
  // the position of a range still waiting to be processed.
  ranges.sort((a, b) => b.pos - a.pos);
  const fullText = sourceFile.getFullText();
  for (const { pos, end } of ranges) {
    const end2 = fullText[end] === "\n" ? end + 1 : end; // eat the comment's own newline too, not just its text
    sourceFile.removeText(pos, end2);
  }
}

/** Removes the mount-line ExpressionStatement calling controller.<name> — matched by that reference, not by verb/path text, so a hand-reformatted line (quotes, spacing, a trailing comment) doesn't hide it. */
export function removeRouteMount(sourceFile: SourceFile, name: string): boolean {
  for (const stmt of sourceFile.getStatements()) {
    if (!Node.isExpressionStatement(stmt)) continue;
    const expr = stmt.getExpression();
    if (!Node.isCallExpression(expr)) continue;
    const args = expr.getArguments();
    const last = args[args.length - 1];
    if (last && Node.isPropertyAccessExpression(last) && last.getName() === name) {
      stmt.remove();
      return true;
    }
  }
  return false;
}

/** Removes a service function by name, plus any import declaration whose entire named-import set belongs to that same method's schema types (each method's type import stays in its own declaration — see ensureImports()'s doc comment — so "entire set" never catches another method's names too). */
export function removeServiceMethod(sourceFile: SourceFile, name: string): boolean {
  const fn = sourceFile.getFunction(name);
  if (!fn) return false;
  fn.remove();

  const methodTypeNames = new Set([`${name}ParamsSchema`, `${name}BodySchema`, `${name}QuerySchema`]);
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const names = importDecl.getNamedImports().map((ni) => ni.getName());
    if (names.length > 0 && names.every((n) => methodTypeNames.has(n))) {
      importDecl.remove();
    }
  }
  return true;
}

const SCHEMA_CONST_SUFFIXES = ["ParamsSchema", "BodySchema", "QuerySchema"];

function isSchemaConstStatement(node: Node): boolean {
  if (!Node.isVariableStatement(node)) return false;
  const decls = node.getDeclarations();
  return decls.length === 1 && SCHEMA_CONST_SUFFIXES.some((suffix) => decls[0]!.getName().endsWith(suffix));
}

/**
 * Reconstructs the file's text from its current AST instead of returning
 * whatever ts-morph's in-place text edits left behind — in-place edits are
 * precise about *removing* a node's own text, but don't reliably leave the
 * same blank-line spacing around the survivors that the old block-based
 * convention had. Import declarations stay packed together with no blank
 * line between them (as generated); every other top-level statement gets
 * its own blank-line-separated paragraph, EXCEPT a schema const
 * (*ParamsSchema/*BodySchema/*QuerySchema) which stays glued to the
 * statement right after it — renderControllerMethod() always emits a
 * method's schema consts immediately followed by its defineRoute() export,
 * with no blank line between them, and this keeps that grouping intact
 * through arbitrary add/remove cycles instead of only on first write.
 */
export function printSource(sourceFile: SourceFile): string {
  const importDecls = sourceFile.getImportDeclarations();
  const importText = importDecls.map((d) => d.getText()).join("\n");

  const rest = sourceFile.getStatements().filter((s) => !Node.isImportDeclaration(s));
  const paragraphs: string[] = [];
  let i = 0;
  while (i < rest.length) {
    const parts: string[] = [];
    while (i < rest.length && isSchemaConstStatement(rest[i]!)) {
      parts.push(rest[i]!.getFullText().trim());
      i++;
    }
    if (i < rest.length) {
      parts.push(rest[i]!.getFullText().trim());
      i++;
    }
    paragraphs.push(parts.join("\n"));
  }

  const blocks = [importText, ...paragraphs].filter((b) => b.length > 0);
  return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : "";
}
