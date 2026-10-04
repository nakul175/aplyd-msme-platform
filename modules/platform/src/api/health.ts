import { REQUIRED_TRIGGERS_BY_TABLE } from "../db/guards.ts";
import type { AppEnv } from "../env.ts";
import { json } from "./http.ts";

// The append-only guarantee of the audit log and of every other append-only table lives in triggers (see db/guards.ts).
// A database without them is not healthy. The check is that each required trigger exists by name and on the table it belongs to. It does
// not read a trigger's body, so a trigger of the right name and table with a weaker body would still pass: the integration tests, which
// run real SQL against each rule, are what show the bodies are right. The JSON field is still called `auditGuard` for the clients that read it.

export async function handleHealth(_request: Request, env: AppEnv): Promise<Response> {
  let database: "ok" | "unavailable" = "unavailable";
  let auditGuard: "ok" | "missing" | "unknown" = "unknown";
  try {
    if (env.DB) {
      const { results } = await env.DB.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger'").all<{ name: string; tbl_name: string }>();
      database = "ok";
      const present = new Set(results.map((r) => `${r.tbl_name}.${r.name}`));
      auditGuard = REQUIRED_TRIGGERS_BY_TABLE.every((t) => present.has(`${t.table}.${t.name}`)) ? "ok" : "missing";
    }
  } catch {
    database = "unavailable";
  }
  const healthy = database === "ok" && auditGuard === "ok";
  return json(healthy ? 200 : 503, { status: healthy ? "ok" : "degraded", database, auditGuard });
}
