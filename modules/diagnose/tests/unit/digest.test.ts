import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, digestOf, standingDecisions } from "../../src/digest.ts";
import { diagnose } from "../../src/engine.ts";
import type { Result } from "../../src/engine.ts";

const result: Result = diagnose({ problems: ["late_deliveries", "rejects_rework"], production_tracking: "paper", quality_checks: "visual", budget_band: "5_to_25_lakh" });
const [first, second] = result.items.map((i) => i.opportunityId);

test("canonical JSON does not depend on key order, drops undefined, and keeps array order", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, 2], c: null } }), canonicalJson({ a: { c: null, d: [3, 2] }, b: 1 }));
  assert.equal(canonicalJson({ a: 1, b: undefined }), canonicalJson({ a: 1 }));
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  assert.equal(canonicalJson({ a: "x\"y\n" }), '{"a":"x\\"y\\n"}');
  assert.equal(canonicalJson(null), "null");
  assert.equal(canonicalJson("é"), '"é"');
});

test("the standing decision on an item is the latest one, in the result's order, and an undecided item has none", () => {
  const rows = [
    { opportunityId: second, decision: "reject", note: "" },
    { opportunityId: first, decision: "defer", note: "later" },
    { opportunityId: first, decision: "accept", note: "now" },
    { opportunityId: null, decision: null, note: "" },
    { opportunityId: "not_in_result", decision: "accept", note: "" },
  ];
  assert.deepEqual(standingDecisions(result, rows), [
    { opportunityId: first, decision: "accept", note: "now" },
    { opportunityId: second, decision: "reject", note: "" },
  ]);
  assert.deepEqual(standingDecisions(result, []), []);
});

test("the digest is a 64-character hex SHA-256 of a known input, and it changes with the assessment, the result and every standing decision and note", async () => {
  assert.equal(await digestOf("a", { ...result, items: [] }, []), await digestOf("a", { ...result, items: [] }, []));
  // SHA-256 of canonicalJson({assessmentId, result, standing}) for a tiny result, computed independently.
  const tiny = { engine: "rules", engineVersion: 1, libraryVersion: 1, synthetic: true, inputs: { problems: [], budgetBand: null, sector: null, readiness: null }, items: [], leftOut: [] } as Result;
  const { createHash } = await import("node:crypto");
  const expected = createHash("sha256").update(canonicalJson({ assessmentId: "id-1", result: tiny, standing: [] })).digest("hex");
  assert.equal(await digestOf("id-1", tiny, []), expected);
  assert.match(expected, /^[0-9a-f]{64}$/);

  const standing = [{ opportunityId: first, decision: "accept", note: "" }];
  const base = await digestOf("a", result, standing);
  const variants = [
    await digestOf("b", result, standing),
    await digestOf("a", result, [{ ...standing[0], decision: "defer" }]),
    await digestOf("a", result, [{ ...standing[0], note: "x" }]),
    await digestOf("a", result, []),
    await digestOf("a", { ...result, items: result.items.slice(1) }, standing),
    await digestOf("a", { ...result, items: result.items.map((i, n) => (n === 0 ? { ...i, score: i.score + 1 } : i)) }, standing),
  ];
  for (const v of variants) assert.notEqual(v, base);
  assert.equal(new Set([base, ...variants]).size, variants.length + 1, "all different from each other too");
});
