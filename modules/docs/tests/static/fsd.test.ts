// The real FSD against the real BRD: every function traces to a requirement that exists, numbers are contiguous, and section 11
// covers every requirement exactly as the function rows say.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseRequirements } from "../../src/brd.ts";
import { checkCoverage, parseFunctionalRequirements } from "../../src/fsd.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const brd = parseRequirements(readFileSync(join(ROOT, "docs/brd/BRD.md"), "utf8"));
const fsdText = readFileSync(join(ROOT, "docs/fsd/FSD.md"), "utf8");
const frs = parseFunctionalRequirements(fsdText, brd);

test("the FSD has functions in every area it specifies, each tracing to the BRD", () => {
  assert.ok(frs.length >= 100, `${frs.length} functions`);
  assert.ok(new Set(frs.map((f) => f.area)).size >= 8);
});

test("section 11 covers every business requirement exactly as the function rows name them", () => {
  assert.deepEqual(checkCoverage(fsdText, brd, frs), []);
});

test("no function claims to be built for a requirement the BRD says is Not built, unless it covers it only in part", () => {
  const notBuilt = new Set(brd.filter((r) => r.status === "not-built").map((r) => r.id));
  const offenders = frs.filter((f) => f.status === "AS BUILT" && f.traces.length > 0 && f.traces.every((t) => notBuilt.has(t)));
  assert.deepEqual(offenders.map((f) => `${f.id} is AS BUILT but every requirement it serves is Not built in the BRD`), []);
});
