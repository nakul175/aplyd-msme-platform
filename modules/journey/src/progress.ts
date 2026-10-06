// Where an owner is on the five stages, and what to do next, worked out from facts about the company and never stored. Pure functions:
// the facts are read by facts.ts, the pages draw what these return. The same facts always give the same answer, so a person can check
// by hand why the home page says what it says.
//
// Nothing here decides anything for the owner or moves a record on. It names the step that is the owner's turn and where to do it.
import { milestoneState, statusOf } from "../../deliver/src/state.ts";
import type { MilestoneKind, MilestoneState } from "../../deliver/src/state.ts";
import { REVIEW_DAYS, reviewSlots } from "../../run/src/state.ts";

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
  /** The newest saved version of the description, and the newest one the owner confirmed (null if none was). */
  factory: { latestRevision: number | null; confirmedRevision: number | null };
  /**
   * The assessment that counts, or null if there is none. It is the newest one, unless an older one is signed off and some work is still
   * open (a requirement with no provider chosen, or an engagement not closed): then it is the newest signed-off one, because that is what
   * the open work came from. `newerVersion` is true when the owner has confirmed a newer version of the description than the one this
   * assessment was made from (absent counts as false).
   */
  assessment: { items: number; decided: number; signedOff: boolean; newerVersion?: boolean } | null;
  /**
   * Of the ideas the owner accepted in the signed-off assessment, how many have no requirement. An idea whose requirement was withdrawn
   * counts as asked for, because a withdrawn requirement is not made again. Zero when nothing is signed off.
   */
  ideasToAsk: number;
  /** Requirements that were not withdrawn. */
  requirements: number;
  /** Requirements that were withdrawn (absent counts as zero). Only the line under Choose uses it. */
  requirementsWithdrawn?: number;
  /** Of those, the ones for which no provider has been chosen yet. */
  requirementsWithoutProvider: number;
  /** Of those, the ones that have at least one listed provider to choose from. Never more than `requirementsWithoutProvider`. */
  requirementsToChoose: number;
  engagements: EngagementFacts[];
};

/** The facts of a company that has not done anything yet. */
export const NO_FACTS: Facts = { factory: { latestRevision: null, confirmedRevision: null }, assessment: null, ideasToAsk: 0, requirements: 0, requirementsWithoutProvider: 0, requirementsToChoose: 0, engagements: [] };

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
    | "no_ideas"
    | "decide"
    | "sign_off"
    | "judge_delivery"
    | "review_due"
    | "agree_plan"
    | "record_baseline"
    | "choose_provider"
    | "make_requirement"
    | "new_assessment"
    | "close_engagement"
    | "keep_going"
    | "waiting_for_listing"
    | "ask_for_more"
    | "caught_up";
  title: string;
  body: string;
  /** The words on the button. Never the name of a page, so it never answers to a page link's name. */
  cta: string;
  href: string;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const step = (stage: StageId, key: NextStep["key"], title: string, body: string, cta: string): NextStep => ({ stage, key, title, body, cta, href: stageById(stage).href });

/**
 * The steps that say "nothing needs you": they are shown, but no stage is marked as the owner's turn for them, and a page that is not about
 * them does not repeat them at its foot. `ask_for_more` is not one of them: it is optional, but it is something the owner can do.
 */
const NOTHING_NEEDED: ReadonlySet<NextStep["key"]> = new Set(["keep_going", "waiting_for_listing", "caught_up"]);
export const isOwnersTurn = (s: Pick<NextStep, "key">): boolean => !NOTHING_NEEDED.has(s.key);

/**
 * The last first-acceptance time whose review dates a JavaScript date can still hold: the last moment a date can hold (8.64e15 ms after
 * 1970) less the last review day.
 */
const LAST_READABLE_MS = 8.64e15 - REVIEW_DAYS[REVIEW_DAYS.length - 1]! * 86_400_000;
/**
 * A first-acceptance time that cannot be read, or whose review dates could not be written down, is treated as "nothing accepted yet", so
 * one bad value cannot stop every page.
 */
const readable = (at: string | null): string | null => (at !== null && (Number.isNaN(Date.parse(at)) || Date.parse(at) > LAST_READABLE_MS) ? null : at);
const slotsOf = (g: EngagementFacts, now: Date) => reviewSlots({ firstAcceptedAt: readable(g.firstAcceptedAt), now, recorded: g.reviewsRecorded });

