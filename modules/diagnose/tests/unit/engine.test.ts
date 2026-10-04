import assert from "node:assert/strict";
import { test } from "node:test";
import { FIELDS } from "../../../factory/src/questionnaire.ts";
import type { Answers } from "../../../factory/src/questionnaire.ts";
import { ENGINE_VERSION, MAX_ITEMS, affordability, diagnose, evaluate } from "../../src/engine.ts";
import type { Result } from "../../src/engine.ts";
import { BUDGET_CEILING, LIBRARY, LIBRARY_VERSION } from "../../src/library.ts";
import type { Opportunity } from "../../src/library.ts";

const base: Answers = {
  sector: "textiles_garments",
  products: "SYNTHETIC shirts",
  employees: "10_49",
  processes: ["cutting"],
  problems: ["late_deliveries", "rejects_rework"],
  production_tracking: "paper",
  quality_checks: "visual",
  budget_band: "5_to_25_lakh",
  it_support: "owner_or_family",
  connectivity: "reliable",
  data_kept: ["quality_records", "customer_orders", "machine_hours"],
  inventory: "paper",
  maintenance: "when_it_breaks",
  accounts: "accounting_software",
};
const omit = (a: Answers, ...keys: string[]): Answers => Object.fromEntries(Object.entries(a).filter(([k]) => !keys.includes(k)));
const item = (r: Result, id: string) => r.items.find((i) => i.opportunityId === id)!;

test("the same answers give the same result, the answers are not changed, and the result names its versions and says SYNTHETIC", () => {
  const frozen = structuredClone(base);
  Object.freeze(frozen);
  const one = diagnose(frozen);
  const two = diagnose(structuredClone(base));
  assert.deepEqual(one, two);
  assert.equal(one.engine, "rules");
  assert.equal(one.engineVersion, ENGINE_VERSION);
  assert.equal(one.libraryVersion, LIBRARY_VERSION);
  assert.equal(one.synthetic, true);
  assert.deepEqual(base, structuredClone(base));
});

test("conditions: each kind is judged on one-choice and many-choice answers, and a missing answer is unknown", () => {
  const a: Answers = { quality_checks: "visual", data_kept: ["energy_bills"], processes: [] };
  assert.equal(evaluate({ question: "quality_checks", is: ["visual", "none"] }, a), "yes");
  assert.equal(evaluate({ question: "quality_checks", is: ["none"] }, a), "no");
  assert.equal(evaluate({ question: "quality_checks", not: ["none"] }, a), "yes");
  assert.equal(evaluate({ question: "quality_checks", not: ["visual"] }, a), "no");
  assert.equal(evaluate({ question: "data_kept", has: "energy_bills" }, a), "yes");
  assert.equal(evaluate({ question: "data_kept", has: "customer_orders" }, a), "no");
  assert.equal(evaluate({ question: "data_kept", lacks: "customer_orders" }, a), "yes");
  assert.equal(evaluate({ question: "data_kept", lacks: "energy_bills" }, a), "no");
  assert.equal(evaluate({ question: "maintenance", is: ["when_it_breaks"] }, a), "unknown");
  assert.equal(evaluate({ question: "data_kept", has: "energy_bills" }, {}), "unknown");
  // the wrong shape of answer is "no", never a crash and never "yes"
  assert.equal(evaluate({ question: "quality_checks", has: "visual" }, a), "no");
  assert.equal(evaluate({ question: "data_kept", is: ["energy_bills"] }, a), "no");
  assert.equal(evaluate({ question: "data_kept", not: ["energy_bills"] }, a), "no");
});

test("a question named like an inherited property is unknown, not read from the prototype", () => {
  for (const question of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.equal(evaluate({ question, is: ["x"] }, {}), "unknown", question);
    assert.equal(evaluate({ question, has: "x" }, {}), "unknown", question);
  }
});

test("the score is the sum of its parts, the list is in score order with ties broken by id, and ranks run 1, 2, 3", () => {
  const r = diagnose(base);
  assert.ok(r.items.length >= 3);
  for (const i of r.items) {
    const p = i.scoreParts;
    assert.equal(i.score, p.problems + p.readiness + p.affordability + p.risk + p.uncertainty, i.opportunityId);
    assert.ok(p.risk <= 0 && p.uncertainty <= 0 && p.problems > 0 && p.problems % 10 === 0);
  }
  assert.deepEqual(r.items.map((i) => i.rank), r.items.map((_, n) => n + 1));
  for (let n = 1; n < r.items.length; n++) {
    const [prev, next] = [r.items[n - 1], r.items[n]];
    assert.ok(prev.score > next.score || (prev.score === next.score && prev.opportunityId < next.opportunityId), `${prev.opportunityId} before ${next.opportunityId}`);
  }
});

