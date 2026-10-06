// Run: after work was accepted, the owner records what the factory was like before (a baseline) and looks again 30, 90 and 180
// days after the first acceptance (a review): the number, whether it did what the assessment expected, whether it is still in
// use. The page also says what comes next in the owner's plan. The owner types every number; nothing here measures anything,
// providers do not sign in (OQ-13), and nothing in it touches money or the listing fee (D-03).
import { authorizeCompanyRead, authorizeCompanyWrite } from "../../../platform/src/api/authorize.ts";
import type { Allowed } from "../../../platform/src/api/authorize.ts";
import { bodyField, takeBody } from "../../../platform/src/api/body.ts";
import type { Body } from "../../../platform/src/api/body.ts";
import { json, redirect } from "../../../platform/src/api/http.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { hasControlCharacters } from "../../../factory/src/questionnaire.ts";
import { loadEngagement } from "../../../deliver/src/db/engagements.ts";
import type { EngagementRecord } from "../../../deliver/src/db/engagements.ts";
import { presentAssessment } from "../../../diagnose/src/api/diagnose.ts";
import { loadAssessment } from "../../../diagnose/src/db/assessments.ts";
import { listRequirements } from "../../../procure/src/db/requirements.ts";
import { listCorrections, listOutcomes, recordBaseline, recordCorrection, recordReview } from "../db/outcomes.ts";
import type { CorrectionRow, OutcomeRow } from "../db/outcomes.ts";
import { IN_USE, MAX_NOTE_LENGTH, MAX_VALUE, VERDICTS, baselineBlock, isReviewNo, reviewSlots } from "../state.ts";
import type { BaselineBlock, InUse, ReviewSlot, Verdict } from "../state.ts";

export type PresentedOutcomes = {
  engagementId: string;
  title: string;
  /** What the assessment said this idea would do, in its own measure and unit (a SYNTHETIC assumption), or null if that assessment is not found. */
  expected: { measure: string; unit: "percent" | "days" | "rupees_per_year"; low: number; high: number; synthetic: true } | null;
  /** `value` is the current number: the latest correction's, or the number recorded when there is none. `recorded` is the number as it was first written. */
  baseline: ({ id: number; value: number; at: string; note: string } & Corrected) | null;
  firstAcceptedAt: string | null;
  /** The baseline can be taken once, after the plan is agreed, while the engagement is open and before anything is accepted. */
  canRecordBaseline: boolean;
  /** Why the baseline cannot be taken now (`recorded`, `too_late`, `closed`, `no_plan`), or null when it can. */
  baselineBlocked: BaselineBlock | null;
  reviews: (ReviewSlot & { record: ({ id: number; at: string; value: number; verdict: Verdict; inUse: InUse; note: string } & Corrected) | null })[];
  /** The latest review's current number less the baseline's current number, in the unit; null unless both exist. Not compared with the expected range: which way is better depends on the measure. */
  changeSinceBaseline: number | null;
  /** The first idea the owner accepted in the same assessment that has no requirement yet, in the assessment's order. */
  next: { opportunityId: string; title: string } | null;
};

/** How a number was corrected: the number first recorded, and every correction of it in order, the last of which gives the current value. */
export type Corrected = { recorded: number; corrections: { at: string; value: number; reason: string }[] };

/** The current value of a recorded number and its corrections. Every correction stays in the list; only the last one decides the value. */
export function corrected(row: { id: number; value: number }, all: readonly CorrectionRow[]): { value: number } & Corrected {
  const own = all.filter((c) => c.outcomeId === row.id).map((c) => ({ at: c.at, value: c.value, reason: c.reason }));
  return { value: own.length ? own[own.length - 1].value : row.value, recorded: row.value, corrections: own };
}

