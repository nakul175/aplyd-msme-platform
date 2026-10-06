// The documentation-index reader: the table of documents, coverage, status claims, reading paths, the table of checks and code spans, each with a seeded fault.
// Every document is a link: there is no label for a document whose file may not be there.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkChecks,
  checkCodeSpans,
  checkReadingPaths,
  checkStatusClaims,
  isDocumentPath,
  missingFromIndex,
  missingListed,
  parseChecks,
  parseDocuments,
  parseReadingPaths,
  suiteIdOf,
  suiteIdsOf,
  type IndexedDocument,
} from "../../src/docindex.ts";

const INDEX = "docs/DOCUMENTATION-INDEX.md";
const DOC_HEAD = "| Document | Purpose | Readers | Source of truth for | Status and date |\n| --- | --- | --- | --- | --- |";
const drow = (first: string, over: Partial<Record<"purpose" | "readers" | "truth" | "status", string>> = {}) => {
  const c = { purpose: "What it is for", readers: "developer", truth: "The thing", status: "Version 0.1, 5 October 2026. Draft, not reviewed by a person", ...over };
  return `| ${first} | ${c.purpose} | ${c.readers} | ${c.truth} | ${c.status} |`;
};
const index = (...rows: string[]) => `# Index\n\n## 3. The documents\n\n### 3.1 Start here\n\n${DOC_HEAD}\n${rows.join("\n")}\n\n## 4. Next\n`;
const problemsOf = (text: string): string => {
  try {
    parseDocuments(text, INDEX);
  } catch (e) {
    return (e as Error).message;
  }
  return "";
};

test("rows are read: a link resolved from the index (a page of HTML too), and the readers (all is the four)", () => {
  const d = parseDocuments(
    index(
      drow("[README.md](../README.md)", { readers: "all" }),
      drow("[docs/thesis.md](thesis.md)", { readers: "sponsor, developer" }),
      drow("[docs/design/LLD.md](design/LLD.md)"),
      drow("[docs/design/wireframes.html](design/wireframes.html)"),
    ),
    INDEX,
  );
  assert.deepEqual(d.map((x) => [x.path, x.readers]), [
    ["README.md", ["sponsor", "developer", "tester", "operator"]],
    ["docs/thesis.md", ["sponsor", "developer"]],
    ["docs/design/LLD.md", ["developer"]],
    ["docs/design/wireframes.html", ["developer"]],
  ]);
});

test("rows outside section 3 are not documents, and the header row is not one", () => {
  const text = `${index(drow("[A.md](A.md)"))}\n| Check | Documents | What | Run |\n| \`x\` | y | z | w |\n`;
  assert.deepEqual(parseDocuments(text, INDEX).map((d) => d.path), ["docs/A.md"]);
});

