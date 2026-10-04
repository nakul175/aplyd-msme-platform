import type { AppEnv } from "../env.ts";
import { isSyntheticEnvironment } from "../env.ts";
import { recordAudit } from "../db/audit.ts";
import { isCrossSite } from "../identity/cross-site.ts";
import { resolveIdentity } from "../identity/resolve.ts";
import { clearedSessionCookie, sessionCookie, signSession } from "../identity/session.ts";
import { json, redirect } from "./http.ts";

/** GET: who am I. */
export async function handleSessionRead(request: Request, env: AppEnv): Promise<Response> {
  const identity = await resolveIdentity(request, env);
  return identity ? json(200, identity) : json(401, { error: "not_signed_in" });
}

async function readBody(request: Request): Promise<{ email?: string; intent?: string; form: boolean }> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded")) {
    const f = await request.formData();
    return { email: String(f.get("email") ?? ""), intent: String(f.get("intent") ?? ""), form: true };
  }
  try {
    const b = (await request.json()) as { email?: unknown; intent?: unknown };
    return { email: typeof b.email === "string" ? b.email : "", intent: typeof b.intent === "string" ? b.intent : "", form: false };
  } catch {
    return { form: false };
  }
}

/**
 * POST: synthetic sign-in, or sign-out when intent is "sign-out".
 * Synthetic sign-in picks one of the synthetic users. It exists only where APLYD_ENV is local, synthetic or test.
 * Anywhere else it refuses. Real sign-in is a separate provider module, not yet built (OQ-07).
 */
export async function handleSessionWrite(request: Request, env: AppEnv): Promise<Response> {
  if (isCrossSite(request)) return json(403, { error: "cross_site_refused" });
  const body = await readBody(request);

  if (body.intent === "sign-out") {
    const headers = { "set-cookie": clearedSessionCookie() };
    return body.form ? redirect("/", headers) : json(200, { signedOut: true }, headers);
  }

  if (!isSyntheticEnvironment(env) || !env.DB || !env.SESSION_SECRET) {
    return json(503, { error: "sign_in_not_available" });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const user = email
    ? await env.DB
        .prepare("SELECT id, company_id FROM users WHERE email = ? AND is_synthetic = 1")
        .bind(email)
        .first<{ id: string; company_id: string | null }>()
    : null;
  if (!user) {
    // The refused address is not stored.
    await recordAudit(env.DB, "session.refused");
    return body.form ? redirect("/sign-in?refused=1") : json(401, { error: "unknown_user" });
  }
  const token = await signSession(user.id, env.SESSION_SECRET, Math.floor(Date.now() / 1000));
  await recordAudit(env.DB, "session.created", { userId: user.id, companyId: user.company_id });
  const headers = { "set-cookie": sessionCookie(token) };
  return body.form ? redirect("/", headers) : json(200, { signedIn: true }, headers);
}
