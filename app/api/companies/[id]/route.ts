import { env } from "cloudflare:workers";
import { handleCompanyRead } from "../../../../modules/platform/src/api/companies.ts";
import type { AppEnv } from "../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  handleCompanyRead(request, env as unknown as AppEnv, (await context.params).id);
