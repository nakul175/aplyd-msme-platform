// Run: after work was accepted, the owner records what the factory was like before (a baseline) and looks again 30, 90 and 180
// days after the first acceptance (a review): the number, whether it did what the assessment expected, whether it is still in
// use. The page also says what comes next in the owner's plan. The owner types every number; nothing here measures anything,
// providers do not sign in (OQ-13), and nothing in it touches money or the listing fee (D-03).
import { authorizeCompanyRead, authorizeCompanyWrite } from "../../../platform/src/api/authorize.ts";
import { bodyField, takeBody } from "../../../platform/src/api/body.ts";
import { json, redirect } from "../../../platform/src/api/http.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { hasControlCharacters } from "../../../factory/src/questionnaire.ts";
import { loadEngagement } from "../../../deliver/src/db/engagements.ts";
import type { EngagementRecord } from "../../../deliver/src/db/engagements.ts";
import { presentAssessment } from "../../../diagnose/src/api/diagnose.ts";
import { loadAssessment } from "../../../diagnose/src/db/assessments.ts";
import { listRequirements } from "../../../procure/src/db/requirements.ts";
import { listOutcomes, recordBaseline, recordReview } from "../db/outcomes.ts";
import type { OutcomeRow } from "../db/outcomes.ts";
import { IN_USE, MAX_NOTE_LENGTH, MAX_VALUE, VERDICTS, isReviewNo, reviewSlots } from "../state.ts";
import type { InUse, ReviewSlot, Verdict } from "../state.ts";

export type PresentedOutcomes = {
  engagementId: string;
  title: string;
  /** What the assessment said this idea would do, in its own measure and unit (a SYNTHETIC assumption), or null if that assessment is not found. */
  expected: { measure: string; unit: "percent" | "days" | "rupees_per_year"; low: number; high: number; synthetic: true } | null;
  baseline: { value: number; at: string; note: string } | null;
  firstAcceptedAt: string | null;
  /** The baseline can be taken until something is accepted, and only once. */
  canRecordBaseline: boolean;
  reviews: (ReviewSlot & { record: { at: string; value: number; verdict: Verdict; inUse: InUse; note: string } | null })[];
  /** The latest review's number less the baseline, in the unit; null unless both exist. Not compared with the expected range: which way is better depends on the measure. */
  changeSinceBaseline: number | null;
  /** The first idea the owner accepted in the same assessment that has no requirement yet, in the assessment's order. */
  next: { opportunityId: string; title: string } | null;
};

/** What a viewer needs: the measurements, which reviews are due, and what the plan says to do next. */
export async function presentOutcomes(db: D1Database, companyId: string, e: EngagementRecord, now: Date): Promise<PresentedOutcomes> {
  const events: OutcomeRow[] = await listOutcomes(db, companyId, e.id);
  const accepted = e.events.filter((x) => x.kind === "accepted").sort((a, b) => a.id - b.id)[0];
  const firstAcceptedAt = accepted?.at ?? null;
  const baselineRow = events.find((x) => x.kind === "baseline") ?? null;
  const reviewRows = events.filter((x) => x.kind === "review");

  const requirements = await listRequirements(db, companyId);
  const requirement = requirements.find((r) => r.id === e.requirementId) ?? null;
  const record = requirement ? await loadAssessment(db, companyId, requirement.assessmentId) : null;
  const view = record ? await presentAssessment(record) : null;
  const item = view?.result.items.find((i) => i.opportunityId === e.opportunityId) ?? null;
  const asked = new Set(requirements.filter((r) => requirement && r.assessmentId === requirement.assessmentId).map((r) => r.opportunityId));
  const nextItem = view?.result.items.find((i) => view.standing.some((s) => s.opportunityId === i.opportunityId && s.decision === "accept") && !asked.has(i.opportunityId)) ?? null;

  const slots = reviewSlots({ firstAcceptedAt, now, recorded: reviewRows.map((r) => r.reviewNo as number) });
  const reviews = slots.map((s) => {
    const row = reviewRows.find((r) => r.reviewNo === s.no);
    return { ...s, record: row ? { at: row.at, value: row.value, verdict: row.verdict as Verdict, inUse: row.inUse as InUse, note: row.note } : null };
  });
  const latest = [...reviews].reverse().find((r) => r.record)?.record ?? null;
  return {
    engagementId: e.id,
    title: e.title,
    expected: item && view ? { measure: item.benefit.measure, unit: item.benefit.unit, low: item.benefit.low, high: item.benefit.high, synthetic: view.result.synthetic } : null,
    baseline: baselineRow ? { value: baselineRow.value, at: baselineRow.at, note: baselineRow.note } : null,
    firstAcceptedAt,
    canRecordBaseline: baselineRow === null && firstAcceptedAt === null,
    reviews,
    changeSinceBaseline: latest && baselineRow ? latest.value - baselineRow.value : null,
    next: nextItem ? { opportunityId: nextItem.opportunityId, title: nextItem.title } : null,
  };
}

