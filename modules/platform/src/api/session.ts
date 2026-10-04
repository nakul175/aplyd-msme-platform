import type { AppEnv } from "../env.ts";
import { getSessionSecret, isSyntheticEnvironment } from "../env.ts";
import { recordAudit } from "../db/audit.ts";
import { isCrossSite } from "../identity/cross-site.ts";
import { resolveIdentity } from "../identity/resolve.ts";
import { clearedSessionCookie, sessionCookie, signSession } from "../identity/session.ts";
import { drain, json, redirect } from "./http.ts";

/** GET: who am I. */
export async function handleSessionRead(request: Request, env: AppEnv): Promise<Response> {
  const identity = await resolveIdentity(request, env);
  return identity ? json(200, identity) : json(401, { error: "not_signed_in" });
}

type SessionBody = { email: string; intent: string; form: boolean };

/** Reads a sign-in or sign-out body. Returns "unsupported" for any content type but the two the interface sends, and null when the body is unreadable. */
async function readBody(request: Request): Promise<SessionBody | "unsupported" | null> {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  try {
    if (type === "application/x-www-form-urlencoded") {
      const form = new URLSearchParams(await request.text());
      return { email: form.get("email") ?? "", intent: form.get("intent") ?? "", form: true };
    }
    if (type === "application/json") {
      const b: unknown = await request.json();
      if (typeof b !== "object" || b === null || Array.isArray(b)) return null;
      const { email, intent } = b as { email?: unknown; intent?: unknown };
      return { email: typeof email === "string" ? email : "", intent: typeof intent === "string" ? intent : "", form: false };
    }
  } catch {
    return null;
  }
  return "unsupported";
}

/**
 * POST: synthetic sign-in, or sign-out when intent is "sign-out".
 * Synthetic sign-in picks one of the synthetic users. It exists only where APLYD_ENV is local, synthetic or test.
 * Anywhere else it refuses. Real sign-in is a separate provider module, not yet built (OQ-07).
 */
export async function handleSessionWrite(request: Request, env: AppEnv): Promise<Response> {
  if (isCrossSite(request)) {
    await drain(request);
    return json(403, { error: "cross_site_refused" });
  }
  const body = await readBody(request);
  if (body === "unsupported") {
    await drain(request);
    return json(415, { error: "unsupported_content_type" });
  }
  if (body === null) return json(400, { error: "bad_request" });

  if (body.intent === "sign-out") {
    // Sign-out clears the cookie in this browser. The token itself stays valid until it expires (STATUS.md, limit 3).
    const identity = await resolveIdentity(request, env);
    if (identity && env.DB) await recordAudit(env.DB, "session.ended", { userId: identity.userId, companyId: identity.companyId });
    const headers = { "set-cookie": clearedSessionCookie() };
    return body.form ? redirect("/", headers) : json(200, { signedOut: true }, headers);
  }

  const secret = getSessionSecret(env);
  if (!isSyntheticEnvironment(env) || !env.DB || !secret) {
    return json(503, { error: "sign_in_not_available" });
  }
  const email = body.email.trim().toLowerCase();
  const user = email
    ? await env.DB
        .prepare("SELECT id, company_id FROM users WHERE email = ? AND is_synthetic = 1")
        .bind(email)
        .first<{ id: string; company_id: string | null }>()
    : null;
  if (!user) {
    // Not written to the audit log: anyone can send these without signing in, and the log cannot be pruned.
    // The refused address is not recorded anywhere.
    console.warn(JSON.stringify({ event: "session.refused" }));
    return body.form ? redirect("/sign-in?refused=1") : json(401, { error: "unknown_user" });
  }
  const token = await signSession(user.id, secret, Math.floor(Date.now() / 1000));
  await recordAudit(env.DB, "session.created", { userId: user.id, companyId: user.company_id });
  const headers = { "set-cookie": sessionCookie(token) };
  return body.form ? redirect("/", headers) : json(200, { signedIn: true }, headers);
}
