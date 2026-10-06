// The presenter's script against the cast and the platform's own people: everyone it names exists, the order and the timing make sense, and
// what it says about the floor is what the data does.
import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterLabel } from "../../../procure/src/clusters.ts";
import { DEMO_COMPANIES, FIRST_CLUSTER, OPERATOR, PLACEHOLDER_FEE_INR, SECOND_CLUSTER, WALKED_COMPANY, WITNESS_COMPANY } from "../../src/cast.ts";
import { DOES_NOT_SHOW, RESET_NOTE, STEPS } from "../../src/script.ts";

const NAMES = new Set([OPERATOR.name, WALKED_COMPANY.owner, WITNESS_COMPANY.owner, ...DEMO_COMPANIES.map((c) => c.ownerName)]);

test("the steps are numbered in order, each signs in as someone who exists and has something to do and to say", () => {
  assert.deepEqual(STEPS.map((s) => s.n), STEPS.map((_, i) => i + 1));
  for (const s of STEPS) {
    assert.ok(NAMES.has(s.signInAs), `step ${s.n} signs in as "${s.signInAs}", who is not in the cast`);
    assert.ok(s.title.length > 0 && s.open.length > 0 && s.do.length >= 1 && s.say.length > 40 && s.labels.length >= 1, `step ${s.n} is incomplete`);
    assert.ok(Number.isInteger(s.minutes) && s.minutes >= 1 && s.minutes <= 5);
  }
});

test("the walk is a presentation, not an afternoon: between ten and twenty minutes", () => {
  const total = STEPS.reduce((n, s) => n + s.minutes, 0);
  assert.ok(total >= 10 && total <= 20, `${total} minutes`);
});

test("the walk follows the five stages in their order, for the one company the presenter walks", () => {
  const walked = STEPS.filter((s) => s.signInAs === WALKED_COMPANY.owner).map((s) => s.open);
  assert.deepEqual(walked, ["Describe your factory", "What to do about it", "What you need", "What you need", "Results"]);
});

test("what the script says about the clusters, the fee and the floor matches the data", () => {
  const all = JSON.stringify(STEPS);
  assert.ok(all.includes(clusterLabel(FIRST_CLUSTER)) && all.includes(clusterLabel(SECOND_CLUSTER)));
  // The script is a page anyone past the gate can read, owners included, and no owner may read the fee (D-03): it points at the operator's page and never says the amount.
  assert.ok(!all.includes(`₹${PLACEHOLDER_FEE_INR.toLocaleString("en-IN")}`) && !all.includes(String(PLACEHOLDER_FEE_INR)), "the script does not state the fee");
  assert.match(all, /placeholder/);
  assert.match(all, /at least 5/i);
  assert.match(all, /fewer than 5/i);
});

test("the script never claims what the application does not do", () => {
  const claims = JSON.stringify(STEPS).toLowerCase();
  for (const forbidden of ["guarantee", "saves you", "will save", "certified", "approved by", "payment is made through", "we pay", "contacts the provider"]) assert.ok(!claims.includes(forbidden), `the script says "${forbidden}"`);
  assert.ok(DOES_NOT_SHOW.length >= 5);
  assert.match(DOES_NOT_SHOW.join(" "), /Real sign-in/);
  assert.match(DOES_NOT_SHOW.join(" "), /ten-owner test/);
  assert.match(RESET_NOTE, /restart/i);
});

test("the figures the script tells the presenter to type fit the boxes that take them (S5-11)", () => {
  const results = STEPS.find((s) => s.title === "Results")!;
  const text = results.do.join(" ");
  // The box takes a whole number of percent; a count of orders is refused, and words are refused.
  assert.ok(!/late orders/i.test(text), "a count of late orders does not go in a box that takes a percent");
  assert.match(text, /percent/);
  assert.match(text, /type 40/);
  assert.match(text, /whole number/);
  // The delivery form wants the date year first and the price in digits.
  const plan = STEPS.find((s) => s.title === "Choose a provider and agree a plan")!.do.join(" ");
  assert.match(plan, /2026-12-15/);
  assert.match(plan, /50000/);
  // What the Choose step says the platform does not do is said where the owner reads it.
  assert.match(plan, /does not put the owner in touch with the provider/);
});
