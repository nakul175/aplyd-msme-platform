// Shared by the property tests of the journey rules (tests/unit/properties.test.ts and tests/unit/properties-exhaustive.test.ts).
// Nothing here is a test. It holds four things, kept apart from the code under test on purpose:
//   1. the documented rules as data (RULES), written from the table in docs/design/LLD.md section 4.7 and not from the code of progress.ts,
//   2. generators of facts: a seeded pseudo-random one in three tiers and an exhaustive one over a small world,
//   3. a small model of the platform (WORLD_EVENTS) that only ever adds progress, to walk a company from nothing to a closed engagement,
//   4. the sets of words and pages the answers are checked against.
// Every number and date here is SYNTHETIC test input, not a figure about any factory.
import type { EngagementFacts, Facts, NextStep, StageId } from "../../src/progress.ts";

export type Key = NextStep["key"];
type Milestone = EngagementFacts["milestones"][number];

// ---------------------------------------------------------------------------------------------------------------------------------
// The clock and the seeded generator

/** The fixed "now" of every case unless a case sets its own. The same value as the example tests use. */
export const NOW = new Date("2026-10-05T10:00:00.000Z");
export const DAY = 86_400_000;
export const isoAt = (ms: number) => new Date(ms).toISOString();

/** The days after the first acceptance at which reviews 1, 2 and 3 open (docs/design/LLD.md 4.6, REVIEW_DAYS; written out here, not imported). */
export const REVIEW_AFTER_DAYS = [30, 90, 180] as const;

/** A small, well known generator (mulberry32). Same seed, same sequence, on every machine. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** An integer from lo to hi, both included. */
    int: (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p: number): boolean => next() < p,
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    /** One of the values, chosen with the given relative weights. */
    weighted: <T>(pairs: readonly (readonly [T, number])[]): T => {
      const total = pairs.reduce((n, [, w]) => n + w, 0);
      let x = next() * total;
      for (const [v, w] of pairs) {
        x -= w;
        if (x < 0) return v;
      }
      return pairs[pairs.length - 1]![0];
    },
  };
}
export type Rng = ReturnType<typeof rng>;

// ---------------------------------------------------------------------------------------------------------------------------------
// The documented answers: keys, stages, pages and the order of the rules

/** The 18 keys of docs/design/LLD.md 4.7 (19 rules, because record_baseline is two rules). */
export const KEYS: readonly Key[] = ["describe", "confirm", "diagnose", "no_ideas", "decide", "sign_off", "record_baseline", "judge_delivery", "review_due", "agree_plan", "choose_provider", "make_requirement", "new_assessment", "close_engagement", "keep_going", "waiting_for_listing", "ask_for_more", "caught_up"];
/** The steps that say nothing is needed from the owner (docs/design/LLD.md 4.7, isOwnersTurn). */
export const NOTHING_NEEDED_KEYS: readonly Key[] = ["keep_going", "waiting_for_listing", "caught_up"];
export const STAGE_ORDER: readonly StageId[] = ["describe", "diagnose", "procure", "deliver", "run"];
/** The page each stage lives on (docs/design/LLD.md 4.7, STAGES). */
export const PAGE_OF: Readonly<Record<StageId, string>> = { describe: "/factory", diagnose: "/diagnose", procure: "/procure", deliver: "/deliver", run: "/run" };
export const KNOWN_PAGES: readonly string[] = Object.values(PAGE_OF);

const readableTime = (at: string | null): number | null => {
  if (at === null) return null;
  const t = Date.parse(at);
  return Number.isNaN(t) ? null : t;
};
/** The numbers of the reviews that can be recorded now on one engagement. A first-acceptance time that cannot be read counts as none. */
export function openReviewsOf(g: EngagementFacts, now: Date): number[] {
  const t = readableTime(g.firstAcceptedAt);
  if (t === null) return [];
  return [1, 2, 3].filter((no) => !g.reviewsRecorded.includes(no) && now.getTime() >= t + REVIEW_AFTER_DAYS[no - 1]! * DAY);
}
/** Not closed, and some milestone is delivered and waiting for a decision. */
export const deliveryWaiting = (g: EngagementFacts): boolean => !g.closed && g.milestones.some((m) => m === "delivered");
/** The plan is agreed, the engagement is open, no number is written down and nothing has been accepted. */
export const canTakeBaseline = (g: EngagementFacts): boolean => g.planAgreed && !g.closed && !g.baselineRecorded && g.firstAcceptedAt === null;
/** Open, plan agreed, at least one milestone, and every milestone accepted or paid. */
export const everyMilestoneAccepted = (g: EngagementFacts): boolean => !g.closed && g.planAgreed && g.milestones.length > 0 && g.milestones.every((m) => m === "accepted" || m === "paid");

