// The test-document reader and its checks: what they accept, and that each check fails on a fixture built to break it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRequirements } from "../../src/brd.ts";
import {
  GAPS_END,
  GAPS_START,
  checkAutomation,
  checkCaseTable,
  checkDocument,
  checkEveryRequirementCovered,
  checkMustAutomated,
  checkNumbering,
  checkRequirementsExist,
  checkSequence,
  checkTestDocuments,
  compactIds,
  declaredTitles,
  functionalCells,
  mentionedCaseIds,
  mentionedPaths,
  parseAutomation,
  parseCases,
  parseGaps,
  buildMatrix,
  renderMatrix,
  verdictOf,
  withTraceability,
  TEST_DOCUMENTS,
  type TestCase,
} from "../../src/testdocs.ts";

const FILE = "modules/platform/tests/unit/session.test.ts";
const FILE_TEXT = `import { test } from "node:test";\n// test("only in a comment")\ntest("a signed session verifies", () => {});\ntest('another one', () => {});\n`;
const read = (path: string) => (path === FILE ? FILE_TEXT : undefined);

const brdRow = (id: string, o: Partial<Record<"pri" | "status", string>> = {}) =>
  `| ${id} | **A title.** What it says. | ${o.pri ?? "Must"} | Thesis stage 1 | A person can check this. | ${o.status ?? "Built"} |`;
const brdDoc = (...rows: string[]) => ["| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |", "| --- | --- | --- | --- | --- | --- |", ...rows].join("\n");
const reqs = parseRequirements(
  brdDoc(brdRow("BR-ID-01"), brdRow("BR-ID-02", { pri: "Should", status: "Not built" }), brdRow("BR-DESC-01", { status: "Partial. Some" }), brdRow("BR-DESC-02", { status: "Not built" })),
);

type Cell = "reqs" | "title" | "layer" | "type" | "steps" | "expected" | "auto";
const row = (id: string, o: Partial<Record<Cell, string>> = {}) =>
  `| ${id} | ${o.reqs ?? "BR-ID-01"} | ${o.title ?? "A title"} | ${o.layer ?? "unit"} | ${o.type ?? "positive"} | ${o.steps ?? "Do the thing."} | ${o.expected ?? "It works."} | ${o.auto ?? `automated: ${FILE} :: a signed session verifies`} |`;
const head = "| ID | Requirements | Title | Layer | Type | Steps and data | Expected result | Automation |\n| --- | --- | --- | --- | --- | --- | --- | --- |";
const doc = (...rows: string[]) => [head, ...rows].join("\n");

const parsed = (...rows: string[]) => {
  const r = parseCases(doc(...rows));
  assert.deepEqual(r.problems, []);
  return r.cases;
};
const ok = (id: string, reqIds: string, extra: Partial<Record<Cell, string>> = {}) => row(id, { reqs: reqIds, ...extra });

test("a well-formed row of each automation kind is read into its parts", () => {
  const [a, d, p, partly, later] = parsed(
    row("TC-ID-01"),
    row("TC-ID-02", { auto: "designed", layer: "integration" }),
    row("TC-ID-03", { auto: "people", layer: "manual", type: "usability" }),
    row("TC-ID-04", { expected: "Partly: it works for one part." }),
    row("TC-ID-05", { auto: "designed", layer: "manual", expected: "Cannot be tested until a thing exists." }),
  ) as [TestCase, TestCase, TestCase, TestCase, TestCase];
  assert.deepEqual([a.id, a.area, a.number, a.requirements, a.layer, a.type], ["TC-ID-01", "ID", 1, ["BR-ID-01"], "unit", "positive"]);
  assert.deepEqual(a.automation, { kind: "automated", file: FILE, title: "a signed session verifies" });
  assert.deepEqual(d.automation, { kind: "designed" });
  assert.deepEqual(p.automation, { kind: "people" });
  assert.equal(partly.partly, true);
  assert.equal(partly.notTestable, false);
  assert.equal(later.notTestable, true);
  assert.equal(parsed(row("TC-ID-01", { reqs: "BR-ID-01, BR-DESC-01" }))[0]!.requirements.length, 2);
});

