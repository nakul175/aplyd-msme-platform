// State-changing requests carry the session cookie, so a request that another website started is refused.
// SameSite=Lax on the cookie is the first defence; this check is the second.

const CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isCrossSite(request: Request): boolean {
  if (!CHANGING.has(request.method)) return false;
  const origin = request.headers.get("origin");
  if (origin === null) return request.headers.get("sec-fetch-site") === "cross-site";
  try {
    return new URL(origin).origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}
