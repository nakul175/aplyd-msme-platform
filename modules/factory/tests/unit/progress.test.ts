import assert from "node:assert/strict";
import { test } from "node:test";
import { FIELDS, REQUIRED_TO_CONFIRM } from "../../src/questionnaire.ts";
import type { Answers } from "../../src/questionnaire.ts";
import { FOLLOW_UP_KEYS, confirmWords, isAnswered, progressOf, progressWords } from "../../src/progress.ts";

const required: Answers = { sector: "textiles_garments", products: "Shirts", employees: "10_49", processes: ["cutting"], problems: ["late_deliveries"] };

test("nothing saved, or an empty set of answers, is zero of every question that applies", () => {
  for (const none of [null, undefined, {}]) {
    const p = progressOf(none);
    assert.equal(p.answered, 0);
    assert.equal(p.total, FIELDS.length - FOLLOW_UP_KEYS.length, "the two follow-up questions do not apply yet");
    assert.equal(p.requiredAnswered, 0);
    assert.equal(p.requiredTotal, REQUIRED_TO_CONFIRM.length);
    assert.deepEqual(p.requiredMissing, [...REQUIRED_TO_CONFIRM], "in questionnaire order");
  }
});

test("every question that applies and has an answer is counted once, and the five needed to confirm are counted on their own", () => {
  const p = progressOf({ ...required, year_started: 2009, shifts: "one" });
  assert.equal(p.answered, 7);
  assert.equal(p.requiredAnswered, 5);
  assert.deepEqual(p.requiredMissing, []);
  assert.equal(progressOf({ sector: "pharma", year_started: 2009 }).requiredAnswered, 1);
  assert.deepEqual(progressOf({ sector: "pharma", products: "Tablets" }).requiredMissing, ["employees", "processes", "problems"]);
});

test("a follow-up question counts only once the answer that asks for it is given", () => {
  const without = progressOf({ sector: "electronics", sector_other: "left over from an earlier choice" });
  assert.equal(without.answered, 1, "an answer to a question that does not apply is not counted");
  assert.equal(without.total, FIELDS.length - 2);
  const withSector = progressOf({ sector: "other" });
  assert.equal(withSector.total, FIELDS.length - 1, "sector_other applies once the sector is 'Something else'");
  assert.equal(withSector.answered, 1, "and is not answered yet");
  assert.equal(progressOf({ sector: "other", sector_other: "Toys" }).answered, 2);
  const problems = progressOf({ problems: ["breakdowns", "other_problem"], problem_other: "Floods" });
  assert.equal(problems.total, FIELDS.length - 1);
  assert.equal(problems.answered, 2);
  const everything = progressOf({ sector: "other", problems: ["other_problem"] });
  assert.equal(everything.total, FIELDS.length, "with both triggers given every question applies");
});

test("the follow-up rules name questions that exist", () => {
  const keys = FIELDS.map((f) => f.key);
  for (const k of FOLLOW_UP_KEYS) assert.ok(keys.includes(k), k);
});

test("what counts as an answer: text with something in it, a finite number, a list with something in it", () => {
  for (const yes of ["x", " x ", 0, 2009, ["a"]]) assert.ok(isAnswered(yes), String(yes));
  for (const no of ["", "   ", NaN, Infinity, [], null, undefined, {}, true]) assert.ok(!isAnswered(no), String(no));
  assert.equal(progressOf({ products: "  ", processes: [], year_started: NaN } as unknown as Answers).answered, 0);
});

test("a key that is not a question, and a key named like an object's own members, change nothing", () => {
  const raw = JSON.parse('{"__proto__": "x", "constructor": "y", "toString": "z", "nonsense": "w"}') as Answers;
  assert.equal(progressOf(raw).answered, 0);
  assert.equal(progressOf({ ...required, nonsense: "w" } as Answers).answered, 5);
});

test("the words: the count, and one line about the questions needed to confirm", () => {
  assert.equal(progressWords(progressOf({ ...required, shifts: "one" }), true), `6 of ${FIELDS.length - 2} questions answered in the newest saved version`);
  assert.equal(progressWords(progressOf(null), false), `0 of ${FIELDS.length - 2} questions answered`, "with nothing saved there is no saved version to name");
  assert.equal(confirmWords(progressOf({ sector: "pharma" }), false), "1 of 5 questions needed to confirm are answered.");
  assert.match(confirmWords(progressOf(required), false) ?? "", /All 5 questions needed to confirm are answered\. You can confirm this version\./);
  assert.equal(confirmWords(progressOf({ sector: "pharma" }), true), null, "a confirmed version needs nothing more");
  assert.equal(confirmWords(progressOf(required), true), null);
});
