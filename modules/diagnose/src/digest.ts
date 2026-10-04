// What a sign-off covers, as a fingerprint. The digest is SHA-256 over a canonical (key-sorted) JSON of the assessment's id,
// its whole result and the decision standing on each item, with their notes. Anyone can recompute it later from the
// stored rows; if the rows were changed outside the application, it no longer matches.
import type { Result } from "./engine.ts";

export type StandingDecision = { opportunityId: string; decision: string; note: string };

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** The decision that stands on each item of the result, in the result's order. An item with no decision gets none. */
export function standingDecisions(result: Result, decisions: { opportunityId: string | null; decision: string | null; note: string }[]): StandingDecision[] {
  const latest = new Map<string, StandingDecision>();
  for (const d of decisions) if (d.opportunityId && d.decision) latest.set(d.opportunityId, { opportunityId: d.opportunityId, decision: d.decision, note: d.note });
  return result.items.flatMap((i) => {
    const d = latest.get(i.opportunityId);
    return d ? [d] : [];
  });
}

export async function digestOf(assessmentId: string, result: Result, standing: StandingDecision[]): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson({ assessmentId, result, standing }));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
