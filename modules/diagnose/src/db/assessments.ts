// Reads and appends assessments and the events on them. Every function takes the company id from the caller's identity, never
// from a URL, and every query is bound to it (a static test checks that). Nothing here edits or deletes a row.
import { auditIfChanged } from "../../../platform/src/db/audit.ts";
import type { Result } from "../engine.ts";

export type EventRow = { id: number; at: string; userId: string; kind: "decision" | "signoff"; opportunityId: string | null; decision: "accept" | "defer" | "reject" | null; note: string; digest: string | null };
export type AssessmentRecord = { id: string; factoryRevisionNo: number; libraryVersion: number; engineVersion: number; createdAt: string; createdBy: string; result: Result; events: EventRow[] };
export type AssessmentSummary = { id: string; factoryRevisionNo: number; libraryVersion: number; engineVersion: number; createdAt: string; items: number; decided: number; signedOffAt: string | null };

type AssessmentRow = { id: string; factory_revision_no: number; library_version: number; engine_version: number; created_at: string; created_by: string; result: string };
type EventDbRow = { id: number; at: string; user_id: string; kind: "decision" | "signoff"; opportunity_id: string | null; decision: "accept" | "defer" | "reject" | null; note: string; digest: string | null };

const toEvent = (r: EventDbRow): EventRow => ({ id: r.id, at: r.at, userId: r.user_id, kind: r.kind, opportunityId: r.opportunity_id, decision: r.decision, note: r.note, digest: r.digest });

