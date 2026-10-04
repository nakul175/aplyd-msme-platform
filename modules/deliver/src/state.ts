// What state an engagement and each milestone are in, worked out from the events recorded, never stored. Pure functions: the
// rules about what may happen next are also enforced by triggers in the database (drizzle/0011_deliver_guards.sql). A unit test
// reads the trigger text and compares it with the table here; an integration test runs the real triggers against every state
// and every kind and checks the page is offered exactly what the database would accept.

export const EVENT_KINDS = ["plan_agreed", "delivered", "accepted", "rejected", "payment_recorded", "closed"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
/** The kinds that are about one milestone. */
export const MILESTONE_KINDS = ["delivered", "accepted", "rejected", "payment_recorded"] as const;
export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

export type MilestoneState = "planned" | "delivered" | "accepted" | "rejected" | "paid";
export type EngagementStatus = "planning" | "in_progress" | "complete" | "ended_early";

/** The limits are assumptions. The same numbers are in the migration (a test keeps them equal). */
export const MAX_MILESTONES = 12;
/** Times one milestone can be delivered (each followed by at most one decision, then one payment): an assumption that bounds what a page reads. After the last rejection the owner closes the engagement. */
export const MAX_DELIVERIES = 14;
export const MAX_AMOUNT_INR = 100_000_000;
export const MAX_TITLE_LENGTH = 120;
export const MAX_TEST_LENGTH = 500;
export const MAX_NOTE_LENGTH = 500;

const STATE_AFTER: Record<MilestoneKind, MilestoneState> = { delivered: "delivered", accepted: "accepted", rejected: "rejected", payment_recorded: "paid" };

/** A milestone's state is what its latest event says; with none it is only planned. */
export function milestoneState(kinds: readonly MilestoneKind[]): MilestoneState {
  const last = kinds[kinds.length - 1];
  return last ? STATE_AFTER[last] : "planned";
}

/**
 * What the owner may record next on a milestone in a state, given how many times it has been delivered. Mirrors the triggers:
 * delivered once or again after a rejection, until the delivery cap; accepted or rejected after a delivery; paid once after
 * acceptance. At the cap a rejected milestone has nothing left to record (the independent review found the page offering a
 * delivery the database would refuse); the owner closes the engagement.
 */
export function nextKinds(state: MilestoneState, deliveries: number = 0): MilestoneKind[] {
  switch (state) {
    case "planned":
      return ["delivered"];
    case "rejected":
      return deliveries >= MAX_DELIVERIES ? [] : ["delivered"];
    case "delivered":
      return ["accepted", "rejected"];
    case "accepted":
      return ["payment_recorded"];
    case "paid":
      return [];
  }
}

/** Planning until the plan is agreed; in progress until closed; closed is complete only if every milestone was accepted. */
export function statusOf(input: { planAgreed: boolean; closed: boolean; states: readonly MilestoneState[] }): EngagementStatus {
  if (input.closed) return input.states.length > 0 && input.states.every((s) => s === "accepted" || s === "paid") ? "complete" : "ended_early";
  return input.planAgreed ? "in_progress" : "planning";
}

/** A real calendar date written YYYY-MM-DD (2026-02-30 is not one). */
export function isCalendarDate(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return y >= 2000 && y <= 2100 && date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
