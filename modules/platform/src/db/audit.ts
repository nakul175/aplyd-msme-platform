/**
 * An audit insert for a D1 batch, written only when the statement before it in the same batch changed a row (SQLite's
 * changes()). Used to make a record and its audit entry succeed or fail together.
 */
export function auditIfChanged(
  db: D1Database,
  event: string,
  fields: { userId?: string | null; companyId?: string | null; detail?: Record<string, string | number | boolean> } = {},
): D1PreparedStatement {
  return db
    .prepare("INSERT INTO audit_events (at, event, user_id, company_id, detail) SELECT ?, ?, ?, ?, ? WHERE changes() > 0")
    .bind(new Date().toISOString(), event, fields.userId ?? null, fields.companyId ?? null, JSON.stringify(fields.detail ?? {}));
}

export async function recordAudit(
  db: D1Database,
  event: string,
  fields: { userId?: string | null; companyId?: string | null; detail?: Record<string, string | number | boolean> } = {},
): Promise<void> {
  await db
    .prepare("INSERT INTO audit_events (at, event, user_id, company_id, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(new Date().toISOString(), event, fields.userId ?? null, fields.companyId ?? null, JSON.stringify(fields.detail ?? {}))
    .run();
}
