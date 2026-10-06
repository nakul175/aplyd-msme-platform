// Where the unit stands in the five areas the requirements name (data, people, systems, money, quality), and what stands between it and each
// idea. Pure code, no database: it reads what an assessment already holds (the stored result), the answers it was made from, and the
// library. It ranks nothing and adds no rule or threshold. Every line below is something the engine already judged (a prerequisite not met,
// a prerequisite it could not judge for want of an answer, a gap it could not see for want of an answer, a first-year cost against the
// budget the owner chose), put in the area of the question it is about.
//
// One thing here is a choice and not a finding: which area a question belongs to (AREA_OF_QUESTION). It is a presentation choice, written
// down here and shown on the page as such. Where the library or the answers cannot support a placement, the line is kept and shown as "not
// placed in an area", and an area the answers cannot speak for says "not assessed" and why. Nothing is guessed.
import { FIELDS } from "../../factory/src/questionnaire.ts";
import type { Answers } from "../../factory/src/questionnaire.ts";
import { evaluate } from "./engine.ts";
import type { Affordability, Item, Readiness, Result } from "./engine.ts";
import { BUDGET_CEILING, LIBRARY, LIBRARY_VERSION } from "./library.ts";
import type { Condition, Opportunity, Range } from "./library.ts";

export type AreaId = "data" | "people" | "systems" | "money" | "quality";

/** The five areas, in the order the requirements name them (BR-DIAG-08). */
export const AREAS: readonly { id: AreaId; label: string; about: string }[] = [
  { id: "data", label: "Data", about: "The records you keep in written or digital form." },
  { id: "people", label: "People", about: "Who looks after computers and software. The rules look at nothing else about people: skills and staffing are not assessed." },
  { id: "systems", label: "Systems", about: "How orders, work, machines, stock and accounts are handled today, and your internet." },
  { id: "money", label: "Money", about: "Each idea's first-year cost against the top of the yearly budget band you chose (an assumption)." },
  { id: "quality", label: "Quality", about: "How the quality of what you make is checked." },
];

/**
 * Which area a question of the questionnaire belongs to. A choice made for this page, not a finding. Only questions the rules read are
 * here (a test holds that), so every answer shown under an area is one that can matter to an idea. A question that is not here (what you
 * make, where you are, the number of people, the shifts, who decides) is not about any of the five areas as far as the rules go.
 */
export const AREA_OF_QUESTION: Record<string, AreaId> = {
  data_kept: "data",
  it_support: "people",
  orders_in: "systems",
  production_tracking: "systems",
  maintenance: "systems",
  accounts: "systems",
  inventory: "systems",
  connectivity: "systems",
  budget_band: "money",
  quality_checks: "quality",
};

export const READINESS_WORDS: Record<Readiness, string> = { ready: "Ready to start", check: "A few things to check first", needs_first: "Needs something else first" };
/** How an idea's first-year cost sits against the yearly budget, short enough to follow "was" and "now". */
export const FIT_WORDS: Record<Affordability, string> = { within: "within your yearly budget", stretch: "could stretch your yearly budget", over: "more than your yearly budget", unknown: "not compared with a budget" };

const FIELD = new Map(FIELDS.map((f) => [f.key, f]));
export const questionLabel = (key: string): string => FIELD.get(key)?.label ?? key;
const areaOf = (key: string): AreaId | null => (Object.hasOwn(AREA_OF_QUESTION, key) ? AREA_OF_QUESTION[key]! : null);
const quote = (s: string) => `"${s}"`;

/** The owner's answer to one question, in the questionnaire's own words; null when there is no answer (or no answers to read). */
export function answerWords(key: string, answers: Answers | null): string | null {
  if (!answers || !Object.hasOwn(answers, key)) return null;
  const a = answers[key];
  const f = FIELD.get(key);
  const option = (v: string) => (f && (f.kind === "choice" || f.kind === "multi") ? (f.options.find((o) => o.value === v)?.label ?? v) : v);
  if (Array.isArray(a)) return a.length ? a.map(option).join("; ") : null;
  return typeof a === "string" ? option(a) : String(a);
}

