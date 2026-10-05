import type { AppEnv } from "../env.ts";
import { json } from "./http.ts";

// The audit log's append-only guarantee lives in these triggers (drizzle/0001 and 0002). A database without them is not healthy.
const AUDIT_TRIGGERS = ["audit_events_no_update", "audit_events_no_delete", "audit_events_no_replace"];

export async function handleHealth(_request: Request, env: AppEnv): Promise<Response> {
  let database: "ok" | "unavailable" = "unavailable";
  let auditGuard: "ok" | "missing" | "unknown" = "unknown";
  try {
    if (env.DB) {
      const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'audit_events'").all<{ name: string }>();
      database = "ok";
      const present = new Set(results.map((r) => r.name));
      auditGuard = AUDIT_TRIGGERS.every((t) => present.has(t)) ? "ok" : "missing";
    }
  } catch {
    database = "unavailable";
  }
  const healthy = database === "ok" && auditGuard === "ok";
  return json(healthy ? 200 : 503, { status: healthy ? "ok" : "degraded", database, auditGuard });
}
