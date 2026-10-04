import { env } from "cloudflare:workers";
import { handleRequirementCreate, handleRequirementList } from "../../../../../modules/procure/src/api/requirements.ts";
import type { AppEnv } from "../../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, context: Context) => handleRequirementList(request, env as unknown as AppEnv, (await context.params).id);
export const POST = async (request: Request, context: Context) => handleRequirementCreate(request, env as unknown as AppEnv, (await context.params).id);
