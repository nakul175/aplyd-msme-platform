import { env } from "cloudflare:workers";
import { handleAssessmentRead } from "../../../../../../modules/diagnose/src/api/diagnose.ts";
import type { AppEnv } from "../../../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const GET = async (request: Request, context: { params: Promise<{ id: string; aid: string }> }) => {
  const { id, aid } = await context.params;
  return handleAssessmentRead(request, env as unknown as AppEnv, id, aid);
};