/** The questions the rules read: the problems, the budget band, and every question a gap or a prerequisite of the library is about. */
export function questionsRead(library: Opportunity[] = LIBRARY): Set<string> {
  const keys = new Set<string>(["problems", "budget_band"]);
  for (const o of library) {
    for (const c of o.appliesWhen) keys.add(c.question);
    for (const p of o.prerequisites) if ("when" in p) keys.add(p.when.question);
  }
  return keys;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const range = (r: Range) => (r.low === r.high ? rupees(r.low) : `${rupees(r.low)} to ${rupees(r.high)}`);

export type BlockerKind = "first" | "check" | "answer" | "money";
export type Blocker = {
  opportunityId: string;
  rank: number;
  title: string;
  kind: BlockerKind;
  /** The area it is about, or null when the library or the answers cannot say. */
  area: AreaId | null;
  /** The prerequisite as the library words it, when the line is about one. */
  text: string;
  /** The questions the owner did not answer that would settle it (kind check or answer). */
  missing: string[];
  /** The whole line, in plain words. */
  words: string;
};
export type Standing = { question: string; label: string; answer: string | null };
export type InPlace = { opportunityId: string; title: string; area: AreaId | null; words: string };
export type Area = {
  id: AreaId;
  label: string;
  about: string;
  state: "assessed" | "not_assessed";
  /** Why the area is not assessed; null when it is. */
  whyNot: string | null;
  standing: Standing[];
  blockers: Blocker[];
  /** How many ranked ideas have at least one line in this area. */
  heldUp: number;
  inPlace: InPlace[];
};
export type IdeaGap = { opportunityId: string; rank: number; title: string; readiness: Readiness; blockers: Blocker[] };
export type GapView = {
  /** ideas: at least one ranked idea. all_left_out: none ranked, and every idea that matched a problem was left out. no_match: no idea matched a problem. */
  state: "ideas" | "all_left_out" | "no_match";
  areas: Area[];
  /** Lines that could not be put in an area, and why (the library changed since the assessment, or the answers are not available). */
  unplaced: Blocker[];
  unplacedInPlace: InPlace[];
  ideas: IdeaGap[];
  /** Ideas left out because the owner's answers show the gap is not there. */
  leftOutByAnswer: number;
  /** Ideas that matched a problem and were left out only because eight were already ranked. */
  rankedBelowCap: number;
  /** Whether any line waits on a question the owner did not answer. */
  needsAnswers: boolean;
  /** Whether lines could be placed in areas by the library. False when the assessment was made with another library version. */
  placed: boolean;
};

const KIND_ORDER: Record<BlockerKind, number> = { first: 0, check: 1, answer: 2, money: 3 };
const CAPPED = /^Ranked below the first \d+\.$/;

type Facts = { area: AreaId | null; missing: string[] };

/** What a prerequisite of the library is about: the area of its question, and the questions the owner left unanswered that would settle it. */
function prerequisiteFacts(opportunity: Opportunity | undefined, text: string, kind: "first" | "check", answers: Answers | null, library: Opportunity[]): Facts {
  const p = opportunity?.prerequisites.find((x) => x.text === text);
  if (!p) return { area: null, missing: [] };
  if ("when" in p) return { area: areaOf(p.when.question), missing: kind === "check" ? [questionLabel(p.when.question)] : [] };
  const other = library.find((o) => o.id === p.opportunity);
  if (!other) return { area: null, missing: [] };
  const unknown = answers ? other.appliesWhen.filter((c) => evaluate(c, answers) === "unknown") : [];
  const lead = kind === "check" && unknown[0] ? unknown[0] : other.appliesWhen[0];
  return { area: lead ? areaOf(lead.question) : null, missing: kind === "check" ? unknown.map((c) => questionLabel(c.question)) : [] };
}

const unanswered = (labels: string[]) => labels.map(quote).join(" or ");
/** A prerequisite that begins "First ..." read as an instruction on its own line ("First keep a stock register" becomes "Keep a stock register"). */
const asInstruction = (text: string): string => (/^First [a-z]/.test(text) ? text[6]!.toUpperCase() + text.slice(7) : text);

function blockersOf(item: Item, library: Opportunity[], answers: Answers | null, trust: boolean): Blocker[] {
  const opportunity = trust ? library.find((o) => o.id === item.opportunityId) : undefined;
  const base = { opportunityId: item.opportunityId, rank: item.rank, title: item.title };
  const out: Blocker[] = [];
  for (const text of item.readiness.needsFirst) {
    const f = prerequisiteFacts(opportunity, text, "first", answers, library);
    out.push({ ...base, kind: "first", area: f.area, text, missing: [], words: `${asInstruction(text)}.` });
  }
  for (const text of item.readiness.toCheck) {
    const f = prerequisiteFacts(opportunity, text, "check", answers, library);
    const known = f.missing.length ? `Not known yet: you did not answer ${unanswered(f.missing)}.` : "Not known yet: an answer is missing.";
    out.push({ ...base, kind: "check", area: f.area, text, missing: f.missing, words: `${asInstruction(text)}. ${known}` });
  }
  if (item.scoreParts.uncertainty !== 0) {
    // The engine could not see whether the gap this idea closes exists, because an answer is missing. Name the question when it can be found.
    const unknown = opportunity && answers ? opportunity.appliesWhen.filter((c: Condition) => evaluate(c, answers) === "unknown") : [];
    if (unknown.length === 0) out.push({ ...base, kind: "answer", area: null, text: "", missing: [], words: "An answer needed to see whether this applies to you is missing." });
    for (const c of unknown) out.push({ ...base, kind: "answer", area: areaOf(c.question), text: "", missing: [questionLabel(c.question)], words: `You did not answer ${quote(questionLabel(c.question))}, so it is not clear whether this applies to you.` });
  }
  const { state, firstYear, budgetCeiling } = item.affordability;
  if ((state === "over" || state === "stretch") && budgetCeiling !== null) {
    const verdict = state === "over" ? "so it is more than your yearly budget" : "so it could stretch your yearly budget";
    out.push({ ...base, kind: "money", area: "money", text: "", missing: [], words: `The first year costs ${range(firstYear)}. Your yearly budget is up to ${rupees(budgetCeiling)}, ${verdict}.` });
  }
  return out;
}

function inPlaceOf(result: Result, library: Opportunity[], answers: Answers | null, trust: boolean): { lines: InPlace[]; capped: number } {
  const lines: InPlace[] = [];
  let capped = 0;
  for (const l of result.leftOut) {
    if (CAPPED.test(l.reason)) {
      capped += 1;
      continue;
    }
    const opportunity = trust ? library.find((o) => o.id === l.opportunityId) : undefined;
    const cause = opportunity && answers ? opportunity.appliesWhen.find((c) => evaluate(c, answers) === "no") : undefined;
    const given = cause ? answerWords(cause.question, answers) : null;
    if (cause && given !== null) lines.push({ opportunityId: l.opportunityId, title: l.title, area: areaOf(cause.question), words: `You answered ${quote(given)} to ${quote(questionLabel(cause.question))}, so ${quote(l.title)} was left out.` });
    else lines.push({ opportunityId: l.opportunityId, title: l.title, area: null, words: `${quote(l.title)} was left out. ${l.reason}` });
  }
  return { lines, capped };
}

function standingOf(area: AreaId, answers: Answers | null): Standing[] {
  return FIELDS.filter((f) => areaOf(f.key) === area).map((f) => ({ question: f.key, label: f.label, answer: answerWords(f.key, answers) }));
}

function whyNot(area: AreaId, answers: Answers | null, standing: Standing[]): string | null {
  if (!answers) return "The description this assessment was made from could not be read, so this part is not assessed.";
  if (area === "money") {
    const band = typeof answers.budget_band === "string" ? answers.budget_band : null;
    if (band !== null && Object.hasOwn(BUDGET_CEILING, band)) return null;
    return band === null ? "You did not give a yearly budget, so no idea is compared with one." : "You said you are not sure of your yearly budget, so no idea is compared with one.";
  }
  if (standing.some((s) => s.answer !== null)) return null;
  return `You did not answer ${unanswered(standing.map((s) => s.label))}, so this part is not assessed.`;
}

/**
 * The gap view of one assessment. `answers` are the owner's answers of the description version it was made from (null when they cannot be
 * read). Lines are placed with the library only when it is the version the assessment was made with; otherwise they are kept, unplaced.
 */
export function gapView(result: Result, answers: Answers | null, library: Opportunity[] = LIBRARY, libraryVersion: number = LIBRARY_VERSION): GapView {
  const trust = result.libraryVersion === libraryVersion;
  const all = result.items.flatMap((item) => blockersOf(item, library, answers, trust));
  const ordered = (list: Blocker[]) => [...list].sort((a, b) => a.rank - b.rank || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const place = inPlaceOf(result, library, answers, trust);

  const areas: Area[] = AREAS.map((a) => {
    const standing = standingOf(a.id, answers);
    const reason = whyNot(a.id, answers, standing);
    const blockers = ordered(all.filter((b) => b.area === a.id));
    return {
      id: a.id,
      label: a.label,
      about: a.about,
      state: reason === null ? "assessed" : "not_assessed",
      whyNot: reason,
      standing,
      blockers,
      heldUp: new Set(blockers.map((b) => b.opportunityId)).size,
      inPlace: place.lines.filter((l) => l.area === a.id),
    };
  });

  const byAnswer = place.lines.length;
  return {
    state: result.items.length > 0 ? "ideas" : result.leftOut.length > 0 ? "all_left_out" : "no_match",
    areas,
    unplaced: ordered(all.filter((b) => b.area === null)),
    unplacedInPlace: place.lines.filter((l) => l.area === null),
    ideas: result.items.map((item) => ({ opportunityId: item.opportunityId, rank: item.rank, title: item.title, readiness: item.readiness.state, blockers: ordered(all.filter((b) => b.opportunityId === item.opportunityId)) })),
    leftOutByAnswer: byAnswer,
    rankedBelowCap: place.capped,
    needsAnswers: all.some((b) => b.kind === "check" || b.kind === "answer"),
    placed: trust,
  };
}
