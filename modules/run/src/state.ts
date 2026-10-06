// When each review of an engagement is due, and what has been recorded, worked out from the events and the clock, never stored.
// Pure functions. The same day counts are in the trigger in drizzle/0013_run_guards.sql, and a test keeps the two equal.

/** Days after the first accepted milestone at which the owner reviews what it did. Assumptions, not findings. */
export const REVIEW_DAYS = [30, 90, 180] as const;
export type ReviewNo = 1 | 2 | 3;
export const VERDICTS = ["met", "partly", "not_met"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const IN_USE = ["yes", "no"] as const;
export type InUse = (typeof IN_USE)[number];

export const MAX_VALUE = 1_000_000_000;
export const MAX_NOTE_LENGTH = 500;

const DAY_MS = 86_400_000;

export const isReviewNo = (n: unknown): n is ReviewNo => n === 1 || n === 2 || n === 3;

/** The moment review `no` falls due: exactly that many days after the first acceptance. */
export const dueAt = (firstAcceptedAt: string, no: ReviewNo): Date => new Date(new Date(firstAcceptedAt).getTime() + REVIEW_DAYS[no - 1] * DAY_MS);

/**
 * waiting: nothing has been accepted yet, so there is nothing to review. not_due: accepted, and the review's day has not come.
 * due: it can be recorded now. recorded: it has been.
 */
export type ReviewState = "waiting" | "not_due" | "due" | "recorded";
export type ReviewSlot = { no: ReviewNo; days: number; dueAt: string | null; state: ReviewState };

export function reviewSlots(input: { firstAcceptedAt: string | null; now: Date; recorded: readonly number[] }): ReviewSlot[] {
  return ([1, 2, 3] as const).map((no) => {
    const days = REVIEW_DAYS[no - 1];
    if (input.recorded.includes(no)) return { no, days, dueAt: input.firstAcceptedAt ? dueAt(input.firstAcceptedAt, no).toISOString() : null, state: "recorded" as const };
    if (input.firstAcceptedAt === null) return { no, days, dueAt: null, state: "waiting" as const };
    const due = dueAt(input.firstAcceptedAt, no);
    return { no, days, dueAt: due.toISOString(), state: input.now.getTime() >= due.getTime() ? ("due" as const) : ("not_due" as const) };
  });
}

/**
 * Why a starting number cannot be recorded now, or null when it can. In the order the database answers (drizzle/0013_run_guards.sql and
 * drizzle/0015_run_corrections.sql): once recorded it is "recorded"; after an acceptance it is too late; a closed engagement takes none;
 * and before the plan is agreed it is too early, because there is no plan yet to measure the work against.
 */
export type BaselineBlock = "recorded" | "too_late" | "closed" | "no_plan";
export function baselineBlock(e: { recorded: boolean; accepted: boolean; closed: boolean; planAgreed: boolean }): BaselineBlock | null {
  if (e.recorded) return "recorded";
  if (e.accepted) return "too_late";
  if (e.closed) return "closed";
  if (!e.planAgreed) return "no_plan";
  return null;
}

/** What the unit the assessment used for an idea's benefit is called on a page. */
export const UNIT_LABEL: Record<"percent" | "days" | "rupees_per_year", string> = { percent: "percent", days: "days", rupees_per_year: "rupees a year" };
