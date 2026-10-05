import { env } from "cloudflare:workers";
import { handleDecisionCreate } from "../../../../../../../modules/diagnose/src/api/diagnose.ts";
import type { AppEnv } from "../../../../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const POST = async (request: Request, context: { params: Promise<{ id: string; aid: string }> }) => {
  const { id, aid } = await context.params;
  return handleDecisionCreate(request, env as unknown as AppEnv, id, aid);
};
