// The journey rules tried on every combination of a short list of values for each field (a "small world"), not a sample. The list is
// chosen so that every rule of docs/design/LLD.md 4.7 can fire and every pair of rules that can hold together does. The answers are
// compared with the documented order (RULES in tests/support/model.ts), and the statuses with the documented own tests of each stage.
//
// Size, so a silent shrink of the lists fails here: 504 prefixes (versions, assessment, counts) for the early rules (360 until 6 October
// 2026, when two assessments made from an older version than the confirmed one were added), and for the later rules 18 prefixes with an
// assessment that was signed off from the confirmed version, each tried with no engagement, with each of the 1,080 single engagements,
// with each ordered pair of 24 hand-chosen engagements and with each ordered triple of 8 of those.
import assert from "node:assert/strict";
import { test } from "node:test";
import { STAGE_IDS, isOwnersTurn, nextStep, stageLine, stageStatuses } from "../../src/progress.ts";
import type { EngagementFacts, Facts } from "../../src/progress.ts";
import { DAY, KEYS, NOW, RULES, STAGE_ORDER, badPlurals, expectedLinePattern, expectedRule, expectedStatuses, isoAt, rawWordsIn, smallEngagements, smallPrefixes, stageWordsIn } from "../support/model.ts";
import type { Key } from "../support/model.ts";

const at = (days: number) => isoAt(NOW.getTime() - days * DAY);
const e = (planAgreed: boolean, closed: boolean, milestones: EngagementFacts["milestones"], baselineRecorded: boolean, firstAcceptedAt: string | null, reviewsRecorded: number[]): EngagementFacts => ({ planAgreed, closed, milestones, baselineRecorded, firstAcceptedAt, reviewsRecorded });

/** 24 engagements, each chosen for a different thing it makes the rules do. */
const POOL: EngagementFacts[] = [
  e(false, false, [], false, null, []), //                                   open, no plan, nothing written
  e(false, false, ["planned"], false, null, []), //                         open, a milestone written, plan not agreed
  e(false, true, [], false, null, []), //                                    closed before a plan
  e(true, false, ["planned"], false, null, []), //                           plan agreed, starting number can be recorded
  e(true, false, ["planned"], true, null, []), //                            number recorded, work under way
  e(true, false, ["delivered"], false, null, []), //                         delivery waiting and the number is not written (rule 7)
  e(true, false, ["delivered"], true, null, []), //                          delivery waiting, number written (rule 8)
  e(true, false, ["accepted", "planned"], true, at(5), []), //               accepted 5 days ago, no review yet
  e(true, false, ["accepted", "planned"], true, at(45), []), //              first review open
  e(true, false, ["accepted", "planned"], true, at(200), []), //             all three reviews open
  e(true, false, ["accepted", "planned"], true, at(200), [1, 2, 3]), //      all three recorded
  e(true, false, ["accepted", "accepted"], true, at(5), []), //              ready to close
  e(true, false, ["paid", "paid"], true, at(200), [1, 2, 3]), //             ready to close, reviews recorded
  e(true, true, ["paid"], true, at(200), [1, 2, 3]), //                      finished
  e(true, true, ["paid"], true, at(45), []), //                              closed with a review open
  e(true, true, ["planned"], false, null, []), //                            closed before anything was accepted
  e(true, true, ["delivered"], false, null, []), //                          closed with a delivery nobody decided
  e(true, false, ["rejected"], false, null, []), //                          rejected, not delivered again
  e(true, false, ["accepted", "delivered"], true, at(5), []), //             one accepted, one waiting
  e(true, false, ["accepted"], true, "not a date", []), //                   a time that cannot be read
  e(true, false, ["accepted", "planned"], true, isoAt(NOW.getTime() - 30 * DAY), []), // review 1 opens this very millisecond
  e(true, false, ["accepted", "planned"], true, isoAt(NOW.getTime() - 30 * DAY + 1), []), // and one millisecond later
  e(true, false, [], false, null, []), //                                    plan agreed with no milestone
  e(true, true, ["accepted"], true, at(5), []), //                           closed after an acceptance
];
const TRIPLE_POOL = [1, 4, 6, 7, 9, 11, 13, 15].map((i) => POOL[i]!);

