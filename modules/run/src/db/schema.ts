import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { engagements } from "../../../deliver/src/db/schema.ts";
import { companies, users } from "../../../platform/src/db/schema.ts";

// The owner's own measurements of what an engagement did for the factory, kept as events and never changed: one baseline taken
// before anything was accepted, and up to three reviews at 30, 90 and 180 days after the first acceptance. Triggers
// (drizzle/0013_run_guards.sql) refuse UPDATE, DELETE and any INSERT that would replace a row, and enforce the order and the
// dates. Nothing here measures anything: the owner types a whole number in the unit the assessment named for the idea, and says
// whether it did what the assessment expected and whether it is still in use. Providers do not sign in (OQ-13).
export const outcomeEvents = sqliteTable(
  "outcome_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    engagementId: text("engagement_id").notNull(),
    companyId: text("company_id").notNull().references(() => companies.id),
    at: text("at").notNull(),
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    reviewNo: integer("review_no"),
    value: integer("value").notNull(),
    verdict: text("verdict"),
    inUse: text("in_use"),
    note: text("note").notNull().default(""),
  },
  (t) => [
    index("outcome_events_engagement").on(t.engagementId),
    uniqueIndex("outcome_events_one_baseline").on(t.engagementId).where(sql`${t.kind} = 'baseline'`),
    uniqueIndex("outcome_events_one_review").on(t.engagementId, t.reviewNo).where(sql`${t.kind} = 'review'`),
    foreignKey({ name: "outcome_events_engagement_fk", columns: [t.engagementId, t.companyId], foreignColumns: [engagements.id, engagements.companyId] }),
    check("outcome_events_value", sql`${t.value} BETWEEN 0 AND 1000000000`),
    check("outcome_events_note", sql`length(${t.note}) <= 500`),
    // Every column a kind needs is named as NOT NULL as well as in range: a CHECK that is NULL passes, so a bare BETWEEN or IN would
    // let a review with no number, no verdict or no answer on use into the table.
    check(
      "outcome_events_shape",
      sql`(${t.kind} = 'baseline' AND ${t.reviewNo} IS NULL AND ${t.verdict} IS NULL AND ${t.inUse} IS NULL)
       OR (${t.kind} = 'review' AND ${t.reviewNo} IS NOT NULL AND ${t.reviewNo} BETWEEN 1 AND 3 AND ${t.verdict} IS NOT NULL AND ${t.verdict} IN ('met', 'partly', 'not_met') AND ${t.inUse} IS NOT NULL AND ${t.inUse} IN ('yes', 'no'))`,
    ),
  ],
);
