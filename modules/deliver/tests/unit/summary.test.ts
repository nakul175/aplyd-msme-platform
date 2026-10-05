import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptedCount, acceptedLabel, acceptEndsBaseline, deliverySummary, firstWaitingDecision, primaryAction } from "../../src/summary.ts";
import type { EngagementView } from "../../src/summary.ts";

const g = (status: EngagementView["status"], ...states: EngagementView["states"]): EngagementView => ({ status, states });

test("an accepted milestone counts whether or not a payment was recorded after it; delivered, rejected and planned ones do not", () => {
  assert.equal(acceptedCount(["accepted", "paid", "delivered", "rejected", "planned"]), 2);
  assert.equal(acceptedCount([]), 0);
});

test("the words under an engagement's bar say how many were accepted, in the home page's own form, or that there is none yet", () => {
  assert.equal(acceptedLabel([]), "No milestones yet");
  assert.equal(acceptedLabel(["planned"]), "0 of 1 milestone accepted");
  assert.equal(acceptedLabel(["paid", "delivered"]), "1 of 2 milestones accepted");
  assert.equal(acceptedLabel(["accepted", "paid"]), "2 of 2 milestones accepted");
});

test("a delivery waiting for the owner comes first, whatever else is open, and is the owner's turn", () => {
  const s = deliverySummary([g("planning"), g("in_progress", "paid", "delivered"), g("in_progress", "delivered")]);
  assert.deepEqual([s.decide, s.plansToAgree, s.yourTurn], [2, 1, true]);
  assert.equal(s.sentence, "2 milestones are waiting for your decision.");
  assert.equal(deliverySummary([g("in_progress", "delivered")]).sentence, "1 milestone is waiting for your decision.");
});

test("a plan that is not agreed is the owner's turn and says nothing moves before it is agreed", () => {
  const s = deliverySummary([g("planning", "planned"), g("in_progress", "planned")]);
  assert.deepEqual([s.decide, s.plansToAgree, s.withProvider, s.yourTurn], [0, 1, 1, true]);
  assert.match(s.sentence, /^Write your plan and agree it\. Nothing can be delivered, accepted or paid before then\.$/);
});

test("work that is with the provider is not the owner's turn: planned and rejected milestones of an agreed plan are waiting to be delivered", () => {
  const s = deliverySummary([g("in_progress", "paid", "planned", "rejected")]);
  assert.deepEqual([s.decide, s.withProvider, s.yourTurn], [0, 2, false]);
  assert.equal(s.sentence, "Nothing needs your decision right now. 2 milestones are waiting to be delivered.");
  assert.equal(deliverySummary([g("in_progress", "paid")]).sentence, "Nothing needs your decision right now.");
});

test("a closed engagement never counts as waiting, and when every engagement is closed the page says so", () => {
  const s = deliverySummary([g("ended_early", "delivered", "planned"), g("complete", "paid")]);
  assert.deepEqual([s.decide, s.withProvider, s.plansToAgree, s.open, s.yourTurn], [0, 0, 0, 0, false]);
  assert.equal(s.sentence, "Every engagement here is closed. Everything stays on record.");
});

test("one action per engagement is the main button: a decision on a delivery, then a payment, then a delivery, and the earliest milestone wins", () => {
  assert.deepEqual(primaryAction([{ seq: 1, next: ["payment_recorded"] }, { seq: 2, next: ["accepted", "rejected"] }, { seq: 3, next: ["delivered"] }]), { seq: 2, kind: "accepted" });
  assert.deepEqual(primaryAction([{ seq: 1, next: ["delivered"] }, { seq: 2, next: ["payment_recorded"] }, { seq: 3, next: ["payment_recorded"] }]), { seq: 2, kind: "payment_recorded" });
  assert.deepEqual(primaryAction([{ seq: 1, next: [] }, { seq: 2, next: ["delivered"] }, { seq: 3, next: ["delivered"] }]), { seq: 2, kind: "delivered" });
  assert.equal(primaryAction([{ seq: 1, next: [] }]), null);
  assert.equal(primaryAction([]), null);
});

test("the link at the top goes to the first delivery waiting for a decision, in an engagement that is still open, and to nothing when none is", () => {
  const ms = (...states: ("planned" | "delivered" | "accepted" | "rejected" | "paid")[]) => states.map((state, i) => ({ id: `m${i + 1}`, seq: i + 1, state }));
  assert.deepEqual(firstWaitingDecision([{ id: "e1", status: "in_progress", milestones: ms("paid", "delivered", "delivered") }, { id: "e2", status: "in_progress", milestones: ms("delivered") }]), { engagementId: "e1", milestoneId: "m2", seq: 2 });
  assert.deepEqual(firstWaitingDecision([{ id: "e1", status: "ended_early", milestones: ms("delivered") }, { id: "e2", status: "in_progress", milestones: ms("rejected", "delivered") }]), { engagementId: "e2", milestoneId: "m2", seq: 2 });
  assert.equal(firstWaitingDecision([{ id: "e1", status: "in_progress", milestones: ms("planned", "rejected", "accepted") }]), null);
  assert.equal(firstWaitingDecision([]), null);
});

test("accepting is said to end the starting number only while it still can be recorded: open, nothing accepted, no number yet", () => {
  assert.equal(acceptEndsBaseline({ closed: false, baselineRecorded: false, states: ["delivered", "planned"] }), true);
  assert.equal(acceptEndsBaseline({ closed: false, baselineRecorded: false, states: ["rejected", "delivered"] }), true, "a rejection does not end it");
  assert.equal(acceptEndsBaseline({ closed: false, baselineRecorded: true, states: ["delivered"] }), false, "the number is recorded");
  assert.equal(acceptEndsBaseline({ closed: false, baselineRecorded: false, states: ["accepted", "delivered"] }), false, "something is accepted: it is already too late");
  assert.equal(acceptEndsBaseline({ closed: false, baselineRecorded: false, states: ["paid", "delivered"] }), false, "a paid milestone was accepted");
  assert.equal(acceptEndsBaseline({ closed: true, baselineRecorded: false, states: ["delivered"] }), false, "closed: nothing can be accepted");
});
