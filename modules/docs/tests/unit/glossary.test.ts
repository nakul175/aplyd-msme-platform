// The glossary reader: rows, order, the terms it must cover, the identifier schemes, paths and links, used terms and the stage table, each with a seeded fault.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkPathsInText,
  checkStages,
  checkWhere,
  definedPrefixes,
  letterOf,
  missingPrefixes,
  missingTerms,
  parseGlossary,
  requiredTerms,
  searchKey,
  sentenceCount,
  sortKey,
  stageRows,
  unusedTerms,
} from "../../src/glossary.ts";

const HEAD = "| Term | Meaning | Do not confuse with | Where defined or enforced |\n| --- | --- | --- | --- |";
const row = (term: string, over: Partial<Record<"meaning" | "confuse" | "where", string>> = {}) => {
  const c = { meaning: "A thing the repository uses.", confuse: "Another thing.", where: "[FSD](fsd/FSD.md)", ...over };
  return `| **${term}** | ${c.meaning} | ${c.confuse} | ${c.where} |`;
};
const glossary = (...blocks: [string, ...string[]][]) => blocks.map(([letter, ...rows]) => `## ${letter}\n\n${HEAD}\n${rows.join("\n")}`).join("\n\n");
const problemsOf = (text: string): string => {
  try {
    parseGlossary(text);
  } catch (e) {
    return (e as Error).message;
  }
  return "";
};

test("rows are read under their letter, with the four cells", () => {
  const e = parseGlossary(glossary(["A", row("Alpha"), row("Apple")], ["B", row("Beta (test suite)")]));
  assert.deepEqual(e.map((x) => [x.term, x.letter]), [["Alpha", "A"], ["Apple", "A"], ["Beta (test suite)", "B"]]);
  assert.equal(e[0]!.where, "[FSD](fsd/FSD.md)");
});

test("the order ignores capitals and a symbol before the first letter, and the letter of a term is its first letter", () => {
  assert.equal(letterOf("authorizeCompanyRead"), "A");
  assert.equal(letterOf("_inr"), "I");
  assert.equal(letterOf("404"), "");
  assert.ok(sortKey("apple") < sortKey("Banana"));
  assert.ok(sortKey("Baseline (outcome)") < sortKey("Baseline (test suite)"));
  assert.equal(problemsOf(glossary(["A", row("apple"), row("Apricot")], ["I", row("Idea"), row("_inr")])), "");
});

test("a row with a pipe in a cell, or a missing cell, is named", () => {
  assert.match(problemsOf(glossary(["A", row("Alpha", { meaning: "One | two." })])), /Alpha: 5 cells, expected 4/);
  assert.match(problemsOf(`## A\n\n${HEAD}\n| **Alpha** | Meaning. | Another. |`), /Alpha: 3 cells, expected 4/);
});

test("an empty meaning, an empty note on what it is not, and an empty place are each named", () => {
  const text = glossary(["A", row("Alpha", { meaning: "" }), row("Apple", { confuse: "" }), row("Avocado", { where: "" })]);
  const p = problemsOf(text);
  assert.match(p, /Alpha: no meaning/);
  assert.match(p, /Apple: nothing under "do not confuse with"/);
  assert.match(p, /Avocado: nothing under "where defined or enforced"/);
});

test("a meaning of more than two sentences is named, and code, links and numbers do not make a sentence", () => {
  assert.match(problemsOf(glossary(["A", row("Alpha", { meaning: "One. Two. Three." })])), /Alpha: the meaning is 3 sentences; it is at most 2/);
  assert.equal(problemsOf(glossary(["A", row("Alpha", { meaning: "A table `a.b` of 1,00,000 rows, see [the FSD](fsd/FSD.md#x). It is ok." })])), "");
  assert.equal(sentenceCount("One. Two? Three!"), 3);
  assert.equal(sentenceCount("Version 0.1 is e.g. fine."), 1);
});

test("a term under the wrong letter, two entries for one term, and a term out of order are each named", () => {
  assert.match(problemsOf(glossary(["B", row("Alpha")])), /Alpha: sits under the heading "B" and belongs under "A"/);
  assert.match(problemsOf(glossary(["A", row("Alpha"), row("Alpha")])), /Alpha: defined twice/);
  assert.match(problemsOf(glossary(["A", row("Apple"), row("Alpha")])), /Alpha: comes after Apple; terms are in alphabetical order/);
  assert.match(problemsOf(glossary(["A", row("404")])), /404: a term starts with a letter/);
});

