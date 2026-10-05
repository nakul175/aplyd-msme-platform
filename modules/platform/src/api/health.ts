import { ALL_REQUIRED_TRIGGERS } from "../db/guards.ts";
import type { AppEnv } from "../env.ts";
import { json } from "./http.ts";

// The append-only guarantee of the audit log and of every other append-only table lives in triggers (see db/guards.ts).
// A database without them is not healthy.

export async function handleHealth(_request: Request, env: AppEnv): Promise<Response> {
  let database: "ok" | "unavailable" = "unavailable";
  let auditGuard: "ok" | "missing" | "unknown" = "unknown";
  try {
    if (env.DB) {
      const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all<{ name: string }>();
      database = "ok";
      const present = new Set(results.map((r) => r.name));
      auditGuard = ALL_REQUIRED_TRIGGERS.every((t) => present.has(t)) ? "ok" : "missing";
    }
  } catch {
    database = "unavailable";
  }
  const healthy = database === "ok" && auditGuard === "ok";
  return json(healthy ? 200 : 503, { status: healthy ? "ok" : "degraded", database, auditGuard });
}