function* earlyWorld(): Generator<Facts> {
  for (const p of smallPrefixes()) for (const engagements of [[], [POOL[5]!], [POOL[8]!, POOL[0]!]]) yield { ...p, engagements };
}
const LATE = smallPrefixes().filter((p) => p.factory.latestRevision === 2 && p.factory.confirmedRevision === 2 && p.assessment?.signedOff === true && p.assessment.newerVersion !== true);
function* lateSingles(): Generator<Facts> {
  for (const p of LATE) {
    yield { ...p, engagements: [] };
    for (const g of smallEngagements()) yield { ...p, engagements: [g] };
  }
}
function* latePairsAndTriples(): Generator<Facts> {
  for (const p of LATE) {
    for (const a of POOL) for (const b of POOL) yield { ...p, engagements: [a, b] };
    for (const a of TRIPLE_POOL) for (const b of TRIPLE_POOL) for (const c of TRIPLE_POOL) yield { ...p, engagements: [a, b, c] };
  }
}

/** Everything asked of one state of the small world. The failure message carries the facts. */
function check(facts: Facts): void {
  const s = nextStep(facts, NOW);
  const rule = expectedRule(facts, NOW);
  const st = stageStatuses(facts, NOW);
  const note = () => JSON.stringify(facts);
  assert.equal(s.key, rule.key, `rule ${rule.n} should fire: ${note()}`);
  assert.equal(s.stage, rule.stage, note());
  assert.deepEqual(st, expectedStatuses(facts, NOW), note());
  const current = STAGE_ORDER.filter((id) => st[id] === "current").length;
  assert.equal(current, isOwnersTurn(s) ? 1 : 0, note());
  STAGE_ORDER.forEach((id, j) => assert.ok(st[id] !== "done" || !STAGE_ORDER.slice(0, j).some((b) => st[b] === "todo"), `${id} is done after a stage not started: ${note()}`));
  for (const part of [s.title, s.body, s.cta]) assert.deepEqual([...rawWordsIn(part), ...badPlurals(part)], [], `${s.key}: ${part}`);
  for (const id of STAGE_IDS) {
    const line = stageLine(id, facts, NOW);
    assert.ok(rawWordsIn(line).length === 0 && stageWordsIn(line).length === 0 && badPlurals(line).length === 0 && line.trim().length > 0, `${id}: "${line}" ${note()}`);
    assert.match(line, expectedLinePattern(id, facts, NOW), `${id}: "${line}" ${note()}`);
  }
}

function checkAll(world: Generator<Facts>): number {
  let n = 0;
  for (const facts of world) {
    check(facts);
    n++;
  }
  return n;
}

test("the small world is as large as it says: 504 prefixes, 1,080 single engagements, 24 hand-chosen ones, 18 late prefixes", () => {
  assert.equal(smallPrefixes().length, 504);
  assert.equal(smallEngagements().length, 1_080);
  assert.equal(POOL.length, 24);
  assert.equal(TRIPLE_POOL.length, 8);
  assert.equal(LATE.length, 18);
});

test("early rules, exhaustively: every version, assessment and count, with no engagement and with two kinds of engagement behind them", () => {
  assert.equal(checkAll(earlyWorld()), 504 * 3);
});

test("late rules, exhaustively: a signed-off assessment with no engagement and with each of the 1,080 single engagements", () => {
  assert.equal(checkAll(lateSingles()), 18 * (1 + 1_080));
});

test("late rules, exhaustively: a signed-off assessment with every ordered pair of the 24 engagements and every ordered triple of 8", () => {
  assert.equal(checkAll(latePairsAndTriples()), 18 * (24 * 24 + 8 * 8 * 8));
});

test("the small world reaches all 18 keys and at least 130 of the 171 pairs of rules holding together", () => {
  const keys = new Set<Key>();
  const together = new Set<string>();
  let states = 0;
  for (const world of [earlyWorld(), lateSingles(), latePairsAndTriples()]) {
    for (const facts of world) {
      states++;
      keys.add(nextStep(facts, NOW).key);
      const holding = RULES.filter((r) => r.holds(facts, NOW)).map((r) => r.n);
      for (const i of holding) for (const j of holding) if (i < j) together.add(`${i}/${j}`);
    }
  }
  assert.ok(states >= 40_000, `${states} states`);
  assert.deepEqual([...KEYS].filter((k) => !keys.has(k)), []);
  assert.ok(together.size >= 130, `${together.size} pairs of rules held together in the small world`);
});