test("header rows, rules, prose and a row template in a fenced block are not cases", () => {
  const text = `Some prose with TC-ID-01 in it.\n\n\`\`\`text\n${row("TC-ID-09", { layer: "nonsense" })}\n\`\`\`\n\n${doc()}`;
  assert.deepEqual(parseCases(text), { cases: [], problems: [] });
});

test("every kind of malformed row is named, all at once", () => {
  const bad = doc(
    row("TC-ID-01", { reqs: "BR-ID-01 | extra" }), // a pipe inside a cell
    row("TC-ID-1"), // an ID that is not of the form
    row("TC-XYZ-01"), // not an area
    row("TC-ID-02", { reqs: "BR-ID-01, BR-ID-01" }), // listed twice
    row("TC-ID-03", { reqs: "ID-01" }), // not a requirement ID
    row("TC-ID-04", { reqs: "BR-DESC-01" }), // area differs from the first requirement
    row("TC-ID-05", { layer: "sideways" }),
    row("TC-ID-06", { type: "happy" }),
    row("TC-ID-07", { auto: "done" }),
    row("TC-ID-08", { auto: "automated: tests/x.ts :: t" }), // not a test file path
    row("TC-ID-09", { layer: "manual" }), // automated but manual
    row("TC-ID-10", { layer: "browser" }), // layer differs from the directory
    row("TC-ID-11", { auto: "people", layer: "unit" }), // people but not manual
    row("TC-ID-12", { auto: "designed", expected: "Partly: all of it." }), // Partly on a case that is not automated
    row("TC-ID-13", { expected: "Cannot be tested until it exists." }), // automated but cannot be tested
    row("TC-ID-14", { title: "x" }),
    row("TC-ID-15", { steps: "" }),
  );
  const { cases, problems } = parseCases(bad);
  assert.equal(cases.length, 0);
  for (const part of [
    "TC-ID-01 (line 3): 9 cells, expected 8",
    "TC-ID-1 (line 4)",
    '"XYZ" is not a requirement area',
    "a requirement is listed twice",
    '"ID-01" is not a requirement ID',
    "the case is in area ID but its first requirement is in area DESC",
    'layer "sideways"',
    'type "happy"',
    'the automation "done"',
    '"tests/x.ts" is not a test file path',
    "an automated case cannot be in the manual layer",
    "the case is in the browser layer but its test file is in tests/unit",
    "a case for people must be in the manual layer",
    "belongs to automated cases only",
    'cannot also be automated',
    "no title",
    "no steps and data",
  ]) assert.ok(problems.some((p) => p.includes(part)), `missing "${part}" in:\n${problems.join("\n")}`);
});

test("the automation grammar is exactly three forms", () => {
  assert.deepEqual(parseAutomation("designed"), { kind: "designed" });
  assert.deepEqual(parseAutomation("people"), { kind: "people" });
  assert.deepEqual(parseAutomation(`automated: ${FILE} :: a title with :: inside`), { kind: "automated", file: FILE, title: "a title with :: inside" });
  for (const bad of ["", "Designed", "people.", `automated: ${FILE}`, `automated:${FILE} :: t`, `automated: ${FILE} ::`, "automated: a.test.ts :: t", "automated: modules/x/tests/other/a.test.ts :: t"]) {
    assert.equal(typeof parseAutomation(bad), "string", JSON.stringify(bad));
  }
});

