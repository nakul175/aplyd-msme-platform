import { env } from "cloudflare:workers";
import { handleProviderList } from "../../../../../../modules/procure/src/api/providers.ts";
import type { AppEnv } from "../../../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const POST = async (request: Request, context: { params: Promise<{ pid: string }> }) => handleProviderList(request, env as unknown as AppEnv, (await context.params).pid);
