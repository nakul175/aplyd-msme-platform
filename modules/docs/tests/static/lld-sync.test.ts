// The real low-level design against the real code: every files table names files that exist and lists exactly what they export; every repository
// path in a code span exists; every table, trigger, function, binding or variable the document names appears in the code; its own anchors resolve;
// its headings are the plan's; every module section ends with "Found while writing"; its diagrams are small. It does not check the prose: a
// sentence that is wrong about what a function does is not found by any of this.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkDiagrams, checkFilesTables, checkFoundPointers, checkNamedThings, checkOwnAnchors, checkPathSpans, checkStructure, parseFilesTables } from "../../src/lld.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const text = readFileSync(join(ROOT, "docs/design/LLD.md"), "utf8");

const read = (path: string): string | null => {
  const full = join(ROOT, path);
  return existsSync(full) && statSync(full).isFile() ? readFileSync(full, "utf8") : null;
};
const kind = (path: string): "file" | "directory" | null => {
  const full = join(ROOT, path);
  if (!existsSync(full)) return null;
  return statSync(full).isDirectory() ? "directory" : "file";
};

const SKIP = new Set(["node_modules", ".git", "dist", ".wrangler", ".vinext", ".next", "meta"]);
function walk(dir: string, into: string[]): void {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, into);
    else if (/\.(ts|tsx|mjs|js|json|jsonc|sql|css|yml|yaml|toml)$/.test(e.name)) into.push(rel);
  }
}
const codeFiles: string[] = [];
for (const d of ["app", "modules", "scripts", "worker", "drizzle", ".github"]) if (existsSync(join(ROOT, d))) walk(d, codeFiles);
for (const f of readdirSync(ROOT)) if (/\.(ts|mjs|js|json|jsonc|toml|yml|yaml)$/.test(f) || f === "Dockerfile") codeFiles.push(f);
const tokens = new Set<string>();
for (const f of codeFiles) for (const m of readFileSync(join(ROOT, f), "utf8").matchAll(/[A-Za-z_$][\w$]*/g)) tokens.add(m[0]);

/**
 * Names the document uses as examples, or as names of things it says do not exist (a column that is missing, an invented file). They are not in
 * the code on purpose. Each carries the reason.
 */
const EXAMPLES = new Map<string, string>([
  ["CURRENT_TIMESTAMP", "named as something no migration uses (section 3.5)"],
  ["onClick", "named as something no page uses (section 5.1)"],
  ["onChange", "named as something no page uses (section 5.1)"],
  ["onSubmit", "named as something no page uses (section 5.1)"],
  ["dangerouslySetInnerHTML", "named as something no page uses (section 5.1)"],
  ["migrations_dir", "named as something no file in the repository uses (section 6.3)"],
  ["authorizeOperatorRead", "the functional specification names it; it does not exist (found while writing, section 4.1)"],
  ["authorizeOperatorChange", "the functional specification names it; it does not exist (found while writing, section 4.1)"],
]);

test("the document has the plan's headings in order, a Found while writing list under each module, and its status", () => {
  assert.deepEqual(checkStructure(text), []);
});

test("every files table row names a file that exists and lists exactly the names the file exports", () => {
  const { tables, rows } = parseFilesTables(text);
  assert.ok(tables >= 20, `${tables} files tables`);
  assert.ok(rows.length >= 150, `${rows.length} rows`);
  assert.deepEqual(checkFilesTables(text, read), []);
});

test("every repository path in a code span exists, and a directory ends in a slash", () => {
  assert.deepEqual(checkPathSpans(text, kind), []);
});

test("every table, trigger, function, binding and variable the document names appears in the code", () => {
  assert.deepEqual(checkNamedThings(text, (n) => tokens.has(n), new Set(EXAMPLES.keys())), []);
});

test("the anchors inside the document resolve on GitHub and under the repository's own checker; the pointers to section 9 count what it holds", () => {
  assert.deepEqual(checkOwnAnchors(text), []);
  assert.deepEqual(checkFoundPointers(text), []);
});

test("diagrams stay small and every fenced block has a language", () => {
  assert.deepEqual(checkDiagrams(text), []);
});
