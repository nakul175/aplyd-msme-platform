import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { assessments } from "../../../diagnose/src/db/schema.ts";
import { companies, users } from "../../../platform/src/db/schema.ts";

// Every table here is append-only: triggers (drizzle/0008_procure_guards.sql) refuse UPDATE, DELETE and any INSERT that would
// replace a row, and enforce the rules about what may be inserted. What changes over time is recorded as events.

// A company's standard requirement: one accepted item of one signed-off assessment, asked for in one cluster. It never changes.
export const requirements = sqliteTable(
  "requirements",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id),
    assessmentId: text("assessment_id").notNull(),
    opportunityId: text("opportunity_id").notNull(),
    cluster: text("cluster").notNull(),
    // JSON: a copy of the assessed item (title, summary, kind, costs), so a later change to the library changes nothing here.
    spec: text("spec").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull().references(() => users.id),
  },
  (t) => [
    uniqueIndex("requirements_one_per_item").on(t.companyId, t.assessmentId, t.opportunityId),
    uniqueIndex("requirements_id_company").on(t.id, t.companyId),
    index("requirements_company").on(t.companyId),
    index("requirements_pool").on(t.cluster, t.opportunityId),
    foreignKey({ name: "requirements_assessment_fk", columns: [t.assessmentId, t.companyId], foreignColumns: [assessments.id, assessments.companyId] }),
    check("requirements_spec_json", sql`json_valid(${t.spec})`),
  ],
);

// The only thing that happens to a requirement after it is made: the owner withdraws it. A withdrawn requirement leaves its pool.
export const requirementEvents = sqliteTable(
  "requirement_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requirementId: text("requirement_id").notNull(),
    companyId: text("company_id").notNull().references(() => companies.id),
    at: text("at").notNull(),
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [
    foreignKey({ name: "requirement_events_requirement_fk", columns: [t.requirementId, t.companyId], foreignColumns: [requirements.id, requirements.companyId] }),
    uniqueIndex("requirement_events_one_withdrawal").on(t.requirementId),
    check("requirement_events_kind", sql`${t.kind} = 'withdraw'`),
  ],
);

// A provider on the registry. Entered by a platform operator, who vets providers; a provider does not sign in here. SYNTHETIC.
export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  summary: text("summary").notNull().default(""),
  isSynthetic: integer("is_synthetic").notNull().default(1),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
});

// Which kind of requirement (an opportunity id) a provider serves, in which cluster.
export const providerServices = sqliteTable(
  "provider_services",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: text("provider_id").notNull().references(() => providers.id),
    opportunityId: text("opportunity_id").notNull(),
    cluster: text("cluster").notNull(),
  },
  (t) => [uniqueIndex("provider_services_unique").on(t.providerId, t.opportunityId, t.cluster), index("provider_services_match").on(t.cluster, t.opportunityId)],
);

// The listing fee: one number for every provider (D-03). A new row is a new version; the highest version is in force. While
// there is no row the fee is undecided (OQ-11) and no provider can be listed. There is no column that names a provider,
// a requirement, a company, a deal or a percentage, and a static test keeps it so.
export const listingTerms = sqliteTable(
  "listing_terms",
  {
    version: integer("version").primaryKey({ autoIncrement: true }),
    at: text("at").notNull(),
    userId: text("user_id").notNull().references(() => users.id),
    feeInr: integer("fee_inr").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [check("listing_terms_fee_positive", sql`${t.feeInr} > 0`)],
);

// A provider is listed or unlisted. A listing records the fee that was in force, copied from the terms by a trigger's
// check, so every listing carries the same fee as the terms of its time.
export const providerEvents = sqliteTable(
  "provider_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: text("provider_id").notNull().references(() => providers.id),
    at: text("at").notNull(),
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    termsVersion: integer("terms_version").references(() => listingTerms.version),
    feeInr: integer("fee_inr"),
    note: text("note").notNull().default(""),
  },
  (t) => [
    index("provider_events_provider").on(t.providerId),
    check(
      "provider_events_shape",
      sql`(${t.kind} = 'list' AND ${t.termsVersion} IS NOT NULL AND ${t.feeInr} IS NOT NULL) OR (${t.kind} = 'unlist' AND ${t.termsVersion} IS NULL AND ${t.feeInr} IS NULL)`,
    ),
  ],
);
