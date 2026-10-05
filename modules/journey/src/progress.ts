// Where an owner is on the five stages, and what to do next, worked out from facts about the company and never stored. Pure functions:
// the facts are read by facts.ts, the pages draw what these return. The same facts always give the same answer, so a person can check
// by hand why the home page says what it says.
//
// Nothing here decides anything for the owner or moves a record on. It names the step that is the owner's turn and where to do it.
import { milestoneState, statusOf } from "../../deliver/src/state.ts";
import type { MilestoneKind, MilestoneState } from "../../deliver/src/state.ts";
import { reviewSlots } from "../../run/src/state.ts";

export const STAGE_IDS = ["describe", "diagnose", "procure", "deliver", "run"] as const;
export type StageId = (typeof STAGE_IDS)[number];

export type Stage = {
  id: StageId;
  /** 1 to 5. */
  n: number;
  /** One word for the progress strip. Not the name of a page: pages keep their own names, so a strip link never answers to a page link's name. */
  short: string;
  /** The page's own name, as it is on the page and in the home page's link. */
  page: string;
  href: string;
  /** What the stage is, in plain words, for someone who has never seen the service. */
  what: string;
};

export const STAGES: readonly Stage[] = [
  { id: "describe", n: 1, short: "Describe", page: "Describe your factory", href: "/factory", what: "Answer plain questions about what you make, how the shop floor runs and what hurts. You can stop and come back." },
  { id: "diagnose", n: 2, short: "Decide", page: "What to do about it", href: "/diagnose", what: "Get a short, ranked list of ideas for your factory, each with its cost, its risk and what has to come first. You say yes, not yet or no." },
  { id: "procure", n: 3, short: "Choose", page: "What you need", href: "/procure", what: "For each idea you said yes to, say what you need and see which listed providers could do it." },
  { id: "deliver", n: 4, short: "Deliver", page: "Delivery", href: "/deliver", what: "Agree a plan in milestones. Write down how you will check each one before work starts, then accept or reject each delivery." },
  { id: "run", n: 5, short: "Measure", page: "Results", href: "/run", what: "Write down your number before the work, then again after 30, 90 and 180 days, to see whether it did what was expected." },
];

export const stageById = (id: StageId): Stage => STAGES.find((s) => s.id === id)!;

export type EngagementFacts = {
  planAgreed: boolean;
  closed: boolean;
  /** One state per milestone of the plan, in order. */
  milestones: MilestoneState[];
  baselineRecorded: boolean;
  firstAcceptedAt: string | null;
  reviewsRecorded: number[];
};

export type Facts = {
  factory: { latestRevision: number | null; anyConfirmed: boolean };
  /** The newest assessment, or null if there is none. */
  assessment: { items: number; decided: number; signedOff: boolean } | null;
  /** Requirements that were not withdrawn. */
  requirements: number;
  /** Of those, the ones for which no provider has been chosen yet. */
  requirementsWithoutProvider: number;
  engagements: EngagementFacts[];
};

/** The facts of a company that has not done anything yet. */
export const NO_FACTS: Facts = { factory: { latestRevision: null, anyConfirmed: false }, assessment: null, requirements: 0, requirementsWithoutProvider: 0, engagements: [] };

/** An engagement's milestone states from the kinds of event recorded on each milestone. A convenience for the reader of the facts. */
export function milestoneStatesOf(eventKindsByMilestone: readonly (readonly MilestoneKind[])[]): MilestoneState[] {
  return eventKindsByMilestone.map((kinds) => milestoneState(kinds));
}

export type StageStatus = "done" | "current" | "todo";