export async function listAssessments(db: D1Database, companyId: string): Promise<AssessmentSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.factory_revision_no, a.library_version, a.engine_version, a.created_at,
              json_array_length(a.result, '$.items') AS items,
              (SELECT COUNT(DISTINCT e.opportunity_id) FROM assessment_events e WHERE e.assessment_id = a.id AND e.company_id = a.company_id AND e.kind = 'decision') AS decided,
              (SELECT MIN(e.at) FROM assessment_events e WHERE e.assessment_id = a.id AND e.company_id = a.company_id AND e.kind = 'signoff') AS signed_off_at
         FROM assessments a WHERE a.company_id = ? ORDER BY a.created_at DESC, a.id`,
    )
    .bind(companyId)
    .all<{ id: string; factory_revision_no: number; library_version: number; engine_version: number; created_at: string; items: number; decided: number; signed_off_at: string | null }>();
  return results.map((r) => ({ id: r.id, factoryRevisionNo: r.factory_revision_no, libraryVersion: r.library_version, engineVersion: r.engine_version, createdAt: r.created_at, items: r.items, decided: r.decided, signedOffAt: r.signed_off_at }));
}

export async function loadAssessment(db: D1Database, companyId: string, assessmentId: string): Promise<AssessmentRecord | null> {
  if (assessmentId.length === 0 || assessmentId.length > 64) return null;
  const row = await db
    .prepare("SELECT id, factory_revision_no, library_version, engine_version, created_at, created_by, result FROM assessments WHERE id = ? AND company_id = ?")
    .bind(assessmentId, companyId)
    .first<AssessmentRow>();
  if (!row) return null;
  const { results } = await db
    .prepare("SELECT id, at, user_id, kind, opportunity_id, decision, note, digest FROM assessment_events WHERE assessment_id = ? AND company_id = ? ORDER BY id")
    .bind(assessmentId, companyId)
    .all<EventDbRow>();
  return { id: row.id, factoryRevisionNo: row.factory_revision_no, libraryVersion: row.library_version, engineVersion: row.engine_version, createdAt: row.created_at, createdBy: row.created_by, result: JSON.parse(row.result) as Result, events: results.map(toEvent) };
}

export async function loadLatestAssessmentId(db: D1Database, companyId: string): Promise<string | null> {
  const row = await db.prepare("SELECT id FROM assessments WHERE company_id = ? ORDER BY created_at DESC, id LIMIT 1").bind(companyId).first<{ id: string }>();
  return row?.id ?? null;
}

export type CreateResult = { ok: true; id: string; created: boolean } | { ok: false; reason: "no_confirmed_description" };

/**
 * Stores an assessment for (company, description version, library version, engine version), unless one already exists, in
 * which case that one is returned. The audit entry is written in the same batch and only when a row was added.
 */
export async function createAssessment(
  db: D1Database,
  input: { companyId: string; userId: string; factoryRevisionNo: number; result: Result },
): Promise<CreateResult> {
  const { companyId, userId, factoryRevisionNo, result } = input;
  const id = crypto.randomUUID();
  const insert = db
    .prepare(
      `INSERT INTO assessments (id, company_id, factory_revision_no, library_version, engine_version, created_at, created_by, result)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM assessments WHERE company_id = ? AND factory_revision_no = ? AND library_version = ? AND engine_version = ?)`,
    )
    .bind(id, companyId, factoryRevisionNo, result.libraryVersion, result.engineVersion, new Date().toISOString(), userId, JSON.stringify(result), companyId, factoryRevisionNo, result.libraryVersion, result.engineVersion);
  const audit = auditIfChanged(db, "assessment.created", { userId, companyId, detail: { assessment: id, revision: factoryRevisionNo } });
  let created = false;
  try {
    const [inserted] = await db.batch([insert, audit]);
    created = inserted.meta.changes === 1;
  } catch (error) {
    if (/needs a confirmed description/.test(String(error))) return { ok: false, reason: "no_confirmed_description" };
    throw error;
  }
  if (created) return { ok: true, id, created: true };
  const existing = await db
    .prepare("SELECT id FROM assessments WHERE company_id = ? AND factory_revision_no = ? AND library_version = ? AND engine_version = ?")
    .bind(companyId, factoryRevisionNo, result.libraryVersion, result.engineVersion)
    .first<{ id: string }>();
  if (!existing) throw new Error("an assessment was neither added nor found");
  return { ok: true, id: existing.id, created: false };
}

/** The most decisions one assessment can hold. The same number is in migration 0007 (a test keeps them equal): every decision is permanent. */
export const MAX_DECISIONS = 200;

export type DecisionResult = { ok: true } | { ok: false; reason: "not_found" | "unknown_item" | "signed_off" | "too_many" };

export async function appendDecision(
  db: D1Database,
  input: { companyId: string; userId: string; assessmentId: string; opportunityId: string; decision: "accept" | "defer" | "reject"; note: string },
): Promise<DecisionResult> {
  const { companyId, userId, assessmentId, opportunityId, decision, note } = input;
  const insert = db
    .prepare(
      `INSERT INTO assessment_events (assessment_id, company_id, at, user_id, kind, opportunity_id, decision, note)
       SELECT ?, ?, ?, ?, 'decision', ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM assessments WHERE id = ? AND company_id = ?)`,
    )
    .bind(assessmentId, companyId, new Date().toISOString(), userId, opportunityId, decision, note, assessmentId, companyId);
  const audit = auditIfChanged(db, "assessment.decision", { userId, companyId, detail: { assessment: assessmentId, opportunity: opportunityId, decision } });
  try {
    const [inserted] = await db.batch([insert, audit]);
    return inserted.meta.changes === 1 ? { ok: true } : { ok: false, reason: "not_found" };
  } catch (error) {
    const text = String(error);
    if (/signed off/.test(text)) return { ok: false, reason: "signed_off" };
    if (/must name an item/.test(text)) return { ok: false, reason: "unknown_item" };
    if (/too many decisions/.test(text)) return { ok: false, reason: "too_many" };
    throw error;
  }
}

export type SignOffResult = { ok: true } | { ok: false; reason: "not_found" | "undecided" | "already_signed_off" | "changed" | "no_items" };

/**
 * Appends the sign-off. `decisionCount` is the number of decision events the digest was computed over; if another decision
 * landed since, the statement changes nothing and the answer is "changed", so a sign-off never covers more than was read.
 */
export async function appendSignOff(
  db: D1Database,
  input: { companyId: string; userId: string; assessmentId: string; note: string; digest: string; decisionCount: number },
): Promise<SignOffResult> {
  const { companyId, userId, assessmentId, note, digest, decisionCount } = input;
  const insert = db
    .prepare(
      `INSERT INTO assessment_events (assessment_id, company_id, at, user_id, kind, note, digest)
       SELECT ?, ?, ?, ?, 'signoff', ?, ?
       WHERE EXISTS (SELECT 1 FROM assessments WHERE id = ? AND company_id = ?)
         AND (SELECT COUNT(*) FROM assessment_events WHERE assessment_id = ? AND company_id = ? AND kind = 'decision') = ?`,
    )
    .bind(assessmentId, companyId, new Date().toISOString(), userId, note, digest, assessmentId, companyId, assessmentId, companyId, decisionCount);
  const audit = auditIfChanged(db, "assessment.signed_off", { userId, companyId, detail: { assessment: assessmentId } });
  try {
    const [inserted] = await db.batch([insert, audit]);
    if (inserted.meta.changes === 1) return { ok: true };
  } catch (error) {
    const text = String(error);
    if (/every item needs a decision/.test(text)) return { ok: false, reason: "undecided" };
    if (/no items cannot be signed off/.test(text)) return { ok: false, reason: "no_items" };
    if (/already signed off|UNIQUE/.test(text)) return { ok: false, reason: "already_signed_off" };
    throw error;
  }
  const exists = await db.prepare("SELECT 1 AS present FROM assessments WHERE id = ? AND company_id = ?").bind(assessmentId, companyId).first();
  return exists ? { ok: false, reason: "changed" } : { ok: false, reason: "not_found" };
}