test("a title is found only as the first argument of test, it or describe", () => {
  const text = [
    'test("one", () => {});',
    "it('two', () => {});",
    "describe(`three`, () => {});",
    'test.skip("four", () => {});',
    '  test(\n    "five",\n  () => {});',
    '// test("six")',
    'const x = foo("seven");',
    'test(name, () => {}); // "eight"',
    'assert.equal(a, "nine");',
  ].join("\n");
  assert.deepEqual(declaredTitles(text), ["one", "two", "three", "four", "five", "six"]);
  // a comment is not told apart from code: the title only has to be where a test would have it, so the titles also checked below are real
  assert.deepEqual(declaredTitles(FILE_TEXT), ["only in a comment", "a signed session verifies", "another one"]);
});

test("numbering names a repeat, a gap and an order that is wrong", () => {
  const cases = parsed(row("TC-ID-01"), row("TC-ID-01"), row("TC-ID-03"), row("TC-DESC-01", { reqs: "BR-DESC-01" }), row("TC-DESC-03", { reqs: "BR-DESC-01" }), row("TC-DESC-02", { reqs: "BR-DESC-01" }));
  const problems = checkNumbering(cases);
  assert.ok(problems.some((p) => p.includes("TC-ID-01") && p.includes("appears twice")), problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("TC-ID-03") && p.includes("should be TC-ID-02")), problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("TC-DESC-03") && p.includes("should be TC-DESC-02")), problems.join("\n"));
  assert.deepEqual(checkNumbering(parsed(row("TC-ID-01"), row("TC-ID-02"), row("TC-DESC-01", { reqs: "BR-DESC-01" }))), [], "two areas number independently");
});

test("a case that cites a requirement that does not exist is named, and so is a requirement no case cites", () => {
  const cases = parsed(row("TC-ID-01", { reqs: "BR-ID-01, BR-ID-77" }), row("TC-ID-02", { reqs: "BR-ID-02" }));
  assert.deepEqual(checkRequirementsExist(cases, reqs), ["TC-ID-01 (line 3): cites BR-ID-77, which is not a requirement in the BRD"]);
  const uncovered = checkEveryRequirementCovered(cases, reqs);
  assert.equal(uncovered.length, 2);
  assert.ok(uncovered[0]!.startsWith("BR-DESC-01:") && uncovered[1]!.startsWith("BR-DESC-02:"), uncovered.join("\n"));
  assert.deepEqual(checkEveryRequirementCovered(parsed(row("TC-ID-01", { reqs: "BR-ID-01, BR-ID-02, BR-DESC-01, BR-DESC-02" })), reqs), []);
});

test("an automated case needs a file that exists and a title that file declares", () => {
  const cases = parsed(
    row("TC-ID-01"),
    row("TC-ID-02", { auto: `automated: modules/platform/tests/unit/missing.test.ts :: a signed session verifies` }),
    row("TC-ID-03", { auto: `automated: ${FILE} :: a signed session verifies, with a word added` }),
    row("TC-ID-04", { auto: `automated: ${FILE} :: another one` }),
    row("TC-ID-05", { auto: "designed" }),
  );
  const problems = checkAutomation(cases, read);
  assert.equal(problems.length, 2, problems.join("\n"));
  assert.ok(problems[0]!.includes("TC-ID-02") && problems[0]!.includes("does not exist"));
  assert.ok(problems[1]!.includes("TC-ID-03") && problems[1]!.includes('declares no test titled "a signed session verifies, with a word added"'));
});

test("the known-gaps block is read, and a missing block is a problem", () => {
  const block = `${GAPS_START}\n- BR-ID-01: why\nnot a gap line BR-ID-02\n  - BR-DESC-01: indented is still a line\n${GAPS_END}`;
  assert.deepEqual(parseGaps(block), { found: true, ids: ["BR-ID-01", "BR-DESC-01"] });
  assert.deepEqual(parseGaps("nothing"), { found: false, ids: [] });
  assert.deepEqual(parseGaps(`${GAPS_END}\n${GAPS_START}`), { found: false, ids: [] });
});

