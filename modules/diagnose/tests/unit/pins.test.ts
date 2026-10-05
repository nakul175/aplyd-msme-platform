// What a version number promises. An assessment is stored under (library version, engine version) and the same inputs are said
// to give the same result, so the versions must change whenever what the library or the engine says changes. The numbers are
// bumped by hand, so these tests pin the content: a change to the library, the points or the engine's output without a new
// version, fails here. To change any of it on purpose, bump LIBRARY_VERSION or ENGINE_VERSION, and ADD a line to the table below;
// do not edit the line of an earlier version (assessments stored under it were made from that content).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { canonicalJson } from "../../src/digest.ts";
import { ENGINE_VERSION, MAX_ITEMS, POINTS, diagnose } from "../../src/engine.ts";
import type { Answers } from "../../../factory/src/questionnaire.ts";
import { BUDGET_CEILING, LIBRARY, LIBRARY_VERSION } from "../../src/library.ts";

const sha = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");

/** library version -> SHA-256 of the library, the budget ceilings, and the points and item cap the ranking uses. */
const LIBRARY_PINS: Record<number, string> = {
  1: "7fb0575c7889e01e6e9a8651fbb92c56ca5c085c314981236c29ec846c2d35f8",
};

/** engine version -> SHA-256 of what the engine says (under the library of that engine version's pin) for a fixed set of descriptions. */
const ENGINE_PINS: Record<number, { library: number; hash: string }> = {
  1: { library: 1, hash: "50095421ba699b9501c9f2f74bebab9409c76c0e043104f4876a2d46fc941e51" },
};

const GOLDEN_DESCRIPTIONS: Answers[] = [
  { problems: [] },
  { problems: ["other_problem"] },
  { problems: ["late_deliveries", "rejects_rework"], production_tracking: "paper", quality_checks: "visual", budget_band: "5_to_25_lakh" },
  { problems: ["rejects_rework"], sector: "pharma", employees: "50_249", processes: ["packaging"] },
  { problems: ["energy_cost", "safety", "stock_shortages"], budget_band: "under_1_lakh" },
  { problems: ["breakdowns", "material_cost", "skilled_labour"], budget_band: "over_25_lakh" },
  { problems: ["compliance_certification", "finding_buyers", "payment_delays"], budget_band: "not_sure" },
  { problems: ["working_capital"] },
];

test("the library, the budget ceilings and the ranking points are the ones recorded for LIBRARY_VERSION", () => {
  const hash = sha({ library: LIBRARY, budgetCeiling: BUDGET_CEILING, points: POINTS, maxItems: MAX_ITEMS });
  assert.ok(LIBRARY_PINS[LIBRARY_VERSION], `LIBRARY_VERSION ${LIBRARY_VERSION} has no recorded pin: add "${LIBRARY_VERSION}: \\"${hash}\\"" to LIBRARY_PINS`);
  assert.equal(hash, LIBRARY_PINS[LIBRARY_VERSION], `the library, the ceilings or the points changed without LIBRARY_VERSION changing. Bump it and add a new pin (${hash}); never edit an earlier pin.`);
});

test("the engine says, for a fixed set of descriptions, what is recorded for ENGINE_VERSION", () => {
  const hash = sha(GOLDEN_DESCRIPTIONS.map((answers) => diagnose(answers)));
  const pin = ENGINE_PINS[ENGINE_VERSION];
  assert.ok(pin, `ENGINE_VERSION ${ENGINE_VERSION} has no recorded pin: add { library: ${LIBRARY_VERSION}, hash: "${hash}" } to ENGINE_PINS`);
  assert.equal(pin.library, LIBRARY_VERSION, "the engine pin was recorded against another library version, so it says nothing about this one: record a new engine pin");
  assert.equal(hash, pin.hash, `the engine's output changed without ENGINE_VERSION (or LIBRARY_VERSION) changing. Bump it and add a new pin (${hash}); never edit an earlier pin.`);
});

test("the pins are a record of real versions only, and the golden descriptions cover an empty result, a full one and the ranking's ties", () => {
  for (const v of Object.keys(LIBRARY_PINS)) assert.ok(Number(v) <= LIBRARY_VERSION, `library pin ${v} is for a version that does not exist yet`);
  for (const v of Object.keys(ENGINE_PINS)) assert.ok(Number(v) <= ENGINE_VERSION, `engine pin ${v} is for a version that does not exist yet`);
  const sizes = GOLDEN_DESCRIPTIONS.map((a) => diagnose(a).items.length);
  assert.ok(sizes.includes(0), "one description gives no items");
  assert.ok(sizes.some((n) => n >= 3), "one gives several");
});
