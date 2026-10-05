// What the Diagnose page says about where the owner is: how far through the decisions, whether the sign-off can be pressed, which
// idea is next, and how an idea's score was made up. Pure code, no database: the page reads the assessment and passes what it needs.

export type SignOffState = "signed" | "empty" | "deciding" | "ready";

/** Signed off, nothing to decide on, some ideas still undecided, or every idea decided and the sign-off can be pressed. */
export function signOffState(decided: number, total: number, signedOff: boolean): SignOffState {
  if (signedOff) return "signed";
  if (total === 0) return "empty";
  return decided < total ? "deciding" : "ready";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One sentence under the meter: what is left, and what that allows. Never claims more than the state shows. */
export function signOffWords(state: SignOffState, decided: number, total: number): string {
  switch (state) {
    case "signed":
      return "Signed off. This assessment is fixed.";
    case "empty":
      return "There is nothing in this assessment to decide on.";
    case "deciding":
      return `Decide on ${plural(total - decided, "more idea", "more ideas")} to be able to sign off.`;
    case "ready":
      return "You have decided on every idea. You can sign off now.";
  }
}

/** The id of the first idea, in rank order, that has no decision yet, or null when every idea has one. */
export function firstUndecided(items: readonly { opportunityId: string }[], decidedIds: ReadonlySet<string>): string | null {
  return items.find((i) => !decidedIds.has(i.opportunityId))?.opportunityId ?? null;
}

/** What the journey says is the owner's turn, as far as this page needs it. Written out here so this module does not depend on the journey's. */
export type TurnLike = { key: string; stage: string; title: string; body: string; cta: string; href: string };
export type Onward = { title: string; body: string; cta: string; href: string };
/** The journey's steps that say nothing needs the owner (its `isOwnersTurn` is false for them). Written out here for the same reason as `TurnLike`. */
const NOTHING_NEEDED: ReadonlySet<string> = new Set(["keep_going", "waiting_for_listing", "caught_up"]);

/**
 * Where a signed-off assessment points the owner next: the step the journey names, with its own words, when that step is further on than
 * this page. Nothing when the owner's turn is still Describe or Diagnose (a newer assessment is waiting, say), and nothing when there is
 * nothing to do today, so the page never points at a step that is not the owner's.
 */
export function afterSignOff(turn: TurnLike): Onward | null {
  if (NOTHING_NEEDED.has(turn.key) || turn.stage === "describe" || turn.stage === "diagnose") return null;
  return { title: turn.title, body: turn.body, cta: turn.cta, href: turn.href };
}

export type Relation = "newest" | "older";

/** Whether an assessment was made from the owner's newest confirmed description, or from an earlier version of it. */
export const relationToConfirmed = (assessmentRevision: number, confirmedRevision: number | null): Relation => (confirmedRevision !== null && assessmentRevision < confirmedRevision ? "older" : "newest");

/** Whether an assessment already exists for this version of the description. */
export const hasAssessmentFrom = (assessments: readonly { factoryRevisionNo: number }[], revision: number): boolean => assessments.some((a) => a.factoryRevisionNo === revision);

export type Decision = "accept" | "defer" | "reject";

/** The short word for a decision, for a tag. The long wording, with its colon, stays on the page beside the choice. */
export const DECISION_WORD: Record<Decision, string> = { accept: "Accept", defer: "Later", reject: "No" };

/** The short word for a decision read from storage, which the page cannot prove is one of the three. */
export const decisionWord = (decision: string): string => (Object.hasOwn(DECISION_WORD, decision) ? DECISION_WORD[decision as Decision] : decision);

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** How an idea's points were made up, in the order the page's own ranking text gives them. The total is the sum, so it can be checked by hand. */
export function scoreLine(parts: { problems: number; readiness: number; affordability: number; risk: number; uncertainty: number }, score: number): string {
  return `${parts.problems} for the problems it answers, ${signed(parts.readiness)} for readiness, ${signed(parts.affordability)} for your yearly budget, ${signed(parts.risk)} for risk and ${signed(parts.uncertainty)} for a missing answer: ${score} in all.`;
}
