// The diagnosis engine: rules, not a model. Given a company's confirmed answers and the library, it returns a ranked list
// of opportunities with the reason for each, and a list of what it left out and why. It is a pure function: the same
// answers and library always give the same result, which is what lets "run it again" be safe and lets a person check a
// ranking by hand.
//
// Ranking, in full (ENGINE_VERSION 1). For each opportunity that addresses at least one problem the owner named and whose
// gap condition is not known to be false:
//   score = 10 x (problems named that it addresses) + readiness + affordability - risk - uncertainty
//   readiness:     ready 4, check 2 (an answer needed to judge a prerequisite is missing), needs first 0
//   affordability: within the yearly budget 2, stretch 0, over -2, not known 0
//   risk:          low 0, medium 1, high 2
//   uncertainty:   1 when an answer needed to judge the gap is missing, else 0
// Ties are broken by id. There is no term for whether the opportunity is AI or not: an AI item has no advantage or penalty
// for being AI (a test pins this). The first MAX_ITEMS are shown; the rest are listed as left out.
import { FIELDS } from "../../factory/src/questionnaire.ts";
import type { Answers } from "../../factory/src/questionnaire.ts";
import { BUDGET_CEILING, LIBRARY, LIBRARY_VERSION } from "./library.ts";
import type { Benefit, Condition, Opportunity, Range } from "./library.ts";

export const ENGINE_VERSION = 1;
export const MAX_ITEMS = 8;

export type Truth = "yes" | "no" | "unknown";
export type Readiness = "ready" | "check" | "needs_first";
export type Affordability = "within" | "stretch" | "over" | "unknown";

export type Item = {
  rank: number;
  opportunityId: string;
  title: string;
  summary: string;
  kind: "ai" | "non_ai";
  /** The owner's own problems this addresses, as the questionnaire's labels. */
  addresses: string[];
  why: string[];
  score: number;
  scoreParts: { problems: number; readiness: number; affordability: number; risk: number; uncertainty: number };
  readiness: { state: Readiness; needsFirst: string[]; toCheck: string[] };
  affordability: { state: Affordability; firstYear: Range; budgetCeiling: number | null };
  benefit: Benefit;
  costs: Opportunity["costs"];
  risk: Opportunity["risk"];
  source: Opportunity["source"];
};
export type LeftOut = { opportunityId: string; title: string; reason: string };
export type Result = {
  engine: "rules";
  engineVersion: number;
  libraryVersion: number;
  synthetic: true;
  inputs: { problems: string[]; budgetBand: string | null; sector: string | null; readiness: string | null };
  items: Item[];
  leftOut: LeftOut[];
};

const FIELD = new Map(FIELDS.map((f) => [f.key, f]));
const optionLabel = (question: string, value: string): string => {
  const f = FIELD.get(question);
  return f && (f.kind === "choice" || f.kind === "multi") ? (f.options.find((o) => o.value === value)?.label ?? value) : value;
};
const questionLabel = (question: string): string => FIELD.get(question)?.label ?? question;

/** Whether a condition holds for these answers. A question the owner did not answer makes it "unknown". */
export function evaluate(condition: Condition, answers: Answers): Truth {
  const answer = Object.hasOwn(answers, condition.question) ? answers[condition.question] : undefined;
  if (answer === undefined) return "unknown";
  if ("is" in condition) return typeof answer === "string" && condition.is.includes(answer) ? "yes" : "no";
  if ("not" in condition) return typeof answer === "string" && !condition.not.includes(answer) ? "yes" : "no";
  if (!Array.isArray(answer)) return "no";
  if ("has" in condition) return answer.includes(condition.has) ? "yes" : "no";
  return answer.includes(condition.lacks) ? "no" : "yes";
}

const conjunction = (truths: Truth[]): Truth => (truths.includes("no") ? "no" : truths.includes("unknown") ? "unknown" : "yes");

/** What a condition asks for, in the questionnaire's own words. */
const expected = (c: Condition): string => {
  if ("is" in c) return c.is.map((v) => `"${optionLabel(c.question, v)}"`).join(" or ");
  if ("not" in c) return `anything but ${c.not.map((v) => `"${optionLabel(c.question, v)}"`).join(" or ")}`;
  if ("has" in c) return `"${optionLabel(c.question, c.has)}" among the choices`;
  return `"${optionLabel(c.question, c.lacks)}" not among the choices`;
};
/** The owner's answer to the question a condition is about, in the questionnaire's own words. */
const given = (c: Condition, answers: Answers): string => {
  const a = Object.hasOwn(answers, c.question) ? answers[c.question] : undefined;
  if (Array.isArray(a)) return a.map((v) => `"${optionLabel(c.question, String(v))}"`).join(", ");
  return a === undefined ? "not answered" : `"${optionLabel(c.question, String(a))}"`;
};
const sentence = (c: Condition, answers: Answers): string => `Your answer to "${questionLabel(c.question)}" is ${given(c, answers)}; this is for units where it is ${expected(c)}`;

// Negative already, so that no score part is ever -0 (JSON would store it as 0 and a stored result would not equal a fresh one).
export const POINTS = {
  perProblem: 10,
  readiness: { ready: 4, check: 2, needs_first: 0 } as Record<Readiness, number>,
  affordability: { within: 2, stretch: 0, unknown: 0, over: -2 } as Record<Affordability, number>,
  risk: { low: 0, medium: -1, high: -2 } as const,
  missingGapAnswer: -1,
};

