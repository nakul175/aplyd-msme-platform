import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MAX_AMOUNT_INR, MAX_MILESTONES, MAX_DELIVERIES, MAX_NOTE_LENGTH, MAX_TEST_LENGTH, MAX_TITLE_LENGTH, MILESTONE_KINDS, isCalendarDate, milestoneState, nextKinds, statusOf } from "../../src/state.ts";
import type { MilestoneKind, MilestoneState } from "../../src/state.ts";

test("a milestone's state is what its latest event says, and with no event it is only planned", () => {
  assert.equal(milestoneState([]), "planned");
  assert.equal(milestoneState(["delivered"]), "delivered");
  assert.equal(milestoneState(["delivered", "rejected"]), "rejected");
  assert.equal(milestoneState(["delivered", "rejected", "delivered"]), "delivered");
  assert.equal(milestoneState(["delivered", "accepted"]), "accepted");
  assert.equal(milestoneState(["delivered", "accepted", "payment_recorded"]), "paid");
});

test("what may be recorded next follows the order: delivered, then accepted or rejected, a rejected one delivered again, an accepted one paid once", () => {
  assert.deepEqual(nextKinds("planned"), ["delivered"]);
  assert.deepEqual(nextKinds("delivered"), ["accepted", "rejected"]);
  assert.deepEqual(nextKinds("rejected"), ["delivered"]);
  assert.deepEqual(nextKinds("accepted"), ["payment_recorded"]);
  assert.deepEqual(nextKinds("paid"), []);
});

test("at the delivery cap a rejected milestone has nothing left to record, and one before the cap can still be delivered again", () => {
  assert.deepEqual(nextKinds("rejected", 1), ["delivered"]);
  assert.deepEqual(nextKinds("rejected", MAX_DELIVERIES - 1), ["delivered"]);
  assert.deepEqual(nextKinds("rejected", MAX_DELIVERIES), [], "the database refuses a delivery after this");
  assert.deepEqual(nextKinds("rejected", MAX_DELIVERIES + 3), []);
  // the cap does not touch the other states: the last delivery can still be accepted or rejected, and an accepted one paid
  assert.deepEqual(nextKinds("delivered", MAX_DELIVERIES), ["accepted", "rejected"]);
  assert.deepEqual(nextKinds("accepted", MAX_DELIVERIES), ["payment_recorded"]);
  assert.deepEqual(nextKinds("paid", MAX_DELIVERIES), []);
  assert.deepEqual(nextKinds("planned", 0), ["delivered"]);
});

test("the state table says what the migration's trigger text says about which kind follows which (a reading of the SQL, not a run of the triggers: the integration test runs them)", () => {
  // The rules as the triggers say them, as a table: after which latest kind (or none) each kind may follow.
  const sql = readFileSync(new URL("../../../../drizzle/0011_deliver_guards.sql", import.meta.url), "utf8");
  assert.match(sql, /NEW\.kind = 'delivered'[\s\S]*?LIMIT 1\), 'rejected'\) <> 'rejected'/, "delivered follows nothing or a rejection");
  assert.match(sql, /NEW\.kind IN \('accepted', 'rejected'\)[\s\S]*?'none'\) <> 'delivered'/, "accepted or rejected follow a delivery");
  assert.match(sql, /NEW\.kind = 'payment_recorded'[\s\S]*?'none'\) <> 'accepted'/, "a payment follows an acceptance");
  const states: MilestoneState[] = ["planned", "delivered", "accepted", "rejected", "paid"];
  const follows: Record<MilestoneKind, MilestoneState[]> = { delivered: ["planned", "rejected"], accepted: ["delivered"], rejected: ["delivered"], payment_recorded: ["accepted"] };
  for (const kind of MILESTONE_KINDS) for (const state of states) assert.equal(nextKinds(state).includes(kind), follows[kind].includes(state), `${kind} after ${state}`);
});

test("the engagement's status: planning until the plan is agreed, in progress until closed, complete only if every milestone was accepted", () => {
  assert.equal(statusOf({ planAgreed: false, closed: false, states: [] }), "planning");
  assert.equal(statusOf({ planAgreed: true, closed: false, states: ["planned"] }), "in_progress");
  assert.equal(statusOf({ planAgreed: true, closed: true, states: ["paid", "accepted"] }), "complete");
  assert.equal(statusOf({ planAgreed: true, closed: true, states: ["paid", "delivered"] }), "ended_early");
  assert.equal(statusOf({ planAgreed: true, closed: true, states: ["paid", "planned"] }), "ended_early");
  assert.equal(statusOf({ planAgreed: false, closed: true, states: [] }), "ended_early", "closed with nothing planned is not complete");
  assert.equal(statusOf({ planAgreed: false, closed: true, states: ["planned"] }), "ended_early");
});

test("a calendar date is a real one, written YYYY-MM-DD", () => {
  for (const ok of ["2026-12-15", "2028-02-29", "2000-01-01", "2100-12-31"]) assert.equal(isCalendarDate(ok), true, ok);
  for (const bad of ["2026-02-30", "2027-02-29", "2026-13-01", "2026-00-10", "2026-12-32", "26-12-15", "2026-1-5", "2026/12/15", "15-12-2026", "", " 2026-12-15", "1999-12-31", "2101-01-01", "2026-12-15T00:00"]) assert.equal(isCalendarDate(bad), false, bad);
});

test("the limits the code states are the ones the schema states", () => {
  const tables = readFileSync(new URL("../../../../drizzle/0010_deliver_tables.sql", import.meta.url), "utf8");
  assert.match(tables, new RegExp(`seq. BETWEEN 1 AND ${MAX_MILESTONES}\\b`));
  assert.match(tables, new RegExp(`length\\(.milestones.\\..title.\\) BETWEEN 1 AND ${MAX_TITLE_LENGTH}\\b`));
  assert.match(tables, new RegExp(`length\\(.milestones.\\..acceptance_test.\\) BETWEEN 1 AND ${MAX_TEST_LENGTH}\\b`));
  assert.match(tables, new RegExp(`agreed_inr. BETWEEN 1 AND ${MAX_AMOUNT_INR}\\b`));
  assert.match(tables, new RegExp(`amount_inr. BETWEEN 1 AND ${MAX_AMOUNT_INR}\\b`));
  assert.ok(MAX_NOTE_LENGTH === 500);
  const guards = readFileSync(new URL("../../../../drizzle/0011_deliver_guards.sql", import.meta.url), "utf8");
  assert.equal(Number(/engagement_events_delivery_limit[\s\S]*?>= (\d+)/.exec(guards)?.[1]), MAX_DELIVERIES);
  assert.equal(Number(/milestones_limit[\s\S]*?>= (\d+)/.exec(guards)?.[1]), MAX_MILESTONES);
});
