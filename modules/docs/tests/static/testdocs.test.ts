// The real test documents: the case table, the traceability matrix and the five other documents, checked against the BRD and against the test
// files they name. The same checks as scripts/check-test-docs.mjs, run here so a failure names the test and the layer. The last test proves the
// checks can fail, by breaking a copy of the real text one way at a time.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseRequirements } from "../../src/brd.ts";
import {
  GAPS_END,
  GAPS_START,
  TEST_DOCUMENTS,
  checkAutomation,
  checkCaseTable,
  checkDocument,
  checkEveryRequirementCovered,
  checkMustAutomated,
  checkNumbering,
  checkRequirementsExist,
  checkTestDocuments,
  parseCases,
  parseGaps,
  withTraceability,
} from "../../src/testdocs.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const exists = (p: string) => existsSync(join(ROOT, p));
const read = (p: string) => (exists(p) ? readFileSync(join(ROOT, p), "utf8") : undefined);

const reqs = parseRequirements(read("docs/brd/BRD.md") ?? "");
const docs = Object.fromEntries(Object.values(TEST_DOCUMENTS).map((p) => [p, read(p)])) as Record<string, string | undefined>;
const casesText = docs[TEST_DOCUMENTS.cases] ?? "";
const traceText = docs[TEST_DOCUMENTS.traceability] ?? "";
const { cases, problems: tableProblems } = parseCases(casesText);

