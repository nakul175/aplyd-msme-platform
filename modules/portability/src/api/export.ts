// GET /api/companies/{id}/export: one company's records as a file to download (BR-DATA-03). Only a person of that company may have
// it (BR-GOV-05): the shared company check answers everyone else exactly as every other company read does, and the operator, who has
// no company, is refused like anyone else. The file is read through the identity's company, never through the id in the URL.
import { authorizeCompanyRead } from "../../../platform/src/api/authorize.ts";
import { json } from "../../../platform/src/api/http.ts";
import { recordAudit } from "../../../platform/src/db/audit.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { buildExport, exportFileName, recordTotal } from "../bundle.ts";
import { readExportInput } from "../read.ts";

/**
 * Answers the file, with a name to save it under. A successful export writes one audit entry, `company.export`, after the file is
 * built and before it is sent, so a file is never handed out without its entry. A refusal is audited by the shared check
 * (`company.export.denied`) and nothing else is written.
 */
export async function handleCompanyExport(request: Request, env: AppEnv, requestedId: string, now: () => Date = () => new Date()): Promise<Response> {
  const allowed = await authorizeCompanyRead(request, env, requestedId, "company.export.denied");
  if (allowed instanceof Response) return allowed;

  const input = await readExportInput(allowed.db, allowed.identity);
  if (!input) return json(404, { error: "not_found" });
  const at = now();
  const bundle = buildExport(input, at);

  await recordAudit(allowed.db, "company.export", {
    userId: allowed.identity.userId,
    companyId: allowed.companyId,
    detail: { version: bundle.version, records: recordTotal(bundle.counts) },
  });
  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${exportFileName(allowed.companyId, at)}"`,
    },
  });
}
