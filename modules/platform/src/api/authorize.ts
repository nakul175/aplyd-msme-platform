// The checks every company-scoped or operator-only endpoint makes before it does anything, in one place so that no endpoint
// can forget one. The scope rule itself is in identity/scope.ts; this applies it to a request and answers the refusal.
// A refusal that names a company says 404 for any company that is not the person's own, exactly as for one that does not
// exist, and is written to the audit log.
import { recordAudit } from "../db/audit.ts";
import type { AppEnv } from "../env.ts";
import { isCrossSite } from "../identity/cross-site.ts";
import { resolveIdentity } from "../identity/resolve.ts";
import { canReadCompany, canWriteOwnCompany } from "../identity/scope.ts";
import type { Identity } from "../identity/scope.ts";
import { drain, json, notSignedIn } from "./http.ts";

export type Allowed = { identity: Identity; companyId: string; db: D1Database };
export type OperatorAllowed = { identity: Identity; db: D1Database };

const refuse = (db: D1Database, event: string, identity: Identity, requested: string) =>
  recordAudit(db, event, { userId: identity.userId, companyId: identity.companyId, detail: { requested: requested.slice(0, 64) } });

/** Signed in, and the company in the URL is the person's own. Answers with the refusal otherwise. */
export async function authorizeCompanyRead(request: Request, env: AppEnv, requestedId: string, event: string): Promise<Allowed | Response> {
  if (!env.DB) return json(503, { error: "storage_unavailable" });
  const identity = await resolveIdentity(request, env);
  if (!identity) return notSignedIn(request);
  if (!canReadCompany(identity, requestedId)) {
    await refuse(env.DB, event, identity, requestedId);
    return json(404, { error: "not_found" });
  }
  return { identity, companyId: identity.companyId!, db: env.DB };
}

/** The same, for a change: another website's request is refused first, and only the company's owner may change anything. */
export async function authorizeCompanyWrite(request: Request, env: AppEnv, requestedId: string, event: string): Promise<Allowed | Response> {
  if (isCrossSite(request)) {
    await drain(request);
    return json(403, { error: "cross_site_refused" });
  }
  if (!env.DB) {
    await drain(request);
    return json(503, { error: "storage_unavailable" });
  }
  const identity = await resolveIdentity(request, env);
  if (!identity) {
    await drain(request);
    return notSignedIn(request);
  }
  if (!canReadCompany(identity, requestedId)) {
    await drain(request);
    await refuse(env.DB, event, identity, requestedId);
    return json(404, { error: "not_found" });
  }
  if (!canWriteOwnCompany(identity, requestedId)) {
    await drain(request);
    await refuse(env.DB, event, identity, requestedId);
    return json(403, { error: "forbidden" });
  }
  return { identity, companyId: identity.companyId!, db: env.DB };
}

/** Anyone signed in. For what every signed-in person may see (the list of listed providers), which belongs to no company. */
export async function authorizeSignedIn(request: Request, env: AppEnv): Promise<{ identity: Identity; db: D1Database } | Response> {
  if (!env.DB) return json(503, { error: "storage_unavailable" });
  const identity = await resolveIdentity(request, env);
  if (!identity) return notSignedIn(request);
  return { identity, db: env.DB };
}

/**
 * A platform operator: a signed-in person with the operator role and no company. Anyone else gets 403 and the attempt is
 * audited. A change is refused first if another website sent it. The operator reads no company's records (the scope rule),
 * so nothing here widens what an operator can see of companies.
 */
export async function authorizeOperator(request: Request, env: AppEnv, event: string, change: boolean): Promise<OperatorAllowed | Response> {
  if (change && isCrossSite(request)) {
    await drain(request);
    return json(403, { error: "cross_site_refused" });
  }
  if (!env.DB) {
    if (change) await drain(request);
    return json(503, { error: "storage_unavailable" });
  }
  const identity = await resolveIdentity(request, env);
  if (!identity) {
    if (change) await drain(request);
    return notSignedIn(request);
  }
  if (identity.role !== "operator" || identity.companyId !== null) {
    if (change) await drain(request);
    await refuse(env.DB, event, identity, "operator");
    return json(403, { error: "forbidden" });
  }
  return { identity, db: env.DB };
}
