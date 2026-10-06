// The findings-register reader: rows, the vocabulary, grouping, source links, evidence and counts, each with a seeded fault.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COUNTS_END,
  COUNTS_START,
  checkCounts,
  checkEvidence,
  checkGrouping,
  checkSourceLinks,
  countsBlock,
  countsOf,
  evidenceItemOf,
  headingAnchors,
  parseFindings,
  resolveLink,
  scriptAnchors,
  statusKindOf,
  type Finding,
} from "../../src/findings.ts";

const HEAD = "| ID | Finding | Evidence | Severity | Module | Source | Status |\n| --- | --- | --- | --- | --- | --- | --- |";
const row = (n: number, over: Partial<Record<"statement" | "evidence" | "severity" | "module" | "source" | "status", string>> = {}) => {
  const c = { statement: "Something is not checked.", evidence: "`modules/a/src/x.ts`: `check`", severity: "not rated", module: "platform", source: "[platform status, Known limits](../modules/platform/STATUS.md#known-limits)", status: "open", ...over };
  return `| FND-${String(n).padStart(3, "0")} | ${c.statement} | ${c.evidence} | ${c.severity} | ${c.module} | ${c.source} | ${c.status} |`;
};
const register = (...rows: string[]) => [HEAD, ...rows].join("\n");
const problemsOf = (text: string): string => {
  try {
    parseFindings(text);
  } catch (e) {
    return (e as Error).message;
  }
  return "";
};

test("rows are read with their evidence, severity, module, every source link and the kind of status", () => {
  const f = parseFindings(
    register(
      row(1, { evidence: "`a/b.ts`: `drain`; `docs/x.md`", severity: "high", source: "[A, one](../a.md#one); also [B, two](b.md#two)", status: "fixed in slice 3 review fixes (migration 0014)" }),
      row(2, { evidence: "none recorded in the source", module: "hosting", status: "documented decision (assumption)" }),
      row(3, { module: "repository", status: "evidence changed: re-check (gone)" }),
    ),
  );
  assert.deepEqual(f.map((x) => [x.id, x.severity, x.module, x.statusKind]), [["FND-001", "high", "platform", "fixed"], ["FND-002", "not rated", "hosting", "decision"], ["FND-003", "not rated", "repository", "recheck"]]);
  assert.deepEqual(f[0]!.evidenceItems, [{ path: "a/b.ts", name: "drain" }, { path: "docs/x.md" }]);
  assert.deepEqual(f[0]!.sources, [{ text: "A, one", target: "../a.md#one" }, { text: "B, two", target: "b.md#two" }]);
  assert.deepEqual(f[1]!.evidenceItems, []);
});

test("text outside a row, the heading row and rows inside a fence are not findings", () => {
  const text = ["Prose about FND-009 in a sentence.", register(row(1)), "```", row(2), "```"].join("\n");
  assert.deepEqual(parseFindings(text).map((x) => x.id), ["FND-001"]);
});

test("every kind of malformed row is named", () => {
  const msg = problemsOf(
    register(
      "| FND-001 | too | few |",
      row(2, { statement: "" }),
      row(3, { statement: "x".repeat(601) }),
      row(4, { evidence: "" }),
      row(5, { evidence: "modules/a/src/x.ts" }),
      row(6, { severity: "critical" }),
      row(7, { module: "docs" }),
      row(8, { source: "no link here" }),
      row(9, { status: "done" }),
    ),
  );
  for (const part of ["FND-001: 3 cells, expected 7", "FND-002: the finding is empty", "FND-003: the finding is 601 characters", "FND-004: no evidence", 'FND-005: the evidence item "modules/a/src/x.ts" is not', 'FND-006: severity "critical" is not', 'FND-007: module "docs" is not', "FND-008: the source is not a link", 'FND-009: status "done" does not start with']) {
    assert.ok(msg.includes(part), `missing "${part}" in ${msg}`);
  }
});

test("a row that appears twice and a gap in the numbers are named; a new number at the end of a module is not a gap", () => {
  assert.match(problemsOf(register(row(1), row(1))), /FND-001: appears twice/);
  assert.match(problemsOf(register(row(1), row(3))), /FND-002 is missing/);
  assert.match(problemsOf(register(row(2), row(3))), /FND-001 is missing/);
  assert.equal(problemsOf(register(row(1), row(3, { module: "factory" }), row(2, { module: "factory" }))), "");
});

test("a status is one of four forms, with an optional note", () => {
  assert.equal(statusKindOf("open"), "open");
  assert.equal(statusKindOf("open (OQ-08)"), "open");
  assert.equal(statusKindOf("fixed in slice 1"), "fixed");
  assert.equal(statusKindOf("documented decision"), "decision");
  assert.equal(statusKindOf("evidence changed: re-check (the file is gone)"), "recheck");
  assert.equal(statusKindOf("opened"), null);
  assert.equal(statusKindOf("fixed"), null);
  assert.equal(statusKindOf(""), null);
});

