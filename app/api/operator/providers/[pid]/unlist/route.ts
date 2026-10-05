import { env } from "cloudflare:workers";
import { handleProviderUnlist } from "../../../../../../modules/procure/src/api/providers.ts";
import type { AppEnv } from "../../../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const POST = async (request: Request, context: { params: Promise<{ pid: string }> }) => handleProviderUnlist(request, env as unknown as AppEnv, (await context.params).pid);