test("the ranking has no term for AI: turning every item's kind around changes no score and no order", () => {
  const flipped: Opportunity[] = LIBRARY.map((o) => ({ ...o, kind: o.kind === "ai" ? "non_ai" : "ai" }));
  for (const answers of [base, { ...base, budget_band: "under_1_lakh" }, { ...base, problems: ["breakdowns", "stock_shortages", "late_deliveries"] }]) {
    const a = diagnose(answers);
    const b = diagnose(answers, flipped);
    assert.deepEqual(b.items.map((i) => [i.opportunityId, i.score, i.rank]), a.items.map((i) => [i.opportunityId, i.score, i.rank]));
  }
});

test("only problems the owner named bring an item in; an item that addresses two named problems outranks one that addresses one", () => {
  assert.deepEqual(diagnose({ ...base, problems: ["energy_cost"] }).items.map((i) => i.opportunityId), ["energy_review_and_tariff_check"]);
  const both = diagnose({ ...base, production_tracking: "paper", problems: ["late_deliveries", "rejects_rework"] });
  assert.equal(both.items[0].opportunityId, "digital_job_log", "addresses both");
  assert.equal(both.items[0].scoreParts.problems, 20);
  assert.deepEqual(both.items[0].addresses, ["Late deliveries", "Rejections and rework"]);
  assert.equal(diagnose({ ...base, problems: ["other_problem"] }).items.length, 0);
  assert.equal(diagnose(omit(base, "problems")).items.length, 0);
  assert.equal(diagnose({}).items.length, 0);
});

test("when the gap does not exist the item is left out with the owner's own answer as the reason", () => {
  const r = diagnose({ ...base, problems: ["payment_delays"], accounts: "erp" });
  assert.equal(r.items.length, 0);
  assert.deepEqual(r.leftOut.map((l) => l.opportunityId).sort(), ["accounting_software", "receivables_follow_up"]);
  for (const l of r.leftOut) {
    assert.match(l.reason, /Your answer to "How do you keep accounts\?" is "In a full business system"/);
    assert.match(l.reason, /"On paper" or "In a spreadsheet"/);
  }
});

test("when an answer needed to see the gap is missing, the item stays in, scores one lower and says why", () => {
  const withAnswer = diagnose({ ...base, problems: ["breakdowns"], maintenance: "when_it_breaks" });
  const without = diagnose(omit({ ...base, problems: ["breakdowns"] }, "maintenance"));
  const [a, b] = [item(withAnswer, "preventive_maintenance_plan"), item(without, "preventive_maintenance_plan")];
  assert.equal(a.scoreParts.uncertainty, 0);
  assert.equal(b.scoreParts.uncertainty, -1);
  assert.equal(b.score, a.score - 1);
  assert.match(b.why.join(" "), /answer needed to see whether the gap exists is missing/);
  assert.match(a.why.join(" "), /Your answer to "How are machines maintained\?" is "When they break"/);
});

test("prerequisites: an unmet one says what to do first, an unknown one asks, and a met one is ready", () => {
  // The camera needs the written quality list first (the gap that list closes still exists for a unit that checks by eye).
  const camera = item(diagnose(base), "camera_inspection_ai");
  assert.equal(camera.readiness.state, "needs_first");
  assert.deepEqual(camera.readiness.needsFirst, ["First check quality against a written list, so there is a clear standard to teach the software"]);
  assert.equal(camera.kind, "ai");
  // No quality records kept: a second thing to do first.
  const noRecords = item(diagnose({ ...base, data_kept: ["customer_orders"] }), "camera_inspection_ai");
  assert.equal(noRecords.readiness.needsFirst.length, 2);
  // An unanswered prerequisite question only needs checking.
  const unknown = item(diagnose(omit({ ...base, production_tracking: "spreadsheet" }, "it_support")), "ai_job_scheduling");
  assert.equal(unknown.readiness.state, "check");
  assert.deepEqual(unknown.readiness.toCheck, ["Someone has to look after the software"]);
  // When the other opportunity's gap is already closed, that prerequisite holds: tracking in a spreadsheet needs no job log first.
  const ready = item(diagnose({ ...base, production_tracking: "spreadsheet", it_support: "owner_or_family" }), "ai_job_scheduling");
  assert.equal(ready.readiness.state, "ready");
  assert.deepEqual(ready.readiness.needsFirst, []);
  assert.equal(ready.scoreParts.readiness, 4);
  assert.equal(unknown.scoreParts.readiness, 2);
  assert.equal(camera.scoreParts.readiness, 0);
});

