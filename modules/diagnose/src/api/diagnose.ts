// Diagnose: make an assessment from the owner's confirmed description, read it, decide on each item, and sign it off.
// The scope rule is the platform's own and is applied here on the server; the company id in the URL is only compared with the
// signed-in person's company, and every query is bound to the person's company.
import { authorizeCompanyRead, authorizeCompanyWrite } from "../../../platform/src/api/authorize.ts";
import { bodyField, takeBody } from "../../../platform/src/api/body.ts";
import { json, redirect } from "../../../platform/src/api/http.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { loadLatest } from "../../../factory/src/db/revisions.ts";
import { hasControlCharacters } from "../../../factory/src/questionnaire.ts";
import { appendDecision, appendSignOff, createAssessment, listAssessments, loadAssessment } from "../db/assessments.ts";
import type { AssessmentRecord, SignOffResult } from "../db/assessments.ts";
import { digestOf, standingDecisions } from "../digest.ts";
import { diagnose } from "../engine.ts";

export const MAX_NOTE_LENGTH = 500;
export const DECISIONS = ["accept", "defer", "reject"] as const;
export type DecisionValue = (typeof DECISIONS)[number];

/** What the page says to a signed-in person who is not an owner: a member of a company is told what they can do, not that they have no company. */
export const notOwnerMessage = (isMemberOfACompany: boolean): string =>
  isMemberOfACompany
    ? "This page is for the owner of the company. You are signed in as a member of it, and only the owner can make and sign off an assessment."
    : "This page is for the owner of a company. Your account is not linked to one.";

/** What a viewer needs: the assessment, the decision standing on each item, the history, and the sign-off with a check of its digest. */
export async function presentAssessment(a: AssessmentRecord) {
  const decisions = a.events.filter((e) => e.kind === "decision");
  const standing = standingDecisions(a.result, decisions);
  const signoff = a.events.find((e) => e.kind === "signoff") ?? null;
  const covered = signoff ? standingDecisions(a.result, decisions.filter((d) => d.id < signoff.id)) : null;
  return {
    id: a.id,
    factoryRevisionNo: a.factoryRevisionNo,
    libraryVersion: a.libraryVersion,
    engineVersion: a.engineVersion,
    createdAt: a.createdAt,
    result: a.result,
    standing,
    history: decisions.map((d) => ({ at: d.at, opportunityId: d.opportunityId, decision: d.decision, note: d.note })),
    signoff: signoff && covered ? { at: signoff.at, note: signoff.note, digest: signoff.digest ?? "", digestMatches: signoff.digest !== null && (await digestOf(a.id, a.result, covered)) === signoff.digest } : null,
  };
}

/** GET the company's assessments, newest first. */
export async function handleAssessmentList(request: Request, env: AppEnv, requestedId: string): Promise<Response> {
  const allowed = await authorizeCompanyRead(request, env, requestedId, "assessment.read.denied");
  if (allowed instanceof Response) return allowed;
  return json(200, { assessments: await listAssessments(allowed.db, allowed.companyId) });
}

/** GET one assessment of the company. An id that is another company's looks the same as one that does not exist. */
export async function handleAssessmentRead(request: Request, env: AppEnv, requestedId: string, assessmentId: string): Promise<Response> {
  const allowed = await authorizeCompanyRead(request, env, requestedId, "assessment.read.denied");
  if (allowed instanceof Response) return allowed;
  const record = await loadAssessment(allowed.db, allowed.companyId, assessmentId);
  if (!record) return json(404, { error: "not_found" });
  return json(200, await presentAssessment(record));
}

/**
 * POST: make an assessment from the newest version of the description the owner confirmed. The same description, library and
 * engine always give the same result, so running it again returns the assessment that is already there (200, not 201).
 */
export async function handleAssessmentCreate(request: Request, env: AppEnv, requestedId: string): Promise<Response> {
  const allowed = await authorizeCompanyWrite(request, env, requestedId, "assessment.write.denied");
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";

  const revision = await loadLatest(allowed.db, allowed.companyId, "confirmed");
  if (!revision) return form ? redirect("/diagnose?needs=confirm") : json(409, { error: "no_confirmed_description" });
  const result = diagnose(revision.answers);
  const made = await createAssessment(allowed.db, { companyId: allowed.companyId, userId: allowed.identity.userId, factoryRevisionNo: revision.revision, result });
  if (!made.ok) return form ? redirect("/diagnose?needs=confirm") : json(409, { error: made.reason });
  if (form) return redirect(`/diagnose?a=${encodeURIComponent(made.id)}`);
  return json(made.created ? 201 : 200, { id: made.id, created: made.created, factoryRevisionNo: revision.revision });
}

