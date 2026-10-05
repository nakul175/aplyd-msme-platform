import { env } from "cloudflare:workers";
import { handleOutcomeRead, handleOutcomeRecord } from "../../../../../../../modules/run/src/api/outcomes.ts";
import type { AppEnv } from "../../../../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const GET = async (request: Request, context: { params: Promise<{ id: string; eid: string }> }) => {
  const { id, eid } = await context.params;
  return handleOutcomeRead(request, env as unknown as AppEnv, id, eid);
};
export const POST = async (request: Request, context: { params: Promise<{ id: string; eid: string }> }) => {
  const { id, eid } = await context.params;
  return handleOutcomeRecord(request, env as unknown as AppEnv, id, eid);
};