test("every Must requirement that is Built or Partial has an automated case or is a stated gap, and the list cannot go stale", () => {
  const withAuto = parsed(row("TC-ID-01"), row("TC-DESC-01", { reqs: "BR-DESC-01", auto: "designed" }));
  // BR-DESC-01 is Must and Partial with only a designed case
  let problems = checkMustAutomated(withAuto, reqs, { found: true, ids: [] });
  assert.deepEqual(problems, ["BR-DESC-01: a Must requirement that is Partial has no automated case and is not in the known-gaps block"]);
  assert.deepEqual(checkMustAutomated(withAuto, reqs, { found: true, ids: ["BR-DESC-01"] }), [], "listed, so accepted");
  // the list is policed: it cannot name something that has an automated case, is not a Must, is not built or partial, or is not a requirement
  problems = checkMustAutomated(withAuto, reqs, { found: true, ids: ["BR-DESC-01", "BR-ID-01", "BR-ID-02", "BR-DESC-02", "BR-NFR-99"] });
  assert.ok(problems.some((p) => p.startsWith("BR-ID-01:") && p.includes("a case now automates it")), problems.join("\n"));
  assert.ok(problems.some((p) => p.startsWith("BR-ID-02:") && p.includes("not a Must requirement that is Built or Partial")), problems.join("\n"));
  assert.ok(problems.some((p) => p.startsWith("BR-DESC-02:") && p.includes("not a Must requirement that is Built or Partial")), problems.join("\n"));
  assert.ok(problems.some((p) => p.startsWith("BR-NFR-99:") && p.includes("not a requirement in the BRD")), problems.join("\n"));
  assert.ok(checkMustAutomated(withAuto, reqs, { found: false, ids: [] }).some((p) => p.includes(GAPS_START)), "no block at all");
  // a Must requirement that is not built needs no automated case
  assert.deepEqual(checkMustAutomated(parsed(row("TC-DESC-01", { reqs: "BR-DESC-02", auto: "designed" })), reqs.filter((r) => r.id === "BR-DESC-02"), { found: true, ids: [] }), []);
});

test("a verdict follows the rule, case by case", () => {
  const c = (o: Partial<Record<Cell, string>>) => parsed(row("TC-ID-01", o))[0]!;
  const full = c({});
  const partly = c({ expected: "Partly: some of it." });
  const designed = c({ auto: "designed" });
  const people = c({ auto: "people", layer: "manual" });
  const cannot = c({ auto: "people", layer: "manual", expected: "Cannot be tested until it exists." });
  assert.equal(verdictOf([]), "uncovered");
  assert.equal(verdictOf([full]), "covered-automated");
  assert.equal(verdictOf([full, full, cannot]), "covered-automated", "a case that cannot run yet is not open work");
  assert.equal(verdictOf([full, partly]), "covered-partly");
  assert.equal(verdictOf([partly]), "covered-partly");
  assert.equal(verdictOf([full, designed]), "covered-partly", "something that could be automated is not yet");
  assert.equal(verdictOf([full, people]), "covered-partly");
  assert.equal(verdictOf([designed]), "designed-only");
  assert.equal(verdictOf([designed, people, cannot]), "designed-only");
  assert.equal(verdictOf([people]), "people-only");
  assert.equal(verdictOf([people, cannot]), "people-only");
  assert.equal(verdictOf([cannot]), "not-testable-yet");
  assert.equal(verdictOf([cannot, cannot]), "not-testable-yet");
});

test("case IDs in a run of three or more in one area are written as a range", () => {
  assert.equal(compactIds(["TC-ID-01"]), "TC-ID-01");
  assert.equal(compactIds(["TC-ID-01", "TC-ID-02"]), "TC-ID-01, TC-ID-02");
  assert.equal(compactIds(["TC-ID-01", "TC-ID-02", "TC-ID-03"]), "TC-ID-01 to TC-ID-03");
  assert.equal(compactIds(["TC-ID-01", "TC-ID-02", "TC-ID-03", "TC-ID-05", "TC-DESC-06", "TC-DESC-07", "TC-DESC-08"]), "TC-ID-01 to TC-ID-03, TC-ID-05, TC-DESC-06 to TC-DESC-08");
  assert.equal(compactIds(["TC-ID-09", "TC-DESC-10", "TC-DESC-11"]), "TC-ID-09, TC-DESC-10, TC-DESC-11", "a run does not cross an area");
});

