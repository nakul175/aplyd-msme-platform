// What the Delivery page says about where things stand, worked out from the states of the milestones and never stored. Pure functions,
// so a test can check the words. Nothing here decides anything for the owner: it counts what the records already say.
import type { EngagementStatus, MilestoneKind, MilestoneState } from "./state.ts";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Milestones the owner has accepted, whether or not a payment was recorded after. The same count the home page gives as "N of M milestones accepted". */
export const acceptedCount = (states: readonly MilestoneState[]): number => states.filter((s) => s === "accepted" || s === "paid").length;

/** The words under an engagement's bar: "1 of 2 milestones accepted", or what is missing when the plan has no milestone yet. */
export function acceptedLabel(states: readonly MilestoneState[]): string {
  if (states.length === 0) return "No milestones yet";
  return `${acceptedCount(states)} of ${plural(states.length, "milestone", "milestones")} accepted`;
}

export type EngagementView = { status: EngagementStatus; states: readonly MilestoneState[] };

export type DeliverySummary = {
  /** Milestones the provider is said to have delivered, which only the owner can accept or reject. */
  decide: number;
  /** Milestones of agreed plans that are not yet recorded as delivered (planned, or rejected and waiting to be delivered again). */
  withProvider: number;
  /** Engagements whose plan the owner has not agreed. */
  plansToAgree: number;
  /** Engagements not yet closed. */
  open: number;
  /** True when something is the owner's turn on this page. */
  yourTurn: boolean;
  sentence: string;
};

const isOpen = (g: { status: EngagementStatus }) => g.status === "planning" || g.status === "in_progress";

/** The state of the whole page in one sentence: what waits for the owner, and what waits for somebody else. */
export function deliverySummary(list: readonly EngagementView[]): DeliverySummary {
  const open = list.filter(isOpen);
  const decide = open.reduce((n, g) => n + g.states.filter((s) => s === "delivered").length, 0);
  const withProvider = open.filter((g) => g.status === "in_progress").reduce((n, g) => n + g.states.filter((s) => s === "planned" || s === "rejected").length, 0);
  const plansToAgree = open.filter((g) => g.status === "planning").length;
  let sentence: string;
  if (decide > 0) sentence = `${plural(decide, "milestone is", "milestones are")} waiting for your decision.`;
  else if (plansToAgree > 0) sentence = "Write your plan and agree it. Nothing can be delivered, accepted or paid before then.";
  else if (open.length === 0) sentence = "Every engagement here is closed. Everything stays on record.";
  else if (withProvider > 0) sentence = `Nothing needs your decision right now. ${plural(withProvider, "milestone is", "milestones are")} waiting to be delivered.`;
  else sentence = "Nothing needs your decision right now.";
  return { decide, withProvider, plansToAgree, open: open.length, yourTurn: decide > 0 || plansToAgree > 0, sentence };
}

export type PrimaryAction = { seq: number; kind: MilestoneKind };

/**
 * The one action of an engagement the page makes the main button, so that two milestones never each ask for the owner's attention at the
 * same time. The owner's decision on a delivery comes first, then noting a payment, then noting that the provider says a part is done. Among
 * milestones the earliest in the plan wins. Every other action stays available; it is only drawn quietly.
 */
export function primaryAction(milestones: readonly { seq: number; next: readonly MilestoneKind[] }[]): PrimaryAction | null {
  for (const kind of ["accepted", "payment_recorded", "delivered"] as const) {
    const m = milestones.find((x) => x.next.includes(kind));
    if (m) return { seq: m.seq, kind };
  }
  return null;
}

export type WaitingDecision = { engagementId: string; milestoneId: string; seq: number };

/** The first milestone, in the order the page lists them, that the provider is said to have delivered and the owner has not yet decided on. Only an engagement still open counts. */
export function firstWaitingDecision(list: readonly { id: string; status: EngagementStatus; milestones: readonly { id: string; seq: number; state: MilestoneState }[] }[]): WaitingDecision | null {
  for (const g of list) {
    if (!isOpen(g)) continue;
    const m = g.milestones.find((x) => x.state === "delivered");
    if (m) return { engagementId: g.id, milestoneId: m.id, seq: m.seq };
  }
  return null;
}
