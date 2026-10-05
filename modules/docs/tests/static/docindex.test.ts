// The real documentation index: every Markdown file of the repository (and every HTML page under docs/) is listed, each row says what its document
// says of itself, the four reading paths lead to listed documents, and every check, path and suite the index names exists.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ADDED, checkChecks, checkCodeSpans, checkReadingPaths, checkStatusClaims, isDocumentPath, missingFromIndex, missingListed, parseChecks, parseDocuments, parseReadingPaths, suiteIdsOf } from "../../src/docindex.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const INDEX = "docs/DOCUMENTATION-INDEX.md";
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const exists = (path: string): boolean => existsSync(join(ROOT, path));
const text = read(INDEX);
const tracked = (): string[] => execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && exists(f));
const suiteIds = (): Set<string> => suiteIdsOf(execFileSync(process.execPath, ["scripts/test.mjs", "--list"], { cwd: ROOT, encoding: "utf8" }));

test("the index says what it is: a title, the version, date and status line, and how it relates to the other documents", () => {
  const lines = text.split("\n");
  assert.equal(lines[0], "# Documentation index: APLYD MSME platform");
  assert.ok(lines.includes("Version 0.1. Date: 5 October 2026. Status: draft, not reviewed by a person."));
  assert.ok(lines.some((l) => l.startsWith("How this relates to the other documents:")));
});

test("every row of the table of documents has a document, a purpose, its readers, what it is the record of, and a status and date", () => {
  const documents = parseDocuments(text, INDEX);
  assert.ok(documents.length >= 40, `${documents.length} documents`);
});

test("every Markdown file of the repository, and every HTML page under docs/, is listed in the index", () => {
  assert.deepEqual(missingFromIndex(parseDocuments(text, INDEX), tracked()), []);
  assert.ok(tracked().filter(isDocumentPath).length >= 40);
});

test("every listed document is there, unless its row says it is added with this set", () => {
  assert.deepEqual(missingListed(parseDocuments(text, INDEX), exists), []);
});

test("the low-level design and the HTML wireframes are listed, with the status Added with this set", () => {
  const documents = parseDocuments(text, INDEX);
  for (const path of ["docs/design/LLD.md", "docs/design/wireframes.html"]) {
    const d = documents.find((x) => x.path === path);
    assert.ok(d, `${path} is not listed`);
    assert.equal(d.status, ADDED, `${path}: the status`);
  }
});

test("each row says what its document says of itself: the dates, the commit, the version and the review status are in the document", () => {
  assert.deepEqual(checkStatusClaims(parseDocuments(text, INDEX), (path) => (exists(path) ? read(path) : null)), []);
});

test("the four reading paths are there, each with at least three numbered items that lead to listed documents", () => {
  const paths = parseReadingPaths(text, INDEX);
  assert.deepEqual(paths.map((p) => p.name), ["Sponsor", "Developer", "Tester", "Operator"]);
  assert.deepEqual(checkReadingPaths(paths, parseDocuments(text, INDEX)), []);
});

test("every document check of the repository is in the table of checks, with the command that runs that suite and a suite the runner lists", () => {
  const expected = [
    ...readdirSync(join(ROOT, "scripts")).filter((f) => /^check-[a-z-]+\.mjs$/.test(f)).map((f) => `scripts/${f}`),
    ...readdirSync(join(ROOT, "modules/docs/tests/static")).filter((f) => f.endsWith(".test.ts")).map((f) => `modules/docs/tests/static/${f}`),
  ];
  assert.ok(expected.length >= 10, `${expected.length} checks found`);
  assert.deepEqual(checkChecks(parseChecks(text), expected, exists, suiteIds()), []);
});

test("every path in code in the index exists, and every suite in code is one the runner lists", () => {
  const added = new Set(parseDocuments(text, INDEX).filter((d) => d.added).map((d) => d.path));
  assert.deepEqual(checkCodeSpans(text, exists, suiteIds(), added), []);
});