test("an evidence item is a path in code, or a path, a colon and a name in code", () => {
  assert.deepEqual(evidenceItemOf("`a/b.ts`"), { path: "a/b.ts" });
  assert.deepEqual(evidenceItemOf("`a/b.ts`: `drain`"), { path: "a/b.ts", name: "drain" });
  for (const bad of ["a/b.ts", "`a/b.ts` `drain`", "`a/b.ts`:`drain`", "`a/b.ts`: drain", "", "`a/b.ts`, `c.ts`"]) assert.equal(evidenceItemOf(bad), null, bad);
});

test("modules are together and in order, and numbers rise within a module", () => {
  const f = (text: string) => parseFindings(text);
  assert.deepEqual(checkGrouping(f(register(row(1), row(2), row(3, { module: "factory" }), row(4, { module: "hosting" })))), []);
  assert.match(checkGrouping(f(register(row(1), row(2, { module: "factory" }), row(3))))[0]!, /FND-003: module platform appears again/);
  assert.match(checkGrouping(f(register(row(1, { module: "factory" }), row(2))))[0]!, /FND-002: module platform comes after factory/);
  assert.match(checkGrouping(f(register(row(2), row(1))))[0]!, /FND-001: comes after FND-002/);
  assert.deepEqual(checkGrouping(f(register(row(1), row(3), row(2, { module: "run" })))), []);
});

test("a link is resolved from the file that holds it, and one that leaves the repository does not resolve", () => {
  assert.deepEqual(resolveLink("docs/FINDINGS.md", "../modules/run/STATUS.md#known-limits"), { path: "modules/run/STATUS.md", anchor: "known-limits" });
  assert.deepEqual(resolveLink("docs/FINDINGS.md", "design/HLD.md#x"), { path: "docs/design/HLD.md", anchor: "x" });
  assert.deepEqual(resolveLink("docs/FINDINGS.md", "./GLOSSARY.md"), { path: "docs/GLOSSARY.md", anchor: "" });
  assert.deepEqual(resolveLink("docs/FINDINGS.md", "#top"), { path: "docs/FINDINGS.md", anchor: "top" });
  assert.equal(resolveLink("docs/FINDINGS.md", "../../outside.md"), null);
});

test("anchors are made as GitHub makes them: code text kept, punctuation dropped, underscores kept, repeats numbered, fenced blocks ignored", () => {
  const md = ["# Title", "## 5.2 The `x` thing (AS BUILT)", "## Known limits", "## Known limits", "```", "## not a heading", "```", "### Ünïcode, and: more", "## The `next_step` rule"].join("\n");
  assert.deepEqual([...headingAnchors(md)], ["title", "52-the-x-thing-as-built", "known-limits", "known-limits-1", "ünïcode-and-more", "the-next_step-rule"]);
});

test("the anchors of the document checker drop inline code and underscores, so the two rules can differ", () => {
  const md = ["## 5.2 The `x` thing", "## The `next_step` rule", "## Plain heading"].join("\n");
  assert.deepEqual([...scriptAnchors(md)], ["52-the--thing", "the--rule", "plain-heading"]);
  assert.ok(headingAnchors(md).has("52-the-x-thing") && !scriptAnchors(md).has("52-the-x-thing"));
});

test("a link that resolves on GitHub but not for the document checker is reported, and the reverse is a missing heading", () => {
  const md = "## 5.2 The `x` thing\n## Plain heading\n";
  const resolver = { exists: () => true, anchors: () => headingAnchors(md), scriptAnchors: () => scriptAnchors(md) };
  const f = parseFindings(
    register(
      row(1, { source: "[a](../modules/a/STATUS.md#52-the-x-thing)" }),
      row(2, { source: "[a](../modules/a/STATUS.md#plain-heading)" }),
      row(3, { source: "[a](../modules/a/STATUS.md#52-the--thing)" }),
    ),
  );
  const msg = checkSourceLinks(f, "docs/FINDINGS.md", resolver).join("\n");
  assert.match(msg, /FND-001: .*matches a heading on GitHub but not for scripts\/check-documentation\.mjs/);
  assert.match(msg, /FND-003: .*has no matching heading/);
  assert.ok(!msg.includes("FND-002"), msg);
});

