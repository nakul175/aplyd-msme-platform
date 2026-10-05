import { env } from "cloudflare:workers";
import { handleMilestoneAdd } from "../../../../../../../modules/deliver/src/api/engagements.ts";
import type { AppEnv } from "../../../../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const POST = async (request: Request, context: { params: Promise<{ id: string; eid: string }> }) => {
  const { id, eid } = await context.params;
  return handleMilestoneAdd(request, env as unknown as AppEnv, id, eid);
};
