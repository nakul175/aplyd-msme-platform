import type { Identity } from "../identity/scope.ts";

export type CompanyRecord = { id: string; name: string; synthetic: boolean; createdAt: string };

/** The one place a company record is read. Always bound to the signed-in person's own company. */
export async function loadOwnCompany(db: D1Database, identity: Identity): Promise<CompanyRecord | null> {
  if (identity.companyId === null) return null;
  const row = await db
    .prepare("SELECT id, name, is_synthetic, created_at FROM companies WHERE id = ?")
    .bind(identity.companyId)
    .first<{ id: string; name: string; is_synthetic: number; created_at: string }>();
  return row ? { id: row.id, name: row.name, synthetic: row.is_synthetic === 1, createdAt: row.created_at } : null;
}
