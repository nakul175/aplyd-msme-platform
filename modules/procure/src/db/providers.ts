// The provider registry and the listing fee. Providers belong to no company; a platform operator enters them. Nothing here
// reads a company's record. The fee is one number for every provider (D-03): a listing copies it from the terms in force by a
// statement of its own, so no caller supplies a fee, and a trigger refuses a listing whose fee is not the one in force.
import { auditIfChanged } from "../../../platform/src/db/audit.ts";

export type Terms = { version: number; at: string; feeInr: number; note: string };
export type Service = { opportunityId: string; cluster: string };
export type ProviderRecord = { id: string; name: string; summary: string; createdAt: string; services: Service[]; listed: boolean; listedFeeInr: number | null; listedAt: string | null };
export type PublicProvider = { id: string; name: string; summary: string };

type TermsRow = { version: number; at: string; fee_inr: number; note: string };
const toTerms = (r: TermsRow): Terms => ({ version: r.version, at: r.at, feeInr: r.fee_inr, note: r.note });

/** The listing terms in force, or null while the fee is undecided (OQ-11). */
export async function currentTerms(db: D1Database): Promise<Terms | null> {
  const row = await db.prepare("SELECT version, at, fee_inr, note FROM listing_terms ORDER BY version DESC LIMIT 1").first<TermsRow>();
  return row ? toTerms(row) : null;
}

export async function listTermsHistory(db: D1Database): Promise<Terms[]> {
  const { results } = await db.prepare("SELECT version, at, fee_inr, note FROM listing_terms ORDER BY version DESC").all<TermsRow>();
  return results.map(toTerms);
}

/** Sets the fee in force: a new version, one number for every provider. Earlier versions and the listings made under them stay as they were. */
export async function setTerms(db: D1Database, input: { userId: string; feeInr: number; note: string }): Promise<Terms> {
  const { userId, feeInr, note } = input;
  const at = new Date().toISOString();
  const insert = db.prepare("INSERT INTO listing_terms (at, user_id, fee_inr, note) VALUES (?, ?, ?, ?)").bind(at, userId, feeInr, note);
  const audit = auditIfChanged(db, "listing_terms.set", { userId, companyId: null, detail: { feeInr } });
  await db.batch([insert, audit]);
  const terms = await currentTerms(db);
  if (!terms) throw new Error("the terms were not stored");
  return terms;
}

export type CreateProviderResult = { ok: true; id: string } | { ok: false; reason: "duplicate_service" };

/** Adds a provider and what it serves in one batch. It is not listed until the operator lists it. */
export async function createProvider(db: D1Database, input: { userId: string; name: string; summary: string; services: Service[] }): Promise<CreateProviderResult> {
  const { userId, name, summary, services } = input;
  const keys = new Set(services.map((s) => `${s.opportunityId}|${s.cluster}`));
  if (keys.size !== services.length) return { ok: false, reason: "duplicate_service" };
  const id = crypto.randomUUID();
  const statements = [
    db.prepare("INSERT INTO providers (id, name, summary, is_synthetic, created_at, created_by) VALUES (?, ?, ?, 1, ?, ?)").bind(id, name, summary, new Date().toISOString(), userId),
    ...services.map((s) => db.prepare("INSERT INTO provider_services (provider_id, opportunity_id, cluster) VALUES (?, ?, ?)").bind(id, s.opportunityId, s.cluster)),
    auditIfChanged(db, "provider.created", { userId, companyId: null, detail: { provider: id } }),
  ];
  await db.batch(statements);
  return { ok: true, id };
}

export type ListResult = { ok: true; feeInr: number } | { ok: false; reason: "not_found" | "fee_undecided" | "no_service" | "already_listed" };

/**
 * Lists a provider. The fee is read from the terms in force inside the statement itself: there is no parameter by which a
 * caller could give one provider a different fee. With no terms the statement inserts nothing.
 */
