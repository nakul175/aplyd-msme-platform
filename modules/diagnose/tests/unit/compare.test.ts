// What moved between two assessments: ideas that went up or down, came in or dropped out, and the answers that differ between the two
// descriptions. Each case is a description a person can read against the library and check by hand.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Answers } from "../../../factory/src/questionnaire.ts";
import { compareAssessments, diffAnswers } from "../../src/compare.ts";
import { diagnose } from "../../src/engine.ts";
import type { Result } from "../../src/engine.ts";

const A: Answers = {
  sector: "textiles_garments",
  products: "SYNTHETIC school uniforms",
  year_started: 2009,
  employees: "10_49",
  shifts: "one",
  processes: ["cutting", "stitching_assembly"],
  orders_in: ["phone_whatsapp", "agents_traders"],
  production_tracking: "paper",
  quality_checks: "visual",
  maintenance: "when_it_breaks",
  accounts: "accounting_software",
  inventory: "paper",
  it_support: "owner_or_family",
  connectivity: "unreliable",
  data_kept: ["customer_orders", "energy_bills"],
  problems: ["late_deliveries", "rejects_rework", "payment_delays"],
  budget_band: "1_to_5_lakh",
  decides: "owner_family",
  readiness: "within_year",
};
const compare = (before: Answers, after: Answers, sameVersion = false) => compareAssessments(diagnose(before), diagnose(after), before, after, sameVersion);

test("changing how jobs are tracked drops two ideas out and moves the rest up, each with its reason", () => {
  const after: Answers = { ...A, production_tracking: "software", data_kept: ["quality_records", "customer_orders", "energy_bills"] };
  const c = compare(A, after);
  assert.equal(c.sameDescription, false);
  assert.equal(c.nothingMoved, false);
  assert.deepEqual(c.dropped.map((d) => [d.opportunityId, d.wasRank]), [["digital_job_log", 1], ["ai_job_scheduling", 3]]);
  assert.match(c.dropped[0]!.now, /^Now it is left out\. Your answer to "How do you keep track of what is being made\?" is "In software"/);
  assert.deepEqual(c.moved.map((m) => [m.opportunityId, m.from, m.to, m.direction]), [
    ["inspection_checklist_and_gauges", 2, 1, "up"],
    ["camera_inspection_ai", 4, 2, "up"],
    ["demand_forecast_ai", 5, 3, "up"],
  ]);
  assert.deepEqual(c.entered, []);
  assert.equal(c.steady, 0);
  // The camera idea's own points did not change; what changed is that one thing it needed first is in the way no longer, and the answer behind it changed.
  const camera = c.moved.find((m) => m.opportunityId === "camera_inspection_ai")!;
  assert.equal(camera.because[0], "Its own points did not change. Other ideas moved around it.");
  assert.match(camera.because[1]!, /^No longer in the way: Keep quality or rejection records, so there are examples to learn from\. Your answer to "Which records do you keep in written or digital form\?" changed\.$/);
});

test("the answers that differ are listed, those the rules read first, and a free-text change shows only that it changed", () => {
  const after: Answers = { ...A, production_tracking: "software", own_words: "SYNTHETIC new words", products: "SYNTHETIC school uniforms and aprons" };
  const c = compare(A, after);
  assert.deepEqual(c.answers!.map((a) => [a.key, a.usedByRules]), [["production_tracking", true], ["products", false], ["own_words", false]], "the questionnaire's order inside each group");
  assert.deepEqual(c.answers![0], { key: "production_tracking", label: "How do you keep track of what is being made?", before: "On paper or a register", after: "In software", usedByRules: true });
  assert.deepEqual([c.answers![1]!.before, c.answers![1]!.after], ["", ""], "the owner's own words are not repeated");
});

