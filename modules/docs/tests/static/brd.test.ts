// The real BRD: well formed, its counts current, every requirement ID that any document mentions exists. The same checks as
// scripts/check-traceability.mjs, run here so a failure names the test and the layer.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { mentionedIds, parseRequirements, withCounts } from "../../src/brd.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const text = readFileSync(join(ROOT, "docs/brd/BRD.md"), "utf8");
const reqs = parseRequirements(text);

test("the BRD has requirements in every area, with unique IDs", () => {
  assert.ok(reqs.length >= 100, `${reqs.length} requirements`);
  assert.equal(new Set(reqs.map((r) => r.id)).size, reqs.length);
  assert.equal(new Set(reqs.map((r) => r.area)).size, 12);
});

test("the counts in section 11 are what the tables add up to", () => {
  assert.equal(withCounts(text, reqs), text, "run: node scripts/check-traceability.mjs --write");
});

test("every requirement a document mentions exists", () => {
  const known = new Set(reqs.map((r) => r.id));
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && existsSync(join(ROOT, f)));
  const missing: string[] = [];
  for (const f of files) for (const id of mentionedIds(readFileSync(join(ROOT, f), "utf8").replace(/```[\s\S]*?```/g, ""))) if (!known.has(id)) missing.push(`${f}: ${id}`);
  assert.deepEqual(missing, []);
});

test("vendor neutrality and the floor of five are requirements the document cannot lose", () => {
  for (const id of ["BR-GOV-02", "BR-GOV-06", "BR-PROC-05", "BR-ID-03"]) assert.ok(reqs.some((r) => r.id === id && r.priority === "Must"), `${id} must exist as a Must`);
});

test("a requirement the sponsor decided or carried forward cites its decision", () => {
  for (const r of reqs.filter((x) => /^(Decided|Carried)/.test(x.basis))) assert.match(r.basis, /\b[DC]-\d{2}\b|D-\d{2}/, `${r.id} says ${r.basis} without the ID`);
});