export function affordability(firstYear: Range, budgetBand: string | null): { state: Affordability; budgetCeiling: number | null } {
  if (budgetBand === null || !Object.hasOwn(BUDGET_CEILING, budgetBand)) return { state: "unknown", budgetCeiling: null };
  const ceiling = BUDGET_CEILING[budgetBand];
  if (ceiling === null) return { state: "within", budgetCeiling: null };
  if (firstYear.high <= ceiling) return { state: "within", budgetCeiling: ceiling };
  if (firstYear.low <= ceiling) return { state: "stretch", budgetCeiling: ceiling };
  return { state: "over", budgetCeiling: ceiling };
}

/** Whether the gap this opportunity closes exists for these answers. */
function gapOf(o: Opportunity, answers: Answers): Truth {
  return conjunction(o.appliesWhen.map((c) => evaluate(c, answers)));
}

export function diagnose(answers: Answers, library: Opportunity[] = LIBRARY): Result {
  const byId = new Map(library.map((o) => [o.id, o]));
  const named = Array.isArray(answers.problems) ? (answers.problems as string[]) : [];
  const budgetBand = typeof answers.budget_band === "string" ? answers.budget_band : null;
  const candidates: Item[] = [];
  const leftOut: LeftOut[] = [];

  for (const o of library) {
    const matched = o.addresses.filter((p) => named.includes(p));
    if (matched.length === 0) continue; // addresses nothing the owner named: not a candidate, not listed
    const gap = gapOf(o, answers);
    if (gap === "no") {
      const reason = o.appliesWhen.find((c) => evaluate(c, answers) === "no");
      leftOut.push({ opportunityId: o.id, title: o.title, reason: reason ? `${sentence(reason, answers)}, so the gap does not seem to exist here.` : "The gap this closes does not seem to exist here." });
      continue;
    }

    const needsFirst: string[] = [];
    const toCheck: string[] = [];
    for (const p of o.prerequisites) {
      if ("opportunity" in p) {
        const other = byId.get(p.opportunity);
        const t = other ? gapOf(other, answers) : "unknown";
        // The other opportunity's gap still exists, so it is not done yet. If the gap is closed, the prerequisite holds.
        if (t === "yes") needsFirst.push(p.text);
        else if (t === "unknown") toCheck.push(p.text);
      } else {
        const t = evaluate(p.when, answers);
        if (t === "no") needsFirst.push(p.text);
        else if (t === "unknown") toCheck.push(p.text);
      }
    }
    const readiness: Readiness = needsFirst.length ? "needs_first" : toCheck.length ? "check" : "ready";
    const firstYear: Range = { low: o.costs.oneTime.low + o.costs.recurringPerYear.low, high: o.costs.oneTime.high + o.costs.recurringPerYear.high };
    const afford = affordability(firstYear, budgetBand);
    const parts = {
      problems: POINTS.perProblem * matched.length,
      readiness: POINTS.readiness[readiness],
      affordability: POINTS.affordability[afford.state],
      risk: POINTS.risk[o.risk.level],
      uncertainty: gap === "unknown" ? POINTS.missingGapAnswer : 0,
    };
    const why = [`You named ${matched.length === 1 ? "this problem" : "these problems"}: ${matched.map((p) => optionLabel("problems", p).toLowerCase()).join("; ")}.`];
    if (o.appliesWhen.length) why.push(gap === "yes" ? `${o.appliesWhen.map((c) => sentence(c, answers)).join("; ")}.` : "An answer needed to see whether the gap exists is missing.");
    candidates.push({
      rank: 0,
      opportunityId: o.id,
      title: o.title,
      summary: o.summary,
      kind: o.kind,
      addresses: matched.map((p) => optionLabel("problems", p)),
      why,
      score: parts.problems + parts.readiness + parts.affordability + parts.risk + parts.uncertainty,
      scoreParts: parts,
      readiness: { state: readiness, needsFirst, toCheck },
      affordability: { state: afford.state, firstYear, budgetCeiling: afford.budgetCeiling },
      benefit: o.benefit,
      costs: o.costs,
      risk: o.risk,
      source: o.source,
    });
  }

  candidates.sort((a, b) => b.score - a.score || (a.opportunityId < b.opportunityId ? -1 : 1));
  const items = candidates.slice(0, MAX_ITEMS).map((c, i) => ({ ...c, rank: i + 1 }));
  for (const c of candidates.slice(MAX_ITEMS)) leftOut.push({ opportunityId: c.opportunityId, title: c.title, reason: `Ranked below the first ${MAX_ITEMS}.` });

  return {
    engine: "rules",
    engineVersion: ENGINE_VERSION,
    libraryVersion: LIBRARY_VERSION,
    synthetic: true,
    inputs: {
      problems: named.map((p) => optionLabel("problems", p)),
      budgetBand: budgetBand ? optionLabel("budget_band", budgetBand) : null,
      sector: typeof answers.sector === "string" ? optionLabel("sector", answers.sector) : null,
      readiness: typeof answers.readiness === "string" ? optionLabel("readiness", answers.readiness) : null,
    },
    items,
    leftOut,
  };
}
