import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { IN_USE, MAX_NOTE_LENGTH, MAX_VALUE, REVIEW_DAYS, VERDICTS, baselineBlock, dueAt, isReviewNo, reviewSlots } from "../../src/state.ts";

const FIRST = "2026-10-01T10:00:00.000Z";
const day = (n: number, extraMs = 0) => new Date(new Date(FIRST).getTime() + n * 86_400_000 + extraMs);

test("a review falls due exactly 30, 90 and 180 days after the first acceptance", () => {
  assert.deepEqual([...REVIEW_DAYS], [30, 90, 180]);
  assert.equal(dueAt(FIRST, 1).toISOString(), "2026-10-31T10:00:00.000Z");
  assert.equal(dueAt(FIRST, 2).toISOString(), "2026-12-30T10:00:00.000Z");
  assert.equal(dueAt(FIRST, 3).toISOString(), "2027-03-30T10:00:00.000Z");
});

test("before anything is accepted there is nothing to review: every slot waits and has no date", () => {
  const slots = reviewSlots({ firstAcceptedAt: null, now: day(500), recorded: [] });
  assert.deepEqual(slots.map((s) => [s.no, s.state, s.dueAt]), [[1, "waiting", null], [2, "waiting", null], [3, "waiting", null]]);
});

test("a slot opens at the instant it falls due, not a moment before", () => {
  const at = (now: Date) => reviewSlots({ firstAcceptedAt: FIRST, now, recorded: [] }).map((s) => s.state);
  assert.deepEqual(at(day(0)), ["not_due", "not_due", "not_due"]);
  assert.deepEqual(at(day(30, -1)), ["not_due", "not_due", "not_due"], "one millisecond early");
  assert.deepEqual(at(day(30)), ["due", "not_due", "not_due"]);
  assert.deepEqual(at(day(90, -1)), ["due", "not_due", "not_due"]);
  assert.deepEqual(at(day(90)), ["due", "due", "not_due"]);
  assert.deepEqual(at(day(180, -1)), ["due", "due", "not_due"]);
  assert.deepEqual(at(day(180)), ["due", "due", "due"]);
  assert.deepEqual(at(day(10_000)), ["due", "due", "due"], "a slot never lapses: a review that is late can still be recorded");
});

test("a recorded slot stays recorded, keeps its date, and the others are judged on their own", () => {
  const slots = reviewSlots({ firstAcceptedAt: FIRST, now: day(100), recorded: [1] });
  assert.deepEqual(slots.map((s) => s.state), ["recorded", "due", "not_due"]);
  assert.equal(slots[0].dueAt, "2026-10-31T10:00:00.000Z");
  assert.equal(slots[2].dueAt, "2027-03-30T10:00:00.000Z");
  assert.deepEqual(reviewSlots({ firstAcceptedAt: FIRST, now: day(0), recorded: [2] }).map((s) => s.state), ["not_due", "recorded", "not_due"], "recorded wins over not due");
});

test("a review number is 1, 2 or 3 and nothing else", () => {
  for (const ok of [1, 2, 3]) assert.equal(isReviewNo(ok), true);
  for (const bad of [0, 4, -1, 1.5, "1", null, undefined, NaN]) assert.equal(isReviewNo(bad), false, String(bad));
});

test("the day counts, the limits and the vocabularies the code states are the ones the database states", () => {
  const guards = readFileSync(new URL("../../../../drizzle/0013_run_guards.sql", import.meta.url), "utf8");
  const cases = [...guards.matchAll(/WHEN (\d) THEN (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(cases, REVIEW_DAYS.map((days, i) => [i + 1, days]), "the trigger's day counts equal REVIEW_DAYS");

  const tables = readFileSync(new URL("../../../../drizzle/0012_run_tables.sql", import.meta.url), "utf8");
  assert.match(tables, new RegExp(`value. BETWEEN 0 AND ${MAX_VALUE}\\b`));
  assert.match(tables, new RegExp(`length\\(.outcome_events.\\..note.\\) <= ${MAX_NOTE_LENGTH}\\b`));
  assert.match(tables, new RegExp(`verdict. IN \\(${VERDICTS.map((v) => `'${v}'`).join(", ")}\\)`));
  assert.match(tables, new RegExp(`in_use. IN \\(${IN_USE.map((v) => `'${v}'`).join(", ")}\\)`));
  assert.match(tables, /review_no. BETWEEN 1 AND 3/);
  assert.equal(REVIEW_DAYS.length, 3);
});

test("a starting number can be recorded only once, after the plan is agreed, while the engagement is open and before anything is accepted", () => {
  const at = (o: Partial<{ recorded: boolean; accepted: boolean; closed: boolean; planAgreed: boolean }>) => baselineBlock({ recorded: false, accepted: false, closed: false, planAgreed: true, ...o });
  assert.equal(at({}), null, "agreed, open, nothing accepted, none recorded: it can be recorded");
  assert.equal(at({ planAgreed: false }), "no_plan");
  assert.equal(at({ closed: true }), "closed");
  assert.equal(at({ closed: true, planAgreed: false }), "closed", "closed before any plan: closed is the reason");
  assert.equal(at({ accepted: true }), "too_late");
  assert.equal(at({ accepted: true, closed: true }), "too_late", "after an acceptance it is too late, closed or not, as the database answers");
  assert.equal(at({ recorded: true, accepted: true, closed: true }), "recorded", "once recorded, that comes first, as the database answers");
});
