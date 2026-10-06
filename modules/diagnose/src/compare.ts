// What moved between two assessments of one company: which ideas went up, went down, came in or dropped out, and which of the owner's
// answers changed between the two descriptions they were made from. Pure code, no database, no new record: it reads two stored results and
// the answers of the two description versions, and every sentence it gives is taken from what those hold (the ranks, the score parts, the
// readiness and affordability the engine stored, the engine's own reason for a left-out idea). It never re-runs the engine.
import { FIELDS } from "../../factory/src/questionnaire.ts";
import type { Answers } from "../../factory/src/questionnaire.ts";
import { FIT_WORDS, READINESS_WORDS, answerWords, questionLabel, questionsRead } from "./gaps.ts";
import type { Item, Result } from "./engine.ts";
import { LIBRARY } from "./library.ts";
import type { Opportunity } from "./library.ts";

export type Moved = { opportunityId: string; title: string; from: number; to: number; direction: "up" | "down"; because: string[] };
export type Entered = { opportunityId: string; title: string; rank: number; before: string };
export type Changed = { opportunityId: string; title: string; rank: number; because: string[] };
export type Dropped = { opportunityId: string; title: string; wasRank: number; now: string };
export type AnswerChange = { key: string; label: string; before: string; after: string; usedByRules: boolean };
export type Comparison = {
  /** Both were made from the same version of the description, so no answer changed and any difference comes from the library or the engine. */
  sameDescription: boolean;
  libraryChanged: boolean;
  engineChanged: boolean;
  moved: Moved[];
  entered: Entered[];
  dropped: Dropped[];
  /** Ideas in both, in the same place, but with something changed in what they need or cost. */
  changedInPlace: Changed[];
  /** How many ideas are in both, in the same place, with nothing changed. */
  steady: number;
  /** The answers that differ, those the rules read first. Null when either description could not be read. */
  answers: AnswerChange[] | null;
  /** No idea moved, came in or dropped out (an idea may still have changed in place). */
  nothingMoved: boolean;
};

const NOT_ANSWERED = "not answered";

/** Whether two answers to one question are the same: a many-choice answer is a set, so the order the choices were saved in does not count. */
function sameAnswer(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");
  return a === b;
}

/**
 * The questions whose answer differs between two descriptions, in the questionnaire's order. A question the rules read shows what it was and
 * what it is; a free-text answer the rules do not read shows only that it changed (its words are the owner's and play no part in the result).
 */
export function diffAnswers(before: Answers, after: Answers, library: Opportunity[] = LIBRARY): AnswerChange[] {
  const read = questionsRead(library);
  const out: AnswerChange[] = [];
  for (const f of FIELDS) {
    const had = Object.hasOwn(before, f.key) ? before[f.key] : undefined;
    const has = Object.hasOwn(after, f.key) ? after[f.key] : undefined;
    if (had === undefined && has === undefined) continue;
    if (had !== undefined && has !== undefined && sameAnswer(had, has)) continue;
    const used = read.has(f.key);
    const quiet = !used && f.kind === "text";
    out.push({
      key: f.key,
      label: questionLabel(f.key),
      before: quiet ? "" : (answerWords(f.key, before) ?? NOT_ANSWERED),
      after: quiet ? "" : (answerWords(f.key, after) ?? NOT_ANSWERED),
      usedByRules: used,
    });
  }
  return [...out.filter((c) => c.usedByRules), ...out.filter((c) => !c.usedByRules)];
}

const stateIn = (item: Item, text: string): "first" | "check" | "met" => (item.readiness.needsFirst.includes(text) ? "first" : item.readiness.toCheck.includes(text) ? "check" : "met");

/** The questions that settle one prerequisite of an idea: its own question, or the questions of the gap of the idea that has to come first. */
function questionsOfPrerequisite(opportunity: Opportunity | undefined, text: string, library: Opportunity[]): string[] {
  const p = opportunity?.prerequisites.find((x) => x.text === text);
  if (!p) return [];
  if ("when" in p) return [p.when.question];
  return library.find((o) => o.id === p.opportunity)?.appliesWhen.map((c) => c.question) ?? [];
}

