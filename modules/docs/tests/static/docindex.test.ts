// The real documentation index: every Markdown file of the repository (and every HTML page under docs/) is listed, each row says what its document
// says of itself, the four reading paths lead to listed documents, and every check, path and suite the index names exists.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkChecks, checkCodeSpans, checkReadingPaths, checkStatusClaims, isDocumentPath, missingFromIndex, missingListed, parseChecks, parseDocuments, parseReadingPaths, suiteIdsOf } from "../../src/docindex.ts";

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
  assert.ok(lines.includes("Version 0.2. Date: 5 October 2026. Status: draft, not reviewed by a person."));
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

test("every listed document is there: each is a link, and a link to a file that is not there is named", () => {
  assert.deepEqual(missingListed(parseDocuments(text, INDEX), exists), []);
});

test("the low-level design, the wireframes (Markdown and HTML), the glossary, the findings register and this index are listed, each with its date and the review status", () => {
  const documents = parseDocuments(text, INDEX);
  const wanted: [string, RegExp][] = [
    ["docs/design/LLD.md", /^5 October 2026\. Draft, not reviewed by a person$/],
    ["docs/design/WIREFRAMES.md", /^Version 0\.2, 5 October 2026\. Draft, not reviewed by a person$/],
    ["docs/design/wireframes.html", /^Version 0\.2, 5 October 2026\. Draft, not reviewed by a person$/],
    ["docs/GLOSSARY.md", /^Version 0\.2, 5 October 2026\. Draft, not reviewed by a person$/],
    ["docs/FINDINGS.md", /^Version 0\.2, 5 October 2026\. Draft, not reviewed by a person$/],
    ["docs/DOCUMENTATION-INDEX.md", /^Version 0\.2, 5 October 2026\. Draft, not reviewed by a person$/],
    ["docs/fsd/FSD.md", /^Version 0\.2, 5 October 2026\. Draft, not reviewed by a person$/],
  ];
  for (const [path, status] of wanted) {
    const d = documents.find((x) => x.path === path);
    assert.ok(d, `${path} is not listed`);
    assert.match(d.status, status, `${path}: the status`);
  }
  const index = /^\[[^\]]+\]\(([^)#]+)\)/;
  assert.ok(text.split("\n").some((l) => l.startsWith("| [docs/design/LLD.md](design/LLD.md) |") && index.test(l.slice(2))), "the LLD row is a link to the file, with no anchor");
});

test("the FSD and the wireframes, listed as Version 0.2, state Version 0.2 in their own opening lines (the HTML page states it in its status line, after its style sheet)", () => {
  for (const path of ["docs/fsd/FSD.md", "docs/design/WIREFRAMES.md"]) assert.match(read(path).split("\n").slice(0, 25).join("\n"), /Version 0\.2\b/, path);
  assert.match(read("docs/design/wireframes.html"), /<p class="status">Version 0\.2 /);
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
  const checks = parseChecks(text);
  assert.deepEqual(checkChecks(checks, expected, exists, suiteIds()), []);
  assert.ok(expected.includes("modules/docs/tests/static/wireframes.test.ts"), "the wireframes test is one of the checks");
  const row = checks.find((c) => c.path === "modules/docs/tests/static/wireframes.test.ts");
  assert.ok(row, "the table of checks names the wireframes test");
  assert.ok(row.run.includes("node scripts/test.mjs static --only docs/static/wireframes"));
});

test("every path in code in the index exists, and every suite in code is one the runner lists", () => {
  assert.deepEqual(checkCodeSpans(text, exists, suiteIds()), []);
});
