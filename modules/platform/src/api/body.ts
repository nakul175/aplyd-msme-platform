// Reads the body of a POST that carries either a JSON object or an HTML form, with a size cap and a content-type check.
// The content type is checked before the body is read, so a body of a type the interface never sends is not buffered.
import { drain, json } from "./http.ts";

export type Body =
  | { kind: "form"; form: URLSearchParams }
  | { kind: "json"; value: Record<string, unknown> }
  | { kind: "empty" };
export type BodyProblem = "unsupported" | "too_large" | "bad";

/** Larger than any legitimate form this interface sends. */
export const MAX_BODY_CHARACTERS = 64 * 1024;

/**
 * Reads a request's body as text without buffering it to the end when it is over a bound. A body whose declared length is over the bound is
 * refused without being read; a body that turns out to be over it (no length declared, or a false one) is abandoned as soon as the
 * bound is passed, not buffered to the end. The bound is checked between pieces of the stream, so one piece bigger than the bound is held
 * whole before it is checked: this is not a hard cap on memory. The bound is in bytes, four for each character allowed (the most one character takes in UTF-8);
 * the count of characters is checked by the caller after decoding. "bad" is a body that cannot be read.
 */
export async function readTextWithin(request: Request, maxCharacters: number): Promise<{ ok: true; text: string } | { ok: false; problem: "too_large" | "bad" }> {
  const maxBytes = maxCharacters * 4;
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) return { ok: false, problem: "too_large" };
  if (request.body === null) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, problem: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, problem: "bad" };
  }
  const all = new Uint8Array(bytes);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(all) };
}

/**
 * An absent body (no content type, nothing sent) is "empty". JSON must be an object. Anything else is a problem:
 * "unsupported" for another content type (415), "too_large" (413), "bad" for unreadable or malformed content (400).
 */
export async function readBody(request: Request, maxCharacters: number = MAX_BODY_CHARACTERS): Promise<Body | BodyProblem> {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "" && type !== "application/x-www-form-urlencoded" && type !== "application/json") return "unsupported";
  const read = await readTextWithin(request, maxCharacters);
  if (!read.ok) return read.problem;
  const text = read.text;
  if (text.length > maxCharacters) return "too_large";
  if (type === "application/x-www-form-urlencoded") return { kind: "form", form: new URLSearchParams(text) };
  if (type === "") return text.trim() === "" ? { kind: "empty" } : "unsupported";
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? { kind: "json", value: value as Record<string, unknown> } : "bad";
  } catch {
    return "bad";
  }
}

/** The HTTP answer for a body problem. */
export const problemStatus = (p: BodyProblem): { status: number; error: string } =>
  p === "unsupported" ? { status: 415, error: "unsupported_content_type" } : p === "too_large" ? { status: 413, error: "too_large" } : { status: 400, error: "bad_request" };

/** Reads the body, or answers with the refusal. A body of a type the interface never sends is drained so the connection stays usable. */
export async function takeBody(request: Request): Promise<Body | Response> {
  const body = await readBody(request);
  if (typeof body === "string") {
    if (body === "unsupported") await drain(request);
    const { status, error } = problemStatus(body);
    return json(status, { error });
  }
  return body;
}

/** The value of a field of a form or a JSON body, or undefined. */
export const bodyField = (body: Body, name: string): unknown => (body.kind === "form" ? (body.form.get(name) ?? undefined) : body.kind === "json" ? body.value[name] : undefined);
