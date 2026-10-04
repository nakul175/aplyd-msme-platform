import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // 1 for every company until real data is allowed (open questions OQ-07 and OQ-09). Shown as SYNTHETIC in the interface.
  isSynthetic: integer("is_synthetic").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  // Null for a platform operator, who belongs to no company and therefore reads none.
  companyId: text("company_id").references(() => companies.id),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(), // owner | operator
  isSynthetic: integer("is_synthetic").notNull().default(1),
});

// Append-only. A trigger (drizzle/0001_audit_append_only.sql) refuses UPDATE and DELETE.
export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: text("at").notNull(),
  event: text("event").notNull(),
  userId: text("user_id"),
  companyId: text("company_id"),
  // Short JSON text. Never personal data, secrets or the contents of a record.
  detail: text("detail").notNull().default("{}"),
});
