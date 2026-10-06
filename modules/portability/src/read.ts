// Reads everything the export file holds for the signed-in person's own company, through the other modules' own data-layer
// functions. This file holds no SQL: each module keeps its tables behind its data layer, and every function called here binds its
// query to the company id it is given, which is taken from the identity, never from a URL. Nothing here reads the provider
// register, the listing terms, the pools or the audit log.
import { listAssessments, loadAssessment } from "../../diagnose/src/db/assessments.ts";
import { listEngagements } from "../../deliver/src/db/engagements.ts";
import { MAX_REVISIONS_PER_COMPANY, loadHistory, loadRevision } from "../../factory/src/db/revisions.ts";
import { loadOwnCompany } from "../../platform/src/db/companies.ts";
import type { Identity } from "../../platform/src/identity/scope.ts";
import { listRequirements } from "../../procure/src/db/requirements.ts";
import { listOutcomes } from "../../run/src/db/outcomes.ts";
import type { ExportInput } from "./bundle.ts";

const present = <T>(x: T | null): x is T => x !== null;

/** The records of the identity's own company, or null when the identity has no company or the company row is missing. */
export async function readExportInput(db: D1Database, identity: Identity): Promise<ExportInput | null> {
  if (identity.companyId === null || identity.companyId === "") return null;
  const company = await loadOwnCompany(db, identity);
  if (!company) return null;
  const companyId = identity.companyId;

  // The history lists every revision number (the database refuses more than MAX_REVISIONS_PER_COMPANY), then each is read whole.
  const [history, summaries, requirements, engagements] = await Promise.all([
    loadHistory(db, companyId, MAX_REVISIONS_PER_COMPANY),
    listAssessments(db, companyId),
    listRequirements(db, companyId),
    listEngagements(db, companyId),
  ]);
  const [revisions, assessments, outcomes] = await Promise.all([
    Promise.all(history.map((h) => loadRevision(db, companyId, h.revision))).then((rows) => rows.filter(present)),
    Promise.all(summaries.map((s) => loadAssessment(db, companyId, s.id))).then((rows) => rows.filter(present)),
    Promise.all(engagements.map(async (g) => ({ engagementId: g.id, rows: await listOutcomes(db, companyId, g.id) }))),
  ]);
  return { company, revisions, assessments, requirements, engagements, outcomes };
}
