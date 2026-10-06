// Page addresses: what a page reads from the part after the question mark.
// A name repeated in the address (`?missing=a&missing=b`) reaches a page as a list, not as text. A page that treats every value as text then
// fails on a list (S3-03). This reads each name a page uses as its first text, and anything else as absent.

/** The first text for each named value, or undefined. Only the names given are read, so nothing else in the address reaches the page. */
export function firstTexts<K extends string>(raw: Record<string, unknown> | null | undefined, names: readonly K[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  if (!raw) return out;
  for (const name of names) {
    if (!Object.hasOwn(raw, name)) continue;
    const v = raw[name];
    const first = Array.isArray(v) ? v[0] : v;
    if (typeof first === "string") out[name] = first;
  }
  return out;
}

/** A saved version number as the page may print it: whole digits and nothing else. */
export const isVersionNumber = (v: string | undefined): v is string => v !== undefined && /^\d{1,9}$/.test(v);
