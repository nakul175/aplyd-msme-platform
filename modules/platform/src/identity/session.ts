// Signed session tokens: base64url(payload) + "." + base64url(HMAC-SHA256). The token carries only the user id and an expiry.
// Company and role always come from the database, never from the token.

export const SESSION_COOKIE = "aplyd_session";
export const SESSION_SECONDS = 8 * 60 * 60;

export type SessionClaims = { u: string; exp: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (text.length % 4)) % 4);
  try {
    const raw = atob(padded);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signSession(userId: string, secret: string, nowSeconds: number): Promise<string> {
  const claims: SessionClaims = { u: userId, exp: nowSeconds + SESSION_SECONDS };
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(mac))}`;
}

export async function verifySession(token: string, secret: string, nowSeconds: number): Promise<SessionClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, mac] = parts;
  const macBytes = fromBase64Url(mac);
  if (!macBytes) return null;
  // crypto.subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), macBytes, encoder.encode(payload));
  if (!ok) return null;
  const body = fromBase64Url(payload);
  if (!body) return null;
  try {
    const claims = JSON.parse(decoder.decode(body)) as Partial<SessionClaims>;
    if (typeof claims.u !== "string" || typeof claims.exp !== "number") return null;
    if (claims.exp <= nowSeconds) return null;
    return { u: claims.u, exp: claims.exp };
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