test("all seven test documents exist, each opening with a title, a version line and a status line", () => {
  for (const path of Object.values(TEST_DOCUMENTS)) {
    const text = docs[path];
    assert.ok(text !== undefined, `${path} does not exist`);
    const lines = text.split("\n").filter((l) => l.trim());
    assert.match(lines[0] ?? "", /^# \S/, `${path}: the first line is the title`);
    assert.match(lines[1] ?? "", /^Version \d+\.\d+\. Date \d{1,2} [A-Z][a-z]+ \d{4}\. Status: /, `${path}: the second line is the version, date and status`);
    assert.ok(text.includes("How this relates to the other documents"), `${path}: no line saying how it relates to the other documents`);
  }
});

test("the case table is well formed: eight cells a row, known layers and types, the automation grammar, IDs unique and in order", () => {
  assert.deepEqual(tableProblems, []);
  assert.ok(cases.length >= reqs.length, `${cases.length} cases for ${reqs.length} requirements`);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  assert.deepEqual(checkNumbering(cases), []);
});

test("every requirement a case cites is in the BRD, and every requirement in the BRD is cited by a case", () => {
  assert.deepEqual(checkRequirementsExist(cases, reqs), []);
  assert.deepEqual(checkEveryRequirementCovered(cases, reqs), []);
});

test("every automated case names a test file that exists and a title that file declares, word for word", () => {
  assert.ok(cases.some((c) => c.automation.kind === "automated"), "no automated case at all");
  assert.deepEqual(checkAutomation(cases, read), []);
});

test("every Must requirement that the BRD calls Built or Partial has an automated case, or is a stated gap, and every stated gap is true", () => {
  const gaps = parseGaps(casesText);
  assert.ok(gaps.found, "the known-gaps block is missing");
  assert.deepEqual(checkMustAutomated(cases, reqs, gaps), []);
});

test("a case whose test lives in a layer is in that layer, and a case for people is in the manual layer", () => {
  for (const c of cases) {
    if (c.automation.kind === "automated") assert.notEqual(c.layer, "manual", `${c.id} is automated but manual`);
    if (c.automation.kind === "people") assert.equal(c.layer, "manual", `${c.id} is for people but not manual`);
  }
});

test("the coverage counts and the matrix in TRACEABILITY.md are what the cases and the BRD add up to", () => {
  assert.equal(withTraceability(traceText, cases, reqs), traceText, "run: node scripts/check-test-docs.mjs --write");
});

test("the strategy, scenarios, regression pack, traceability, UAT plan and test data name only cases, requirements and paths that exist", () => {
  for (const path of Object.values(TEST_DOCUMENTS)) {
    const text = docs[path];
    assert.ok(text !== undefined, `${path} does not exist`);
    const sequences = path === TEST_DOCUMENTS.scenarios ? ["SC"] : path === TEST_DOCUMENTS.regression ? ["RP"] : path === TEST_DOCUMENTS.data ? ["TD"] : [];
    assert.deepEqual(checkDocument(path, text, cases, reqs, exists, sequences), []);
  }
});

test("the whole set passes the one function the script calls", () => {
  assert.deepEqual(checkTestDocuments({ brd: reqs, docs, read, exists }).problems, []);
});

test("the UAT plan's first section is acceptance by people, because the other documents link to it", () => {
  const text = docs[TEST_DOCUMENTS.uat] ?? "";
  assert.match(text, /^## 1\. Acceptance by people$/im);
});

test("the strategy has the sections the other documents link to: layers (2), running the layers (8) and findings from reading the tests (10)", () => {
  const text = docs[TEST_DOCUMENTS.strategy] ?? "";
  assert.match(text, /^## 2\. /m);
  assert.match(text, /^## 8\. /m);
  assert.match(text, /^## 10\. /m);
});

test("no document cites a functional requirement, use case, screen, message or rule, which belong to the functional specification", () => {
  for (const path of Object.values(TEST_DOCUMENTS)) {
    const body = (docs[path] ?? "").replace(/```[\s\S]*?```/g, "").replace(/<!-- MATRIX-START -->[\s\S]*?<!-- MATRIX-END -->/, "");
    assert.deepEqual(body.match(/\b(?:UC|SCR|MSG|RULE)-[A-Z0-9-]+\b/g) ?? [], [], path);
  }
  const body = casesText.replace(/```[\s\S]*?```/g, "");
  assert.deepEqual(body.match(/\bFR-[A-Z]+-\d+\b/g) ?? [], []);
});

test("the checks can fail: each break made in a copy of the real text is reported", () => {
  const run = (cases2: string, trace2: string = traceText) => checkCaseTable({ casesText: cases2, traceabilityText: trace2, reqs, read }).problems;
  const has = (problems: string[], part: string) => assert.ok(problems.some((p) => p.includes(part)), `expected "${part}" in: ${problems.slice(0, 5).join(" / ")}`);
  assert.deepEqual(run(casesText), [], "the real text must be clean before it is broken");

  const firstAutomated = cases.find((c) => c.automation.kind === "automated" && !c.partly);
  assert.ok(firstAutomated && firstAutomated.automation.kind === "automated");
  const { file, title } = firstAutomated.automation;
  // (c) a title the file does not declare, and a file that is not there
  has(run(casesText.replace(`:: ${title} |`, `:: ${title} (reworded) |`)), "declares no test titled");
  has(run(casesText.replace(`automated: ${file} ::`, `automated: ${file.replace(".test.ts", "-gone.test.ts")} ::`)), "does not exist");

  // (a) a layer that is not one, a row with a cell too many, a number that is skipped
  has(run(casesText.replace(`| ${firstAutomated.layer} | ${firstAutomated.type} |`, `| sideways | ${firstAutomated.type} |`)), 'layer "sideways"');
  const second = cases[1]!;
  has(run(casesText.replace(`| ${second.id} | `, `| ${second.id} | extra | `)), "9 cells");
  const firstArea = cases[0]!.area;
  const inArea = cases.filter((c) => c.area === firstArea);
  has(run(casesText.replace(`| ${inArea[1]!.id} |`, `| ${inArea[0]!.id.replace(/\d+$/, "99")} |`)), "should be");

  // (b) a requirement that is not in the BRD
  has(run(casesText.replace(`| ${firstAutomated.requirements.join(", ")} |`, `| BR-GOV-99 |`)), "BR-GOV-99");

  // (d) a requirement no case cites: drop every row that cites it
  const only = reqs.find((r) => cases.filter((c) => c.requirements.includes(r.id)).length === 1);
  if (only) {
    const lines = casesText.split("\n").filter((l) => !(l.includes(`| ${only.id} |`) && /^\| TC-/.test(l)));
    has(run(lines.join("\n")), `${only.id}: no case cites it`);
  }

  // (e) the known-gaps block: empty it, and name a requirement that has an automated case
  const gaps = parseGaps(casesText);
  assert.ok(gaps.ids.length > 0, "the known-gaps block lists the Must requirements with no automated case");
  has(run(casesText.replace(/<!-- AUTOMATION-GAPS-START -->[\s\S]*?<!-- AUTOMATION-GAPS-END -->/, `${GAPS_START}\n${GAPS_END}`)), `${gaps.ids[0]}: a Must requirement`);
  const automatedMust = reqs.find((r) => r.priority === "Must" && (r.status === "built" || r.status === "partial") && !gaps.ids.includes(r.id) && cases.some((c) => c.requirements.includes(r.id) && c.automation.kind === "automated"));
  assert.ok(automatedMust, "there is a Must requirement with an automated case");
  has(run(casesText.replace(GAPS_START, `${GAPS_START}\n- ${automatedMust.id}: it is not a gap`)), `${automatedMust.id}: listed in the known-gaps block, but a case now automates it`);
  has(run(casesText.replace(GAPS_START, "<!-- gone -->")), "needs");

  // (f) the matrix and the counts: change a verdict in the matrix, empty the matrix, and change a count
  const inMatrix = (re: RegExp, to: string) => traceText.replace(/<!-- MATRIX-START -->[\s\S]*?<!-- MATRIX-END -->/, (block) => block.replace(re, to));
  has(run(casesText, inMatrix(/\| covered-partly \|/, "| covered-automated |")), "out of date");
  has(run(casesText, inMatrix(/^\| BR-GOV-02 .*\n/m, "")), "out of date");
  has(run(casesText, traceText.replace(/Cases: \d+, citing/, "Cases: 1, citing")), "out of date");
  has(run(casesText, traceText.replace(/<!-- MATRIX-START -->[\s\S]*?<!-- MATRIX-END -->/, "<!-- MATRIX-START -->\n<!-- MATRIX-END -->")), "out of date");
});

test("another document that names a case, a requirement or a path that does not exist is reported", () => {
  const bad = "## SC-01 One\n\nSee TC-GOV-99, BR-GOV-99 and `scripts/not-a-script.mjs`.\n";
  const problems = checkDocument("d.md", bad, cases, reqs, exists, ["SC"]);
  assert.equal(problems.length, 3, problems.join(" / "));
});