export async function listProvider(db: D1Database, input: { userId: string; providerId: string; note: string }): Promise<ListResult> {
  const { userId, providerId, note } = input;
  const insert = db
    .prepare(
      `INSERT INTO provider_events (provider_id, at, user_id, kind, terms_version, fee_inr, note)
       SELECT p.id, ?, ?, 'list', t.version, t.fee_inr, ?
         FROM providers p, listing_terms t
        WHERE p.id = ? AND t.version = (SELECT MAX(version) FROM listing_terms)`,
    )
    .bind(new Date().toISOString(), userId, note, providerId);
  const audit = auditIfChanged(db, "provider.listed", { userId, companyId: null, detail: { provider: providerId } });
  try {
    const [inserted] = await db.batch([insert, audit]);
    if (inserted.meta.changes === 1) {
      const terms = await currentTerms(db);
      return { ok: true, feeInr: terms!.feeInr };
    }
  } catch (error) {
    const text = String(error);
    if (/needs a service/.test(text)) return { ok: false, reason: "no_service" };
    if (/in turn/.test(text)) return { ok: false, reason: "already_listed" };
    throw error;
  }
  const provider = await db.prepare("SELECT 1 AS present FROM providers WHERE id = ?").bind(providerId).first();
  return provider ? { ok: false, reason: "fee_undecided" } : { ok: false, reason: "not_found" };
}

export type UnlistResult = { ok: true } | { ok: false; reason: "not_found" | "not_listed" };

export async function unlistProvider(db: D1Database, input: { userId: string; providerId: string; note: string }): Promise<UnlistResult> {
  const { userId, providerId, note } = input;
  const insert = db
    .prepare("INSERT INTO provider_events (provider_id, at, user_id, kind, note) SELECT id, ?, ?, 'unlist', ? FROM providers WHERE id = ?")
    .bind(new Date().toISOString(), userId, note, providerId);
  const audit = auditIfChanged(db, "provider.unlisted", { userId, companyId: null, detail: { provider: providerId } });
  try {
    const [inserted] = await db.batch([insert, audit]);
    return inserted.meta.changes === 1 ? { ok: true } : { ok: false, reason: "not_found" };
  } catch (error) {
    if (/in turn/.test(String(error))) return { ok: false, reason: "not_listed" };
    throw error;
  }
}

type ProviderRow = { id: string; name: string; summary: string; created_at: string; last_kind: string | null; fee_inr: number | null; listed_at: string | null };

/** Every provider, listed or not, with what it serves. For the operator. In name order. */
export async function listAllProviders(db: D1Database): Promise<ProviderRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.summary, p.created_at,
              (SELECT e.kind FROM provider_events e WHERE e.provider_id = p.id ORDER BY e.id DESC LIMIT 1) AS last_kind,
              (SELECT e.fee_inr FROM provider_events e WHERE e.provider_id = p.id AND e.kind = 'list' ORDER BY e.id DESC LIMIT 1) AS fee_inr,
              (SELECT e.at FROM provider_events e WHERE e.provider_id = p.id AND e.kind = 'list' ORDER BY e.id DESC LIMIT 1) AS listed_at
         FROM providers p ORDER BY p.name COLLATE NOCASE, p.id`,
    )
    .all<ProviderRow>();
  const { results: services } = await db.prepare("SELECT provider_id, opportunity_id, cluster FROM provider_services ORDER BY opportunity_id, cluster").all<{ provider_id: string; opportunity_id: string; cluster: string }>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    summary: r.summary,
    createdAt: r.created_at,
    services: services.filter((s) => s.provider_id === r.id).map((s) => ({ opportunityId: s.opportunity_id, cluster: s.cluster })),
    listed: r.last_kind === "list",
    listedFeeInr: r.last_kind === "list" ? r.fee_inr : null,
    listedAt: r.last_kind === "list" ? r.listed_at : null,
  }));
}

/**
 * The listed providers that serve this kind of requirement in this cluster, in name order. The order is the same for every
 * requester and does not depend on when a provider was listed, what it pays or anything else about it.
 */
export async function listedProvidersFor(db: D1Database, opportunityId: string, cluster: string): Promise<PublicProvider[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.summary FROM providers p
         JOIN provider_services s ON s.provider_id = p.id
        WHERE s.opportunity_id = ? AND s.cluster = ?
          AND (SELECT e.kind FROM provider_events e WHERE e.provider_id = p.id ORDER BY e.id DESC LIMIT 1) = 'list'
        ORDER BY p.name COLLATE NOCASE, p.id`,
    )
    .bind(opportunityId, cluster)
    .all<{ id: string; name: string; summary: string }>();
  return results;
}

/** Every listed provider, for any signed-in person. In name order. */
export async function listPublicProviders(db: D1Database): Promise<(PublicProvider & { services: Service[] })[]> {
  const all = await listAllProviders(db);
  return all.filter((p) => p.listed).map((p) => ({ id: p.id, name: p.name, summary: p.summary, services: p.services }));
}
