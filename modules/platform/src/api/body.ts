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
 * An absent body (no content type, nothing sent) is "empty". JSON must be an object. Anything else is a problem:
 * "unsupported" for another content type (415), "too_large" (413), "bad" for unreadable or malformed content (400).
 */
export async function readBody(request: Request, maxCharacters: number = MAX_BODY_CHARACTERS): Promise<Body | BodyProblem> {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "" && type !== "application/x-www-form-urlencoded" && type !== "application/json") return "unsupported";
  let text: string;
  try {
    text = await request.text();
  } catch {
    return "bad";
  }
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