function readNote(raw: unknown): string | { error: string } {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") return { error: "Write the note as text." };
  const note = raw.trim();
  if (note.length > MAX_NOTE_LENGTH) return { error: `Keep the note under ${MAX_NOTE_LENGTH} characters.` };
  if (hasControlCharacters(note)) return { error: "The note has characters that cannot be saved." };
  return note;
}

const field = bodyField;

/** POST a decision on one item of an assessment. A later decision on the same item replaces the earlier one in effect; both are kept. */
export async function handleDecisionCreate(request: Request, env: AppEnv, requestedId: string, assessmentId: string): Promise<Response> {
  const allowed = await authorizeCompanyWrite(request, env, requestedId, "assessment.write.denied");
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";
  const back = (query: string) => redirect(`/diagnose?a=${encodeURIComponent(assessmentId)}&${query}`);

  const opportunityId = field(body, form ? "opportunity" : "opportunityId");
  const decision = field(body, "decision");
  const note = readNote(field(body, "note"));
  const fields: Record<string, string> = {};
  if (typeof opportunityId !== "string" || opportunityId.length === 0 || opportunityId.length > 80) fields.opportunityId = "Say which item this is about.";
  if (typeof decision !== "string" || !(DECISIONS as readonly string[]).includes(decision)) fields.decision = "Choose accept, defer or reject.";
  if (typeof note === "object") fields.note = note.error;
  if (Object.keys(fields).length) return form ? back("problem=decision") : json(400, { error: "invalid", fields });

  const result = await appendDecision(allowed.db, { companyId: allowed.companyId, userId: allowed.identity.userId, assessmentId, opportunityId: opportunityId as string, decision: decision as DecisionValue, note: note as string });
  if (result.ok) return form ? back(`saved=${encodeURIComponent(opportunityId as string)}`) : json(201, { ok: true });
  if (result.reason === "signed_off") return form ? back("problem=signed") : json(409, { error: "signed_off" });
  if (result.reason === "unknown_item") return form ? back("problem=decision") : json(400, { error: "invalid", fields: { opportunityId: "That item is not in this assessment." } });
  if (result.reason === "too_many") return form ? back("problem=too_many") : json(409, { error: "too_many_decisions" });
  // Another company's assessment and one that does not exist look the same, for a form as for the API.
  return form ? redirect("/diagnose?problem=missing") : json(404, { error: "not_found" });
}

/** POST the sign-off: the owner says they have read the assessment and every decision on it is theirs. Needs a decision on every item. */
export async function handleSignOff(request: Request, env: AppEnv, requestedId: string, assessmentId: string): Promise<Response> {
  const allowed = await authorizeCompanyWrite(request, env, requestedId, "assessment.write.denied");
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";
  const back = (query: string) => redirect(`/diagnose?a=${encodeURIComponent(assessmentId)}&${query}`);

  const note = readNote(field(body, "note"));
  if (typeof note === "object") return form ? back("problem=note") : json(400, { error: "invalid", fields: { note: note.error } });

  const record = await loadAssessment(allowed.db, allowed.companyId, assessmentId);
  if (!record) return form ? redirect("/diagnose?problem=missing") : json(404, { error: "not_found" });
  const decisions = record.events.filter((e) => e.kind === "decision");
  const digest = await digestOf(record.id, record.result, standingDecisions(record.result, decisions));
  const result = await appendSignOff(allowed.db, { companyId: allowed.companyId, userId: allowed.identity.userId, assessmentId, note, digest, decisionCount: decisions.length });
  return signOffAnswer(result, form, assessmentId, digest);
}

/** What a person is told about the outcome of a sign-off: a page for a form post, JSON for anything else. Apart from the sign-off itself, no outcome answers a form post with JSON. */
export function signOffAnswer(result: SignOffResult, form: boolean, assessmentId: string, digest: string): Response {
  const back = (query: string) => redirect(`/diagnose?a=${encodeURIComponent(assessmentId)}&${query}`);
  if (result.ok) return form ? back("signed=1") : json(201, { ok: true, digest });
  if (result.reason === "undecided") return form ? back("problem=undecided") : json(409, { error: "undecided" });
  if (result.reason === "already_signed_off") return form ? back("problem=signed") : json(409, { error: "already_signed_off" });
  if (result.reason === "no_items") return form ? back("problem=no_items") : json(409, { error: "no_items" });
  if (result.reason === "changed") return form ? back("problem=changed") : json(409, { error: "changed", detail: "A decision was added while this was being signed. Read it again." });
  return form ? redirect("/diagnose?problem=missing") : json(404, { error: "not_found" });
}
