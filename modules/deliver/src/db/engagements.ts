// Reads and appends a company's engagements: the provider the owner chose for a requirement, the milestones of the plan, and
// the events on them. Every function takes the company id from the caller's identity, never from a URL, and every query is
// bound to it (a static test checks that). Nothing here edits or deletes a row, and nothing here moves money: an amount is a
// number the owner typed in.
import { auditIfChanged } from "../../../platform/src/db/audit.ts";
import type { EventKind, MilestoneKind } from "../state.ts";

export type MilestoneRecord = { id: string; seq: number; title: string; acceptanceTest: string; dueOn: string; agreedInr: number; createdAt: string };
export type EventRow = { id: number; at: string; userId: string; kind: EventKind; milestoneId: string | null; amountInr: number | null; note: string };
export type EngagementRecord = {
  id: string;
  requirementId: string;
  providerId: string;
  providerName: string;
  providerSummary: string;
  opportunityId: string;
  cluster: string;
  title: string;
  createdAt: string;
  milestones: MilestoneRecord[];
  events: EventRow[];
};

type EngagementRow = { id: string; requirement_id: string; provider_id: string; created_at: string; provider_name: string; provider_summary: string; opportunity_id: string; cluster: string; spec: string };
type MilestoneRow = { id: string; engagement_id: string; seq: number; title: string; acceptance_test: string; due_on: string; agreed_inr: number; created_at: string };
type EventDbRow = { id: number; engagement_id: string; at: string; user_id: string; kind: EventKind; milestone_id: string | null; amount_inr: number | null; note: string };

const toMilestone = (r: MilestoneRow): MilestoneRecord => ({ id: r.id, seq: r.seq, title: r.title, acceptanceTest: r.acceptance_test, dueOn: r.due_on, agreedInr: r.agreed_inr, createdAt: r.created_at });
const toEvent = (r: EventDbRow): EventRow => ({ id: r.id, at: r.at, userId: r.user_id, kind: r.kind, milestoneId: r.milestone_id, amountInr: r.amount_inr, note: r.note });

const SELECT_ENGAGEMENTS = `SELECT g.id, g.requirement_id, g.provider_id, g.created_at, p.name AS provider_name, p.summary AS provider_summary, r.opportunity_id, r.cluster, r.spec
         FROM engagements g
         JOIN providers p ON p.id = g.provider_id
         JOIN requirements r ON r.id = g.requirement_id AND r.company_id = g.company_id`;

async function assemble(db: D1Database, companyId: string, rows: EngagementRow[]): Promise<EngagementRecord[]> {
  if (rows.length === 0) return [];
  const [milestones, events] = await Promise.all([
    db.prepare("SELECT id, engagement_id, seq, title, acceptance_test, due_on, agreed_inr, created_at FROM milestones WHERE company_id = ? ORDER BY engagement_id, seq").bind(companyId).all<MilestoneRow>(),
    db.prepare("SELECT id, engagement_id, at, user_id, kind, milestone_id, amount_inr, note FROM engagement_events WHERE company_id = ? ORDER BY id").bind(companyId).all<EventDbRow>(),
  ]);
  return rows.map((r) => ({
    id: r.id,
    requirementId: r.requirement_id,
    providerId: r.provider_id,
    providerName: r.provider_name,
    providerSummary: r.provider_summary,
    opportunityId: r.opportunity_id,
    cluster: r.cluster,
    title: (JSON.parse(r.spec) as { title: string }).title,
    createdAt: r.created_at,
    milestones: milestones.results.filter((m) => m.engagement_id === r.id).map(toMilestone),
    events: events.results.filter((e) => e.engagement_id === r.id).map(toEvent),
  }));
}

/** The company's engagements, newest first, each with its plan and every event on it. */
export async function listEngagements(db: D1Database, companyId: string): Promise<EngagementRecord[]> {
  const { results } = await db.prepare(`${SELECT_ENGAGEMENTS} WHERE g.company_id = ? ORDER BY g.created_at DESC, g.id`).bind(companyId).all<EngagementRow>();
  return assemble(db, companyId, results);
}

/** One engagement of the company, or null. An id that is another company's is null, the same as one that does not exist. */
export async function loadEngagement(db: D1Database, companyId: string, engagementId: string): Promise<EngagementRecord | null> {
  if (engagementId.length === 0 || engagementId.length > 64) return null;
  const { results } = await db.prepare(`${SELECT_ENGAGEMENTS} WHERE g.company_id = ? AND g.id = ?`).bind(companyId, engagementId).all<EngagementRow>();
  return (await assemble(db, companyId, results))[0] ?? null;
}

export type CreateResult = { ok: true; id: string; created: boolean } | { ok: false; reason: "not_found" | "requirement_withdrawn" | "provider_unavailable" | "already_engaged" };

/**
 * Records the owner's choice of a provider for a requirement of theirs. One engagement per requirement: choosing again the same
 * provider returns the one already there; another provider is refused. The database refuses a withdrawn requirement and a
 * provider that is not listed for that idea and cluster. There is no fee anywhere in this statement: the choice is not priced.
 */
