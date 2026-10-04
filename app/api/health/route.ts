import { env } from "cloudflare:workers";
import { handleHealth } from "../../../modules/platform/src/api/health.ts";
import type { AppEnv } from "../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleHealth(request, env as unknown as AppEnv);
