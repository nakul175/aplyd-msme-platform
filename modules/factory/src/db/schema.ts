import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { companies, users } from "../../../platform/src/db/schema.ts";

// One row is one saved version of a company's description of its factory. Append-only: a change is a new row with the
// next revision number, never an edit. Triggers (drizzle/0004_factory_revisions_append_only.sql) refuse UPDATE, DELETE and
// REPLACE. A revision with confirmed = 1 is the owner saying "this is accurate"; Diagnose reads the latest confirmed one.
export const factoryRevisions = sqliteTable(
  "factory_revisions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: text("company_id").notNull().references(() => companies.id),
    revisionNo: integer("revision_no").notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull().references(() => users.id),
    confirmed: integer("confirmed").notNull().default(0),
    questionnaireVersion: integer("questionnaire_version").notNull(),
    // JSON object of answers keyed by question. A missing key means unknown.
    answers: text("answers").notNull(),
    // What changed and why, in the owner's words. Short.
    note: text("note").notNull().default(""),
  },
  (t) => [
    uniqueIndex("factory_revisions_company_revision").on(t.companyId, t.revisionNo),
    index("factory_revisions_company").on(t.companyId),
    check("factory_revisions_confirmed_bool", sql`${t.confirmed} IN (0, 1)`),
    check("factory_revisions_revision_positive", sql`${t.revisionNo} >= 1`),
  ],
);