/** What changed in what an idea needs first, from the lists the engine stored. When an answer that settles it changed too, the line says so. */
function prerequisiteChanges(a: Item, b: Item, changed: Set<string>, library: Opportunity[]): string[] {
  const opportunity = library.find((o) => o.id === b.opportunityId);
  const texts = [...new Set([...a.readiness.needsFirst, ...a.readiness.toCheck, ...b.readiness.needsFirst, ...b.readiness.toCheck])];
  const out: string[] = [];
  for (const text of texts) {
    const from = stateIn(a, text);
    const to = stateIn(b, text);
    if (from === to) continue;
    let line = to === "met" ? (from === "check" ? `Now settled: ${text}.` : `No longer in the way: ${text}.`) : to === "first" ? `Now in the way: ${text}.` : `Now to be checked, because an answer is missing: ${text}.`;
    const hit = questionsOfPrerequisite(opportunity, text, library).filter((k) => changed.has(k));
    if (hit.length) line += ` Your answer to ${hit.map((k) => `"${questionLabel(k)}"`).join(" and ")} changed.`;
    out.push(line);
  }
  return out;
}

/** What changed in one idea's own points, from the parts the engine stored. */
function ownChanges(a: Item, b: Item): string[] {
  const own: string[] = [];
  if (a.addresses.length !== b.addresses.length) own.push(`It answers ${b.addresses.length} of your problems now and answered ${a.addresses.length} before.`);
  if (a.readiness.state !== b.readiness.state) own.push(`It was "${READINESS_WORDS[a.readiness.state]}" and is now "${READINESS_WORDS[b.readiness.state]}".`);
  if (a.affordability.state !== b.affordability.state) own.push(`Against your yearly budget it was ${FIT_WORDS[a.affordability.state]} and is now ${FIT_WORDS[b.affordability.state]}.`);
  if (a.scoreParts.uncertainty !== b.scoreParts.uncertainty) own.push(b.scoreParts.uncertainty === 0 ? "An answer it needed, which was missing, is there now." : "An answer it needs is missing now.");
  if (a.risk.level !== b.risk.level) own.push(`Its risk went from ${a.risk.level} to ${b.risk.level}.`);
  return own;
}

/** Why one idea's place differs between the two assessments, from what the engine stored for it. */
function because(a: Item, b: Item, changed: Set<string>, library: Opportunity[]): string[] {
  const own = ownChanges(a, b);
  return [...(own.length ? own : ["Its own points did not change. Other ideas moved around it."]), ...prerequisiteChanges(a, b, changed, library)];
}

const was = (result: Result, id: string): string => {
  const l = result.leftOut.find((x) => x.opportunityId === id);
  return l ? l.reason : "";
};

/**
 * What moved from `earlier` to `later`. The answers are those of the description version each was made from (null when one cannot be read,
 * in which case the answer list is null and the ranks are still compared).
 */
export function compareAssessments(earlier: Result, later: Result, earlierAnswers: Answers | null, laterAnswers: Answers | null, sameVersion: boolean, library: Opportunity[] = LIBRARY): Comparison {
  const before = new Map(earlier.items.map((i) => [i.opportunityId, i]));
  const after = new Map(later.items.map((i) => [i.opportunityId, i]));
  const answers = earlierAnswers && laterAnswers ? diffAnswers(earlierAnswers, laterAnswers, library) : null;
  const changed = new Set((answers ?? []).map((c) => c.key));
  const moved: Moved[] = [];
  const changedInPlace: Changed[] = [];
  const entered: Entered[] = [];
  const dropped: Dropped[] = [];
  let steady = 0;

  for (const item of later.items) {
    const old = before.get(item.opportunityId);
    if (!old) {
      const reason = was(earlier, item.opportunityId);
      entered.push({ opportunityId: item.opportunityId, title: item.title, rank: item.rank, before: reason ? `Before, it was left out. ${reason}` : "Before, it did not match a problem you named." });
    } else if (old.rank === item.rank) {
      const why = [...ownChanges(old, item), ...prerequisiteChanges(old, item, changed, library)];
      if (why.length) changedInPlace.push({ opportunityId: item.opportunityId, title: item.title, rank: item.rank, because: why });
      else steady += 1;
    } else {
      moved.push({ opportunityId: item.opportunityId, title: item.title, from: old.rank, to: item.rank, direction: item.rank < old.rank ? "up" : "down", because: because(old, item, changed, library) });
    }
  }
  for (const old of earlier.items) {
    if (after.has(old.opportunityId)) continue;
    const reason = was(later, old.opportunityId);
    dropped.push({ opportunityId: old.opportunityId, title: old.title, wasRank: old.rank, now: reason ? `Now it is left out. ${reason}` : "Now it does not match a problem you named." });
  }

  return {
    sameDescription: sameVersion,
    libraryChanged: earlier.libraryVersion !== later.libraryVersion,
    engineChanged: earlier.engineVersion !== later.engineVersion,
    moved,
    entered,
    dropped,
    changedInPlace,
    steady,
    answers,
    nothingMoved: moved.length === 0 && entered.length === 0 && dropped.length === 0,
  };
}