export type NextStep = {
  stage: StageId;
  /** A short, stable name for the rule that fired, so a test can say which one it expects. */
  key:
    | "describe"
    | "confirm"
    | "diagnose"
    | "decide"
    | "sign_off"
    | "judge_delivery"
    | "review_due"
    | "agree_plan"
    | "record_baseline"
    | "choose_provider"
    | "make_requirement"
    | "keep_going"
    | "caught_up";
  title: string;
  body: string;
  /** The words on the button. Never the name of a page, so it never answers to a page link's name. */
  cta: string;
  href: string;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const step = (stage: StageId, key: NextStep["key"], title: string, body: string, cta: string): NextStep => ({ stage, key, title, body, cta, href: stageById(stage).href });

/** The one thing that is the owner's turn. Urgent decisions on work in progress come before earlier stages only once the earlier stages are done. */
export function nextStep(facts: Facts, now: Date): NextStep {
  const { factory, assessment, engagements } = facts;
  if (factory.latestRevision === null) {
    return step("describe", "describe", "Start by describing your factory", "Plain questions about what you make, how work moves through the shop floor and what hurts. Nothing is lost if you stop halfway: every save is kept.", "Start with your factory");
  }
  if (!factory.anyConfirmed) {
    return step("describe", "confirm", "Confirm your description", "Your answers are saved as a draft. When they are accurate, confirm them: that is what the ideas are worked out from.", "Review and confirm");
  }
  if (assessment === null) {
    return step("diagnose", "diagnose", "See what is worth doing", "Your answers go through a fixed set of rules and come back as a short ranked list of ideas, each with its cost, its risk and what has to come first.", "Get your ranked ideas");
  }
  if (!assessment.signedOff) {
    if (assessment.decided < assessment.items) {
      const left = assessment.items - assessment.decided;
      return step("diagnose", "decide", `Decide on ${plural(left, "idea", "ideas")}`, `You have decided on ${assessment.decided} of ${assessment.items}. For each one say yes, not yet or no. Only the ideas you say yes to go on to the next stage.`, "Continue deciding");
    }
    return step("diagnose", "sign_off", "Sign off your decisions", "You have decided on every idea. Signing off says these decisions are yours and lets you go on to say what you need.", "Sign off");
  }

  if (engagements.some((g) => g.milestones.includes("delivered"))) {
    return step("deliver", "judge_delivery", "A delivery is waiting for your decision", "The provider says a milestone is done. Check it against the test you wrote before work started, then accept or reject it.", "Check the work done");
  }
  const due = engagements.flatMap((g) => reviewSlots({ firstAcceptedAt: g.firstAcceptedAt, now, recorded: g.reviewsRecorded })).filter((r) => r.state === "due");
  if (due.length > 0) {
    return step("run", "review_due", due.length === 1 ? `Review ${due[0].no} is open` : `${due.length} reviews are open`, "Measure the same thing you measured before the work, and say whether it did what was expected.", "Record a review");
  }
  if (engagements.some((g) => !g.planAgreed && !g.closed)) {
    return step("deliver", "agree_plan", "Agree a plan with your provider", "Break the work into milestones. For each one write what is delivered, how you will check it, a date and a price.", "Plan the work");
  }
  if (engagements.some((g) => g.planAgreed && !g.baselineRecorded && g.firstAcceptedAt === null)) {
    return step("run", "record_baseline", "Write down your starting number", "Record today's number before anything is accepted, so that later you can see what changed. It can only be recorded once, and only before the first milestone is accepted.", "Record the number");
  }
  if (facts.requirementsWithoutProvider > 0) {
    return step("procure", "choose_provider", "Choose a provider", "You have said what you need. Pick which of the listed providers you want to work with.", "Choose a provider");
  }
  if (facts.requirements === 0 && engagements.length === 0) {
    return step("procure", "make_requirement", "Say what you need", "Pick an idea you said yes to and say what you need. You will see which listed providers could do it.", "Make a request");
  }

  const openStates = engagements.filter((g) => !g.closed && statusOf({ planAgreed: g.planAgreed, closed: g.closed, states: g.milestones }) === "in_progress");
  if (openStates.length > 0) {
    const next = engagements
      .flatMap((g) => reviewSlots({ firstAcceptedAt: g.firstAcceptedAt, now, recorded: g.reviewsRecorded }))
      .filter((r) => r.state === "not_due" && r.dueAt)
      .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1))[0];
    return step(
      "run",
      "keep_going",
      "Work is under way",
      next ? `Nothing needs you today. The next review opens on ${next.dueAt!.slice(0, 10)}.` : "Nothing needs you today. Accept each milestone as it is delivered; the review dates start from the first one you accept.",
      "Check on the work",
    );
  }
  return step("run", "caught_up", "You are up to date", "Nothing needs you today. You can go back over any stage.", "Look back at the numbers");
}

