import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { providers, requirements } from "../../../procure/src/db/schema.ts";
import { companies, users } from "../../../platform/src/db/schema.ts";

// Every table here is append-only: triggers (drizzle/0011_deliver_guards.sql) refuse UPDATE, DELETE and any INSERT that would
// replace a row, and enforce the order things may happen in. What changes over time is recorded as events.
//
// Nothing here moves money. The two amounts (`milestones.agreed_inr` and `engagement_events.amount_inr`) are what the owner and
// the provider agreed between themselves and what the owner says was paid; APLYD takes nothing from either (D-03), and a
// static test keeps those two columns out of every query that reads the listing fee.

// The owner's choice of one provider for one requirement. It never changes. A requirement has at most one engagement.
export const engagements = sqliteTable(
  "engagements",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id),
    requirementId: text("requirement_id").notNull(),
    providerId: text("provider_id").notNull().references(() => providers.id),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull().references(() => users.id),
  },
  (t) => [
    uniqueIndex("engagements_one_per_requirement").on(t.requirementId),
    uniqueIndex("engagements_id_company").on(t.id, t.companyId),
    index("engagements_company").on(t.companyId),
    foreignKey({ name: "engagements_requirement_fk", columns: [t.requirementId, t.companyId], foreignColumns: [requirements.id, requirements.companyId] }),
  ],
);

// One step of the plan: what is to be delivered, how the owner will check it, by when, and what the two agreed to pay for it.
// Added one at a time until the owner agrees the plan; after that none can be added.
export const milestones = sqliteTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    engagementId: text("engagement_id").notNull(),
    companyId: text("company_id").notNull().references(() => companies.id),
    seq: integer("seq").notNull(),
    title: text("title").notNull(),
    acceptanceTest: text("acceptance_test").notNull(),
    dueOn: text("due_on").notNull(),
    agreedInr: integer("agreed_inr").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull().references(() => users.id),
  },
  (t) => [
    uniqueIndex("milestones_order").on(t.engagementId, t.seq),
    uniqueIndex("milestones_id_engagement").on(t.id, t.engagementId),
    index("milestones_company").on(t.companyId),
    foreignKey({ name: "milestones_engagement_fk", columns: [t.engagementId, t.companyId], foreignColumns: [engagements.id, engagements.companyId] }),
    check("milestones_seq", sql`${t.seq} BETWEEN 1 AND 12`),
    check("milestones_title", sql`length(${t.title}) BETWEEN 1 AND 120`),
    check("milestones_test", sql`length(${t.acceptanceTest}) BETWEEN 1 AND 500`),
    check("milestones_due", sql`${t.dueOn} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
    check("milestones_agreed", sql`${t.agreedInr} BETWEEN 1 AND 100000000`),
  ],
);

// What happens to an engagement: the plan is agreed, a milestone is delivered (as the provider told the owner), accepted or
// rejected by the owner against its test, the owner records a payment made outside the platform, the engagement is closed.
// Providers do not sign in here (OQ-13), so the owner records every event.
export const engagementEvents = sqliteTable(
  "engagement_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    engagementId: text("engagement_id").notNull(),
    companyId: text("company_id").notNull().references(() => companies.id),
    at: text("at").notNull(),
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    milestoneId: text("milestone_id"),
    amountInr: integer("amount_inr"),
    note: text("note").notNull().default(""),
  },
  (t) => [
    index("engagement_events_engagement").on(t.engagementId),
    index("engagement_events_milestone").on(t.milestoneId),
    uniqueIndex("engagement_events_one_agreement").on(t.engagementId).where(sql`${t.kind} = 'plan_agreed'`),
    uniqueIndex("engagement_events_one_close").on(t.engagementId).where(sql`${t.kind} = 'closed'`),
    uniqueIndex("engagement_events_one_payment").on(t.milestoneId).where(sql`${t.kind} = 'payment_recorded'`),
    foreignKey({ name: "engagement_events_engagement_fk", columns: [t.engagementId, t.companyId], foreignColumns: [engagements.id, engagements.companyId] }),
    foreignKey({ name: "engagement_events_milestone_fk", columns: [t.milestoneId, t.engagementId], foreignColumns: [milestones.id, milestones.engagementId] }),
    check(
      "engagement_events_shape",
      sql`(${t.kind} IN ('plan_agreed', 'closed') AND ${t.milestoneId} IS NULL AND ${t.amountInr} IS NULL)
       OR (${t.kind} IN ('delivered', 'accepted', 'rejected') AND ${t.milestoneId} IS NOT NULL AND ${t.amountInr} IS NULL)
       OR (${t.kind} = 'payment_recorded' AND ${t.milestoneId} IS NOT NULL AND ${t.amountInr} BETWEEN 1 AND 100000000)`,
    ),
  ],
);