test("a ready item outranks an otherwise equal one that needs something first", () => {
  const r = diagnose(base);
  const rank = (id: string) => item(r, id).rank;
  assert.ok(rank("digital_job_log") < rank("ai_job_scheduling"), "the log comes before the software that needs it");
  assert.ok(rank("inspection_checklist_and_gauges") < rank("camera_inspection_ai"), "the written list comes before the camera");
});

test("affordability: first-year cost against the top of the yearly budget band, with the band's edges", () => {
  const cost = (low: number, high: number) => ({ low, high });
  assert.deepEqual(affordability(cost(10, 100_000), "under_1_lakh"), { state: "within", budgetCeiling: 100_000 });
  assert.deepEqual(affordability(cost(10, 100_001), "under_1_lakh"), { state: "stretch", budgetCeiling: 100_000 });
  assert.deepEqual(affordability(cost(100_000, 900_000), "under_1_lakh"), { state: "stretch", budgetCeiling: 100_000 });
  assert.deepEqual(affordability(cost(100_001, 900_000), "under_1_lakh"), { state: "over", budgetCeiling: 100_000 });
  assert.deepEqual(affordability(cost(10_000_000, 90_000_000), "over_25_lakh"), { state: "within", budgetCeiling: null });
  for (const band of [null, "not_sure", "nonsense", "constructor", "__proto__", "toString"]) assert.deepEqual(affordability(cost(1, 2), band), { state: "unknown", budgetCeiling: null }, String(band));
  assert.deepEqual(Object.keys(BUDGET_CEILING).sort(), ["1_to_5_lakh", "5_to_25_lakh", "over_25_lakh", "under_1_lakh"]);
});

test("affordability changes the order: the same unit with a smaller budget sees dearer items fall", () => {
  const rich = diagnose({ ...base, budget_band: "over_25_lakh" });
  const poor = diagnose({ ...base, budget_band: "under_1_lakh" });
  assert.ok(item(poor, "camera_inspection_ai").scoreParts.affordability < item(rich, "camera_inspection_ai").scoreParts.affordability);
  assert.equal(item(poor, "camera_inspection_ai").affordability.state, "over");
  assert.equal(item(rich, "camera_inspection_ai").affordability.state, "within");
  assert.equal(item(diagnose({ ...base, budget_band: "not_sure" }), "camera_inspection_ai").affordability.state, "unknown");
  const first = item(poor, "digital_job_log").affordability.firstYear;
  assert.deepEqual(first, { low: 20_000, high: 104_000 }, "one-time plus the first year's recurring, low with low and high with high");
});

test("only the first eight are shown; the rest are listed as left out and say why", () => {
  const many: Opportunity[] = Array.from({ length: 12 }, (_, n) => ({ ...LIBRARY[0], id: `item_${String(n).padStart(2, "0")}`, appliesWhen: [], prerequisites: [] }));
  const r = diagnose({ problems: ["late_deliveries"] }, many);
  assert.equal(r.items.length, MAX_ITEMS);
  assert.equal(r.leftOut.length, 4);
  assert.ok(r.leftOut.every((l) => l.reason === `Ranked below the first ${MAX_ITEMS}.`));
  assert.deepEqual(r.items.map((i) => i.opportunityId), many.slice(0, MAX_ITEMS).map((o) => o.id), "equal scores: by id");
});

test("the result carries a copy of what it used, so it does not depend on the library staying the same", () => {
  const r = diagnose(base);
  const first = r.items[0];
  assert.equal(first.title, LIBRARY.find((o) => o.id === first.opportunityId)!.title);
  assert.ok(first.costs.hidden.length > 0 && first.benefit.basis === "assumption" && first.source === "assumption");
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r, "plain data: it survives being stored as JSON");
  assert.deepEqual(r.inputs, { problems: ["Late deliveries", "Rejections and rework"], budgetBand: "5 to 25 lakh rupees", sector: "Textiles and garments", readiness: null });
});