const TRACE = `# T\n\n<!-- COVERAGE-START -->\nold\n<!-- COVERAGE-END -->\n\n<!-- MATRIX-START -->\nold\n<!-- MATRIX-END -->\n`;

test("the matrix has one row per requirement in the BRD's order, and the counts follow the cases", () => {
  const cases = parsed(row("TC-ID-01"), row("TC-ID-02", { reqs: "BR-ID-01, BR-DESC-01", auto: "designed" }), row("TC-ID-03", { reqs: "BR-ID-02", auto: "people", layer: "manual", expected: "Cannot be tested until it exists." }));
  const rows = buildMatrix(cases, reqs);
  assert.deepEqual(rows.map((r) => [r.id, r.cases, r.automated, r.verdict]), [
    ["BR-ID-01", ["TC-ID-01", "TC-ID-02"], 1, "covered-partly"],
    ["BR-ID-02", ["TC-ID-03"], 0, "not-testable-yet"],
    ["BR-DESC-01", ["TC-ID-02"], 0, "designed-only"],
    ["BR-DESC-02", [], 0, "uncovered"],
  ]);
  const text = renderMatrix(rows);
  assert.ok(text.includes("| BR-ID-02 | A title. | Should | Not built | TC-ID-03 | 0 | not-testable-yet | to be linked |"), text);
  assert.ok(text.includes("| BR-DESC-02 | A title. | Must | Not built | none | 0 | uncovered | to be linked |"), text);
  const written = withTraceability(TRACE, cases, reqs);
  assert.ok(written.includes("Cases: 3, citing 3 of 4 requirements."), written);
  assert.ok(written.includes("| uncovered | 1 | 0 | 0 | 1 |"), written);
  assert.ok(written.includes("Must requirements that the BRD calls Built or Partial: 2. With at least one automated case: 1. Without: 1 (BR-DESC-01"), written);
  assert.equal(withTraceability(written, cases, reqs), written, "regenerating changes nothing");
});

test("regenerating keeps what a person typed in the functional-requirements column, and refuses a document with no markers", () => {
  const cases = parsed(row("TC-ID-01"));
  const written = withTraceability(TRACE, cases, reqs);
  assert.ok(written.includes("| BR-ID-01 | A title. | Must | Built | TC-ID-01 | 1 | covered-automated | to be linked |"));
  const edited = written.replace("covered-automated | to be linked |", "covered-automated | FR-ID-01, FR-ID-02 |");
  assert.equal(functionalCells(edited).get("BR-ID-01"), "FR-ID-01, FR-ID-02");
  const again = withTraceability(edited, cases, reqs);
  assert.ok(again.includes("| covered-automated | FR-ID-01, FR-ID-02 |"), again);
  assert.ok(again.includes("| BR-ID-02 | A title. | Should | Not built | none | 0 | uncovered | to be linked |"), "a row with nothing typed says to be linked");
  assert.throws(() => withTraceability("# no markers", cases, reqs), /needs <!-- COVERAGE-START --> and <!-- COVERAGE-END -->/);
  assert.throws(() => withTraceability(`<!-- COVERAGE-START -->\n<!-- COVERAGE-END -->\n<!-- MATRIX-END -->\n<!-- MATRIX-START -->`, cases, reqs), /needs <!-- MATRIX-START -->/);
});