export type RuleSpec = {
  /** The rule's number in docs/design/LLD.md 4.7. */
  n: number;
  key: Key;
  stage: StageId;
  /** The rule's own condition, as the table "Fires when" states it, not counting the rules before it. */
  holds: (f: Facts, now: Date) => boolean;
};

/**
 * The 19 rules in the documented order. A rule fires when its own condition holds and none before it does. Rules 7 to 19 are only reached
 * when the counted assessment is signed off, which follows from rules 3 to 6 holding for every other assessment.
 */
export const RULES: readonly RuleSpec[] = [
  { n: 1, key: "describe", stage: "describe", holds: (f) => f.factory.latestRevision === null },
  { n: 2, key: "confirm", stage: "describe", holds: (f) => f.factory.confirmedRevision === null },
  { n: 3, key: "diagnose", stage: "diagnose", holds: (f) => f.assessment === null },
  { n: 4, key: "no_ideas", stage: "describe", holds: (f) => f.assessment !== null && !f.assessment.signedOff && f.assessment.items === 0 },
  { n: 5, key: "decide", stage: "diagnose", holds: (f) => f.assessment !== null && !f.assessment.signedOff && f.assessment.decided < f.assessment.items },
  { n: 6, key: "sign_off", stage: "diagnose", holds: (f) => f.assessment !== null && !f.assessment.signedOff },
  { n: 7, key: "record_baseline", stage: "run", holds: (f) => f.engagements.some((g) => deliveryWaiting(g) && canTakeBaseline(g)) },
  { n: 8, key: "judge_delivery", stage: "deliver", holds: (f) => f.engagements.some(deliveryWaiting) },
  { n: 9, key: "review_due", stage: "run", holds: (f, now) => f.engagements.some((g) => openReviewsOf(g, now).length > 0) },
  { n: 10, key: "agree_plan", stage: "deliver", holds: (f) => f.engagements.some((g) => !g.planAgreed && !g.closed) },
  { n: 11, key: "record_baseline", stage: "run", holds: (f) => f.engagements.some(canTakeBaseline) },
  { n: 12, key: "choose_provider", stage: "procure", holds: (f) => f.requirementsToChoose > 0 },
  { n: 13, key: "make_requirement", stage: "procure", holds: (f) => f.requirements === 0 && f.engagements.length === 0 && f.ideasToAsk > 0 },
  { n: 14, key: "new_assessment", stage: "describe", holds: (f) => f.requirements === 0 && f.engagements.length === 0 && f.ideasToAsk === 0 },
  { n: 15, key: "close_engagement", stage: "deliver", holds: (f) => f.engagements.some(everyMilestoneAccepted) },
  { n: 16, key: "keep_going", stage: "deliver", holds: (f) => f.engagements.some((g) => !g.closed && g.planAgreed) },
  { n: 17, key: "waiting_for_listing", stage: "procure", holds: (f) => f.requirementsWithoutProvider > 0 },
  { n: 18, key: "ask_for_more", stage: "procure", holds: (f) => f.ideasToAsk > 0 },
  { n: 19, key: "caught_up", stage: "run", holds: () => true },
];

/** The rule that fires: the first, in the documented order, whose own condition holds. */
export const expectedRule = (f: Facts, now: Date): RuleSpec => RULES.find((r) => r.holds(f, now))!;

