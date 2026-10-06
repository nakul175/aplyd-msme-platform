import assert from "node:assert/strict";
import { test } from "node:test";
import { brokenReferences, citedIds, definedIds } from "../../src/ids.ts";

test("an identifier is defined by a table row or a heading, and not by a mention in prose or in code", () => {
  const text = ["| FR-ID-01 | A function |", "#### UC-ID-02 Sign out", "## SC-03 A scenario", "Prose about TC-ID-04 and MSG-05.", "```", "| AD-06 | in a fence |", "```"].join("\n");
  assert.deepEqual([...definedIds(text)].sort(), ["FR-ID-01", "SC-03", "UC-ID-02"]);
  assert.deepEqual([...citedIds(text)].sort(), ["FR-ID-01", "MSG-05", "SC-03", "TC-ID-04", "UC-ID-02"]);
});

test("placeholders and near-misses are not identifiers", () => {
  assert.equal(citedIds("FR-AREA-NN, UC-X-1, SCR-1, RULE-NN, XFR-ID-01x, API-1000a").size, 0);
});

test("a citation of something defined nowhere is reported once per file and id", () => {
  const files = [
    { path: "a.md", text: "| FR-ID-01 | x |\n| SC-01 | y |" },
    { path: "b.md", text: "See FR-ID-01, SC-01, FR-ID-02 and FR-ID-02 and TH-04." },
  ];
  assert.deepEqual(brokenReferences(files), ["b.md: FR-ID-02 is cited but defined in no document", "b.md: TH-04 is cited but defined in no document"]);
});

test("a definition in one file satisfies a citation in another", () => {
  assert.deepEqual(brokenReferences([{ path: "a.md", text: "#### UC-RUN-01 Record a review" }, { path: "b.md", text: "UC-RUN-01" }]), []);
});

test("a finding of the findings register is an identifier of three digits, defined by its row", () => {
  const text = ["| FND-001 | A finding | evidence |", "A citation of FND-002, FND-12 and FND-0003 in prose."].join("\n");
  assert.deepEqual([...definedIds(text)], ["FND-001"]);
  assert.deepEqual([...citedIds(text)].sort(), ["FND-001", "FND-002"]);
  assert.deepEqual(brokenReferences([{ path: "a.md", text }]), ["a.md: FND-002 is cited but defined in no document"]);
});