/** What a viewer needs: the measurements, which reviews are due, and what the plan says to do next. */
export async function presentOutcomes(db: D1Database, companyId: string, e: EngagementRecord, now: Date): Promise<PresentedOutcomes> {
  const events: OutcomeRow[] = await listOutcomes(db, companyId, e.id);
  const fixes = await listCorrections(db, companyId, e.id);
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
    return { ...s, record: row ? { id: row.id, at: row.at, verdict: row.verdict as Verdict, inUse: row.inUse as InUse, note: row.note, ...corrected(row, fixes) } : null };
  });
  const latest = [...reviews].reverse().find((r) => r.record)?.record ?? null;
  const baseline = baselineRow ? { id: baselineRow.id, at: baselineRow.at, note: baselineRow.note, ...corrected(baselineRow, fixes) } : null;
  const blocked = baselineBlock({ recorded: baselineRow !== null, accepted: firstAcceptedAt !== null, closed: e.events.some((x) => x.kind === "closed"), planAgreed: e.events.some((x) => x.kind === "plan_agreed") });
  return {
    engagementId: e.id,
    title: e.title,
    expected: item && view ? { measure: item.benefit.measure, unit: item.benefit.unit, low: item.benefit.low, high: item.benefit.high, synthetic: view.result.synthetic } : null,
    baseline,
    firstAcceptedAt,
    canRecordBaseline: blocked === null,
    baselineBlocked: blocked,
    reviews,
    changeSinceBaseline: latest && baseline ? latest.value - baseline.value : null,
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
  if (kind === "correction") return recordCorrectionFrom(body, form, allowed, engagementId, now);
  const value = readValue(bodyField(body, "value"));
  const noteRaw = bodyField(body, "note");
  const note = noteRaw === undefined || noteRaw === null ? "" : typeof noteRaw === "string" ? noteRaw.trim() : null;
  const fields: Record<string, string> = {};
  if (kind !== "baseline" && kind !== "review") fields.kind = "Say whether this is a baseline, a review or a correction.";
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
  // A starting number refused only for its number gets its own message, which does not talk about reviews.
  const baselineValueOnly = kind === "baseline" && Object.keys(fields).length === 1 && fields.value !== undefined;
  if (Object.keys(fields).length) return form ? redirect(baselineValueOnly ? "/run?problem=baseline_invalid" : "/run?problem=invalid") : json(400, { error: "invalid", fields });
  if (engagementId.length === 0 || engagementId.length > 64) return form ? redirect("/run?problem=missing") : json(404, { error: "not_found" });

  if (kind === "baseline") {
    // A closed engagement, or one whose plan is not agreed, takes no starting number. Checked here so that the owner is told why; the
    // database refuses the same rows (drizzle/0015_run_corrections.sql). A second number and a late one are left to the database's
    // own answers, which come first there too.
    const record = await loadEngagement(allowed.db, allowed.companyId, engagementId);
    if (!record) return form ? redirect("/run?problem=missing") : json(404, { error: "not_found" });
    const recorded = (await listOutcomes(allowed.db, allowed.companyId, engagementId)).some((x) => x.kind === "baseline");
    const blocked = baselineBlock({ recorded, accepted: record.events.some((x) => x.kind === "accepted"), closed: record.events.some((x) => x.kind === "closed"), planAgreed: record.events.some((x) => x.kind === "plan_agreed") });
    if (blocked === "closed") return form ? redirect("/run?problem=baseline_closed") : json(409, { error: "baseline_closed" });
    if (blocked === "no_plan") return form ? redirect("/run?problem=baseline_no_plan") : json(409, { error: "baseline_no_plan" });
  }

  const common = { companyId: allowed.companyId, userId: allowed.identity.userId, engagementId, value: value as number, note: note as string, at: now() };
  const done = kind === "baseline" ? await recordBaseline(allowed.db, common) : await recordReview(allowed.db, { ...common, reviewNo: reviewNo as 1 | 2 | 3, verdict: verdict as Verdict, inUse: inUse as InUse });
  if (done.ok) return form ? redirect(`/run?saved=${kind}`) : json(201, { ok: true });
  if (done.reason === "not_found") return form ? redirect("/run?problem=missing") : json(404, { error: "not_found" });
  return form ? redirect(`/run?problem=${done.reason}`) : json(409, { error: done.reason });
}

/**
 * A correction of a number already recorded (BR-RUN-09): the id of the baseline or review it corrects (`outcome` in a form, `outcomeId` in
 * JSON, a whole number), the number it should have been, and why (`reason`, required). The number it corrects is not changed; the page
 * shows both, and the latest correction is the current value. Allowed whether or not the engagement is closed: a typing slip can be found
 * late.
 */
async function recordCorrectionFrom(
  body: Body,
  form: boolean,
  allowed: Allowed,
  engagementId: string,
  now: () => Date,
): Promise<Response> {
  const value = readValue(bodyField(body, "value"));
  const reasonRaw = bodyField(body, "reason");
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : null;
  const outcomeRaw = bodyField(body, form ? "outcome" : "outcomeId");
  const outcomeId = form && typeof outcomeRaw === "string" && /^\d{1,15}$/.test(outcomeRaw) ? Number(outcomeRaw) : outcomeRaw;
  const fields: Record<string, string> = {};
  if (typeof outcomeId !== "number" || !Number.isSafeInteger(outcomeId) || outcomeId < 1) fields.outcomeId = "Say which recorded number this corrects.";
  if (value === null) fields.value = `Give a whole number from 0 to ${MAX_VALUE}.`;
  if (reason === null || reason.length === 0 || reason.length > MAX_NOTE_LENGTH || hasControlCharacters(reason)) fields.reason = `Say why the number was wrong, in up to ${MAX_NOTE_LENGTH} characters.`;
  for (const [name, raw] of [["reviewNo", bodyField(body, form ? "review" : "reviewNo")], ["verdict", bodyField(body, "verdict")], ["inUse", bodyField(body, form ? "in_use" : "inUse")], ["note", bodyField(body, "note")]] as const)
    if (raw !== undefined && raw !== null && raw !== "") fields[name] = "A correction has only the number, the reason and the number it corrects.";
  if (Object.keys(fields).length) return form ? redirect("/run?problem=correction_invalid") : json(400, { error: "invalid", fields });
  if (engagementId.length === 0 || engagementId.length > 64) return form ? redirect("/run?problem=missing") : json(404, { error: "not_found" });

  const done = await recordCorrection(allowed.db, { companyId: allowed.companyId, userId: allowed.identity.userId, engagementId, outcomeId: outcomeId as number, value: value as number, reason: reason as string, at: now() });
  if (done.ok) return form ? redirect("/run?saved=correction") : json(201, { ok: true });
  return form ? redirect("/run?problem=missing") : json(404, { error: "not_found" });
}
