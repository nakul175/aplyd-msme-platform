import { env } from "cloudflare:workers";
import { handleCompanyExport } from "../../../../../modules/portability/src/api/export.ts";
import type { AppEnv } from "../../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  handleCompanyExport(request, env as unknown as AppEnv, (await context.params).id);
