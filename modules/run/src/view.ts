// What the Results page says about where things stand, worked out from the reviews and never stored. Pure functions, so a test can check
// the words. Nothing here judges a number: the page does not know whether a higher number is better or worse.
import type { ReviewState } from "./state.ts";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The small label on each review: what the owner can do with it now. */
export const REVIEW_TAG: Record<ReviewState, { text: string; tone?: "ok" | "turn" }> = {
  waiting: { text: "Waiting" },
  not_due: { text: "Not open yet" },
  due: { text: "Open now", tone: "turn" },
  recorded: { text: "Recorded", tone: "ok" },
};

/** The latest recorded review in order (review 3 over review 2 over review 1), or null if none is recorded. */
export function latestRecorded<T extends { record: unknown | null }>(reviews: readonly T[]): T | null {
  return [...reviews].reverse().find((r) => r.record !== null) ?? null;
}

/** The number of the first review that is open now, which is the one the page makes its main button when two are open at once; null when none is. */
export const firstOpenReview = (reviews: readonly { no: number; state: ReviewState }[]): number | null => reviews.find((r) => r.state === "due")?.no ?? null;

export const recordedCount = (reviews: readonly { state: ReviewState }[]): number => reviews.filter((r) => r.state === "recorded").length;

export type ResultsView = { canRecordBaseline: boolean; reviews: readonly { state: ReviewState; dueAt: string | null }[] };

export type ResultsSummary = {
  /** Reviews that can be recorded now. */
  open: number;
  /** Engagements whose starting number can still be recorded. */
  baselineToRecord: number;
  /** The date (UTC) of the next review to open, if there is one. */
  nextOpens: string | null;
  yourTurn: boolean;
  sentence: string;
};

/** The state of the whole page in one sentence. */
export function resultsSummary(list: readonly ResultsView[]): ResultsSummary {
  const reviews = list.flatMap((g) => g.reviews);
  const open = reviews.filter((r) => r.state === "due").length;
  const baselineToRecord = list.filter((g) => g.canRecordBaseline).length;
  const nextOpens =
    reviews
      .filter((r) => r.state === "not_due" && r.dueAt)
      .map((r) => r.dueAt!.slice(0, 10))
      .sort()[0] ?? null;
  let sentence: string;
  if (open > 0) sentence = `${plural(open, "review is", "reviews are")} open now.`;
  else if (baselineToRecord > 0) sentence = "Write down your starting number before the first milestone is accepted.";
  else if (nextOpens) sentence = `Nothing needs you today. The next review opens on ${nextOpens}.`;
  else if (reviews.length > 0 && reviews.every((r) => r.state === "recorded")) sentence = "Every review is recorded.";
  else sentence = "Nothing needs you today. The reviews are counted from the day you accept your first milestone.";
  return { open, baselineToRecord, nextOpens, yourTurn: open > 0 || baselineToRecord > 0, sentence };
}

export type FirstTurn = { kind: "baseline"; engagementId: string } | { kind: "review"; engagementId: string; no: number };

/** Where the owner's turn is on this page, first in the order the page lists things: an open review before a starting number to record, as in the sentence at the top. Null when it is nobody's turn. */
export function firstTurn(list: readonly { id: string; canRecordBaseline: boolean; reviews: readonly { no: number; state: ReviewState }[] }[]): FirstTurn | null {
  for (const g of list) {
    const no = firstOpenReview(g.reviews);
    if (no !== null) return { kind: "review", engagementId: g.id, no };
  }
  const g = list.find((x) => x.canRecordBaseline);
  return g ? { kind: "baseline", engagementId: g.id } : null;
}