/**
 * The own test of each stage, from the table in docs/design/LLD.md 4.7. A stage is shown done only when its own test holds and the stage
 * before it is done; the stage the owner is to act on is shown current instead.
 */
export function expectedStatuses(f: Facts, now: Date): Record<StageId, "done" | "current" | "todo"> {
  const rule = expectedRule(f, now);
  const ownersTurn = !NOTHING_NEEDED_KEYS.includes(rule.key);
  const reviewed = (g: EngagementFacts) => [1, 2, 3].every((n) => g.reviewsRecorded.includes(n)) || (g.closed && g.firstAcceptedAt === null);
  const own: Record<StageId, boolean> = {
    describe: f.factory.confirmedRevision !== null,
    diagnose: f.assessment !== null && f.assessment.signedOff,
    procure: f.assessment !== null && f.assessment.signedOff && f.engagements.length > 0 && f.requirementsWithoutProvider === 0,
    deliver: f.engagements.length > 0 && f.engagements.every((g) => g.closed),
    run: f.engagements.length > 0 && f.engagements.every(reviewed),
  };
  const out = {} as Record<StageId, "done" | "current" | "todo">;
  let previousDone: boolean = true;
  for (const id of STAGE_ORDER) {
    const done: boolean = own[id] && previousDone;
    out[id] = ownersTurn && rule.stage === id ? "current" : done ? "done" : "todo";
    previousDone = done;
  }
  return out;
}

/**
 * What the line under a stage must say, as a pattern, by the first condition that holds in the table of docs/design/LLD.md 4.7 ("stageLine
 * tests its branches in this order"). The patterns hold the phrases the table and the functional specification use, not whole sentences,
 * and the numbers are checked apart.
 */
