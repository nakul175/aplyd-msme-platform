import { env } from "cloudflare:workers";
import { handleRevisionCreate } from "../../../../../../modules/factory/src/api/factory.ts";
import type { AppEnv } from "../../../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const POST = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  handleRevisionCreate(request, env as unknown as AppEnv, (await context.params).id);
