import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { factoryRevisions } from "../../../factory/src/db/schema.ts";
import { companies, users } from "../../../platform/src/db/schema.ts";

// An assessment is the engine's draft for one company, made from one confirmed version of the factory description. It never
// changes. What a person does with it (decide on each item, sign it off) is recorded as events beside it. Triggers
// (drizzle/0006_diagnose_guards.sql) refuse UPDATE, DELETE and REPLACE on both tables, and enforce the rules on the events.
export const assessments = sqliteTable(
  "assessments",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id),
    factoryRevisionNo: integer("factory_revision_no").notNull(),
    libraryVersion: integer("library_version").notNull(),
    engineVersion: integer("engine_version").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull().references(() => users.id),
    // JSON: the engine's whole result, including a copy of every library fact it used, so a later change to the library
    // never changes a past assessment.
    result: text("result").notNull(),
  },
  (t) => [
    // The same inputs always give the same result, so one assessment per set of inputs is enough: running it again returns it.
    uniqueIndex("assessments_inputs").on(t.companyId, t.factoryRevisionNo, t.libraryVersion, t.engineVersion),
    uniqueIndex("assessments_id_company").on(t.id, t.companyId),
    index("assessments_company").on(t.companyId),
    foreignKey({ name: "assessments_revision_fk", columns: [t.companyId, t.factoryRevisionNo], foreignColumns: [factoryRevisions.companyId, factoryRevisions.revisionNo] }),
    check("assessments_result_json", sql`json_valid(${t.result})`),
  ],
);

// A decision on one item (accept, defer, reject), or the sign-off of the whole assessment. The latest decision on an item
// stands; earlier ones stay. After the sign-off no decision can be added, and the sign-off needs a decision on every item.
export const assessmentEvents = sqliteTable(
  "assessment_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    assessmentId: text("assessment_id").notNull(),
    companyId: text("company_id").notNull().references(() => companies.id),
    at: text("at").notNull(),
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    opportunityId: text("opportunity_id"),
    decision: text("decision"),
    note: text("note").notNull().default(""),
    // Sign-off only: SHA-256 of what was signed (the assessment's result and the standing decisions), in hex.
    digest: text("digest"),
  },
  (t) => [
    foreignKey({ name: "assessment_events_assessment_fk", columns: [t.assessmentId, t.companyId], foreignColumns: [assessments.id, assessments.companyId] }),
    uniqueIndex("assessment_events_one_signoff").on(t.assessmentId).where(sql`${t.kind} = 'signoff'`),
    index("assessment_events_assessment").on(t.assessmentId),
    check(
      "assessment_events_shape",
      sql`(${t.kind} = 'decision' AND ${t.opportunityId} IS NOT NULL AND ${t.decision} IN ('accept', 'defer', 'reject') AND ${t.digest} IS NULL) OR (${t.kind} = 'signoff' AND ${t.opportunityId} IS NULL AND ${t.decision} IS NULL AND ${t.digest} IS NOT NULL)`,
    ),
  ],
);