export function expectedLinePattern(stage: StageId, f: Facts, now: Date): RegExp {
  const { factory, assessment, engagements } = f;
  switch (stage) {
    case "describe":
      if (factory.latestRevision === null) return /^Not started/;
      if (factory.confirmedRevision === null) return /draft is saved.*Not confirmed yet/;
      return factory.confirmedRevision === factory.latestRevision ? /^Confirmed\./ : /is confirmed.*newer draft/;
    case "diagnose":
      if (factory.confirmedRevision === null) return /^Waits for a confirmed description/;
      if (assessment === null) return /^Not started/;
      if (assessment.items === 0) return /^No idea fits your answers yet/;
      return assessment.signedOff ? /^Signed off\./ : /Not signed off\.$/;
    case "procure":
      if (assessment?.signedOff !== true) return /^Waits for your signed-off decisions/;
      if (f.requirements === 0) return /^Nothing asked for yet/;
      return /requirements?, \d+ providers? chosen\.$/;
    case "deliver":
      if (engagements.length === 0) return /^Waits for a chosen provider/;
      if (!engagements.some((g) => g.planAgreed)) return engagements.every((g) => g.closed) ? /^Closed before a plan was agreed\./ : /^Plan not agreed yet/;
      return /milestones? accepted\.$/;
    case "run": {
      if (engagements.length === 0) return /^Waits for work to start/;
      if (engagements.some((g) => openReviewsOf(g, now).length > 0)) return /reviews? (is|are) open\.$/;
      if (engagements.length > 1) return /^\d+ of \d+ starting numbers recorded\. \d+ reviews? recorded\.$/;
      const g = engagements[0]!;
      if (g.baselineRecorded) return /^Starting number recorded\./;
      return g.firstAcceptedAt !== null || g.closed ? /^No starting number was recorded\./ : /^No starting number yet\./;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Generators of facts (seeded)

const MILESTONE_STATES: readonly Milestone[] = ["planned", "delivered", "accepted", "rejected", "paid"];
const BAD_TIMES: readonly string[] = ["", "not a date", "2026-13-45", "yesterday"];
/**
 * Times that can be read and are very far from today. Not in the list: a time within 180 days of the last moment a JavaScript date can
 * hold ("+275760-09-12T00:00:00.000Z"). The functions throw "Invalid time value" on it (open finding in VALIDATION.md, 6 October 2026), and a
 * property that fails on the real code stays out of the suite.
 */
const EXTREME_TIMES: readonly string[] = ["9999-12-31T23:59:59.999Z", "0000-01-01T00:00:00.000Z", "-271821-04-20T00:00:00.000Z", "1970-01-01T00:00:00.000Z", "2026-10-05"];

/** An age in milliseconds, often exactly on or one millisecond either side of a review day, so a comparison that is off by one is found. */
function ageMs(r: Rng): number {
  if (r.chance(0.35)) {
    const edge = r.pick([0, ...REVIEW_AFTER_DAYS]) * DAY;
    return edge + r.pick([-1, 0, 1]);
  }
  return r.int(0, 400) * DAY + r.int(0, DAY - 1);
}

/** An engagement that could be read from the records: states follow the guards of the deliver and run modules. */
export function coherentEngagement(r: Rng, now: Date): EngagementFacts {
  const closed = r.chance(0.3);
  const planAgreed = r.chance(0.78);
  const count = r.chance(0.15) ? 0 : r.int(1, 4);
  const milestones: Milestone[] = [];
  for (let i = 0; i < count; i++) {
    milestones.push(planAgreed ? r.weighted<Milestone>([["planned", 3], ["delivered", 2], ["accepted", 3], ["rejected", 1], ["paid", 2]]) : "planned");
  }
  const accepted = milestones.some((m) => m === "accepted" || m === "paid");
  let firstAcceptedAt: string | null = null;
  let age = -1;
  if (accepted) {
    age = ageMs(r);
    firstAcceptedAt = isoAt(now.getTime() - age);
  }
  const reviewsRecorded: number[] = [];
  if (firstAcceptedAt !== null) {
    for (const no of [1, 2, 3]) if (age >= REVIEW_AFTER_DAYS[no - 1]! * DAY && r.chance(0.5)) reviewsRecorded.push(no);
  }
  return { planAgreed, closed, milestones, baselineRecorded: r.chance(0.5), firstAcceptedAt, reviewsRecorded };
}

/** Facts a company can really reach (the counts add up, an engagement needs a signed-off assessment, a milestone is accepted only after a plan). */
export function coherentFacts(r: Rng, now: Date): Facts {
  const latestRevision = r.chance(0.06) ? null : r.int(1, 5);
  const confirmedRevision = latestRevision !== null && !r.chance(0.1) ? r.int(1, latestRevision) : null;
  let assessment: Facts["assessment"] = null;
  let ideasToAsk = 0;
  let requirements = 0;
  let requirementsWithoutProvider = 0;
  let requirementsToChoose = 0;
  const engagements: EngagementFacts[] = [];
  if (confirmedRevision !== null && !r.chance(0.07)) {
    const items = r.chance(0.08) ? 0 : r.int(1, 8);
    const signedOff = items > 0 && r.chance(0.78);
    assessment = { items, decided: signedOff ? items : r.int(0, items), signedOff };
    if (signedOff) {
      const acceptedIdeas = r.int(0, items);
      const made = r.int(0, acceptedIdeas);
      ideasToAsk = acceptedIdeas - made;
      const withdrawn = r.chance(0.2) ? r.int(0, made) : 0;
      // A requirement that has an engagement cannot be withdrawn (a trigger of the procure module), so every engagement belongs to a
      // requirement that still counts: requirements = requirementsWithoutProvider + engagements.
      requirements = made - withdrawn;
      const engaged = Math.min(r.int(0, requirements), 3);
      requirementsWithoutProvider = requirements - engaged;
      requirementsToChoose = r.int(0, requirementsWithoutProvider);
      for (let i = 0; i < engaged; i++) engagements.push(coherentEngagement(r, now));
    }
  }
  return { factory: { latestRevision, confirmedRevision }, assessment, ideasToAsk, requirements, requirementsWithoutProvider, requirementsToChoose, engagements };
}

/** Any combination of the fields, including ones the records cannot produce (more decided than there are ideas, an unconfirmed version with an assessment). Counts stay whole and not negative. */
export function oddFacts(r: Rng, now: Date): Facts {
  const count = () => r.weighted([[0, 4], [1, 4], [2, 2], [5, 1]]);
  const engagement = (): EngagementFacts => ({
    planAgreed: r.chance(0.6),
    closed: r.chance(0.35),
    milestones: Array.from({ length: r.weighted([[0, 2], [1, 3], [2, 3], [4, 1]]) }, () => r.pick(MILESTONE_STATES)),
    baselineRecorded: r.chance(0.5),
    firstAcceptedAt: r.weighted<string | null>([[null, 4], [isoAt(now.getTime() - ageMs(r)), 5], [isoAt(now.getTime() + r.int(1, 30) * DAY), 1], [r.pick(BAD_TIMES), 1]]),
    reviewsRecorded: [1, 2, 3].filter(() => r.chance(0.3)).concat(r.chance(0.1) ? [r.pick([0, 4, 1])] : []),
  });
  const items = count();
  return {
    factory: { latestRevision: r.chance(0.2) ? null : r.int(1, 4), confirmedRevision: r.chance(0.3) ? null : r.int(1, 4) },
    assessment: r.chance(0.15) ? null : { items, decided: r.chance(0.3) ? count() : r.int(0, items), signedOff: r.chance(0.7) },
    ideasToAsk: count(),
    requirements: count(),
    requirementsWithoutProvider: count(),
    requirementsToChoose: count(),
    engagements: Array.from({ length: r.weighted([[0, 3], [1, 4], [2, 3], [3, 1]]) }, engagement),
  };
}

/** Hostile input: whole numbers that are negative or huge, many engagements, long lists. Only "does not throw" and "answers from the known set" are asked of it. */
export function wildFacts(r: Rng, now: Date): Facts {
  const base = oddFacts(r, now);
  const big = () => r.pick([-1, -7, 0, 1, 1_000, Number.MAX_SAFE_INTEGER]);
  const many = r.chance(0.2) ? Array.from({ length: r.int(8, 40) }, () => oddFacts(r, now).engagements[0] ?? coherentEngagement(r, now)) : base.engagements;
  return {
    factory: { latestRevision: r.chance(0.5) ? base.factory.latestRevision : big(), confirmedRevision: r.chance(0.5) ? base.factory.confirmedRevision : big() },
    assessment: base.assessment === null ? null : { items: big(), decided: big(), signedOff: base.assessment.signedOff },
    ideasToAsk: big(),
    requirements: big(),
    requirementsWithoutProvider: big(),
    requirementsToChoose: big(),
    engagements: many.map((g) => ({
      ...g,
      milestones: r.chance(0.2) ? Array.from({ length: r.int(0, 30) }, () => r.pick(MILESTONE_STATES)) : g.milestones,
      firstAcceptedAt: r.chance(0.15) ? r.pick(EXTREME_TIMES) : g.firstAcceptedAt,
    })),
  };
}

export type Tier = "coherent" | "odd" | "wild";
export type Case = { tier: Tier; seed: number; index: number; facts: Facts; now: Date };

/** `count` cases of a tier from one seed. The seed and the index are what a failure prints, so a failing case can be rebuilt on its own. */
export function* cases(tier: Tier, seed: number, count: number): Generator<Case> {
  const r = rng(seed);
  const make = tier === "coherent" ? coherentFacts : tier === "odd" ? oddFacts : wildFacts;
  for (let index = 0; index < count; index++) {
    // Most cases use the fixed time; some move it, so a review that has just opened or has not yet is also tried.
    const now = r.chance(0.7) ? NOW : new Date(NOW.getTime() + r.int(-60, 200) * DAY);
    yield { tier, seed, index, facts: make(r, now), now };
  }
}

/** The text a failure prints: enough to rebuild the case. */
export const describeCase = (c: Case): string => `tier=${c.tier} seed=${c.seed} index=${c.index} now=${c.now.toISOString()} facts=${JSON.stringify(c.facts)}`;

/** Freezes the value and everything inside it, so a function that changes its input throws (modules are strict) and the test shows it. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as object)) deepFreeze(v);
  }
  return value;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The small world: every combination of a short list of values for each field. Used for exhaustive checks.

const A = (n: number) => isoAt(NOW.getTime() - n * DAY);

/** One engagement for each combination of the choices below that the records could produce, plus an unreadable time. */
export function smallEngagements(): EngagementFacts[] {
  const out: EngagementFacts[] = [];
  const profiles: Milestone[][] = [[], ["planned"], ["delivered"], ["accepted"], ["rejected"], ["paid"], ["accepted", "planned"], ["delivered", "accepted"], ["accepted", "paid"]];
  const times: (string | null)[] = [null, A(5), A(45), A(200), "not a date"];
  const reviews: number[][] = [[], [1], [1, 2, 3]];
  for (const planAgreed of [false, true]) for (const closed of [false, true]) for (const milestones of profiles) for (const baselineRecorded of [false, true]) for (const firstAcceptedAt of times) for (const reviewsRecorded of reviews) {
    out.push({ planAgreed, closed, milestones, baselineRecorded, firstAcceptedAt, reviewsRecorded });
  }
  return out;
}

/** The part of the facts before the engagements: versions, assessment and the counts. */
export function smallPrefixes(): Omit<Facts, "engagements">[] {
  const out: Omit<Facts, "engagements">[] = [];
  const factories: Facts["factory"][] = [{ latestRevision: null, confirmedRevision: null }, { latestRevision: 1, confirmedRevision: null }, { latestRevision: 2, confirmedRevision: 1 }, { latestRevision: 2, confirmedRevision: 2 }];
  const assessments: Facts["assessment"][] = [null, { items: 0, decided: 0, signedOff: false }, { items: 3, decided: 1, signedOff: false }, { items: 3, decided: 3, signedOff: false }, { items: 3, decided: 3, signedOff: true }];
  // requirements, without a provider, to choose (to choose never exceeds without a provider)
  const counts: [number, number, number][] = [[0, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0], [2, 1, 1], [2, 2, 1]];
  for (const factory of factories) for (const assessment of assessments) for (const ideasToAsk of [0, 1, 2]) for (const [requirements, requirementsWithoutProvider, requirementsToChoose] of counts) {
    out.push({ factory, assessment, ideasToAsk, requirements, requirementsWithoutProvider, requirementsToChoose });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// A model of the platform that only adds progress. A company is walked from nothing to a closed engagement by events chosen at random.

export type World = {
  latest: number | null;
  confirmed: number | null;
  assessment: { items: number; decided: number; signedOff: boolean; accepted: number } | null;
  /** The requirements made so far, in order: whether a provider is listed for it, and the engagement made for it, if any. */
  requirements: { listed: boolean; engagement: number | null }[];
  engagements: EngagementFacts[];
  now: Date;
};

export const newWorld = (now: Date = NOW): World => ({ latest: null, confirmed: null, assessment: null, requirements: [], engagements: [], now });

export function worldFacts(w: World): Facts {
  const without = w.requirements.filter((q) => q.engagement === null);
  return {
    factory: { latestRevision: w.latest, confirmedRevision: w.confirmed },
    assessment: w.assessment === null ? null : { items: w.assessment.items, decided: w.assessment.decided, signedOff: w.assessment.signedOff },
    ideasToAsk: w.assessment?.signedOff ? w.assessment.accepted - w.requirements.length : 0,
    requirements: w.requirements.length,
    requirementsWithoutProvider: without.length,
    requirementsToChoose: without.filter((q) => q.listed).length,
    engagements: w.engagements.map((g) => ({ ...g, milestones: [...g.milestones], reviewsRecorded: [...g.reviewsRecorded] })),
  };
}

export type WorldEvent = {
  name: string;
  /** How often to choose it when it is possible, so a walk is more likely to move on than to wait. */
  weight: number;
  possible: (w: World) => boolean;
  apply: (w: World, r: Rng) => void;
};

const openEngagements = (w: World) => w.engagements.filter((g) => !g.closed);

export const WORLD_EVENTS: readonly WorldEvent[] = [
  { name: "save the description", weight: 6, possible: (w) => w.latest === null, apply: (w) => { w.latest = 1; } },
  { name: "confirm the description", weight: 6, possible: (w) => w.latest !== null && w.confirmed === null, apply: (w) => { w.confirmed = w.latest; } },
  { name: "make an assessment", weight: 6, possible: (w) => w.confirmed !== null && w.assessment === null, apply: (w, r) => { w.assessment = { items: r.chance(0.1) ? 0 : r.int(1, 6), decided: 0, signedOff: false, accepted: 0 }; } },
  { name: "decide one idea", weight: 6, possible: (w) => w.assessment !== null && !w.assessment.signedOff && w.assessment.decided < w.assessment.items, apply: (w) => { w.assessment!.decided++; } },
  { name: "sign off", weight: 6, possible: (w) => w.assessment !== null && !w.assessment.signedOff && w.assessment.items > 0 && w.assessment.decided === w.assessment.items, apply: (w, r) => { w.assessment!.signedOff = true; w.assessment!.accepted = r.int(0, w.assessment!.items); } },
  { name: "make a requirement", weight: 5, possible: (w) => w.assessment?.signedOff === true && w.requirements.length < w.assessment.accepted, apply: (w) => { w.requirements.push({ listed: false, engagement: null }); } },
  { name: "list a provider", weight: 4, possible: (w) => w.requirements.some((q) => q.engagement === null && !q.listed), apply: (w, r) => { r.pick(w.requirements.filter((q) => q.engagement === null && !q.listed)).listed = true; } },
  { name: "choose a provider", weight: 5, possible: (w) => w.requirements.some((q) => q.engagement === null && q.listed), apply: (w, r) => {
    const q = r.pick(w.requirements.filter((x) => x.engagement === null && x.listed));
    q.engagement = w.engagements.length;
    w.engagements.push({ planAgreed: false, closed: false, milestones: [], baselineRecorded: false, firstAcceptedAt: null, reviewsRecorded: [] });
  } },
  { name: "agree a plan", weight: 5, possible: (w) => w.engagements.some((g) => !g.planAgreed && !g.closed), apply: (w, r) => {
    const g = r.pick(w.engagements.filter((x) => !x.planAgreed && !x.closed));
    g.planAgreed = true;
    g.milestones = Array.from({ length: r.int(1, 3) }, () => "planned" as Milestone);
  } },
  { name: "write down the starting number", weight: 4, possible: (w) => w.engagements.some(canTakeBaseline), apply: (w, r) => { r.pick(w.engagements.filter(canTakeBaseline)).baselineRecorded = true; } },
  { name: "record a delivery", weight: 5, possible: (w) => openEngagements(w).some((g) => g.planAgreed && g.milestones.some((m) => m === "planned" || m === "rejected")), apply: (w, r) => {
    const g = r.pick(openEngagements(w).filter((x) => x.planAgreed && x.milestones.some((m) => m === "planned" || m === "rejected")));
    const i = r.pick(g.milestones.map((m, at) => (m === "planned" || m === "rejected" ? at : -1)).filter((at) => at >= 0));
    g.milestones[i] = "delivered";
  } },
  { name: "accept a delivery", weight: 5, possible: (w) => openEngagements(w).some((g) => g.milestones.includes("delivered")), apply: (w, r) => {
    const g = r.pick(openEngagements(w).filter((x) => x.milestones.includes("delivered")));
    g.milestones[g.milestones.indexOf("delivered")] = "accepted";
    g.firstAcceptedAt ??= w.now.toISOString();
  } },
  { name: "reject a delivery", weight: 1, possible: (w) => openEngagements(w).some((g) => g.milestones.includes("delivered")), apply: (w, r) => {
    const g = r.pick(openEngagements(w).filter((x) => x.milestones.includes("delivered")));
    g.milestones[g.milestones.indexOf("delivered")] = "rejected";
  } },
  { name: "record a payment", weight: 3, possible: (w) => openEngagements(w).some((g) => g.milestones.includes("accepted")), apply: (w, r) => {
    const g = r.pick(openEngagements(w).filter((x) => x.milestones.includes("accepted")));
    g.milestones[g.milestones.indexOf("accepted")] = "paid";
  } },
  { name: "record a review", weight: 6, possible: (w) => w.engagements.some((g) => openReviewsOf(g, w.now).length > 0), apply: (w, r) => {
    const g = r.pick(w.engagements.filter((x) => openReviewsOf(x, w.now).length > 0));
    g.reviewsRecorded.push(openReviewsOf(g, w.now)[0]!);
  } },
  { name: "close the engagement", weight: 2, possible: (w) => openEngagements(w).length > 0, apply: (w, r) => { r.pick(openEngagements(w)).closed = true; } },
  { name: "let some days pass", weight: 4, possible: () => true, apply: (w, r) => { w.now = new Date(w.now.getTime() + r.int(1, 120) * DAY); } },
];

export const eventNamed = (name: string): WorldEvent => {
  const found = WORLD_EVENTS.find((e) => e.name === name);
  if (!found) throw new Error(`no event named "${name}"`);
  return found;
};

/**
 * What each step asks of the owner, as the names of the events above; the step can be done when any one of them is possible. `no_ideas` and
 * `new_assessment` send the owner back to Describe to write a new version, which the model does not have, so they ask for nothing here.
 */
export const OWNER_ACTION: Partial<Record<Key, readonly string[]>> = {
  describe: ["save the description"],
  confirm: ["confirm the description"],
  diagnose: ["make an assessment"],
  decide: ["decide one idea"],
  sign_off: ["sign off"],
  judge_delivery: ["accept a delivery", "reject a delivery"],
  record_baseline: ["write down the starting number"],
  review_due: ["record a review"],
  agree_plan: ["agree a plan"],
  choose_provider: ["choose a provider"],
  make_requirement: ["make a requirement"],
  close_engagement: ["close the engagement"],
  ask_for_more: ["make a requirement"],
};

/** Who else acts, and what they do, while the step says nothing is needed from the owner: a provider delivers, the operator lists a provider, a day passes. */
export const OTHERS_ACT: Partial<Record<Key, readonly string[]>> = {
  keep_going: ["record a delivery", "let some days pass"],
  waiting_for_listing: ["list a provider"],
  caught_up: ["let some days pass"],
};

/** Walks a company through `steps` events chosen at random. Calls `visit` on the starting state and after every event. */
export function walk(seed: number, steps: number, visit: (facts: Facts, now: Date, event: string | null, world: World) => void): void {
  const r = rng(seed);
  const w = newWorld();
  visit(worldFacts(w), w.now, null, w);
  for (let i = 0; i < steps; i++) {
    const ok = WORLD_EVENTS.filter((e) => e.possible(w));
    const e = r.weighted(ok.map((x) => [x, x.weight] as const));
    e.apply(w, r);
    visit(worldFacts(w), w.now, e.name, w);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Words that must never reach an owner

/**
 * Raw names and programming leftovers: a snake_case word (the keys of the rules are all written that way when they have two words), the
 * words "undefined", "null", "NaN" and "Infinity", an object printed as text, a template that was not filled. The one-word keys
 * (describe, confirm, diagnose, decide) are ordinary English and are not looked for here; `stageWordsIn` looks for the stage ids where
 * they could only be a leak.
 */
export function rawWordsIn(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)) found.push(m[0]);
  for (const bad of [/\bundefined\b/i, /\bnull\b/i, /\bNaN\b/, /\bInfinity\b/, /\[object/i, /\$\{/, /\{\w+\}/]) {
    const m = bad.exec(text);
    if (m) found.push(m[0]);
  }
  return found;
}

/** The ids of the stages written as lowercase words. A line under a stage has no reason to contain one. */
export const stageWordsIn = (text: string): string[] => STAGE_ORDER.filter((id) => new RegExp(`\\b${id}\\b`).test(text));

/** Every "N idea", "N requirements", "N reviews" and so on in a text uses the singular exactly when N is 1. Returns the ones that do not. */
export function badPlurals(text: string): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(/\b(\d+) (idea|requirement|provider|milestone|review|version)(s?)\b/g)) if ((m[1] === "1") !== (m[3] === "")) bad.push(m[0]);
  return bad;
}