/** A starting number can still be recorded: the plan is agreed, the engagement is open and nothing has been accepted. */
const canRecordBaseline = (g: EngagementFacts) => g.planAgreed && !g.closed && !g.baselineRecorded && g.firstAcceptedAt === null;
const hasDelivery = (g: EngagementFacts) => !g.closed && g.milestones.includes("delivered");
/** Every milestone of an agreed plan is accepted or paid, and the engagement is still open. */
const allAccepted = (g: EngagementFacts) => !g.closed && g.planAgreed && g.milestones.length > 0 && g.milestones.every((m) => m === "accepted" || m === "paid");

/** The one thing that is the owner's turn. Urgent decisions on work in progress come before earlier stages only once the earlier stages are done. */
export function nextStep(facts: Facts, now: Date): NextStep {
  const { factory, assessment, engagements } = facts;
  if (factory.latestRevision === null) {
    return step("describe", "describe", "Start by describing your factory", "Plain questions about what you make, how work moves through the shop floor and what hurts. Nothing is lost if you stop halfway: every save is kept.", "Start with your factory");
  }
  if (factory.confirmedRevision === null) {
    return step("describe", "confirm", "Confirm your description", "Your answers are saved as a draft. When they are accurate, confirm them: that is what the ideas are worked out from.", "Review and confirm");
  }
  if (assessment === null) {
    return step("diagnose", "diagnose", "See what is worth doing", "Your answers go through a fixed set of rules and come back as a short ranked list of ideas, each with its cost, its risk and what has to come first.", "Get your ranked ideas");
  }
  // The owner was sent back to Describe (no idea fitted, or nothing is left to ask for) and has confirmed a newer version since: the next
  // thing is a new assessment from it, not another trip to Describe.
  const nothingLeft = assessment.signedOff && facts.requirements === 0 && engagements.length === 0 && facts.ideasToAsk === 0;
  if (assessment.newerVersion === true && ((!assessment.signedOff && assessment.items === 0) || nothingLeft)) {
    return step("diagnose", "diagnose", "See what is worth doing", "You have confirmed a newer version of your description. Make a new assessment from it: your answers go through the same fixed rules and come back as a ranked list of ideas.", "Get your ranked ideas");
  }
  if (!assessment.signedOff) {
    if (assessment.items === 0) {
      return step("describe", "no_ideas", "No idea fits your answers yet", "The fixed rules found nothing to suggest for what you described. Add the problems you want solved, confirm the new version, and make a new assessment.", "Update your description");
    }
    if (assessment.decided < assessment.items) {
      const left = assessment.items - assessment.decided;
      return step("diagnose", "decide", `Decide on ${plural(left, "idea", "ideas")}`, `You have decided on ${assessment.decided} of ${assessment.items}. For each one say yes, not yet or no. Only the ideas you say yes to go on to the next stage.`, "Continue deciding");
    }
    return step("diagnose", "sign_off", "Sign off your decisions", "You have decided on every idea. Signing off says these decisions are yours and lets you go on to say what you need.", "Sign off");
  }

  // The starting number can only be recorded before the first milestone is accepted. If a delivery is already waiting and the number is not
  // written down, say so first: following the next rule's button and accepting would lose it for good.
  if (engagements.some((g) => hasDelivery(g) && canRecordBaseline(g))) {
    return step("run", "record_baseline", "Write down your starting number first", "A delivery is waiting, but your starting number is not written down. It can only be recorded before the first milestone is accepted, so record it before you accept anything.", "Record the number");
  }
  if (engagements.some(hasDelivery)) {
    return step("deliver", "judge_delivery", "A delivery is waiting for your decision", "The provider says a milestone is done. Check it against the test you wrote before work started, then accept or reject it.", "Check the work done");
  }
  const due = engagements.flatMap((g) => slotsOf(g, now)).filter((r) => r.state === "due");
  if (due.length > 0) {
    return step("run", "review_due", due.length === 1 ? `Review ${due[0].no} is open` : `${due.length} reviews are open`, "Measure the same thing you measured before the work, and say whether it did what was expected.", "Record a review");
  }
  if (engagements.some((g) => !g.planAgreed && !g.closed)) {
    return step("deliver", "agree_plan", "Agree a plan with your provider", "Break the work into milestones. For each one write what is delivered, how you will check it, a date and a price.", "Plan the work");
  }
  if (engagements.some(canRecordBaseline)) {
    return step("run", "record_baseline", "Write down your starting number", "Record today's number before anything is accepted, so that later you can see what changed. It can only be recorded once, and only before the first milestone is accepted.", "Record the number");
  }
  if (facts.requirementsToChoose > 0) {
    return step("procure", "choose_provider", "Choose a provider", "You have said what you need. Pick which of the listed providers you want to work with.", "Choose a provider");
  }
  if (facts.requirements === 0 && engagements.length === 0) {
    if (facts.ideasToAsk > 0) {
      return step("procure", "make_requirement", "Say what you need", "Pick an idea you said yes to and say what you need. You will see which listed providers could do it.", "Make a request");
    }
    return step("describe", "new_assessment", "No idea is left to ask for", "Every idea you said yes to has been asked for or taken back, or you said yes to none. To look again, update your description, confirm it, and make a new assessment.", "Update your description");
  }
  if (engagements.some(allAccepted)) {
    return step("deliver", "close_engagement", "Every milestone is accepted", "When you have nothing more to record on this work, close it. Everything stays on record, and your reviews carry on.", "Close the work");
  }

  const underWay = engagements.filter((g) => !g.closed && statusOf({ planAgreed: g.planAgreed, closed: g.closed, states: g.milestones }) === "in_progress");
  if (underWay.length > 0) {
    const next = engagements
      .flatMap((g) => slotsOf(g, now))
      .filter((r) => r.state === "not_due" && r.dueAt)
      .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1))[0];
    const accepting = engagements.some((g) => readable(g.firstAcceptedAt) !== null);
    const second = next
      ? `The next review opens on ${next.dueAt!.slice(0, 10)}.`
      : accepting
        ? "Every review you can record so far is recorded."
        : "Accept each milestone as it is delivered; the review dates start from the first one you accept.";
    return step("deliver", "keep_going", "Work is under way", `Nothing needs you today. ${second}`, "Check on the work");
  }
  if (facts.requirementsWithoutProvider > 0) {
    const more =
      facts.ideasToAsk > 0
        ? ` While you wait, you can ask for ${facts.ideasToAsk === 1 ? "one more idea" : `${facts.ideasToAsk} more ideas`} you said yes to.`
        : " There is nothing for you to do until then.";
    return step("procure", "waiting_for_listing", "Waiting for a provider to be listed", `You have said what you need. No provider is listed for it yet. When one is listed you can choose it.${more}`, "See your requests");
  }
  if (facts.ideasToAsk > 0) {
    return step(
      "procure",
      "ask_for_more",
      facts.ideasToAsk === 1 ? "One more idea is ready to ask for" : `${facts.ideasToAsk} more ideas are ready to ask for`,
      "You said yes to these and have not asked for them yet. Ask for the ones you want now, or leave them for later.",
      "Make a request",
    );
  }
  return step("run", "caught_up", "You are up to date", "Nothing needs you today. You can go back over any stage.", "Look back at the numbers");
}

