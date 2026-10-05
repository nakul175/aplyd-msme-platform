// The gap view: where the unit stands in five areas and what stands between it and each idea, read from a stored assessment, the answers it
// was made from and the library. Every case below is a description a person can read and check by hand against the library.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FIELDS } from "../../../factory/src/questionnaire.ts";
import type { Answers } from "../../../factory/src/questionnaire.ts";
import { diagnose } from "../../src/engine.ts";
import type { Result } from "../../src/engine.ts";
import { AREAS, AREA_OF_QUESTION, answerWords, gapView, questionsRead } from "../../src/gaps.ts";
import { LIBRARY } from "../../src/library.ts";

/** The synthetic description of company A (the seed): paper job cards, quality checked by eye, accounts in software, a stock book. */
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
const without = (answers: Answers, ...keys: string[]): Answers => Object.fromEntries(Object.entries(answers).filter(([k]) => !keys.includes(k)));
const area = (view: ReturnType<typeof gapView>, id: string) => view.areas.find((a) => a.id === id)!;
const everyWord = (view: ReturnType<typeof gapView>): string[] => [
  ...view.areas.flatMap((a) => [a.label, a.about, a.whyNot ?? "", ...a.standing.map((s) => s.label), ...a.blockers.map((b) => b.words), ...a.inPlace.map((l) => l.words)]),
  ...view.unplaced.map((b) => b.words),
];

test("there are five areas, in the order the requirements name them, and every question the library reads is in one of them", () => {
  assert.deepEqual(AREAS.map((a) => a.id), ["data", "people", "systems", "money", "quality"]);
  const read = questionsRead(LIBRARY);
  for (const key of read) if (key !== "problems") assert.ok(Object.hasOwn(AREA_OF_QUESTION, key), `${key} is read by the rules but belongs to no area`);
  // And the other way: an area shows only answers the rules read, so nothing shown under it is there for nothing.
  for (const key of Object.keys(AREA_OF_QUESTION)) assert.ok(read.has(key), `${key} is in an area but no rule reads it`);
  // People is thin because the library is: it reads one question about people, and the area says it looks at nothing else.
  assert.deepEqual(Object.keys(AREA_OF_QUESTION).filter((k) => AREA_OF_QUESTION[k] === "people"), ["it_support"]);
  assert.match(AREAS.find((a) => a.id === "people")!.about, /skills and staffing are not assessed/);
  // A name that is not a question is not in the table either.
  const known = new Set(FIELDS.map((f) => f.key));
  for (const key of Object.keys(AREA_OF_QUESTION)) assert.ok(known.has(key), `${key} is not a question of the questionnaire`);
  assert.deepEqual(gapView(diagnose(A), A).areas.map((a) => a.id), ["data", "people", "systems", "money", "quality"]);
});

test("each line sits in the area of the question it is about, with the owner's own words", () => {
  const result = diagnose(A);
  const view = gapView(result, A);
  assert.equal(view.state, "ideas");
  assert.equal(view.placed, true);
  assert.deepEqual(view.unplaced, []);
  // Quality: the camera idea needs a written standard first, and that prerequisite is another idea whose own gap is a quality question.
  assert.deepEqual(area(view, "quality").blockers.map((b) => [b.opportunityId, b.kind]), [["camera_inspection_ai", "first"]]);
  assert.equal(area(view, "quality").blockers[0]!.words, "Check quality against a written list, so there is a clear standard to teach the software.");
  assert.match(area(view, "quality").blockers[0]!.text, /^First check quality against a written list/, "the library's own text is kept beside the words");
  // Data: it needs quality records, which this owner does not keep.
  assert.deepEqual(area(view, "data").blockers.map((b) => [b.opportunityId, b.kind]), [["camera_inspection_ai", "first"]]);
  assert.match(area(view, "data").blockers[0]!.words, /Keep quality or rejection records/);
  assert.equal(area(view, "data").standing[0]!.answer, "Customer orders; Power bills");
  // Systems: the scheduling idea needs the job log first, the forecast needs a stock register first.
  assert.deepEqual(area(view, "systems").blockers.map((b) => b.opportunityId), ["ai_job_scheduling", "demand_forecast_ai"]);
  // Money: three AI ideas could stretch the budget; the figures are the engine's own.
  const money = area(view, "money");
  assert.deepEqual(money.blockers.map((b) => [b.opportunityId, b.kind]), [["ai_job_scheduling", "money"], ["camera_inspection_ai", "money"], ["demand_forecast_ai", "money"]]);
  assert.match(money.blockers[0]!.words, /^The first year costs ₹1,90,000 to ₹10,00,000\. Your yearly budget is up to ₹5,00,000, so it could stretch your yearly budget\.$/);
  assert.equal(money.standing[0]!.answer, "1 to 5 lakh rupees");
  // People: the owner or family looks after the software, so nothing is in the way.
  const people = area(view, "people");
  assert.equal(people.state, "assessed");
  assert.deepEqual(people.blockers, []);
  assert.deepEqual(people.standing.map((s) => s.answer), ["The owner or family"]);
  // Ideas the owner's answers closed are listed in the area of the answer that closed them.
  assert.deepEqual(area(view, "systems").inPlace.map((l) => l.opportunityId), ["receivables_follow_up", "accounting_software"]);
  assert.match(area(view, "systems").inPlace[0]!.words, /^You answered "In accounting software" to "How do you keep accounts\?", so "Follow up unpaid invoices on a fixed weekly routine" was left out\.$/);
  assert.equal(view.leftOutByAnswer, 2);
  assert.equal(view.rankedBelowCap, 0);
  assert.equal(view.needsAnswers, false);
});

