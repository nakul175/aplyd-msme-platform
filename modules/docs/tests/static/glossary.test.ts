// The real glossary: every row is well formed and in order, it covers the terms of the BRD and FSD convention tables and every identifier scheme
// the documents define, every path and link in it exists, every term is used somewhere in the repository, and the stage table is the progress
// strip's own words.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkPathsInText, checkStages, checkWhere, definedPrefixes, missingPrefixes, missingTerms, parseGlossary, requiredTerms, stageRows, unusedTerms } from "../../src/glossary.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const GLOSSARY = "docs/GLOSSARY.md";
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const exists = (path: string): boolean => existsSync(join(ROOT, path));
const text = read(GLOSSARY);
const tracked = (): string[] => execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && exists(f));

test("the glossary says what it is: a title, the version, date and status line, and how it relates to the other documents", () => {
  const lines = text.split("\n");
  assert.equal(lines[0], "# Glossary: APLYD MSME platform");
  assert.ok(lines.includes("Version 0.1. Date: 5 October 2026. Status: draft, not reviewed by a person."));
  assert.ok(lines.some((l) => l.startsWith("How this relates to the other documents:")));
});

test("every row has a term, a meaning of at most two sentences, what it is not to be confused with and where it is defined; rows are in alphabetical order under their letter", () => {
  const entries = parseGlossary(text);
  assert.ok(entries.length >= 200, `${entries.length} entries`);
});

test("every term of the FSD convention table (section 1.3) and the BRD table of columns (section 1.2) has an entry", () => {
  const required = requiredTerms(read("docs/fsd/FSD.md"), read("docs/brd/BRD.md"));
  assert.ok(required.length >= 40, `${required.length} required terms`);
  assert.ok(required.some((r) => r.kind === "basis") && required.some((r) => r.kind === "status") && required.some((r) => r.kind === "area"), "the Basis words, the Status words and the areas are all read");
  assert.deepEqual(missingTerms(required, parseGlossary(text)), []);
});

test("every identifier scheme that a document defines has an entry", () => {
  const prefixes = new Set<string>();
  for (const f of tracked().filter((f) => f.endsWith(".md"))) for (const p of definedPrefixes(read(f))) prefixes.add(p);
  assert.ok(prefixes.size >= 20, `${prefixes.size} schemes found`);
  assert.deepEqual(missingPrefixes(prefixes, parseGlossary(text)), []);
});

test("every path in code and every link in the glossary leads to something that is there", () => {
  assert.deepEqual(checkWhere(parseGlossary(text), GLOSSARY, exists), []);
  assert.deepEqual(checkPathsInText(text, exists), []);
});

test("every term is used in some file of the repository other than the glossary", () => {
  const corpus = tracked().filter((f) => f !== GLOSSARY && !/\.(png|jpe?g|gif|ico|woff2?|lock)$/i.test(f)).map(read).join("\n");
  assert.deepEqual(unusedTerms(parseGlossary(text), corpus), []);
});

test("the table of the five stages has the step and page names of the progress strip, in order, and a module that exists", () => {
  const rows = stageRows(text);
  assert.equal(rows.length, 5);
  assert.deepEqual(checkStages(rows, read("modules/journey/src/progress.ts"), exists), []);
});

test("the documents that send a reader to the glossary link to it, and the glossary and the index link to each other", () => {
  for (const f of ["docs/brd/BRD.md", "docs/fsd/FSD.md", "docs/design/DATA-DICTIONARY.md", "docs/design/SECURITY-AND-PRIVACY.md", "docs/design/WIREFRAMES.md", "docs/ops/RUNBOOK.md"]) {
    assert.ok(/\]\((?:\.\.\/)?GLOSSARY\.md(?:#[^)]*)?\)/.test(read(f)), `${f} does not link to GLOSSARY.md`);
  }
  assert.ok(text.includes("(DOCUMENTATION-INDEX.md)"));
  assert.ok(read("docs/DOCUMENTATION-INDEX.md").includes("(GLOSSARY.md)"));
});