/** The status of each stage: whether the owner has finished it, whether it is the owner's turn, or whether it has not come yet. */
export function stageStatuses(facts: Facts, now: Date): Record<StageId, StageStatus> {
  const turn = nextStep(facts, now);
  const { factory, assessment, engagements } = facts;
  const reviewed = (g: EngagementFacts) => [1, 2, 3].every((n) => g.reviewsRecorded.includes(n)) || (g.closed && g.firstAcceptedAt === null);
  const own: Record<StageId, boolean> = {
    describe: factory.confirmedRevision !== null,
    diagnose: assessment?.signedOff === true,
    procure: assessment?.signedOff === true && engagements.length > 0 && facts.requirementsWithoutProvider === 0,
    deliver: engagements.length > 0 && engagements.every((g) => g.closed),
    run: engagements.length > 0 && engagements.every(reviewed),
  };
  // A stage is done only when every stage before it is, so the strip never shows a finished step after one that is not.
  const done = {} as Record<StageId, boolean>;
  STAGE_IDS.forEach((id, i) => {
    done[id] = own[id] && (i === 0 || done[STAGE_IDS[i - 1]!]);
  });
  const result = {} as Record<StageId, StageStatus>;
  for (const s of STAGE_IDS) result[s] = isOwnersTurn(turn) && turn.stage === s ? "current" : done[s] ? "done" : "todo";
  return result;
}