test("a row with the wrong number of cells, a first cell that is not a link, and a link with an anchor are named", () => {
  assert.match(problemsOf(index("| [A.md](A.md) | purpose | developer | truth |")), /\[A\.md\]\(A\.md\): 4 cells, expected 5/);
  assert.match(problemsOf(index(drow("A.md"))), /A\.md: the first cell is a link to the document/);
  assert.match(problemsOf(index(drow("`docs/design/LLD.md`"))), /the first cell is a link to the document/, "a path in code is not a link: the file must be there to be listed");
  assert.match(problemsOf(index(drow("[A](A.md#top)"))), /the link A\.md#top must lead to a file, without an anchor/);
  assert.match(problemsOf(index(drow("[A](../../../A.md)"))), /must lead to a file/);
});

test("an empty purpose, source of truth or status is named", () => {
  const p = problemsOf(index(drow("[A.md](A.md)", { purpose: "", truth: "", status: "" })));
  assert.match(p, /no purpose/);
  assert.match(p, /no source of truth/);
  assert.match(p, /no status and date/);
});

test("readers that are not the four, all with another reader, and a reader named twice are each named", () => {
  assert.match(problemsOf(index(drow("[A.md](A.md)", { readers: "manager" }))), /the readers are sponsor, developer, tester, operator or all; found "manager"/);
  assert.match(problemsOf(index(drow("[A.md](A.md)", { readers: "all, tester" }))), /"all" stands alone/);
  assert.match(problemsOf(index(drow("[A.md](A.md)", { readers: "tester, tester" }))), /a reader is named twice/);
});

test("a status that says nothing is named: being written, TBD, to come, in progress, and the old label Added with this set", () => {
  for (const status of ["Being written", "TBD", "Draft, to come", "Work in progress", "Coming soon", "Under construction", "Added with this set", "Added with this set, in part"]) {
    assert.match(problemsOf(index(drow("[A.md](A.md)", { status }))), /says nothing; give what the document is, its date and whether a person has reviewed it/, status);
  }
  assert.equal(problemsOf(index(drow("[A.md](A.md)", { status: "Last updated 4 October 2026" }))), "");
});

test("a document listed twice is named", () => {
  assert.match(problemsOf(index(drow("[A.md](A.md)"), drow("[again](A.md)"))), /docs\/A\.md: listed twice/);
});

const docs = (...rows: string[]): IndexedDocument[] => parseDocuments(index(...rows), INDEX);

test("the files the index must list are every Markdown file and every HTML page under docs/", () => {
  assert.equal(isDocumentPath("docs/a.md"), true);
  assert.equal(isDocumentPath("modules/x/STATUS.md"), true);
  assert.equal(isDocumentPath("docs/design/wireframes.html"), true);
  assert.equal(isDocumentPath("app/page.html"), false);
  assert.equal(isDocumentPath("docs/img/a.png"), false);
  assert.equal(isDocumentPath("scripts/test.mjs"), false);
});

test("a document of the repository that the index does not list is named", () => {
  const d = docs(drow("[A.md](A.md)"), drow("[w](design/wireframes.html)"));
  assert.deepEqual(missingFromIndex(d, ["docs/A.md", "docs/B.md", "docs/design/wireframes.html", "modules/x/STATUS.md", "src/a.ts"]), [
    "docs/B.md is a document of the repository and the index does not list it",
    "modules/x/STATUS.md is a document of the repository and the index does not list it",
  ]);
});

test("a listed document that is not there is named, whichever document it is: nothing is excused from existing", () => {
  const d = docs(drow("[A.md](A.md)"), drow("[LLD](design/LLD.md)"), drow("[gone](gone.md)"));
  assert.deepEqual(missingListed(d, (p) => p === "docs/design/LLD.md"), ["docs/A.md: the link leads to a file that is not there", "docs/gone.md: the link leads to a file that is not there"]);
  assert.deepEqual(missingListed(d, () => true), []);
});

const CLAIM_DOC = "# Title\n\nVersion 0.1. Date: 5 October 2026. Status: draft, not reviewed by a person.\n";
test("a status is checked against the document: a date, a commit, the version, and the review status", () => {
  const d = docs(drow("[A.md](A.md)", { status: "Version 0.2, 6 October 2026. Draft, not reviewed by a person" }), drow("[B.md](B.md)", { status: "Reference commit 2adfbde, 4 October 2026" }));
  const read = (p: string) => (p === "docs/A.md" ? CLAIM_DOC : "# B\n\nFrom commit abc1234.\n");
  assert.deepEqual(checkStatusClaims(d, read), [
    "docs/A.md: the status gives 6 October 2026 and the document does not",
    "docs/A.md: the status gives Version 0.2 and the opening lines of the document say Version 0.1",
    "docs/B.md: the status gives 4 October 2026 and the document does not",
    "docs/B.md: the status gives the commit 2adfbde and the document does not",
  ]);
  const unreviewed = docs(drow("[A.md](A.md)", { status: "Version 0.1, 5 October 2026. Draft, not reviewed by a person" }));
  assert.deepEqual(checkStatusClaims(unreviewed, () => "Version 0.1. Date: 5 October 2026. Status: draft.\n"), ["docs/A.md: the status says \"not reviewed by a person\" and the document does not"]);
  assert.deepEqual(checkStatusClaims(unreviewed, () => CLAIM_DOC), []);
});

test("a file that is not there is not checked against a document (missingListed names it)", () => {
  const d = docs(drow("[LLD](design/LLD.md)", { status: "5 October 2026. Draft, not reviewed by a person" }), drow("[A.md](A.md)", { status: "Last updated 4 October 2026" }));
  assert.deepEqual(checkStatusClaims(d, () => null), []);
});

test("the version in a status is the version the document states in its opening lines: a document that quotes an older version further down does not pass for it", () => {
  const d = docs(drow("[A.md](A.md)", { status: "Version 0.1, 5 October 2026. Draft, not reviewed by a person" }));
  const now = "# A\n\nVersion 0.2. Date: 5 October 2026. Status: draft, not reviewed by a person.\n";
  const quoting = `${now}${"line\n".repeat(30)}Version 0.1 said otherwise.\n`;
  assert.deepEqual(checkStatusClaims(d, () => quoting), ["docs/A.md: the status gives Version 0.1 and the opening lines of the document say Version 0.2"]);
  const current = docs(drow("[A.md](A.md)", { status: "Version 0.2, 5 October 2026. Draft, not reviewed by a person" }));
  assert.deepEqual(checkStatusClaims(current, () => quoting), []);
  const lateOnly = "# A\n\n5 October 2026. Not reviewed by a person.\n" + "line\n".repeat(30) + "Version 0.1.\n";
  assert.deepEqual(checkStatusClaims(d, () => lateOnly), [], "a document that gives no version in its opening lines is checked on the whole text");
});

test("a page of HTML is checked as a document: its version, its date and its review status are read from the page", () => {
  const d = docs(drow("[w](design/wireframes.html)", { status: "Version 0.2, 5 October 2026. Draft, not reviewed by a person" }));
  const page = '<!doctype html>\n<title>W</title>\n<p class="status">Version 0.2 &middot; 5 October 2026 &middot; Draft, not reviewed by a person</p>\n';
  assert.deepEqual(checkStatusClaims(d, () => page), []);
  assert.deepEqual(checkStatusClaims(d, () => page.replace("0.2", "0.1")), ["docs/design/wireframes.html: the status gives Version 0.2 and the opening lines of the document say Version 0.1"]);
});

test("a row that says no date is stated is named when the document gives a date or a version of itself, and not for the date of something else", () => {
  const d = docs(drow("[A.md](A.md)", { status: "No date stated" }));
  assert.deepEqual(checkStatusClaims(d, () => "# A\n\nLast updated 4 October 2026.\n"), ['docs/A.md: the status says no date is stated and the first lines say "Last updated"']);
  assert.deepEqual(checkStatusClaims(d, () => "# A\n\nVersion 2 of the direction.\n"), ['docs/A.md: the status says no date is stated and the first lines say "Version 2"']);
  assert.deepEqual(checkStatusClaims(d, () => "# A\n\nThe study (23 April 2026) says so. Set on 4 October 2026.\n"), []);
  assert.deepEqual(checkStatusClaims(d, () => `${"line\n".repeat(30)}Last updated 4 October 2026.`), [], "only the opening lines are read");
});

const READING = (body: string) => `# Index\n\n## 2. Reading paths\n\nIntro.\n\n${body}\n\n## 3. The documents\n`;
const PATH = (name: string, ...items: string[]) => `### ${name}\n\n${items.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n`;
const FOUR = READING(
  ["Sponsor", "Developer", "Tester", "Operator"].map((n) => PATH(n, "[A](A.md): a.", "[B](B.md): b.", "[C](C.md): c.")).join("\n"),
);
const LISTED = () => docs(drow("[A](A.md)"), drow("[B](B.md)"), drow("[C](C.md)"));

test("reading paths are read with their numbered items and the documents each links to", () => {
  const p = parseReadingPaths(FOUR, INDEX);
  assert.deepEqual(p.map((x) => x.name), ["Sponsor", "Developer", "Tester", "Operator"]);
  assert.deepEqual(p[0]!.items.map((i) => [i.number, i.links]), [[1, ["docs/A.md"]], [2, ["docs/B.md"]], [3, ["docs/C.md"]]]);
  assert.deepEqual(checkReadingPaths(p, LISTED()), []);
});

test("a missing path, a path out of order, a short path and a mis-numbered item are each named", () => {
  const three = READING(["Sponsor", "Developer", "Tester"].map((n) => PATH(n, "[A](A.md)", "[B](B.md)", "[C](C.md)")).join("\n"));
  assert.match(checkReadingPaths(parseReadingPaths(three, INDEX), LISTED())[0]!, /the reading paths are Sponsor, Developer, Tester, Operator in that order; found Sponsor, Developer, Tester/);
  const swapped = READING(["Developer", "Sponsor", "Tester", "Operator"].map((n) => PATH(n, "[A](A.md)", "[B](B.md)", "[C](C.md)")).join("\n"));
  assert.match(checkReadingPaths(parseReadingPaths(swapped, INDEX), LISTED())[0]!, /in that order/);
  const short = FOUR.replace("\n3. [C](C.md): c.", "");
  assert.ok(checkReadingPaths(parseReadingPaths(short, INDEX), LISTED()).includes("Sponsor: 2 item(s), at least 3 are needed"));
  const numbered = FOUR.replace("2. [B](B.md): b.", "5. [B](B.md): b.");
  assert.ok(checkReadingPaths(parseReadingPaths(numbered, INDEX), LISTED()).includes("Sponsor: item 2 is numbered 5"));
});

test("an item that links to a document the index does not list, and an item with no link, are named; an item that points at the module pages is not, and \"(added with this set)\" excuses nothing", () => {
  const fault = FOUR.replace("[C](C.md): c.", "[X](X.md): x.").replace("2. [B](B.md): b.", "2. Nothing to link to.");
  const p = checkReadingPaths(parseReadingPaths(fault, INDEX), LISTED());
  assert.ok(p.includes("Sponsor, item 3: docs/X.md is not a document the index lists"));
  assert.ok(p.includes("Sponsor, item 2: no link to a listed document, and it does not point at the pages under modules/<name>/"));
  const old = FOUR.replace("2. [B](B.md): b.", "2. The low-level design (added with this set): how.");
  assert.ok(checkReadingPaths(parseReadingPaths(old, INDEX), LISTED()).some((x) => x.startsWith("Sponsor, item 2: no link to a listed document")));
  const ok = FOUR.replace("3. [C](C.md): c.", "3. The pages under `modules/<name>/`.");
  assert.deepEqual(checkReadingPaths(parseReadingPaths(ok, INDEX), LISTED()), []);
});

const CHECK_HEAD = "| Check | Documents it checks | What it checks | How to run it |\n| --- | --- | --- | --- |";
const crow = (first: string, run = "`node scripts/test.mjs static --only static/documentation`") => `| ${first} | Docs | Things | ${run} |`;
const CHECKS = (...rows: string[]) => `# Index\n\n## 4. Which test checks which document\n\nIntro.\n\n${CHECK_HEAD}\n${rows.join("\n")}\n\n## 5. Next\n`;
const IDS = new Set(["static/documentation", "docs/static/brd", "docs/unit/brd"]);

test("the table of checks is read, a malformed row is named, and a suite is told from a check's path", () => {
  const c = parseChecks(CHECKS(crow("`scripts/check-documentation.mjs`"), crow("`modules/docs/tests/static/brd.test.ts`", "`node scripts/test.mjs static --only docs/static/brd`")));
  assert.deepEqual(c.map((x) => x.path), ["scripts/check-documentation.mjs", "modules/docs/tests/static/brd.test.ts"]);
  assert.throws(() => parseChecks(CHECKS("| `scripts/check-x.mjs` | a | b |")), /3 cells, expected 4/);
  assert.throws(() => parseChecks(CHECKS(crow("scripts/check-x.mjs"))), /the first cell is the path of the check in code/);
  assert.equal(suiteIdOf("scripts/check-test-docs.mjs"), "static/test-docs");
  assert.equal(suiteIdOf("modules/docs/tests/unit/brd.test.ts"), "docs/unit/brd");
  assert.equal(suiteIdOf("modules/docs/src/brd.ts"), null);
});

test("a check file the table does not name, a named check that is not there, a suite the runner does not list and a wrong command are each named", () => {
  const exists = (p: string) => p !== "scripts/check-gone.mjs";
  const c = parseChecks(
    CHECKS(
      crow("`scripts/check-documentation.mjs`"),
      crow("`scripts/check-gone.mjs`", "`node scripts/test.mjs static --only static/gone`"),
      crow("`modules/docs/tests/static/brd.test.ts`", "`node scripts/test.mjs unit --only docs/static/brd`"),
      crow("`modules/docs/src/brd.ts`"),
    ),
  );
  const p = checkChecks(c, ["scripts/check-documentation.mjs", "scripts/check-traceability.mjs"], exists, IDS);
  assert.deepEqual(p, [
    "scripts/check-traceability.mjs is a check and the table of checks does not name it",
    "scripts/check-gone.mjs: named in the table of checks and not there",
    "scripts/check-gone.mjs: the runner lists no suite static/gone",
    "modules/docs/tests/static/brd.test.ts: \"how to run it\" is \"node scripts/test.mjs static --only docs/static/brd\" in code; found `node scripts/test.mjs unit --only docs/static/brd`",
    "modules/docs/src/brd.ts: not a script of scripts/ or a test of a module, so its suite cannot be told",
  ]);
});

test("a unit test of a module runs as the unit layer", () => {
  const c = parseChecks(CHECKS(crow("`modules/docs/tests/unit/brd.test.ts`", "`node scripts/test.mjs unit --only docs/unit/brd`")));
  assert.deepEqual(checkChecks(c, [], () => true, IDS), []);
});

test("every suite in code is one the runner lists, and every path in code exists, without exception; fences are not read", () => {
  const md = "Run `docs/static/brd` and `docs/static/gone`, see `modules/docs/src/brd.ts`, `modules/docs/src/gone.ts`, `docs/design/LLD.md`, `modules/<name>/STATUS.md`, `node scripts/test.mjs pr` and `baseline.json`.\n\n```\n`fenced/path.ts`\n```";
  assert.deepEqual(checkCodeSpans(md, (p) => p === "modules/docs/src/brd.ts", IDS), [
    "docs/static/gone: the runner lists no such suite",
    "modules/docs/src/gone.ts: the path does not exist",
    "docs/design/LLD.md: the path does not exist",
    "baseline.json: the path does not exist",
  ]);
});

test("the runner's listing is read as a layer and an identifier on each line", () => {
  const ids = suiteIdsOf("static       docs/static/brd\nunit         docs/unit/brd\nstatic       static/documentation\nnot a suite line\nbrowser      journey/browser/journey\n");
  assert.deepEqual([...ids].sort(), ["docs/static/brd", "docs/unit/brd", "journey/browser/journey", "static/documentation"]);
});