test("the same lines are read idea by idea, in rank order, and an idea with nothing in its way says so by having no lines", () => {
  const result = diagnose(A);
  const view = gapView(result, A);
  assert.deepEqual(view.ideas.map((i) => i.opportunityId), result.items.map((i) => i.opportunityId));
  assert.deepEqual(view.ideas.map((i) => i.rank), [1, 2, 3, 4, 5]);
  assert.deepEqual(view.ideas[0]!.blockers, [], "the first idea is ready and fits the budget");
  assert.equal(view.ideas[0]!.readiness, "ready");
  const camera = view.ideas.find((i) => i.opportunityId === "camera_inspection_ai")!;
  assert.deepEqual(camera.blockers.map((b) => b.kind), ["first", "first", "money"], "what comes first, then the cost");
  // Every line of the areas is a line of an idea, and the other way round: the two readings are the same lines.
  const byArea = view.areas.reduce((n, a) => n + a.blockers.length, 0) + view.unplaced.length;
  assert.equal(view.ideas.reduce((n, i) => n + i.blockers.length, 0), byArea);
});

test("a question the owner did not answer is named, in the area it belongs to, and the area it leaves with nothing to go on is not assessed", () => {
  const answers = without(A, "it_support", "data_kept");
  const result = diagnose(answers);
  const view = gapView(result, answers);
  assert.equal(view.needsAnswers, true);
  const checks = view.areas.flatMap((a) => a.blockers).filter((b) => b.kind === "check");
  assert.ok(checks.length >= 2, "the camera idea has two things the engine could not judge");
  const software = checks.find((b) => b.text.startsWith("Someone has to look after the equipment"))!;
  assert.equal(software.area, "people");
  assert.deepEqual(software.missing, ["Who looks after computers and software?"]);
  assert.equal(software.words, 'Someone has to look after the equipment and software. Not known yet: you did not answer "Who looks after computers and software?".');
  assert.equal(area(view, "people").state, "not_assessed");
  assert.match(area(view, "people").whyNot!, /^You did not answer "Who looks after computers and software\?", so this part is not assessed\.$/);
  assert.equal(area(view, "data").state, "not_assessed");
  assert.equal(area(view, "data").standing[0]!.answer, null);
  assert.equal(area(view, "quality").state, "assessed", "an area with its answer is still assessed");
});

test("when an answer needed to see whether an idea applies at all is missing, the line names that question", () => {
  const answers = without(A, "production_tracking");
  const result = diagnose(answers);
  const view = gapView(result, answers);
  const log = result.items.find((i) => i.opportunityId === "digital_job_log")!;
  assert.equal(log.scoreParts.uncertainty, -1, "the engine took a point off for it");
  const line = area(view, "systems").blockers.find((b) => b.opportunityId === "digital_job_log" && b.kind === "answer")!;
  assert.deepEqual(line.missing, ["How do you keep track of what is being made?"]);
  assert.match(line.words, /^You did not answer "How do you keep track of what is being made\?", so it is not clear whether this applies to you\.$/);
  assert.equal(view.needsAnswers, true);
});

test("money: a band with a ceiling is assessed; 'not sure' and no answer are not, and say why; a band above every idea shows no cost line", () => {
  const forBand = (budget: Answers) => area(gapView(diagnose(budget), budget), "money");
  assert.equal(forBand(A).state, "assessed");
  assert.match(forBand({ ...A, budget_band: "not_sure" }).whyNot!, /not sure of your yearly budget/);
  assert.match(forBand(without(A, "budget_band")).whyNot!, /did not give a yearly budget/);
  assert.deepEqual(forBand({ ...A, budget_band: "over_25_lakh" }).blockers, [], "no ceiling, so no idea is over it");
  assert.equal(forBand({ ...A, budget_band: "over_25_lakh" }).state, "assessed");
  const under = forBand({ ...A, budget_band: "under_1_lakh" });
  assert.ok(under.blockers.length > 0);
  assert.ok(under.blockers.every((b) => b.kind === "money"));
  assert.ok(under.blockers.some((b) => /so it is more than your yearly budget\.$/.test(b.words)), "over, not only a stretch");
  assert.ok(under.blockers.some((b) => /so it could stretch your yearly budget\.$/.test(b.words)));
});