test("the order a many-choice answer was saved in is not a change; adding or removing a choice is, and a missing answer reads 'not answered'", () => {
  assert.deepEqual(diffAnswers({ data_kept: ["energy_bills", "customer_orders"] }, { data_kept: ["customer_orders", "energy_bills"] }), []);
  assert.deepEqual(diffAnswers({ data_kept: ["energy_bills"] }, { data_kept: ["energy_bills", "machine_hours"] }).map((a) => [a.before, a.after]), [["Power bills", "Power bills; Machine running hours"]]);
  assert.deepEqual(diffAnswers({}, { connectivity: "reliable" }).map((a) => [a.before, a.after]), [["not answered", "It mostly works"]]);
  assert.deepEqual(diffAnswers({ connectivity: "reliable" }, {}).map((a) => [a.before, a.after]), [["It mostly works", "not answered"]]);
  assert.deepEqual(diffAnswers(A, { ...A }), []);
  assert.deepEqual(diffAnswers({}, {}), []);
});

test("an idea that comes in says what it was before: left out, with the engine's reason, or not matching a problem", () => {
  // Before: accounts in software closed two ideas for the owner's problem. After: accounts on paper, so they come in.
  const after: Answers = { ...A, accounts: "paper" };
  const c = compare(A, after);
  const receivables = c.entered.find((e) => e.opportunityId === "receivables_follow_up")!;
  assert.match(receivables.before, /^Before, it was left out\. Your answer to "How do you keep accounts\?" is "In accounting software"/);
  // An idea for a problem the owner did not name before: it did not match at all.
  const wider: Answers = { ...A, problems: ["late_deliveries", "rejects_rework", "breakdowns"] };
  const d = compare(A, wider);
  const maintenance = d.entered.find((e) => e.opportunityId === "preventive_maintenance_plan")!;
  assert.equal(maintenance.before, "Before, it did not match a problem you named.");
  assert.ok(maintenance.rank >= 1);
  // And an idea that stops matching a problem says that, rather than inventing a reason.
  const narrower = compare(wider, A);
  const gone = narrower.dropped.find((x) => x.opportunityId === "preventive_maintenance_plan")!;
  assert.equal(gone.now, "Now it does not match a problem you named.");
  assert.ok(narrower.answers!.some((a) => a.key === "problems" && a.usedByRules));
});

test("an idea that keeps its place but changes in what it needs is listed on its own, with the words the page uses", () => {
  // One idea only (the sensor idea for breakdowns). Before, the internet question was not answered, so the engine could not judge that
  // prerequisite; after, it is answered, so the idea is ready on that point. Nothing moves, but the idea changed.
  const answered: Answers = { ...A, problems: ["breakdowns"], maintenance: "fixed_schedule", data_kept: ["machine_hours"], connectivity: "reliable" };
  const unanswered: Answers = Object.fromEntries(Object.entries(answered).filter(([k]) => k !== "connectivity"));
  const was = diagnose(unanswered).items;
  const now = diagnose(answered).items;
  assert.deepEqual([was.map((i) => i.opportunityId), now.map((i) => i.opportunityId)], [["predictive_maintenance_ai"], ["predictive_maintenance_ai"]]);
  assert.equal(was[0]!.readiness.state, "check");
  assert.equal(now[0]!.readiness.state, "ready");
  const c = compareAssessments(diagnose(unanswered), diagnose(answered), unanswered, answered, false);
  assert.equal(c.nothingMoved, true);
  assert.equal(c.steady, 0, "it is not counted as steady: it changed");
  assert.deepEqual(c.changedInPlace.map((x) => [x.opportunityId, x.rank]), [["predictive_maintenance_ai", 1]]);
  assert.deepEqual(c.changedInPlace[0]!.because, [
    'It was "A few things to check first" and is now "Ready to start".',
    'Now settled: An internet connection that works most days. Your answer to "How reliable is your internet?" changed.',
  ]);
  assert.deepEqual(c.answers!.map((a) => [a.key, a.before, a.after]), [["connectivity", "not answered", "It mostly works"]]);
  // The other way round, the same words say an answer is missing now.
  const back = compareAssessments(diagnose(answered), diagnose(unanswered), answered, unanswered, false);
  assert.match(back.changedInPlace[0]!.because.join(" "), /It was "Ready to start" and is now "A few things to check first"/);
  assert.match(back.changedInPlace[0]!.because.join(" "), /Now to be checked, because an answer is missing: An internet connection/);
});