/** A stage's status, with one more word for a stage that is neither done nor the owner's turn but has begun. */
export type StageProgress = StageStatus | "started";

/**
 * The statuses of stageStatuses, except that Measure is "started" instead of "todo" once a starting number or a review is recorded on any
 * engagement, so the strip does not say "not started" next to a recorded number. Pages that can show the extra word use this one.
 */
export function stageProgress(facts: Facts, now: Date): Record<StageId, StageProgress> {
  const out: Record<StageId, StageProgress> = { ...stageStatuses(facts, now) };
  if (out.run === "todo" && facts.engagements.some((g) => g.baselineRecorded || g.reviewsRecorded.length > 0)) out.run = "started";
  return out;
}

/** A short line under each stage on the home page: where it stands, in words. */
export function stageLine(stage: StageId, facts: Facts, now: Date): string {
  const { factory, assessment, engagements } = facts;
  switch (stage) {
    case "describe":
      if (factory.latestRevision === null) return "Not started";
      if (factory.confirmedRevision === null) return `A draft is saved (version ${factory.latestRevision}). Not confirmed yet.`;
      return factory.confirmedRevision === factory.latestRevision ? `Confirmed. Newest version is ${factory.latestRevision}.` : `Version ${factory.confirmedRevision} is confirmed. Version ${factory.latestRevision} is a newer draft.`;
    case "diagnose":
      if (factory.confirmedRevision === null) return "Waits for a confirmed description";
      if (assessment === null) return "Not started";
      if (assessment.items === 0) return "No idea fits your answers yet.";
      return assessment.signedOff ? `Signed off. You decided on ${assessment.decided} of ${plural(assessment.items, "idea", "ideas")}.` : `Decided on ${assessment.decided} of ${plural(assessment.items, "idea", "ideas")}. Not signed off.`;
    case "procure":
      if (assessment?.signedOff !== true) return "Waits for your signed-off decisions";
      if (facts.requirements === 0) {
        const withdrawn = facts.requirementsWithdrawn ?? 0;
        return withdrawn > 0 ? `Nothing asked for now. ${withdrawn === 1 ? "1 request was" : `${withdrawn} requests were`} taken back.` : "Nothing asked for yet";
      }
      return `${plural(facts.requirements, "requirement", "requirements")}, ${plural(engagements.length, "provider chosen", "providers chosen")}.`;
    case "deliver": {
      if (engagements.length === 0) return "Waits for a chosen provider";
      const accepted = engagements.reduce((n, g) => n + g.milestones.filter((m) => m === "accepted" || m === "paid").length, 0);
      const total = engagements.reduce((n, g) => n + g.milestones.length, 0);
      if (!engagements.some((g) => g.planAgreed)) return engagements.every((g) => g.closed) ? "Closed before a plan was agreed." : "Plan not agreed yet";
      return `${accepted} of ${plural(total, "milestone", "milestones")} accepted.`;
    }
    case "run": {
      if (engagements.length === 0) return "Waits for work to start";
      const recorded = engagements.reduce((n, g) => n + g.reviewsRecorded.length, 0);
      const open = engagements.flatMap((g) => slotsOf(g, now)).filter((r) => r.state === "due").length;
      if (open > 0) return `${plural(open, "review is", "reviews are")} open.`;
      const withBaseline = engagements.filter((g) => g.baselineRecorded).length;
      let baseline: string;
      if (engagements.length === 1) {
        const g = engagements[0]!;
        baseline = g.baselineRecorded ? "Starting number recorded" : g.firstAcceptedAt !== null || g.closed ? "No starting number was recorded" : "No starting number yet";
      } else {
        baseline = `${withBaseline} of ${engagements.length} starting numbers recorded`;
      }
      return `${baseline}. ${plural(recorded, "review", "reviews")} recorded.`;
    }
  }
}