test("an owner who named no problem has nothing to compare against: no ideas, no lines, and the answers are still shown", () => {
  const answers = without(A, "problems");
  const result = diagnose(answers);
  assert.equal(result.items.length + result.leftOut.length, 0);
  const view = gapView(result, answers);
  assert.equal(view.state, "no_match");
  assert.deepEqual(view.ideas, []);
  assert.equal(view.areas.reduce((n, a) => n + a.blockers.length + a.inPlace.length, 0), 0);
  assert.equal(view.leftOutByAnswer, 0);
  assert.equal(area(view, "systems").standing.find((s) => s.question === "production_tracking")!.answer, "On paper or a register");
  assert.equal(view.needsAnswers, false);
});

test("when every idea that matches the problems is left out, the view says so and lists each with the answer behind it", () => {
  const answers: Answers = { ...A, problems: ["payment_delays"] };
  const result = diagnose(answers);
  assert.equal(result.items.length, 0);
  assert.equal(result.leftOut.length, 2);
  const view = gapView(result, answers);
  assert.equal(view.state, "all_left_out");
  assert.deepEqual(view.ideas, []);
  assert.equal(view.leftOutByAnswer, 2);
  assert.equal(area(view, "systems").inPlace.length, 2);
  assert.ok(area(view, "systems").inPlace.every((l) => /"In accounting software"/.test(l.words)));
  assert.equal(area(view, "systems").heldUp, 0);
  assert.equal(area(view, "money").state, "assessed");
});

test("an idea left out only because eight were already ranked is counted and not called a closed gap", () => {
  const answers: Answers = { ...A, problems: ["late_deliveries", "rejects_rework", "working_capital"], accounts: "paper" };
  const result = diagnose(answers);
  assert.equal(result.items.length, 8);
  const view = gapView(result, answers);
  assert.equal(view.rankedBelowCap, result.leftOut.filter((l) => /^Ranked below/.test(l.reason)).length);
  assert.ok(view.rankedBelowCap >= 1);
  assert.ok(view.areas.every((a) => a.inPlace.every((l) => !/Ranked below/.test(l.words))));
});

test("when the description cannot be read, every area says so and the lines the result holds are still shown", () => {
  const result = diagnose(A);
  const view = gapView(result, null);
  assert.ok(view.areas.every((a) => a.state === "not_assessed" && /could not be read/.test(a.whyNot!)));
  assert.ok(view.areas.every((a) => a.standing.every((s) => s.answer === null)));
  const lines = view.areas.reduce((n, a) => n + a.blockers.length, 0) + view.unplaced.length;
  assert.ok(lines >= 5, "the prerequisites and costs come from the stored result, not from the answers");
  // The left-out ideas cannot be tied to an answer, so they are kept with the engine's own sentence, unplaced.
  assert.equal(view.unplacedInPlace.length, 2);
  assert.match(view.unplacedInPlace[0]!.words, /was left out\. Your answer to "How do you keep accounts\?"/);
});

test("an assessment made with another version of the library is not placed by this library: every line is kept, unplaced, and the view says so", () => {
  const result = diagnose(A);
  const view = gapView(result, A, LIBRARY, result.libraryVersion + 1);
  assert.equal(view.placed, false);
  assert.ok(view.areas.every((a) => a.blockers.length === 0 || a.id === "money"), "only the money lines come from the stored result alone");
  assert.ok(view.unplaced.length >= 3);
  assert.ok(view.unplaced.every((b) => b.area === null));
  assert.equal(view.ideas.reduce((n, i) => n + i.blockers.length, 0), view.areas.reduce((n, a) => n + a.blockers.length, 0) + view.unplaced.length);
});

test("it only reads: the result and the answers are not changed, and the same inputs give the same view", () => {
  const result: Result = diagnose(A);
  const before = JSON.stringify([result, A]);
  const first = gapView(result, A);
  const second = gapView(JSON.parse(JSON.stringify(result)) as Result, JSON.parse(JSON.stringify(A)) as Answers);
  assert.equal(JSON.stringify([result, A]), before);
  assert.deepEqual(first, second);
});

test("the words the page shows are plain: no 'gap', no rule names, nothing about the score", () => {
  const view = gapView(diagnose(A), A);
  for (const w of everyWord(view)) {
    assert.ok(!/\bgaps?\b/i.test(w), w);
    assert.ok(!/\bscore\b|\bengine\b|\bprerequisite\b/i.test(w), w);
  }
});

test("answerWords gives the questionnaire's labels, joins many choices, and gives null for no answer", () => {
  assert.equal(answerWords("accounts", A), "In accounting software");
  assert.equal(answerWords("data_kept", A), "Customer orders; Power bills");
  assert.equal(answerWords("year_started", A), "2009");
  assert.equal(answerWords("connectivity", {}), null);
  assert.equal(answerWords("connectivity", null), null);
  assert.equal(answerWords("toString", {}), null, "an inherited name is not an answer");
});
