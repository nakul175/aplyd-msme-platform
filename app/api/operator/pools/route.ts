import { env } from "cloudflare:workers";
import { handlePools } from "../../../../modules/procure/src/api/providers.ts";
import type { AppEnv } from "../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const GET = async (request: Request) => handlePools(request, env as unknown as AppEnv);
