// Reads and appends a company's requirements and the withdrawals of them. Every function takes the company id from the
// caller's identity, never from a URL, and every query is bound to it (a static test checks that). Nothing here edits or deletes
// a row. The one read that spans companies is in pool.ts and returns counts only.
import { auditIfChanged } from "../../../platform/src/db/audit.ts";

export type Spec = {
  title: string;
  summary: string;
  kind: "ai" | "non_ai";
  addresses: string[];
  costs: { oneTime: { low: number; high: number }; recurringPerYear: { low: number; high: number }; hidden: string[] };
  source: string;
  libraryVersion: number;
};
export type RequirementRecord = { id: string; assessmentId: string; opportunityId: string; cluster: string; spec: Spec; createdAt: string; createdBy: string; withdrawnAt: string | null };

type Row = { id: string; assessment_id: string; opportunity_id: string; cluster: string; spec: string; created_at: string; created_by: string; withdrawn_at: string | null };
const toRecord = (r: Row): RequirementRecord => ({ id: r.id, assessmentId: r.assessment_id, opportunityId: r.opportunity_id, cluster: r.cluster, spec: JSON.parse(r.spec) as Spec, createdAt: r.created_at, createdBy: r.created_by, withdrawnAt: r.withdrawn_at });

/** The company's requirements, newest first, with the time of the withdrawal if there was one. */
export async function listRequirements(db: D1Database, companyId: string): Promise<RequirementRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.assessment_id, r.opportunity_id, r.cluster, r.spec, r.created_at, r.created_by,
              (SELECT e.at FROM requirement_events e WHERE e.requirement_id = r.id AND e.company_id = r.company_id AND e.kind = 'withdraw') AS withdrawn_at
         FROM requirements r WHERE r.company_id = ? ORDER BY r.created_at DESC, r.id`,
    )
    .bind(companyId)
    .all<Row>();
  return results.map(toRecord);
}

export type CreateResult = { ok: true; id: string; created: boolean } | { ok: false; reason: "not_signed_off" | "not_accepted" | "not_found" };

/**
 * Stores a requirement for (company, assessment, item), unless one exists, in which case that one is returned. The database
 * refuses it unless the assessment is signed off and the owner's standing decision on the item is "accept". The audit entry is
 * written in the same batch and only when a row was added.
 */
export async function createRequirement(
  db: D1Database,
  input: { companyId: string; userId: string; assessmentId: string; opportunityId: string; cluster: string; spec: Spec },
): Promise<CreateResult> {
  const { companyId, userId, assessmentId, opportunityId, cluster, spec } = input;
  const id = crypto.randomUUID();
  const insert = db
    .prepare(
      `INSERT INTO requirements (id, company_id, assessment_id, opportunity_id, cluster, spec, created_at, created_by)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM requirements WHERE company_id = ? AND assessment_id = ? AND opportunity_id = ?)`,
    )
    .bind(id, companyId, assessmentId, opportunityId, cluster, JSON.stringify(spec), new Date().toISOString(), userId, companyId, assessmentId, opportunityId);
  const audit = auditIfChanged(db, "requirement.created", { userId, companyId, detail: { requirement: id, opportunity: opportunityId, cluster } });
  let created = false;
  try {
    const [inserted] = await db.batch([insert, audit]);
    created = inserted.meta.changes === 1;
  } catch (error) {
    const text = String(error);
    if (/needs a signed-off assessment/.test(text)) return { ok: false, reason: "not_signed_off" };
    if (/needs an accepted item/.test(text)) return { ok: false, reason: "not_accepted" };
    if (/FOREIGN KEY/.test(text)) return { ok: false, reason: "not_found" };
    throw error;
  }
  if (created) return { ok: true, id, created: true };
  const existing = await db
    .prepare("SELECT id FROM requirements WHERE company_id = ? AND assessment_id = ? AND opportunity_id = ?")
    .bind(companyId, assessmentId, opportunityId)
    .first<{ id: string }>();
  if (!existing) throw new Error("a requirement was neither added nor found");
  return { ok: true, id: existing.id, created: false };
}

export type WithdrawResult = { ok: true } | { ok: false; reason: "not_found" | "already_withdrawn" };

/** Appends the withdrawal. A second one changes nothing. The requirement stays, marked as withdrawn, and leaves its pool. */
export async function withdrawRequirement(db: D1Database, input: { companyId: string; userId: string; requirementId: string; note: string }): Promise<WithdrawResult> {
  const { companyId, userId, requirementId, note } = input;
  const insert = db
    .prepare(
      `INSERT INTO requirement_events (requirement_id, company_id, at, user_id, kind, note)
       SELECT ?, ?, ?, ?, 'withdraw', ?
       WHERE EXISTS (SELECT 1 FROM requirements WHERE id = ? AND company_id = ?)
         AND NOT EXISTS (SELECT 1 FROM requirement_events WHERE requirement_id = ? AND company_id = ?)`,
    )
    .bind(requirementId, companyId, new Date().toISOString(), userId, note, requirementId, companyId, requirementId, companyId);
  const audit = auditIfChanged(db, "requirement.withdrawn", { userId, companyId, detail: { requirement: requirementId } });
  const [inserted] = await db.batch([insert, audit]);
  if (inserted.meta.changes === 1) return { ok: true };
  const exists = await db.prepare("SELECT 1 AS present FROM requirements WHERE id = ? AND company_id = ?").bind(requirementId, companyId).first();
  return exists ? { ok: false, reason: "already_withdrawn" } : { ok: false, reason: "not_found" };
}