test("an idea that stays put with nothing changed is steady, and one that only cost more is listed as changed", () => {
  const bigger: Answers = { ...A, budget_band: "5_to_25_lakh" };
  const c = compare(A, bigger);
  // The budget band is read by the rules, so it is a changed answer, and the ideas that stretched the lower budget are now within the higher one.
  assert.deepEqual(c.answers!.map((a) => a.key), ["budget_band"]);
  assert.equal(c.nothingMoved, true, "the order did not change");
  assert.ok(c.changedInPlace.length >= 1);
  assert.ok(c.changedInPlace.every((x) => x.because.some((line) => /Against your yearly budget it was could stretch your yearly budget and is now within your yearly budget\./.test(line))));
  assert.equal(c.steady + c.changedInPlace.length, 5);
});

test("two assessments of the same description differ only by library or engine version, and the comparison says so", () => {
  const result = diagnose(A);
  const later: Result = { ...result, libraryVersion: result.libraryVersion + 1, engineVersion: result.engineVersion + 1 };
  const c = compareAssessments(result, later, A, A, true);
  assert.equal(c.sameDescription, true);
  assert.equal(c.libraryChanged, true);
  assert.equal(c.engineChanged, true);
  assert.deepEqual(c.answers, []);
  assert.equal(c.nothingMoved, true);
  assert.equal(c.steady, result.items.length);
});

test("identical assessments: nothing moved and every idea is steady", () => {
  const c = compare(A, { ...A });
  assert.equal(c.nothingMoved, true);
  assert.equal(c.steady, 5);
  assert.deepEqual([c.moved, c.entered, c.dropped, c.answers], [[], [], [], []]);
  assert.equal(c.libraryChanged || c.engineChanged, false);
});

test("two assessments with no ideas at all compare as nothing moved, and one with ideas against one without moves them all", () => {
  const none = diagnose({ ...A, problems: ["other_problem"] });
  assert.equal(none.items.length, 0);
  const empty = compareAssessments(none, none, A, A, true);
  assert.equal(empty.nothingMoved, true);
  assert.equal(empty.steady, 0);
  const full = diagnose(A);
  const gained = compareAssessments(none, full, { ...A, problems: ["other_problem"] }, A, false);
  assert.equal(gained.entered.length, 5);
  assert.deepEqual(gained.entered.map((e) => e.rank), [1, 2, 3, 4, 5]);
  assert.ok(gained.entered.every((e) => e.before === "Before, it did not match a problem you named." || /^Before, it was left out/.test(e.before)));
  const lost = compareAssessments(full, none, A, { ...A, problems: ["other_problem"] }, false);
  assert.equal(lost.dropped.length, 5);
  assert.equal(lost.moved.length, 0);
});

test("when either description cannot be read the ranks are still compared and the answers are null", () => {
  const after: Answers = { ...A, production_tracking: "software" };
  const c = compareAssessments(diagnose(A), diagnose(after), null, after, false);
  assert.equal(c.answers, null);
  assert.equal(c.dropped.length, 2);
  assert.equal(compareAssessments(diagnose(A), diagnose(after), A, null, false).answers, null);
});

test("it only reads: neither result is changed", () => {
  const before = diagnose(A);
  const after = diagnose({ ...A, production_tracking: "software" });
  const snapshot = JSON.stringify([before, after]);
  compareAssessments(before, after, A, { ...A, production_tracking: "software" }, false);
  assert.equal(JSON.stringify([before, after]), snapshot);
});
