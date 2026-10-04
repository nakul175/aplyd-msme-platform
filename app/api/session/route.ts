import { env } from "cloudflare:workers";
import { handleSessionRead, handleSessionWrite } from "../../../modules/platform/src/api/session.ts";
import type { AppEnv } from "../../../modules/platform/src/env.ts";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleSessionRead(request, env as unknown as AppEnv);
export const POST = (request: Request) => handleSessionWrite(request, env as unknown as AppEnv);
