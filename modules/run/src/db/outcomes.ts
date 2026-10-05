// Reads and appends the owner's measurements of an engagement. Every function takes the company id from the caller's identity,
// never from a URL, and every query is bound to it (a static test checks that). Nothing here edits or deletes a row.
import { auditIfChanged } from "../../../platform/src/db/audit.ts";
import type { InUse, ReviewNo, Verdict } from "../state.ts";

export type OutcomeRow = { id: number; at: string; userId: string; kind: "baseline" | "review"; reviewNo: ReviewNo | null; value: number; verdict: Verdict | null; inUse: InUse | null; note: string };
type DbRow = { id: number; at: string; user_id: string; kind: "baseline" | "review"; review_no: ReviewNo | null; value: number; verdict: Verdict | null; in_use: InUse | null; note: string };

/** Every measurement recorded for one engagement of the company, in the order they were made. */
export async function listOutcomes(db: D1Database, companyId: string, engagementId: string): Promise<OutcomeRow[]> {
  const { results } = await db
    .prepare("SELECT id, at, user_id, kind, review_no, value, verdict, in_use, note FROM outcome_events WHERE company_id = ? AND engagement_id = ? ORDER BY id")
    .bind(companyId, engagementId)
    .all<DbRow>();
  return results.map((r) => ({ id: r.id, at: r.at, userId: r.user_id, kind: r.kind, reviewNo: r.review_no, value: r.value, verdict: r.verdict, inUse: r.in_use, note: r.note }));
}

export type RecordResult = { ok: true } | { ok: false; reason: "not_found" | "baseline_exists" | "baseline_too_late" | "baseline_closed" | "baseline_no_plan" | "review_exists" | "nothing_accepted" | "not_due" };

type Common = { companyId: string; userId: string; engagementId: string; value: number; note: string; at: Date };

/** The state of things before the work. Once, and only before anything is accepted (a trigger). */
export async function recordBaseline(db: D1Database, input: Common): Promise<RecordResult> {
  return append(db, input, { kind: "baseline", reviewNo: null, verdict: null, inUse: null });
}

/** A review of review number 1, 2 or 3. Once each, and only from the day it falls due (a trigger). */
export async function recordReview(db: D1Database, input: Common & { reviewNo: ReviewNo; verdict: Verdict; inUse: InUse }): Promise<RecordResult> {
  return append(db, input, { kind: "review", reviewNo: input.reviewNo, verdict: input.verdict, inUse: input.inUse });
}

async function append(db: D1Database, input: Common, shape: { kind: "baseline" | "review"; reviewNo: ReviewNo | null; verdict: Verdict | null; inUse: InUse | null }): Promise<RecordResult> {
  const { companyId, userId, engagementId, value, note, at } = input;
  const insert = db
    .prepare(
      `INSERT INTO outcome_events (engagement_id, company_id, at, user_id, kind, review_no, value, verdict, in_use, note)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM engagements WHERE id = ? AND company_id = ?)`,
    )
    .bind(engagementId, companyId, at.toISOString(), userId, shape.kind, shape.reviewNo, value, shape.verdict, shape.inUse, note, engagementId, companyId);
  const audit = auditIfChanged(db, `outcome.${shape.kind}`, { userId, companyId, detail: { engagement: engagementId, review: shape.reviewNo ?? 0 } });
  try {
    const [inserted] = await db.batch([insert, audit]);
    return inserted.meta.changes === 1 ? { ok: true } : { ok: false, reason: "not_found" };
  } catch (error) {
    const text = String(error);
    if (/baseline is recorded once/.test(text)) return { ok: false, reason: "baseline_exists" };
    if (/before anything is accepted/.test(text)) return { ok: false, reason: "baseline_too_late" };
    if (/not taken on a closed engagement/.test(text)) return { ok: false, reason: "baseline_closed" };
    if (/baseline needs an agreed plan/.test(text)) return { ok: false, reason: "baseline_no_plan" };
    if (/review is recorded once/.test(text)) return { ok: false, reason: "review_exists" };
    if (/needs an accepted milestone/.test(text)) return { ok: false, reason: "nothing_accepted" };
    if (/not due yet/.test(text)) return { ok: false, reason: "not_due" };
    throw error;
  }
}

// ---- corrections (BR-RUN-09): a new row that names the number it corrects. The number it corrects is never changed.

export type CorrectionRow = { id: number; outcomeId: number; at: string; userId: string; value: number; reason: string };
type CorrectionDbRow = { id: number; outcome_id: number; at: string; user_id: string; value: number; reason: string };

/** Every correction recorded for one engagement of the company, in the order they were made. */
export async function listCorrections(db: D1Database, companyId: string, engagementId: string): Promise<CorrectionRow[]> {
  const { results } = await db
    .prepare("SELECT id, outcome_id, at, user_id, value, reason FROM outcome_corrections WHERE company_id = ? AND engagement_id = ? ORDER BY id")
    .bind(companyId, engagementId)
    .all<CorrectionDbRow>();
  return results.map((r) => ({ id: r.id, outcomeId: r.outcome_id, at: r.at, userId: r.user_id, value: r.value, reason: r.reason }));
}

export type CorrectionResult = { ok: true } | { ok: false; reason: "not_found" };

/**
 * A correction of a baseline or a review: the number it should have been, and why. Written only when the row it names is a number recorded
 * for this engagement of this company (checked in the same statement, and by a trigger); otherwise nothing is written and the answer is
 * not_found, the same as for a row that does not exist.
 */
export async function recordCorrection(db: D1Database, input: { companyId: string; userId: string; engagementId: string; outcomeId: number; value: number; reason: string; at: Date }): Promise<CorrectionResult> {
  const { companyId, userId, engagementId, outcomeId, value, reason, at } = input;
  const insert = db
    .prepare(
      `INSERT INTO outcome_corrections (outcome_id, engagement_id, company_id, at, user_id, value, reason)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM outcome_events WHERE id = ? AND engagement_id = ? AND company_id = ?)`,
    )
    .bind(outcomeId, engagementId, companyId, at.toISOString(), userId, value, reason, outcomeId, engagementId, companyId);
  const audit = auditIfChanged(db, "outcome.corrected", { userId, companyId, detail: { engagement: engagementId, outcome: outcomeId } });
  const [inserted] = await db.batch([insert, audit]);
  return inserted.meta.changes === 1 ? { ok: true } : { ok: false, reason: "not_found" };
}
