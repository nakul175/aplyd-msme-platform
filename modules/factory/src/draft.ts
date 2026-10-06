// Describe: what an owner typed on a save that was refused, kept for two minutes so the page can show it again.
// Pure code, no database. A refused or stale save answers with a redirect; the redirect carries the typed answers in a cookie that only the
// browser sends back, only to /factory, only on this site. Nothing typed is ever put in an address.
//
// Cookie limits shape this file. A browser keeps about 4 000 bytes per cookie, so the answers are written as UTF-8, turned into text a cookie may
// hold (base64url) and cut into up to three pieces. A description whose answers do not fit in three pieces is not kept; the page then says so.
// Nothing in the cookie is trusted when it is read: it is cut back to the questions in the questionnaire, to text, and to sane lengths, and
// the page validates it again with the same rules as a save.
import { FIELDS, MAX_NOTE_LENGTH, answersFromForm } from "./questionnaire.ts";
import type { Answers } from "./questionnaire.ts";

export const DRAFT_COOKIE = "aplyd_describe_draft";
/** How long the browser keeps it. The page does not clear it (a page cannot change cookies), so it is short, and the next save clears it. */
export const DRAFT_SECONDS = 120;
/** Characters of cookie value in one piece; with the name and the attributes, one piece stays under 4 000 bytes. */
const PIECE = 3000;
export const MAX_PIECES = 3;
/** The longest single answer kept. The questions allow 2 000 at most; a script could send more. */
const MAX_VALUE = 4000;
const MAX_VALUES = 20;
const MAX_KEPT_NOTE = MAX_NOTE_LENGTH + 100;

/** The typed answers as they were sent, before any checking: question key to the values sent (one for most, several for a multiple choice). */
export type Draft = { companyId: string; fields: Record<string, string[]>; note: string };

/** What was typed in a submitted form, or null when nothing was typed at all (then there is nothing worth keeping). */
export function draftFromForm(form: URLSearchParams, companyId: string): Draft | null {
  const fields: Record<string, string[]> = {};
  for (const field of FIELDS) {
    const values = form.getAll(`a.${field.key}`).filter((v) => v.trim() !== "");
    if (values.length) fields[field.key] = values.slice(0, MAX_VALUES).map((v) => v.slice(0, MAX_VALUE));
  }
  const note = (form.get("note") ?? "").slice(0, MAX_KEPT_NOTE);
  return Object.keys(fields).length === 0 && note.trim() === "" ? null : { companyId, fields, note };
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The draft as up to three cookie values, or null when it is too long to keep. */
export function packDraft(draft: Draft): string[] | null {
  const text = toBase64Url(JSON.stringify({ c: draft.companyId, f: draft.fields, n: draft.note }));
  const pieces: string[] = [];
  for (let i = 0; i < text.length; i += PIECE) pieces.push(text.slice(i, i + PIECE));
  return pieces.length > MAX_PIECES ? null : pieces;
}

/** The cookie values back to a draft, cut back to what the questionnaire asks; null when they are not a draft this person may see. */
export function unpackDraft(pieces: string[], companyId: string): Draft | null {
  if (pieces.length === 0) return null;
  const text = fromBase64Url(pieces.join(""));
  if (text === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { c, f, n } = raw as { c?: unknown; f?: unknown; n?: unknown };
  // A draft belongs to the company that typed it: after a sign-out and a sign-in as someone else, it is not shown.
  if (c !== companyId || typeof f !== "object" || f === null || Array.isArray(f)) return null;
  const fields: Record<string, string[]> = {};
  for (const field of FIELDS) {
    const values = Object.hasOwn(f, field.key) ? (f as Record<string, unknown>)[field.key] : undefined;
    if (!Array.isArray(values)) continue;
    const kept = values.filter((v): v is string => typeof v === "string").slice(0, MAX_VALUES).map((v) => v.slice(0, MAX_VALUE));
    if (kept.length) fields[field.key] = kept;
  }
  return { companyId, fields, note: typeof n === "string" ? n.slice(0, MAX_KEPT_NOTE) : "" };
}

const pieceName = (i: number) => `${DRAFT_COOKIE}_${i}`;
const ATTRIBUTES = "HttpOnly; Secure; SameSite=Strict; Path=/factory";

/** The Set-Cookie lines that keep these pieces (and clear any other piece left from before). Null pieces clear all of them. */
export function draftCookies(pieces: string[] | null): string[] {
  const lines: string[] = [];
  for (let i = 0; i < MAX_PIECES; i++) {
    const piece = pieces?.[i];
    lines.push(piece === undefined ? `${pieceName(i)}=; ${ATTRIBUTES}; Max-Age=0` : `${pieceName(i)}=${piece}; ${ATTRIBUTES}; Max-Age=${DRAFT_SECONDS}`);
  }
  return lines;
}

/** The pieces in a Cookie request header, in order, up to the first one that is missing. */
export function draftPieces(cookieHeader: string | null): string[] {
  if (!cookieHeader) return [];
  const jar = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const at = part.indexOf("=");
    if (at > 0) jar.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  const pieces: string[] = [];
  for (let i = 0; i < MAX_PIECES; i++) {
    const piece = jar.get(pieceName(i));
    if (!piece) break;
    pieces.push(piece);
  }
  return pieces;
}

/** The draft in a Cookie request header for this company, or null. */
export function readDraft(cookieHeader: string | null, companyId: string): Draft | null {
  return unpackDraft(draftPieces(cookieHeader), companyId);
}

/** A draft as the answers the page draws: numbers that are numbers stay numbers, anything else stays as typed so the owner can see what to change. */
export function draftAnswers(draft: Draft): Answers {
  const form = new URLSearchParams();
  for (const [key, values] of Object.entries(draft.fields)) for (const v of values) form.append(`a.${key}`, v);
  return answersFromForm(form);
}
