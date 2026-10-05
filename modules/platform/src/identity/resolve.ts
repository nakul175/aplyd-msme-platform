import { getSessionSecret } from "../env.ts";
import type { AppEnv } from "../env.ts";
import type { Identity } from "./scope.ts";
import { SESSION_COOKIE, readCookie, verifySession } from "./session.ts";

/**
 * Identity comes only from a verified session token. Request headers a client can set are never read for identity.
 * Company and role are read from the database on every request, so a removed user loses access at once.
 */
export async function resolveIdentityFromCookieHeader(cookieHeader: string | null, env: AppEnv): Promise<Identity | null> {
  const secret = getSessionSecret(env);
  if (!env.DB || !secret) return null;
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  const claims = await verifySession(token, secret, Math.floor(Date.now() / 1000));
  if (!claims) return null;
  const row = await env.DB
    .prepare("SELECT id, company_id, role, display_name FROM users WHERE id = ?")
    .bind(claims.u)
    .first<{ id: string; company_id: string | null; role: string; display_name: string }>();
  return row ? { userId: row.id, companyId: row.company_id, role: row.role, displayName: row.display_name } : null;
}

export function resolveIdentity(request: Request, env: AppEnv): Promise<Identity | null> {
  return resolveIdentityFromCookieHeader(request.headers.get("cookie"), env);
}
