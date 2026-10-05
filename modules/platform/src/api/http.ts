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
