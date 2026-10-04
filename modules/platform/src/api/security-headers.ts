// Headers added to every response by the Worker entry. They stop the pages being framed, stop content-type guessing and
// keep the address of this site out of the Referer sent elsewhere. This is not a full Content-Security-Policy: the
// application's own scripts are not restricted yet (modules/platform/STATUS.md).
const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "content-security-policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

export function withSecurityHeaders(response: Response): Response {
  // A copy, because the headers of a response that came from another handler may be immutable.
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value);
  return out;
}