/** GET the measurements of one engagement of the company. Another company's engagement looks the same as one that does not exist. */
export async function handleOutcomeRead(request: Request, env: AppEnv, requestedId: string, engagementId: string, now: () => Date = () => new Date()): Promise<Response> {
  const allowed = await authorizeCompanyRead(request, env, requestedId, "outcome.read.denied");
  if (allowed instanceof Response) return allowed;
  const record = await loadEngagement(allowed.db, allowed.companyId, engagementId);
  return record ? json(200, await presentOutcomes(allowed.db, allowed.companyId, record, now())) : json(404, { error: "not_found" });
}

function readValue(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d{1,10}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_VALUE ? n : null;
}

/** POST a baseline or one review. A baseline is taken once, before anything is accepted; a review once each, from the day it falls due. */
export async function handleOutcomeRecord(request: Request, env: AppEnv, requestedId: string, engagementId: string, now: () => Date = () => new Date()): Promise<Response> {
  const allowed = await authorizeCompanyWrite(request, env, requestedId, "outcome.write.denied");
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";

  const kind = bodyField(body, "kind");
  const value = readValue(bodyField(body, "value"));
  const noteRaw = bodyField(body, "note");
  const note = noteRaw === undefined || noteRaw === null ? "" : typeof noteRaw === "string" ? noteRaw.trim() : null;
  const fields: Record<string, string> = {};
  if (kind !== "baseline" && kind !== "review") fields.kind = "Say whether this is a baseline or a review.";
  if (value === null) fields.value = `Give a whole number from 0 to ${MAX_VALUE}.`;
  if (note === null || note.length > MAX_NOTE_LENGTH || hasControlCharacters(note)) fields.note = `Keep the note to text under ${MAX_NOTE_LENGTH} characters.`;
  const reviewRaw = bodyField(body, form ? "review" : "reviewNo");
  const reviewNo = form && typeof reviewRaw === "string" && /^[123]$/.test(reviewRaw) ? Number(reviewRaw) : reviewRaw; // a form sends text; JSON must send a number
  const verdict = bodyField(body, "verdict");
  const inUse = bodyField(body, form ? "in_use" : "inUse");
  if (kind === "review") {
    if (!isReviewNo(reviewNo)) fields.reviewNo = "Say which review: 1, 2 or 3.";
    if (typeof verdict !== "string" || !(VERDICTS as readonly string[]).includes(verdict)) fields.verdict = "Say whether it did what the assessment expected.";
    if (typeof inUse !== "string" || !(IN_USE as readonly string[]).includes(inUse)) fields.inUse = "Say whether it is still in use.";
  } else if (kind === "baseline") {
    for (const [name, raw] of [["reviewNo", reviewRaw], ["verdict", verdict], ["inUse", inUse]] as const) if (raw !== undefined && raw !== null && raw !== "") fields[name] = "A baseline has no review number, verdict or use.";
  }
  if (Object.keys(fields).length) return form ? redirect("/run?problem=invalid") : json(400, { error: "invalid", fields });
  if (engagementId.length === 0 || engagementId.length > 64) return form ? redirect("/run?problem=missing") : json(404, { error: "not_found" });

  const common = { companyId: allowed.companyId, userId: allowed.identity.userId, engagementId, value: value as number, note: note as string, at: now() };
  const done = kind === "baseline" ? await recordBaseline(allowed.db, common) : await recordReview(allowed.db, { ...common, reviewNo: reviewNo as 1 | 2 | 3, verdict: verdict as Verdict, inUse: inUse as InUse });
  if (done.ok) return form ? redirect(`/run?saved=${kind}`) : json(201, { ok: true });
  if (done.reason === "not_found") return form ? redirect("/run?problem=missing") : json(404, { error: "not_found" });
  return form ? redirect(`/run?problem=${done.reason}`) : json(409, { error: done.reason });
}
