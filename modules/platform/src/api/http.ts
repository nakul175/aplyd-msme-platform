/** Reads and discards a request body we are not going to use, so the connection is left clean for the next request. */
export async function drain(request: Request): Promise<void> {
  try {
    await request.arrayBuffer();
  } catch {
    /* an unreadable body is not our problem here */
  }
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function redirect(location: string, extra: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { location, "cache-control": "no-store", ...extra } });
}

/** Where a person whose session has ended is sent. The sign-in page turns `expired=1` into a plain sentence. */
export const EXPIRED_LOCATION = "/sign-in?expired=1";

const NOT_A_FORM_METHOD = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * True for what a page sends: a change (not a read) whose body is an HTML form, in either of the two encodings a browser uses
 * (`application/x-www-form-urlencoded`, the default, and `multipart/form-data`). A program that talks to the interface sends JSON.
 */
export function isFormPost(request: Request): boolean {
  if (NOT_A_FORM_METHOD.has(request.method.toUpperCase())) return false;
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return type === "application/x-www-form-urlencoded" || type === "multipart/form-data";
}

/**
 * The answer to a request that carries no valid session, decided here and nowhere else, so that no handler can forget it. A person at a
 * form (a page's own post) is sent to the sign-in page with a message, never to a page of JSON; a program gets 401 `not_signed_in`, as
 * before. It changes only how the refusal is shown: who may do what is decided by the caller, which calls this only when there is no
 * identity. Call it after the body has been read or drained.
 */
export function notSignedIn(request: Request): Response {
  return isFormPost(request) ? redirect(EXPIRED_LOCATION) : json(401, { error: "not_signed_in" });
}
