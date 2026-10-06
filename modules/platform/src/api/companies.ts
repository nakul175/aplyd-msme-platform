import type { AppEnv } from "../env.ts";
import { recordAudit } from "../db/audit.ts";
import { loadOwnCompany } from "../db/companies.ts";
import { resolveIdentity } from "../identity/resolve.ts";
import { canReadCompany } from "../identity/scope.ts";
import { json, notSignedIn } from "./http.ts";

/**
 * GET one company record. The scope rule is enforced here, on the server.
 * The query is always bound to the signed-in person's own company, never to the id in the URL, so a mistake in the
 * comparison could not return another company's row. A refused read answers 404, the same as a record that does not exist.
 */
export async function handleCompanyRead(request: Request, env: AppEnv, requestedId: string): Promise<Response> {
  if (!env.DB) return json(503, { error: "storage_unavailable" });
  const identity = await resolveIdentity(request, env);
  if (!identity) return notSignedIn(request);

  if (!canReadCompany(identity, requestedId)) {
    await recordAudit(env.DB, "company.read.denied", {
      userId: identity.userId,
      companyId: identity.companyId,
      detail: { requested: requestedId.slice(0, 64) },
    });
    return json(404, { error: "not_found" });
  }

  const company = await loadOwnCompany(env.DB, identity);
  return company ? json(200, company) : json(404, { error: "not_found" });
}
