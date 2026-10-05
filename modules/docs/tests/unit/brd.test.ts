// The BRD reader: what it accepts, what it refuses, and that the generated counts follow the rows.
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyStatus, countByArea, mentionedIds, parseRequirements, renderCounts, withCounts } from "../../src/brd.ts";

const row = (id: string, o: Partial<Record<"req" | "pri" | "basis" | "acc" | "status", string>> = {}) =>
  `| ${id} | ${o.req ?? "**A title.** What it says."} | ${o.pri ?? "Must"} | ${o.basis ?? "Thesis stage 1"} | ${o.acc ?? "A person can check this."} | ${o.status ?? "Built"} |`;
const doc = (...rows: string[]) => ["| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |", "| --- | --- | --- | --- | --- | --- |", ...rows].join("\n");

test("a well-formed row is read into its parts", () => {
  const [r] = parseRequirements(doc(row("BR-DESC-01", { status: "Partial. The options are assumptions (OQ-03)" })));
  assert.equal(r!.id, "BR-DESC-01");
  assert.equal(r!.area, "DESC");
  assert.equal(r!.title, "A title.");
  assert.equal(r!.statement, "What it says.");
  assert.equal(r!.priority, "Must");
  assert.equal(r!.status, "partial");
});

test("header rows, rules and prose are not requirements", () => {
  assert.equal(parseRequirements(`Some prose with BR-ID-01 in it.\n\n${doc()}`).length, 0);
});

test("status words map one to one, and an unknown word is refused", () => {
  assert.equal(classifyStatus("Built"), "built");
  assert.equal(classifyStatus("Built, with tests in every module"), "built");
  assert.equal(classifyStatus("Not built. Open (OQ-13)"), "not-built");
  assert.equal(classifyStatus("Partial"), "partial");
  assert.equal(classifyStatus("Open (OQ-01)"), "open");
  assert.equal(classifyStatus("Unverified. Not measured"), "unverified");
  assert.throws(() => classifyStatus("Done"), /must start with/);
  assert.throws(() => classifyStatus("Notbuilt"), /must start with/);
});

test("every kind of malformed row is named, all at once", () => {
  const bad = doc(
    row("BR-XYZ-01"), // unknown area
    row("BR-DESC-02", { pri: "Critical" }),
    row("BR-DESC-03", { basis: "Hunch" }),
    row("BR-DESC-04", { acc: "" }),
    row("BR-DESC-05", { req: "No bold title here." }),
    row("BR-DESC-06", { status: "Done" }),
    row("BR-DESC-07 | extra", {}),
    row("BR-DESC-08"),
    row("BR-DESC-08"),
  );
  assert.throws(
    () => parseRequirements(bad),
    (e: Error) => {
      for (const part of ["BR-XYZ-01", "BR-DESC-02", "BR-DESC-03", "BR-DESC-04", "BR-DESC-05", "BR-DESC-06", "BR-DESC-08: appears twice"]) assert.ok(e.message.includes(part), `missing ${part}: ${e.message}`);
      return true;
    },
  );
});

test("a pipe inside a cell is caught as a malformed row, not read as a shifted one", () => {
  assert.throws(() => parseRequirements(doc(row("BR-ID-01", { acc: "one | two" }))), /7 cells, expected 6/);
});

test("counts follow the rows, by area and in total, and the block is replaced in place", () => {
  const reqs = parseRequirements(doc(row("BR-ID-01"), row("BR-ID-02", { status: "Not built" }), row("BR-RUN-01", { status: "Open" }), row("BR-RUN-02", { pri: "Could", status: "Partial" })));
  const by = countByArea(reqs);
  assert.deepEqual([by.ID.built, by.ID["not-built"], by.RUN.open, by.RUN.partial], [1, 1, 1, 1]);
  const text = renderCounts(reqs);
  assert.match(text, /\| \*\*All\*\* \| \*\*4\*\* \| \*\*1\*\* \| \*\*1\*\* \| \*\*1\*\* \| \*\*1\*\* \| \*\*0\*\* \|/);
  assert.match(text, /3 Must, 0 Should, 1 Could/);
  assert.match(text, /Of the 3 Must requirements, 2 are not fully built/);
  const page = `before\n<!-- STATUS-COUNTS-START -->\nold\n<!-- STATUS-COUNTS-END -->\nafter`;
  const next = withCounts(page, reqs);
  assert.ok(next.startsWith("before\n<!-- STATUS-COUNTS-START -->\n| Area") && next.endsWith("<!-- STATUS-COUNTS-END -->\nafter") && !next.includes("old"));
  assert.equal(withCounts(next, reqs), next, "regenerating twice changes nothing");
  assert.throws(() => withCounts("no markers", reqs), /needs/);
});

test("mentions are found once each and are not taken from near-misses", () => {
  assert.deepEqual(mentionedIds("see BR-ID-01, BR-ID-01 and BR-UX-12; not BR-ID-1, XBR-ID-02 or br-id-03"), ["BR-ID-01", "BR-UX-12"]);
});