export async function createEngagement(db: D1Database, input: { companyId: string; userId: string; requirementId: string; providerId: string }): Promise<CreateResult> {
  const { companyId, userId, requirementId, providerId } = input;
  const id = crypto.randomUUID();
  const insert = db
    .prepare(
      `INSERT INTO engagements (id, company_id, requirement_id, provider_id, created_at, created_by)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM requirements WHERE id = ? AND company_id = ?)
         AND NOT EXISTS (SELECT 1 FROM engagements WHERE requirement_id = ? AND company_id = ?)`,
    )
    .bind(id, companyId, requirementId, providerId, new Date().toISOString(), userId, requirementId, companyId, requirementId, companyId);
  const audit = auditIfChanged(db, "engagement.created", { userId, companyId, detail: { engagement: id, requirement: requirementId, provider: providerId } });
  let created = false;
  try {
    const [inserted] = await db.batch([insert, audit]);
    created = inserted.meta.changes === 1;
  } catch (error) {
    const text = String(error);
    if (/needs an open requirement/.test(text)) return { ok: false, reason: "requirement_withdrawn" };
    if (/needs a listed provider/.test(text)) return { ok: false, reason: "provider_unavailable" };
    throw error;
  }
  if (created) return { ok: true, id, created: true };
  const existing = await db.prepare("SELECT id, provider_id FROM engagements WHERE requirement_id = ? AND company_id = ?").bind(requirementId, companyId).first<{ id: string; provider_id: string }>();
  if (!existing) return { ok: false, reason: "not_found" };
  return existing.provider_id === providerId ? { ok: true, id: existing.id, created: false } : { ok: false, reason: "already_engaged" };
}

export type MilestoneInput = { title: string; acceptanceTest: string; dueOn: string; agreedInr: number };
export type AddMilestoneResult = { ok: true; id: string; seq: number } | { ok: false; reason: "not_found" | "plan_locked" | "too_many" };

/** Adds the next milestone to a plan that is not yet agreed. The number is worked out in the statement itself. */
export async function addMilestone(db: D1Database, input: { companyId: string; userId: string; engagementId: string } & MilestoneInput): Promise<AddMilestoneResult> {
  const { companyId, userId, engagementId, title, acceptanceTest, dueOn, agreedInr } = input;
  const id = crypto.randomUUID();
  const insert = db
    .prepare(
      `INSERT INTO milestones (id, engagement_id, company_id, seq, title, acceptance_test, due_on, agreed_inr, created_at, created_by)
       SELECT ?, ?, ?, COALESCE((SELECT MAX(seq) FROM milestones WHERE engagement_id = ? AND company_id = ?), 0) + 1, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM engagements WHERE id = ? AND company_id = ?)`,
    )
    .bind(id, engagementId, companyId, engagementId, companyId, title, acceptanceTest, dueOn, agreedInr, new Date().toISOString(), userId, engagementId, companyId);
  const audit = auditIfChanged(db, "milestone.added", { userId, companyId, detail: { engagement: engagementId, milestone: id } });
  try {
    const [inserted] = await db.batch([insert, audit]);
    if (inserted.meta.changes !== 1) return { ok: false, reason: "not_found" };
  } catch (error) {
    const text = String(error);
    if (/cannot be added/.test(text)) return { ok: false, reason: "plan_locked" };
    if (/too many milestones/.test(text)) return { ok: false, reason: "too_many" };
    throw error;
  }
  const row = await db.prepare("SELECT seq FROM milestones WHERE id = ? AND company_id = ?").bind(id, companyId).first<{ seq: number }>();
  return { ok: true, id, seq: row?.seq ?? 0 };
}

export type EventResult = { ok: true } | { ok: false; reason: "not_found" | "closed" | "already_agreed" | "no_milestones" | "not_agreed" | "wrong_state" | "too_many_deliveries" };

/**
 * Appends one event to an engagement. For a milestone event the milestone must be this engagement's, in this company: otherwise
 * the statement inserts nothing. The order things may happen in is the database's (see the triggers), and a refusal is named.
 */
export async function appendEvent(
  db: D1Database,
  input: { companyId: string; userId: string; engagementId: string; kind: EventKind; milestoneId: string | null; amountInr: number | null; note: string },
): Promise<EventResult> {
  const { companyId, userId, engagementId, kind, milestoneId, amountInr, note } = input;
  const insert = db
    .prepare(
      `INSERT INTO engagement_events (engagement_id, company_id, at, user_id, kind, milestone_id, amount_inr, note)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM engagements WHERE id = ? AND company_id = ?)
         AND (? IS NULL OR EXISTS (SELECT 1 FROM milestones WHERE id = ? AND engagement_id = ? AND company_id = ?))`,
    )
    .bind(engagementId, companyId, new Date().toISOString(), userId, kind, milestoneId, amountInr, note, engagementId, companyId, milestoneId, milestoneId, engagementId, companyId);
  const audit = auditIfChanged(db, `engagement.${kind}`, { userId, companyId, detail: { engagement: engagementId, milestone: milestoneId ?? "" } });
  try {
    const [inserted] = await db.batch([insert, audit]);
    return inserted.meta.changes === 1 ? { ok: true } : { ok: false, reason: "not_found" };
  } catch (error) {
    const text = String(error);
    if (/engagement is (already )?closed/.test(text)) return { ok: false, reason: "closed" };
    if (/plan is already agreed/.test(text)) return { ok: false, reason: "already_agreed" };
    if (/at least one milestone/.test(text)) return { ok: false, reason: "no_milestones" };
    if (/plan is not agreed yet/.test(text)) return { ok: false, reason: "not_agreed" };
    if (/delivered once|only a delivered|recorded once/.test(text)) return { ok: false, reason: "wrong_state" };
    if (/too many deliveries/.test(text)) return { ok: false, reason: "too_many_deliveries" };
    throw error;
  }
}

export type { MilestoneKind };