test("entries numbered by headings must be unique and run in order", () => {
  assert.deepEqual(checkSequence("## SC-01 One\n\n### SC-02 Two\n", "SC", "d"), []);
  const bad = checkSequence("## SC-01 One\n## SC-01 Again\n## SC-04 Gap\n```\n## SC-09 in a fence\n```\n", "SC", "d");
  assert.ok(bad.some((p) => p.includes("SC-01 appears twice")), bad.join("\n"));
  assert.ok(bad.some((p) => p.includes("expected SC-02 next but found SC-01")), bad.join("\n"));
  assert.ok(bad.some((p) => p.includes("expected SC-02 next but found SC-04")), bad.join("\n"));
  assert.ok(!bad.some((p) => p.includes("SC-09")), "a fenced heading is not an entry");
  assert.deepEqual(checkSequence("no entries", "RP", "d"), ["d: no RP-NN heading found"]);
  assert.deepEqual(checkSequence("## SC-01 x\n## RP-02 y\n", "RP", "d"), ["d: expected RP-01 next but found RP-02; numbers run in order with no gap"]);
});

test("case IDs and repository paths are found in prose and code spans, and not in fenced blocks", () => {
  assert.deepEqual(mentionedCaseIds("See TC-ID-01 and TC-DESC-12, TC-ID-01 again, TC-ID-1, TC-AREA-NN."), ["TC-ID-01", "TC-DESC-12"]);
  const text = "Run `node scripts/test.mjs` on `modules/platform/tests/unit/session.test.ts`, not `docs/x.md` or `modules/*/db/seed.sql` or `scripts/a b`.\n```\n`scripts/in-a-fence.mjs`\n```\n";
  assert.deepEqual(mentionedPaths(text), ["modules/platform/tests/unit/session.test.ts"]);
  assert.deepEqual(mentionedPaths("`.github/workflows/ci.yml`, `app/page.tsx`."), [".github/workflows/ci.yml", "app/page.tsx"]);
});

test("another document names a case, a requirement or a path that does not exist, and is told so", () => {
  const cases = parsed(row("TC-ID-01"));
  const exists = (p: string) => p === "scripts/real.mjs";
  const text = "## SC-01 One\n\nUses TC-ID-01, TC-ID-02, BR-ID-01, BR-ID-77, `scripts/real.mjs` and `scripts/gone.mjs`.\n";
  const problems = checkDocument("d.md", text, cases, reqs, exists, ["SC"]);
  assert.deepEqual(problems, [
    "d.md: TC-ID-02 is mentioned but is not a case in TEST-CASES.md",
    "d.md: BR-ID-77 is mentioned but is not a requirement in the BRD",
    "d.md: the path scripts/gone.mjs does not exist in the repository",
  ]);
  assert.deepEqual(checkDocument("d.md", "## SC-01 One\n\nTC-ID-01\n", cases, reqs, exists, ["SC"]), []);
});

// A set of fixtures that is clean, then broken one way at a time.
const GAPS = `${GAPS_START}\n- BR-DESC-01: no automated case\n${GAPS_END}`;
const cleanCases = () =>
  [
    "# Cases",
    GAPS,
    doc(
      ok("TC-ID-01", "BR-ID-01"),
      ok("TC-ID-02", "BR-ID-02", { auto: "people", layer: "manual", expected: "Cannot be tested until it exists." }),
      ok("TC-DESC-01", "BR-DESC-01", { auto: "designed", layer: "integration" }),
      ok("TC-DESC-02", "BR-DESC-02", { auto: "designed", layer: "manual", expected: "Cannot be tested until it exists." }),
    ),
  ].join("\n\n");
const cleanTrace = () => withTraceability(TRACE, parseCases(cleanCases()).cases, reqs);
const run = (casesText: string, traceabilityText: string) => checkCaseTable({ casesText, traceabilityText, reqs, read }).problems;

test("a clean set of documents passes", () => {
  assert.deepEqual(run(cleanCases(), cleanTrace()), []);
});

