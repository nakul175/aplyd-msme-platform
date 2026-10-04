import type { AppEnv } from "../env.ts";
import { json } from "./http.ts";

export async function handleHealth(_request: Request, env: AppEnv): Promise<Response> {
  let database: "ok" | "unavailable" = "unavailable";
  try {
    if (env.DB) {
      await env.DB.prepare("SELECT 1").first();
      database = "ok";
    }
  } catch {
    database = "unavailable";
  }
  return json(database === "ok" ? 200 : 503, { status: database === "ok" ? "ok" : "degraded", database });
}
