// Reads and appends factory revisions. Every function takes the company id from the caller's identity, never from a URL,
// and every query on factory_revisions is bound to it (a static test checks that). Nothing here edits or deletes a row.
import { auditIfChanged } from "../../../platform/src/db/audit.ts";
import type { Answers } from "../questionnaire.ts";

export type Revision = {
  revision: number;
  createdAt: string;
  createdBy: string;
  confirmed: boolean;
  questionnaireVersion: number;
  answers: Answers;
  note: string;
};
export type HistoryEntry = Omit<Revision, "answers">;

type Row = { revision_no: number; created_at: string; created_by: string; confirmed: number; questionnaire_version: number; answers: string; note: string };

const toRevision = (r: Row): Revision => ({
  revision: r.revision_no,
  createdAt: r.created_at,
  createdBy: r.created_by,
  confirmed: r.confirmed === 1,
  questionnaireVersion: r.questionnaire_version,
  answers: JSON.parse(r.answers) as Answers,
  note: r.note,
});

const COLUMNS = "revision_no, created_at, created_by, confirmed, questionnaire_version, answers, note";

export async function loadLatest(db: D1Database, companyId: string, which: "any" | "confirmed" = "any"): Promise<Revision | null> {
  const sql = `SELECT ${COLUMNS} FROM factory_revisions WHERE company_id = ?${which === "confirmed" ? " AND confirmed = 1" : ""} ORDER BY revision_no DESC LIMIT 1`;
  const row = await db.prepare(sql).bind(companyId).first<Row>();
  return row ? toRevision(row) : null;
}

export async function loadRevision(db: D1Database, companyId: string, revisionNo: number): Promise<Revision | null> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM factory_revisions WHERE company_id = ? AND revision_no = ?`).bind(companyId, revisionNo).first<Row>();
  return row ? toRevision(row) : null;
}

/** The most revisions a company may save. The same number is in migration 0014 (a test checks they agree). An assumption, not a measured figure. */
export const MAX_REVISIONS_PER_COMPANY = 500;
/** How many of the newest revisions the history lists. Older ones are still stored and still opened by number. */
export const HISTORY_LIMIT = 100;

export async function loadHistory(db: D1Database, companyId: string, limit: number = HISTORY_LIMIT): Promise<HistoryEntry[]> {
  const { results } = await db
    .prepare("SELECT revision_no, created_at, created_by, confirmed, questionnaire_version, note FROM factory_revisions WHERE company_id = ? ORDER BY revision_no DESC LIMIT ?")
    .bind(companyId, limit)
    .all<Omit<Row, "answers">>();
  return results.map((r) => ({ revision: r.revision_no, createdAt: r.created_at, createdBy: r.created_by, confirmed: r.confirmed === 1, questionnaireVersion: r.questionnaire_version, note: r.note }));
}

export async function latestRevisionNo(db: D1Database, companyId: string): Promise<number> {
  const row = await db.prepare("SELECT COALESCE(MAX(revision_no), 0) AS n FROM factory_revisions WHERE company_id = ?").bind(companyId).first<{ n: number }>();
  return row?.n ?? 0;
}

export type AppendResult = { ok: true; revision: number } | { ok: false; reason: "stale"; latest: number } | { ok: false; reason: "too_many" };

/**
 * Appends revision basedOn + 1, only if basedOn is still the latest revision number for the company. The check and the
 * insert are one statement, so two saves from the same starting point cannot both succeed: the second gets "stale" and
 * must start again from what is there. The audit entry is written in the same batch and only when the insert happened.
 */
export async function appendRevision(
  db: D1Database,
  input: { companyId: string; userId: string; basedOn: number; answers: Answers; note: string; confirmed: boolean; questionnaireVersion: number },
): Promise<AppendResult> {
  const { companyId, userId, basedOn, confirmed } = input;
  const insert = db
    .prepare(
      `INSERT INTO factory_revisions (company_id, revision_no, created_at, created_by, confirmed, questionnaire_version, answers, note)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COALESCE(MAX(revision_no), 0) FROM factory_revisions WHERE company_id = ?) = ?`,
    )
    .bind(companyId, basedOn + 1, new Date().toISOString(), userId, confirmed ? 1 : 0, input.questionnaireVersion, JSON.stringify(input.answers), input.note, companyId, basedOn);
  const audit = auditIfChanged(db, "factory.revision.created", { userId, companyId, detail: { revision: basedOn + 1, confirmed } });
  try {
    const [inserted] = await db.batch([insert, audit]);
    if (inserted.meta.changes === 1) return { ok: true, revision: basedOn + 1 };
  } catch (error) {
    const text = String(error);
    if (/the most revisions it may have/.test(text)) return { ok: false, reason: "too_many" };
    // Only a second save that raced this one and lost on the (company, revision) key is the stale case. Any other refusal is a fault and is not
    // reported to the owner as "someone saved a newer version".
    if (!/UNIQUE constraint failed: factory_revisions\.company_id, factory_revisions\.revision_no|factory_revisions is append-only/.test(text)) throw error;
  }
  return { ok: false, reason: "stale", latest: await latestRevisionNo(db, companyId) };
}
