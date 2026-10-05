// The FSD reader: function rows, the section 11 table, and every way the two can disagree with each other or with the BRD.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRequirements } from "../../src/brd.ts";
import { checkCoverage, functionsByRequirement, parseCoverageTable, parseFunctionalRequirements } from "../../src/fsd.ts";

const brdRow = (id: string, status = "Built") => `| ${id} | **T.** S. | Must | Thesis | A person can check this. | ${status} |`;
const BRD = parseRequirements([brdRow("BR-ID-01"), brdRow("BR-ID-02", "Not built"), brdRow("BR-RUN-01", "Partial")].join("\n"));
const fr = (id: string, traces: string, status = "AS BUILT") => `| ${id} | Does a thing. | ${traces} | Rule. | Output. | ${status} |`;
const coverage = (...rows: string[]) => `## 10. Other\n\n## 11. Traceability\n\n| BR | Status in the BRD | Covering FRs | Note |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n\n## 12. After\n| BR-ID-09 | x | none | not read |`;

test("function rows are read with their traces and status; the conventions row and prose are not functions", () => {
  const frs = parseFunctionalRequirements(["| FR-AREA-NN | A functional requirement. |", fr("FR-ID-01", "BR-ID-01, BR-RUN-01"), fr("FR-ID-02", "BR-ID-02", "TO BE")].join("\n"), BRD);
  assert.deepEqual(frs.map((f) => [f.id, f.traces, f.status]), [["FR-ID-01", ["BR-ID-01", "BR-RUN-01"], "AS BUILT"], ["FR-ID-02", ["BR-ID-02"], "TO BE"]]);
  assert.deepEqual([...functionsByRequirement(frs)], [["BR-ID-01", ["FR-ID-01"]], ["BR-RUN-01", ["FR-ID-01"]], ["BR-ID-02", ["FR-ID-02"]]]);
});

test("every kind of malformed function row is named", () => {
  const bad = [
    fr("FR-ID-01", "BR-ID-77"), // not in the BRD
    fr("FR-ID-02", "no requirement here"),
    fr("FR-ID-03", "BR-ID-01", "DONE"),
    "| FR-ID-04 | too | few |",
    fr("FR-ID-05", "BR-ID-01"),
    fr("FR-ID-05", "BR-ID-01"),
    fr("FR-RUN-02", "BR-RUN-01"), // starts at 02
  ].join("\n");
  assert.throws(
    () => parseFunctionalRequirements(bad, BRD),
    (e: Error) => {
      for (const part of ["BR-ID-77, which is not in the BRD", "FR-ID-02: traces to no business requirement", 'status "DONE"', "FR-ID-04: 3 cells", "FR-ID-05: appears twice", "FR-RUN: numbers are not contiguous"]) assert.ok(e.message.includes(part), `missing "${part}" in ${e.message}`);
      return true;
    },
  );
});

test("the coverage table is read, and rows after section 11 are ignored", () => {
  const t = parseCoverageTable(coverage("| BR-ID-01 | Built | FR-ID-01, FR-ID-02 (TO BE) | note |"));
  assert.deepEqual([...t], [["BR-ID-01", { status: "Built", frs: ["FR-ID-01", "FR-ID-02"] }]]);
  assert.throws(() => parseCoverageTable("no sections"), /no section 11/);
  assert.throws(() => parseCoverageTable(coverage("| BR-ID-01 | Built | FR-ID-01 |")), /3 cells, expected 4/);
});

test("section 11 must agree with the BRD and with the function rows, in every direction", () => {
  const frs = parseFunctionalRequirements([fr("FR-ID-01", "BR-ID-01"), fr("FR-ID-02", "BR-ID-02", "TO BE")].join("\n"), BRD);
  const good = coverage("| BR-ID-01 | Built | FR-ID-01 | n |", "| BR-ID-02 | Not built | FR-ID-02 (TO BE) | n |", "| BR-RUN-01 | Partial | none | n |");
  assert.deepEqual(checkCoverage(good, BRD, frs), []);
  const noRow = coverage("| BR-ID-01 | Built | FR-ID-01 | n |", "| BR-ID-02 | Not built | FR-ID-02 | n |");
  assert.deepEqual(checkCoverage(noRow, BRD, frs), ["BR-RUN-01: no row in section 11"]);
  const wrongStatus = coverage("| BR-ID-01 | Partial | FR-ID-01 | n |", "| BR-ID-02 | Not built | FR-ID-02 | n |", "| BR-RUN-01 | Partial | none | n |");
  assert.match(checkCoverage(wrongStatus, BRD, frs)[0]!, /says "Partial" but the BRD says "Built"/);
  const wrongList = coverage("| BR-ID-01 | Built | FR-ID-02 | n |", "| BR-ID-02 | Not built | FR-ID-02 | n |", "| BR-RUN-01 | Partial | none | n |");
  assert.match(checkCoverage(wrongList, BRD, frs)[0]!, /lists \[FR-ID-02\] but the functions that name it are \[FR-ID-01\]/);
  const extra = coverage("| BR-ID-01 | Built | FR-ID-01 | n |", "| BR-ID-02 | Not built | FR-ID-02 | n |", "| BR-RUN-01 | Partial | none | n |", "| BR-ID-55 | Built | none | n |");
  assert.deepEqual(checkCoverage(extra, BRD, frs), ["BR-ID-55: in section 11 but not in the BRD"]);
});
