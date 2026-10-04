// State-changing requests carry the session cookie, so a request that another website started is refused.
// SameSite=Lax on the cookie is the first defence; this check is the second.

// Every method that is not a plain read counts as changing, compared without regard to case.
const READING = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCrossSite(request: Request): boolean {
  if (READING.has(request.method.toUpperCase())) return false;
  const origin = request.headers.get("origin");
  if (origin === null) return request.headers.get("sec-fetch-site") === "cross-site";
  try {
    return new URL(origin).origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}
