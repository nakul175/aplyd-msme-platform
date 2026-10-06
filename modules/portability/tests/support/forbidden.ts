// What must never be a key in the export file, at any depth (BR-GOV-05, D-03): the provider register and a provider's own summary,
// anything about a listing, a fee or the terms, a secret, a session, an email address, the audit log or a pool. The owner's own
// records of a price agreed (`agreedInr`) and a payment made (`amountInr`), and the provider they chose (`chosenProvider`), are theirs.
export const FORBIDDEN_KEY = /^providers$|^providerSummary$|^services$|^listed|listing|fee|^terms|secret|password|token|session|cookie|email|audit|pool/i;

/** Every key of every object in the value, at any depth, with its path. */
export function keysOf(value: unknown, path = "$"): { key: string; path: string }[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => keysOf(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => [{ key: k, path: `${path}.${k}` }, ...keysOf(v, `${path}.${k}`)]);
  return [];
}