test("every source link must lead to a file and to a heading that is there", () => {
  const files = new Set(["modules/a/STATUS.md", "docs/design/HLD.md", "docs/image.png"]);
  const anchors = new Set(["known-limits"]);
  const resolver = { exists: (p: string) => files.has(p), anchors: () => anchors };
  const link = (target: string) => `[x](${target})`;
  const f = parseFindings(
    register(
      row(1, { source: link("../modules/a/STATUS.md#known-limits") }),
      row(2, { source: link("../modules/gone/STATUS.md#known-limits") }),
      row(3, { source: link("../modules/a/STATUS.md#no-such-heading") }),
      row(4, { source: link("../modules/a/STATUS.md") }),
      row(5, { source: link("https://example.org/x") }),
      row(6, { source: `${link("design/HLD.md#known-limits")}; also ${link("design/HLD.md#missing")}` }),
      row(7, { source: link("../../outside.md#x") }),
    ),
  );
  const msg = checkSourceLinks(f, "docs/FINDINGS.md", resolver).join("\n");
  for (const part of ['FND-002: the source link "../modules/gone/STATUS.md#known-limits" does not resolve to a file', 'FND-003: the source link "../modules/a/STATUS.md#no-such-heading" has no matching heading', 'FND-004: the source link "../modules/a/STATUS.md" names no heading', "FND-005: the source link \"https://example.org/x\" is outside the repository", 'FND-006: the source link "design/HLD.md#missing" has no matching heading', 'FND-007: the source link "../../outside.md#x" does not resolve to a file']) {
    assert.ok(msg.includes(part), `missing "${part}" in ${msg}`);
  }
  assert.ok(!msg.includes("FND-001"), msg);
  assert.equal(msg.split("\n").length, 6);
});

test("evidence must exist and hold its name, unless the row says the evidence changed", () => {
  const holds = new Map([["a/b.ts", "export function drain() {}"], ["dir", "anything"]]);
  const files = { exists: (p: string) => holds.has(p), contains: (p: string, t: string) => (holds.get(p) ?? "").includes(t) };
  const f = parseFindings(
    register(
      row(1, { evidence: "`a/b.ts`: `drain`; `dir`" }),
      row(2, { evidence: "`a/gone.ts`" }),
      row(3, { evidence: "`a/b.ts`: `renamed`" }),
      row(4, { evidence: "`a/gone.ts`; `a/b.ts`: `renamed`", status: "evidence changed: re-check (a/gone.ts is gone)" }),
      row(5, { evidence: "none recorded in the source" }),
    ),
  );
  assert.deepEqual(checkEvidence(f, files), [
    'FND-002: the evidence "a/gone.ts" does not exist; correct it or mark the row "evidence changed: re-check"',
    'FND-003: "a/b.ts" no longer holds "renamed"; correct it or mark the row "evidence changed: re-check"',
  ]);
});

const sample = (): Finding[] =>
  parseFindings(
    register(
      row(1, { severity: "high", status: "fixed in slice 1" }),
      row(2, { severity: "low" }),
      row(3, { module: "factory", status: "documented decision" }),
      row(4, { module: "factory", severity: "medium", status: "evidence changed: re-check (gone)" }),
      row(5, { module: "repository", severity: "medium" }),
    ),
  );

test("counts are given for each module that has rows, and a total", () => {
  const c = countsOf(sample());
  assert.deepEqual(c.map((x) => [x.module, x.total]), [["platform", 2], ["factory", 2], ["repository", 1], ["all", 5]]);
  assert.deepEqual(c[0], { module: "platform", total: 2, open: 1, recheck: 0, fixed: 1, decision: 0, high: 1, medium: 0, low: 1, notRated: 0 });
  assert.deepEqual(c[1], { module: "factory", total: 2, open: 0, recheck: 1, fixed: 0, decision: 1, high: 0, medium: 1, low: 0, notRated: 1 });
  assert.deepEqual(c[3], { module: "all", total: 5, open: 2, recheck: 1, fixed: 1, decision: 1, high: 1, medium: 2, low: 1, notRated: 1 });
  assert.equal(countsBlock(sample()).split("\n").length, 2 + 4);
});

test("the counts block must be exactly the counts of the rows", () => {
  const findings = sample();
  const doc = (block: string) => `Intro\n${COUNTS_START}\n${block}\n${COUNTS_END}\nRest`;
  assert.deepEqual(checkCounts(doc(countsBlock(findings)), findings), []);
  const stale = countsBlock(findings).replace("| platform | 2 |", "| platform | 3 |");
  assert.match(checkCounts(doc(stale), findings)[0]!, /does not match the rows; it must read:\n\| Module \| Findings/);
  assert.match(checkCounts("no markers", findings)[0]!, /counts block is missing/);
  assert.match(checkCounts(`${COUNTS_END}\n${COUNTS_START}`, findings)[0]!, /counts block is missing/);
});
