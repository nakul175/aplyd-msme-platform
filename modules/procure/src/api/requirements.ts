// Requirements: an owner turns an accepted idea into a standard requirement, sees the pool it joins and the providers listed
// for it, and may withdraw it. The scope rule is the platform's own (platform/src/api/authorize.ts).
import { authorizeCompanyRead, authorizeCompanyWrite } from "../../../platform/src/api/authorize.ts";
import { bodyField, takeBody } from "../../../platform/src/api/body.ts";
import { json, redirect } from "../../../platform/src/api/http.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { loadAssessment } from "../../../diagnose/src/db/assessments.ts";
import { hasControlCharacters } from "../../../factory/src/questionnaire.ts";
import { isCluster } from "../clusters.ts";
import { createRequirement, listRequirements, withdrawRequirement } from "../db/requirements.ts";
import type { Spec } from "../db/requirements.ts";
import { poolCompanies } from "../db/pool.ts";
import { listedProvidersFor } from "../db/providers.ts";
import type { PublicProvider } from "../db/providers.ts";
import { presentPool } from "../pool.ts";
import type { PoolView } from "../pool.ts";

export const MAX_NOTE_LENGTH = 500;

export type PresentedRequirement = {
  id: string;
  assessmentId: string;
  opportunityId: string;
  cluster: string;
  title: string;
  summary: string;
  kind: "ai" | "non_ai";
  createdAt: string;
  withdrawnAt: string | null;
  pool: PoolView | null;
  providers: PublicProvider[];
};

/**
 * The company's requirements, newest first, each with what may be said of its pool (the number only from five companies) and the
 * providers listed for it. A withdrawn requirement shows neither. The page and the endpoint both use this.
 */
export async function presentRequirements(db: D1Database, companyId: string): Promise<PresentedRequirement[]> {
  const out: PresentedRequirement[] = [];
  for (const r of await listRequirements(db, companyId)) {
    const open = r.withdrawnAt === null;
    out.push({
      id: r.id,
      assessmentId: r.assessmentId,
      opportunityId: r.opportunityId,
      cluster: r.cluster,
      title: r.spec.title,
      summary: r.spec.summary,
      kind: r.spec.kind,
      createdAt: r.createdAt,
      withdrawnAt: r.withdrawnAt,
      pool: open ? presentPool(await poolCompanies(db, r.cluster, r.opportunityId)) : null,
      providers: open ? await listedProvidersFor(db, r.opportunityId, r.cluster) : [],
    });
  }
  return out;
}

/** GET the company's requirements, each with what may be said of its pool and the providers listed for it. */
export async function handleRequirementList(request: Request, env: AppEnv, requestedId: string): Promise<Response> {
  const allowed = await authorizeCompanyRead(request, env, requestedId, "requirement.read.denied");
  if (allowed instanceof Response) return allowed;
  return json(200, { requirements: await presentRequirements(allowed.db, allowed.companyId) });
}

/** POST: make a requirement from an accepted idea of a signed-off assessment. Making it again returns the one already there (200, not 201). */
export async function handleRequirementCreate(request: Request, env: AppEnv, requestedId: string): Promise<Response> {
  const allowed = await authorizeCompanyWrite(request, env, requestedId, "requirement.write.denied");
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";
  const back = (query: string) => redirect(`/procure?${query}`);

  const assessmentId = bodyField(body, form ? "assessment" : "assessmentId");
  const opportunityId = bodyField(body, form ? "opportunity" : "opportunityId");
  const cluster = bodyField(body, "cluster");
  const fields: Record<string, string> = {};
  if (typeof assessmentId !== "string" || assessmentId.length === 0 || assessmentId.length > 64) fields.assessmentId = "Say which assessment this is from.";
  if (typeof opportunityId !== "string" || opportunityId.length === 0 || opportunityId.length > 80) fields.opportunityId = "Say which idea this is about.";
  if (!isCluster(cluster)) fields.cluster = "Choose a cluster from the list.";
  if (Object.keys(fields).length) return form ? back("problem=request") : json(400, { error: "invalid", fields });

  const record = await loadAssessment(allowed.db, allowed.companyId, assessmentId as string);
  if (!record) return form ? back("problem=missing") : json(404, { error: "not_found" });
  const item = record.result.items.find((i) => i.opportunityId === opportunityId);
  if (!item) return form ? back("problem=request") : json(400, { error: "invalid", fields: { opportunityId: "That idea is not in this assessment." } });

  const spec: Spec = { title: item.title, summary: item.summary, kind: item.kind, addresses: item.addresses, costs: item.costs, source: item.source, libraryVersion: record.libraryVersion };
  const made = await createRequirement(allowed.db, { companyId: allowed.companyId, userId: allowed.identity.userId, assessmentId: record.id, opportunityId: item.opportunityId, cluster: cluster as string, spec });
  if (!made.ok) {
    if (made.reason === "not_found") return form ? back("problem=missing") : json(404, { error: "not_found" });
    return form ? back(`problem=${made.reason}`) : json(409, { error: made.reason });
  }
  // Asking again changes nothing, and the answer must not say that something was recorded now (a form shows that it already was).
  if (form) return made.created ? back(`made=${encodeURIComponent(made.id)}`) : back("problem=already_made");
  return json(made.created ? 201 : 200, { id: made.id, created: made.created, cluster: made.cluster });
}

/** POST: withdraw a requirement. It stays on record, marked withdrawn, and leaves its pool. */
export async function handleRequirementWithdraw(request: Request, env: AppEnv, requestedId: string, requirementId: string): Promise<Response> {
  const allowed = await authorizeCompanyWrite(request, env, requestedId, "requirement.write.denied");
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";

  const raw = bodyField(body, "note");
  const note = raw === undefined || raw === null ? "" : typeof raw === "string" ? raw.trim() : null;
  if (note === null || note.length > MAX_NOTE_LENGTH || hasControlCharacters(note)) return form ? redirect("/procure?problem=note") : json(400, { error: "invalid", fields: { note: "Keep the note to text under 500 characters." } });
  if (requirementId.length === 0 || requirementId.length > 64) return form ? redirect("/procure?problem=missing") : json(404, { error: "not_found" });

  const result = await withdrawRequirement(allowed.db, { companyId: allowed.companyId, userId: allowed.identity.userId, requirementId, note });
  if (result.ok) return form ? redirect("/procure?withdrawn=1") : json(201, { ok: true });
  if (result.reason === "already_withdrawn") return form ? redirect("/procure?problem=withdrawn") : json(409, { error: "already_withdrawn" });
  return form ? redirect("/procure?problem=missing") : json(404, { error: "not_found" });
}