test("rows in a code fence and text that is not a row are not entries", () => {
  const text = `${glossary(["A", row("Alpha")])}\n\n\`\`\`\n| **Fenced** | a | b | c |\n\`\`\`\n\nProse with | a pipe.`;
  assert.deepEqual(parseGlossary(text).map((e) => e.term), ["Alpha"]);
});

const FSD = [
  "## 1. Introduction",
  "",
  "### 1.3 Conventions",
  "",
  "| Term | Meaning |",
  "| --- | --- |",
  "| AS BUILT, PARTIAL, TO BE | The marks of a function. |",
  "| FR-AREA-NN, UC-AREA-NN | Functions and use cases; RULE-NN is a rule. Areas: ID, DESC, DIAG. |",
  "| Form post | A request from a form. |",
  "",
  "### 1.4 Next",
].join("\n");
const BRD = [
  "### 1.2 Table of columns",
  "",
  "| Column | Meaning |",
  "| --- | --- |",
  "| Priority | How much. |",
  "| Basis | Where it comes from: **Decided**, **Study** or **Assumed**. |",
  "| Status today | One of **Built:** works, **Partial:** some, **Not built:** nothing. |",
  "",
  "## 2. Next",
].join("\n");

test("the terms the FSD and BRD tables define are read: first-column terms split at commas, placeholder identifiers, areas, columns, Basis and Status words", () => {
  const r = requiredTerms(FSD, BRD);
  const terms = (kind: string) => r.filter((x) => x.kind === kind).map((x) => x.term);
  assert.deepEqual(terms("term"), ["AS BUILT", "PARTIAL", "TO BE", "FR-AREA-NN", "UC-AREA-NN", "RULE-NN", "Form post", "Priority", "Basis", "Status today"]);
  assert.deepEqual(terms("area"), ["ID", "DESC", "DIAG"]);
  assert.deepEqual(terms("basis"), ["Decided", "Study", "Assumed"]);
  assert.deepEqual(terms("status"), ["Built", "Partial", "Not built"]);
});

test("a required term the glossary lacks is named with where it comes from; a word with a qualifier, or a combined entry, counts", () => {
  const required = requiredTerms(FSD, BRD);
  const e = parseGlossary(
    glossary(
      ["A", row("AS BUILT, PARTIAL, TO BE"), row("Assumed (as a Basis)")],
      ["B", row("Basis"), row("Built (as a Status today)")],
      ["D", row("DESC, DIAG, ID")],
      ["F", row("FR-AREA-NN")],
      ["R", row("RULE-NN")],
    ),
  );
  const missing = missingTerms(required, e);
  assert.ok(missing.includes('"UC-AREA-NN" (FSD 1.3) has no entry in the glossary'));
  assert.ok(missing.includes('"Form post" (FSD 1.3) has no entry in the glossary'));
  assert.ok(missing.includes('"Not built" (BRD 1.2 (Status today)) has no entry in the glossary'));
  assert.ok(missing.includes('"Partial" (BRD 1.2 (Status today)) has no entry in the glossary'), "the capitals of PARTIAL do not stand for the status Partial");
  assert.ok(!missing.some((m) => m.startsWith('"Assumed"') || m.startsWith('"Basis"') || m.startsWith('"Built"') || m.startsWith('"PARTIAL"')));
  assert.ok(!missing.some((m) => m.startsWith('"DIAG"')), "an area is found inside a combined term");
});

test("a section that is not there gives no required terms", () => {
  assert.deepEqual(requiredTerms("# Nothing", "# Nothing"), []);
});

test("identifier schemes are the prefixes a table row or a heading defines; a scheme without an entry is named", () => {
  const md = ["| TC-ID-01 | a |", "| D-01 | b |", "| S1 | c |", "### OQ-04 Something", "| FND-001 | x |", "```", "| XX-99 | fenced |", "```", "| Plain | row |"].join("\n");
  assert.deepEqual([...definedPrefixes(md)].sort(), ["D", "FND", "OQ", "S", "TC"]);
  const e = parseGlossary(glossary(["D", row("D-nn")], ["F", row("FND-nnn")], ["O", row("OQ-nn")], ["S", row("S1 to S4")]));
  assert.deepEqual(missingPrefixes(definedPrefixes(md), e), ["the identifier scheme S-nn is defined in the documents and has no entry in the glossary", "the identifier scheme TC-nn is defined in the documents and has no entry in the glossary"]);
});

