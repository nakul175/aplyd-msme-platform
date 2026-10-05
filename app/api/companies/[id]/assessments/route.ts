import { env } from "cloudflare:workers";
import { handleAssessmentCreate, handleAssessmentList } from "../../../../../modules/diagnose/src/api/diagnose.ts";
import type { AppEnv } from "../../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, context: Context) => handleAssessmentList(request, env as unknown as AppEnv, (await context.params).id);
export const POST = async (request: Request, context: Context) => handleAssessmentCreate(request, env as unknown as AppEnv, (await context.params).id);
