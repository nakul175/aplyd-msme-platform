import { env } from "cloudflare:workers";
import { handleOperatorProviders, handleProviderCreate } from "../../../../modules/procure/src/api/providers.ts";
import type { AppEnv } from "../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const GET = async (request: Request) => handleOperatorProviders(request, env as unknown as AppEnv);
export const POST = async (request: Request) => handleProviderCreate(request, env as unknown as AppEnv);
