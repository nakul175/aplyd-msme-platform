// Builds session tokens that the application's own signSession would never produce, signed with the real key,
// so a test can check that verification rejects a bad CLAIM and not only a bad signature.
const encoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function signRaw(payloadText: string, secret: string): Promise<string> {
  const payload = toBase64Url(encoder.encode(payloadText));
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(mac))}`;
}
