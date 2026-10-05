import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_FACTS, nextStep } from "../../../journey/src/progress.ts";
import { diagnose, POINTS } from "../../src/engine.ts";
import { DECISION_WORD, afterSignOff, decisionWord, firstUndecided, hasAssessmentFrom, relationToConfirmed, scoreLine, signOffState, signOffWords } from "../../src/progress.ts";

test("the sign-off can be pressed only when there is something to sign and every idea is decided; a signed assessment stays signed", () => {
  assert.equal(signOffState(0, 5, false), "deciding");
  assert.equal(signOffState(4, 5, false), "deciding");
  assert.equal(signOffState(5, 5, false), "ready");
  assert.equal(signOffState(0, 0, false), "empty", "nothing to decide on is never ready");
  assert.equal(signOffState(5, 5, true), "signed");
  assert.equal(signOffState(2, 5, true), "signed");
});

test("the sentence under the meter says what is left, in the singular and the plural", () => {
  assert.equal(signOffWords("deciding", 0, 5), "Decide on 5 more ideas to be able to sign off.");
  assert.equal(signOffWords("deciding", 4, 5), "Decide on 1 more idea to be able to sign off.");
  assert.match(signOffWords("ready", 5, 5), /decided on every idea/);
  assert.match(signOffWords("signed", 5, 5), /fixed/);
  assert.match(signOffWords("empty", 0, 0), /nothing/i);
});

test("the next idea is the first in rank order without a decision", () => {
  const items = [{ opportunityId: "a" }, { opportunityId: "b" }, { opportunityId: "c" }];
  assert.equal(firstUndecided(items, new Set()), "a");
  assert.equal(firstUndecided(items, new Set(["a"])), "b");
  assert.equal(firstUndecided(items, new Set(["a", "c"])), "b", "a gap is found, not only the end");
  assert.equal(firstUndecided(items, new Set(["a", "b", "c"])), null);
  assert.equal(firstUndecided([], new Set()), null);
});

test("an assessment is 'older' only when a newer description has been confirmed since", () => {
  assert.equal(relationToConfirmed(1, 1), "newest");
  assert.equal(relationToConfirmed(1, 3), "older");
  assert.equal(relationToConfirmed(3, 3), "newest");
  assert.equal(relationToConfirmed(2, null), "newest", "no confirmed version to compare with");
  assert.equal(hasAssessmentFrom([], 1), false);
  assert.equal(hasAssessmentFrom([{ factoryRevisionNo: 1 }], 2), false);
  assert.equal(hasAssessmentFrom([{ factoryRevisionNo: 1 }, { factoryRevisionNo: 2 }], 2), true);
});

test("the decisions have short words for a tag", () => {
  assert.deepEqual(DECISION_WORD, { accept: "Accept", defer: "Later", reject: "No" });
  assert.equal(decisionWord("defer"), "Later");
  assert.equal(decisionWord("constructor"), "constructor", "a word that is not a decision is shown as it is, never looked up on Object.prototype");
});

test("the score line shows the engine's own parts and they add up to the score, for every idea of a real result", () => {
  assert.equal(
    scoreLine({ problems: 20, readiness: 4, affordability: 2, risk: -1, uncertainty: 0 }, 25),
    "20 for the problems it answers, +4 for readiness, +2 for your yearly budget, -1 for risk and 0 for a missing answer: 25 in all.",
  );
  const result = diagnose({ sector: "textiles_garments", problems: ["late_deliveries", "rejects_rework", "breakdowns"], production_tracking: "paper", budget_band: "1_to_5_lakh" });
  assert.ok(result.items.length > 0);
  for (const item of result.items) {
    const p = item.scoreParts;
    assert.equal(p.problems + p.readiness + p.affordability + p.risk + p.uncertainty, item.score, item.opportunityId);
    assert.ok(scoreLine(p, item.score).endsWith(`: ${item.score} in all.`));
    assert.ok(p.problems % POINTS.perProblem === 0);
  }
});

const NOW = new Date("2026-10-05T00:00:00Z");
const signedOffFacts = { ...NO_FACTS, factory: { latestRevision: 1, anyConfirmed: true }, assessment: { items: 5, decided: 5, signedOff: true } };

test("a signed-off assessment points at the step the journey names, with the journey's own words, and at nothing else", () => {
  const turn = nextStep(signedOffFacts, NOW);
  assert.equal(turn.key, "make_requirement");
  assert.deepEqual(afterSignOff(turn), { title: turn.title, body: turn.body, cta: turn.cta, href: "/procure" });
  assert.notEqual(turn.cta, "What you need", "the button's words are not the name of a page link");
  // The owner's turn is still on this page or the one before it: there is nothing further on to point at.
  assert.equal(afterSignOff(nextStep({ ...signedOffFacts, assessment: { items: 5, decided: 2, signedOff: false } }, NOW)), null);
  assert.equal(afterSignOff(nextStep(NO_FACTS, NOW)), null);
  // Nothing to do today is not a step to press.
  assert.equal(afterSignOff({ key: "caught_up", stage: "run", title: "You are up to date", body: "", cta: "Look back at the numbers", href: "/run" }), null);
});
