// How far an owner has got with the Describe questionnaire: how many questions the saved answers cover, and how many of the questions
// needed to confirm. Pure code, no database: the page reads the newest saved version and passes its answers here, so the count on
// the page is computed on the server from what was saved, never from what is being typed.
import { FIELDS, REQUIRED_TO_CONFIRM } from "./questionnaire.ts";
import type { Answers } from "./questionnaire.ts";

/**
 * A follow-up question ("If something else, what?") only applies once the answer that asks for it has been given. Until then it is not
 * counted, so an owner who answers everything that applies reaches "all answered" and is not stopped by a question that never came up.
 */
const FOLLOW_UPS: Record<string, (answers: Answers) => boolean> = {
  sector_other: (a) => a.sector === "other",
  problem_other: (a) => Array.isArray(a.problems) && a.problems.includes("other_problem"),
};
export const FOLLOW_UP_KEYS: readonly string[] = Object.keys(FOLLOW_UPS);

/** Whether a stored value is an answer: text with something in it, a finite number, or a list with something in it. */
export function isAnswered(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

const hasAnswer = (answers: Answers, key: string) => Object.hasOwn(answers, key) && isAnswered(answers[key]);
const applies = (answers: Answers, key: string) => !Object.hasOwn(FOLLOW_UPS, key) || FOLLOW_UPS[key](answers);

export type Progress = {
  /** Questions that apply to these answers and have an answer. */
  answered: number;
  /** Questions that apply to these answers. */
  total: number;
  /** Of the questions needed to confirm, how many have an answer. */
  requiredAnswered: number;
  requiredTotal: number;
  /** The keys of the questions needed to confirm that have no answer, in questionnaire order. */
  requiredMissing: string[];
};

/** The progress of a set of saved answers. `null` (nothing saved yet) counts as no answers. */
export function progressOf(saved: Answers | null | undefined): Progress {
  const answers: Answers = saved ?? {};
  let answered = 0;
  let total = 0;
  for (const f of FIELDS) {
    if (!applies(answers, f.key)) continue;
    total += 1;
    if (hasAnswer(answers, f.key)) answered += 1;
  }
  const required: readonly string[] = REQUIRED_TO_CONFIRM;
  const requiredMissing = FIELDS.map((f) => f.key).filter((k) => required.includes(k) && !hasAnswer(answers, k));
  return { answered, total, requiredAnswered: required.length - requiredMissing.length, requiredTotal: required.length, requiredMissing };
}

/** "12 of 23 questions answered in the newest saved version": the count is of what was saved, so it does not move while the person types. */
export const progressWords = (p: Progress, saved: boolean): string => `${p.answered} of ${p.total} questions answered${saved ? " in the newest saved version" : ""}`;

/**
 * One line about the questions needed to confirm, or null when there is nothing to say: a version that is already confirmed needs no
 * more answers.
 */
export function confirmWords(p: Progress, confirmed: boolean): string | null {
  if (confirmed) return null;
  if (p.requiredMissing.length === 0) return `All ${p.requiredTotal} questions needed to confirm are answered. You can confirm this version.`;
  return `${p.requiredAnswered} of ${p.requiredTotal} questions needed to confirm are answered.`;
}
