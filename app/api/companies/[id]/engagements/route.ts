import { env } from "cloudflare:workers";
import { handleEngagementList } from "../../../../../modules/deliver/src/api/engagements.ts";
import type { AppEnv } from "../../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  return handleEngagementList(request, env as unknown as AppEnv, id);
};