test("a path in code that does not exist, and a link that does not lead to a file, are named; a placeholder is not a path", () => {
  const e = parseGlossary(
    glossary(["A", row("Alpha", { where: "`modules/a/src/x.ts`; `modules/gone/y.ts`; `modules/<name>/STATUS.md`; `modules/*/tests/`; [FSD](fsd/FSD.md); [gone](fsd/GONE.md); [up](../../../x.md)" })]),
  );
  const present = new Set(["modules/a/src/x.ts", "docs/fsd/FSD.md"]);
  assert.deepEqual(checkWhere(e, "docs/GLOSSARY.md", (p) => present.has(p)), [
    "Alpha: the path modules/gone/y.ts does not exist",
    "Alpha: the link fsd/GONE.md does not resolve to a file",
    "Alpha: the link ../../../x.md does not resolve to a file",
  ]);
});

test("a path with a slash in the text that does not exist is named; a bare file name and a suite identifier are not checked", () => {
  const md = "A meaning with `modules/a/x.ts`, `modules/gone/y.ts`, `STATUS.md`, `docs/unit/ids`, `static/documentation` and `application/json`.\n\n```\n`modules/fenced/z.ts`\n```";
  assert.deepEqual(checkPathsInText(md, (p) => p === "modules/a/x.ts"), ["the path modules/gone/y.ts does not exist", "the path application/json does not exist"]);
});

test("a term that no file uses is named; a bracket qualifier and an identifier scheme are looked up as their stem; the match is a whole word in any case", () => {
  assert.equal(searchKey("Baseline (outcome)"), "Baseline");
  assert.equal(searchKey("BR-AREA-NN"), "BR-");
  assert.equal(searchKey("FND-nnn"), "FND-");
  assert.equal(searchKey("Lakh"), "Lakh");
  const e = parseGlossary(glossary(["B", row("Baseline (outcome)"), row("BR-AREA-NN")], ["C", row("CI"), row("Cluster")], ["Z", row("Zebra")]));
  const corpus = "The baseline is written. BR-ID-01 is a requirement. The ci workflow. A cluster.\nSpecial: ACID is not CI.";
  assert.deepEqual(unusedTerms(e, corpus), ['"Zebra" is in no file of the repository outside the glossary: look for "Zebra"']);
  assert.deepEqual(unusedTerms(parseGlossary(glossary(["C", row("CI")])), "a special ACID"), ['"CI" is in no file of the repository outside the glossary: look for "CI"']);
});

const STAGES = [
  "## The five stages and the words the owner pages use",
  "",
  "| Stage (thesis, BRD) | Step name on the owner pages | Page name | Module | BRD area |",
  "| --- | --- | --- | --- | --- |",
  "| Describe | Describe | Describe your factory | `modules/factory/` | DESC |",
  "| Diagnose | Decide | What to do about it | `modules/diagnose/` | DIAG |",
  "",
  "## Terms",
].join("\n");
const SOURCE = [`{ id: "describe", short: "Describe", page: "Describe your factory" },`, `{ id: "diagnose", short: "Decide", page: "What to do about it" },`].join("\n");

test("the stage table is read, and it agrees with the progress strip", () => {
  const rows = stageRows(STAGES);
  assert.deepEqual(rows.map((r) => [r.stage, r.step, r.page, r.module, r.area]), [["Describe", "Describe", "Describe your factory", "modules/factory/", "DESC"], ["Diagnose", "Decide", "What to do about it", "modules/diagnose/", "DIAG"]]);
  assert.deepEqual(checkStages(rows, SOURCE, () => true), []);
  assert.deepEqual(stageRows("# Nothing"), []);
});

test("a step name or a page name that differs from the progress strip, a missing stage and a module that is not there are each named", () => {
  const rows = stageRows(STAGES);
  const changed = SOURCE.replace('short: "Decide"', 'short: "Choose"').replace("Describe your factory", "Your factory");
  assert.deepEqual(checkStages(rows, changed, () => true), [
    'Describe: the table says "Describe" and "Describe your factory" and the progress strip says "Describe" and "Your factory"',
    'Diagnose: the table says "Decide" and "What to do about it" and the progress strip says "Choose" and "What to do about it"',
  ]);
  assert.deepEqual(checkStages(rows, `${SOURCE}\n{ short: "Choose", page: "What you need" }`, () => true), ["the stage table has 2 rows and the progress strip has 3 stages"]);
  assert.deepEqual(checkStages(rows, SOURCE, (p) => p !== "modules/diagnose/"), ["Diagnose: the module modules/diagnose/ does not exist"]);
});