/** The status of each stage: whether the owner has finished it, whether it is the owner's turn, or whether it has not come yet. */
export function stageStatuses(facts: Facts, now: Date): Record<StageId, StageStatus> {
  const turn = nextStep(facts, now);
  const { factory, assessment, engagements } = facts;
  const done: Record<StageId, boolean> = {
    describe: factory.anyConfirmed,
    diagnose: assessment?.signedOff === true,
    procure: engagements.length > 0,
    deliver: engagements.some((g) => statusOf({ planAgreed: g.planAgreed, closed: g.closed, states: g.milestones }) === "complete"),
    run: engagements.some((g) => [1, 2, 3].every((n) => g.reviewsRecorded.includes(n))),
  };
  const result = {} as Record<StageId, StageStatus>;
  for (const s of STAGE_IDS) result[s] = turn.key !== "caught_up" && turn.stage === s ? "current" : done[s] ? "done" : "todo";
  return result;
}

/** A short line under each stage on the home page: where it stands, in words. */
export function stageLine(stage: StageId, facts: Facts, now: Date): string {
  const { factory, assessment, engagements } = facts;
  switch (stage) {
    case "describe":
      if (factory.latestRevision === null) return "Not started";
      return factory.anyConfirmed ? `Confirmed. Newest version is ${factory.latestRevision}.` : `A draft is saved (version ${factory.latestRevision}). Not confirmed yet.`;
    case "diagnose":
      if (!factory.anyConfirmed) return "Waits for a confirmed description";
      if (assessment === null) return "Not started";
      return assessment.signedOff ? `Signed off. You decided on ${assessment.decided} of ${assessment.items} ideas.` : `Decided on ${assessment.decided} of ${assessment.items} ideas. Not signed off.`;
    case "procure":
      if (assessment?.signedOff !== true) return "Waits for your signed-off decisions";
      if (facts.requirements === 0) return "Nothing asked for yet";
      return `${plural(facts.requirements, "requirement", "requirements")}, ${plural(engagements.length, "provider chosen", "providers chosen")}.`;
    case "deliver": {
      if (engagements.length === 0) return "Waits for a chosen provider";
      const accepted = engagements.reduce((n, g) => n + g.milestones.filter((m) => m === "accepted" || m === "paid").length, 0);
      const total = engagements.reduce((n, g) => n + g.milestones.length, 0);
      if (!engagements.some((g) => g.planAgreed)) return "Plan not agreed yet";
      return `${accepted} of ${plural(total, "milestone", "milestones")} accepted.`;
    }
    case "run": {
      if (engagements.length === 0) return "Waits for work to start";
      const recorded = engagements.reduce((n, g) => n + g.reviewsRecorded.length, 0);
      const open = engagements.flatMap((g) => reviewSlots({ firstAcceptedAt: g.firstAcceptedAt, now, recorded: g.reviewsRecorded })).filter((r) => r.state === "due").length;
      if (open > 0) return `${plural(open, "review is", "reviews are")} open.`;
      const baseline = engagements.some((g) => g.baselineRecorded);
      return `${baseline ? "Starting number recorded" : "No starting number yet"}. ${plural(recorded, "review", "reviews")} recorded.`;
    }
  }
}