test("each check fails on a fixture broken to trip it", () => {
  const trace = cleanTrace();
  const has = (problems: string[], part: string) => assert.ok(problems.some((p) => p.includes(part)), `expected "${part}" in:\n${problems.join("\n")}`);
  // (a) a malformed row
  has(run(cleanCases().replace("| unit | positive |", "| sideways | positive |"), trace), 'layer "sideways"');
  // (a) a number that is skipped
  has(run(cleanCases().replace("TC-ID-02", "TC-ID-04"), trace), "should be TC-ID-02");
  // (b) a requirement that does not exist
  has(run(cleanCases().replace("| BR-ID-02 |", "| BR-ID-42 |"), trace), "BR-ID-42, which is not a requirement");
  // (c) a title that the file does not declare, and a file that is not there
  has(run(cleanCases().replace(":: a signed session verifies", ":: a signed session verified"), trace), "declares no test titled");
  has(run(cleanCases().replace(FILE, "modules/platform/tests/unit/gone.test.ts"), trace), "does not exist");
  // (d) a requirement no case cites
  has(run(cleanCases().replace(/\n\| TC-DESC-02 .*$/m, ""), trace), "BR-DESC-02: no case cites it");
  // (e) a Must requirement that is Partial with no automated case and not listed
  has(run(cleanCases().replace(GAPS, `${GAPS_START}\n${GAPS_END}`), trace), "BR-DESC-01: a Must requirement that is Partial has no automated case");
  // (e) the list names something that now has an automated case
  has(run(cleanCases().replace(/\n\| TC-DESC-01 .*$/m, `\n${ok("TC-DESC-01", "BR-DESC-01")}`), trace), "BR-DESC-01: listed in the known-gaps block, but a case now automates it");
  // (f) a matrix that is out of date
  has(run(cleanCases(), trace.replace("covered-automated", "covered-partly")), "out of date");
  has(run(cleanCases(), trace.replace("Cases: 4", "Cases: 5")), "out of date");
});

test("a document whose generated blocks are missing is a problem, not a crash", () => {
  const problems = run(cleanCases(), "# no markers here");
  assert.equal(problems.length, 1);
  assert.ok(problems[0]!.startsWith("TRACEABILITY.md:") && problems[0]!.includes("needs <!-- COVERAGE-START -->"), problems.join("\n"));
});

test("the seven documents are checked together, and one that is missing is named", () => {
  const docs: Record<string, string | undefined> = {
    [TEST_DOCUMENTS.cases]: cleanCases(),
    [TEST_DOCUMENTS.traceability]: cleanTrace(),
    [TEST_DOCUMENTS.strategy]: "# S\n\nSee TC-ID-01 and `scripts/test.mjs`.\n",
    [TEST_DOCUMENTS.scenarios]: "## SC-01 One\n\nTC-ID-02\n\n## SC-02 Two\n\nTC-ID-01\n",
    [TEST_DOCUMENTS.regression]: "## RP-01 One\n\nTC-ID-01\n",
    [TEST_DOCUMENTS.uat]: "# U\n",
    [TEST_DOCUMENTS.data]: "## TD-01 One\n\nx\n",
  };
  const exists = (p: string) => p === "scripts/test.mjs";
  assert.deepEqual(checkTestDocuments({ brd: reqs, docs, read, exists }).problems, []);
  const without = { ...docs, [TEST_DOCUMENTS.uat]: undefined };
  assert.deepEqual(checkTestDocuments({ brd: reqs, docs: without, read, exists }).problems, ["docs/test/UAT-PLAN.md: the document does not exist"]);
  const broken = { ...docs, [TEST_DOCUMENTS.scenarios]: "## SC-01 One\n\nTC-ID-09\n\n## SC-03 Three\n" };
  const problems = checkTestDocuments({ brd: reqs, docs: broken, read, exists }).problems;
  assert.ok(problems.some((p) => p.includes("TC-ID-09 is mentioned but is not a case")), problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("expected SC-02 next but found SC-03")), problems.join("\n"));
  const noCases = checkTestDocuments({ brd: reqs, docs: { ...docs, [TEST_DOCUMENTS.cases]: undefined }, read, exists });
  assert.deepEqual(noCases.problems, ["docs/test/TEST-CASES.md: the document does not exist"]);
});
