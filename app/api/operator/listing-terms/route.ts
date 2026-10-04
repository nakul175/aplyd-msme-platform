import { env } from "cloudflare:workers";
import { handleTermsRead, handleTermsSet } from "../../../../modules/procure/src/api/providers.ts";
import type { AppEnv } from "../../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const GET = async (request: Request) => handleTermsRead(request, env as unknown as AppEnv);
export const POST = async (request: Request) => handleTermsSet(request, env as unknown as AppEnv);
