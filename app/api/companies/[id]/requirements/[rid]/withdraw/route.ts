import { env } from "cloudflare:workers";
import { handleRequirementWithdraw } from "../../../../../../../modules/procure/src/api/requirements.ts";
import type { AppEnv } from "../../../../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const POST = async (request: Request, context: { params: Promise<{ id: string; rid: string }> }) => {
  const { id, rid } = await context.params;
  return handleRequirementWithdraw(request, env as unknown as AppEnv, id, rid);
};