test("the library is well formed against the questionnaire it reads", () => {
  const fields = new Map(FIELDS.map((f) => [f.key, f]));
  const problemValues = new Set((fields.get("problems") as { options: { value: string }[] }).options.map((o) => o.value));
  assert.equal(new Set(LIBRARY.map((o) => o.id)).size, LIBRARY.length, "ids are unique");
  const checkCondition = (id: string, c: { question: string; is?: string[]; not?: string[]; has?: string; lacks?: string }) => {
    const f = fields.get(c.question);
    assert.ok(f && (f.kind === "choice" || f.kind === "multi"), `${id}: ${c.question} is a choice question`);
    const values = (f as { options: { value: string }[] }).options.map((o) => o.value);
    const named = [...(c.is ?? []), ...(c.not ?? []), ...(c.has ? [c.has] : []), ...(c.lacks ? [c.lacks] : [])];
    assert.ok(named.length > 0, `${id}: the condition names a value`);
    for (const v of named) assert.ok(values.includes(v), `${id}: ${c.question}=${v} is an option`);
    assert.equal(f!.kind === "choice", "is" in c || "not" in c, `${id}: ${c.question}: is/not for one-choice, has/lacks for many-choice`);
  };
  for (const o of LIBRARY) {
    assert.ok(o.addresses.length > 0 && o.addresses.every((p) => problemValues.has(p)), `${o.id} addresses real problems`);
    assert.ok(o.title.trim() && o.summary.trim() && o.risk.note.trim() && o.costs.hidden.length > 0, `${o.id} is complete`);
    assert.ok(o.kind === "ai" || o.kind === "non_ai");
    assert.ok(["low", "medium", "high"].includes(o.risk.level));
    for (const r of [o.costs.oneTime, o.costs.recurringPerYear]) assert.ok(Number.isInteger(r.low) && Number.isInteger(r.high) && r.low >= 0 && r.low <= r.high, `${o.id} cost range`);
    assert.ok(o.benefit.low >= 0 && o.benefit.low <= o.benefit.high && o.benefit.basis === "assumption", `${o.id} benefit range`);
    for (const c of o.appliesWhen) checkCondition(o.id, c);
    for (const p of o.prerequisites) {
      assert.ok(p.text.trim());
      if ("opportunity" in p) assert.ok(LIBRARY.some((x) => x.id === p.opportunity) && p.opportunity !== o.id, `${o.id} needs a real other item`);
      else checkCondition(o.id, p.when);
    }
  }
});

test("prerequisites between items never loop", () => {
  const needs = new Map(LIBRARY.map((o) => [o.id, o.prerequisites.flatMap((p) => ("opportunity" in p ? [p.opportunity] : []))]));
  const visit = (id: string, path: string[]) => {
    assert.ok(!path.includes(id), `loop: ${[...path, id].join(" -> ")}`);
    for (const next of needs.get(id) ?? []) visit(next, [...path, id]);
  };
  for (const id of needs.keys()) visit(id, []);
});

test("every problem the questionnaire offers has at least one opportunity, except 'something else', which cannot", () => {
  const fields = new Map(FIELDS.map((f) => [f.key, f]));
  const all = (fields.get("problems") as { options: { value: string }[] }).options.map((o) => o.value);
  const covered = new Set(LIBRARY.flatMap((o) => o.addresses));
  assert.deepEqual(all.filter((p) => !covered.has(p)), ["other_problem"]);
});

test("both kinds are in the library, and non-AI items are the larger share, as the study's finding on pain points suggests", () => {
  const ai = LIBRARY.filter((o) => o.kind === "ai").length;
  assert.ok(ai >= 3 && LIBRARY.length - ai > ai);
});

test("every figure in the library is labelled an assumption or cites a source in the register; and nothing claims APLYD certifies or guarantees", async () => {
  const { readFileSync } = await import("node:fs");
  const register = readFileSync(new URL("../../../../docs/sources.md", import.meta.url), "utf8");
  for (const o of LIBRARY) {
    assert.ok(o.source === "assumption" || new RegExp(`^\\| ${o.source} \\|`, "m").test(register), `${o.id} cites ${o.source}`);
    const text = [o.title, o.summary, o.risk.note, ...o.costs.hidden, ...o.prerequisites.map((p) => p.text)].join(" ");
    assert.ok(!/APLYD\s+(certif|approv|guarantee|endors)/i.test(text), `${o.id} makes no claim for APLYD`);
  }
  const paperwork = LIBRARY.find((o) => o.id === "paperwork_organiser")!;
  assert.match(paperwork.summary, /issued by another body, not by APLYD/);
});

test("the library has no entry that names a company, a person or a real product", () => {
  const text = JSON.stringify(LIBRARY);
  assert.ok(!/@|https?:|www\./.test(text), "no address or link");
  assert.ok(!/\b(Pvt|Ltd|Inc|LLP)\b/.test(text), "no company names");
});
