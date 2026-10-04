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
