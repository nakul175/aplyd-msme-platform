// Describe: read a company's factory record, and append a revision to it.
// The scope rule is enforced here, on the server, with the platform's own functions. The company id in the URL is only
// compared with the signed-in person's company; every query is bound to the person's company.
import type { AppEnv } from "../../../platform/src/env.ts";
import { recordAudit } from "../../../platform/src/db/audit.ts";
import { readTextWithin } from "../../../platform/src/api/body.ts";
import { drain, json, redirect } from "../../../platform/src/api/http.ts";
import { isCrossSite } from "../../../platform/src/identity/cross-site.ts";
import { resolveIdentity } from "../../../platform/src/identity/resolve.ts";
import { canReadCompany, canWriteOwnCompany } from "../../../platform/src/identity/scope.ts";
import type { Identity } from "../../../platform/src/identity/scope.ts";
import { appendRevision, loadHistory, loadLatest } from "../db/revisions.ts";
import { MAX_NOTE_LENGTH, QUESTIONNAIRE_VERSION, REQUIRED_TO_CONFIRM, SECTIONS, answersFromForm, hasControlCharacters, validateAnswers } from "../questionnaire.ts";
import type { Answers } from "../questionnaire.ts";

const refuse = (db: D1Database, event: string, identity: Identity, requested: string) =>
  recordAudit(db, event, { userId: identity.userId, companyId: identity.companyId, detail: { requested: requested.slice(0, 64) } });

/** GET the latest revision, the latest confirmed one and the history, for the signed-in person's own company. */
export async function handleFactoryRead(request: Request, env: AppEnv, requestedId: string): Promise<Response> {
  if (!env.DB) return json(503, { error: "storage_unavailable" });
  const identity = await resolveIdentity(request, env);
  if (!identity) return json(401, { error: "not_signed_in" });
  if (!canReadCompany(identity, requestedId)) {
    await refuse(env.DB, "factory.read.denied", identity, requestedId);
    return json(404, { error: "not_found" });
  }
  const companyId = identity.companyId!;
  const [latest, latestConfirmed, history] = await Promise.all([loadLatest(env.DB, companyId), loadLatest(env.DB, companyId, "confirmed"), loadHistory(env.DB, companyId)]);
  // The history lists the newest HISTORY_LIMIT revisions; `revisionsSaved` says how many there are in all (the latest number, as there are no gaps).
  return json(200, { questionnaireVersion: QUESTIONNAIRE_VERSION, latest, latestConfirmed, history, revisionsSaved: latest?.revision ?? 0 });
}

type Submission = { answers: unknown; note: string; confirm: boolean; basedOn: unknown; form: boolean };

/** Larger than any legitimate description (the longest answers add up to about 6 KB). */
const MAX_BODY_CHARACTERS = 64 * 1024;

async function readSubmission(request: Request): Promise<Submission | "unsupported" | "too_large" | null> {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  try {
    if (type !== "application/x-www-form-urlencoded" && type !== "application/json") return "unsupported";
    const read = await readTextWithin(request, MAX_BODY_CHARACTERS);
    if (!read.ok) return read.problem === "too_large" ? "too_large" : null;
    const text = read.text;
    if (text.length > MAX_BODY_CHARACTERS) return "too_large";
    if (type === "application/x-www-form-urlencoded") {
      const form = new URLSearchParams(text);
      const basedOn = form.get("based_on");
      return { answers: answersFromForm(form), note: (form.get("note") ?? "").trim(), confirm: form.get("intent") === "confirm", basedOn: basedOn !== null && /^\d{1,9}$/.test(basedOn) ? Number(basedOn) : basedOn, form: true };
    }
    if (type === "application/json") {
      const b: unknown = JSON.parse(text);
      if (typeof b !== "object" || b === null || Array.isArray(b)) return null;
      const { answers, note, confirm, basedOn } = b as { answers?: unknown; note?: unknown; confirm?: unknown; basedOn?: unknown };
      if (note !== undefined && typeof note !== "string") return null;
      if (confirm !== undefined && typeof confirm !== "boolean") return null;
      return { answers, note: (note ?? "").trim(), confirm: confirm === true, basedOn, form: false };
    }
  } catch {
    return null;
  }
  return "unsupported";
}

const LABEL_KEYS = new Set(SECTIONS.flatMap((x) => x.fields).map((f) => f.key));
const missingRequired = (answers: Answers) => REQUIRED_TO_CONFIRM.filter((k) => !(k in answers));

/**
 * POST a new revision. The body names the revision it starts from (basedOn); if someone saved in between, the answer is
 * 409 and nothing is written. Confirming needs the required questions answered. A form that asks to confirm without them
 * is saved as a draft instead, so typed answers are never lost, and the redirect says what is missing.
 */
export async function handleRevisionCreate(request: Request, env: AppEnv, requestedId: string): Promise<Response> {
  if (isCrossSite(request)) {
    await drain(request);
    return json(403, { error: "cross_site_refused" });
  }
  if (!env.DB) {
    await drain(request);
    return json(503, { error: "storage_unavailable" });
  }
  const identity = await resolveIdentity(request, env);
  if (!identity) {
    await drain(request);
    return json(401, { error: "not_signed_in" });
  }
  if (!canReadCompany(identity, requestedId)) {
    await drain(request);
    await refuse(env.DB, "factory.write.denied", identity, requestedId);
    return json(404, { error: "not_found" });
  }
  if (!canWriteOwnCompany(identity, requestedId)) {
    await drain(request);
    await refuse(env.DB, "factory.write.denied", identity, requestedId);
    return json(403, { error: "forbidden" });
  }

  const submission = await readSubmission(request);
  if (submission === "unsupported") {
    await drain(request);
    return json(415, { error: "unsupported_content_type" });
  }
  if (submission === "too_large") return json(413, { error: "too_large" });
  if (submission === null) return json(400, { error: "bad_request" });
  const back = (query: string) => redirect(`/factory?${query}`);

  // A person at a form is sent back to the page with what went wrong, never to a page of JSON; a program gets the JSON.
  const refuseInput = (fields: Record<string, string>, problem: string) => (submission.form ? back(`problem=${problem}`) : json(400, { error: "invalid", fields }));
  if (!Number.isInteger(submission.basedOn) || (submission.basedOn as number) < 0) return refuseInput({ basedOn: "Say which revision this starts from (0 for the first)." }, "request");
  if (submission.note.length > MAX_NOTE_LENGTH || hasControlCharacters(submission.note)) return refuseInput({ note: `Keep the note under ${MAX_NOTE_LENGTH} characters, as plain text.` }, "note");

  const valid = validateAnswers(submission.answers, { confirm: false });
  if (!valid.ok) {
    // The page names the questions by their keys, which are checked against the questionnaire: nothing the sender wrote is echoed back.
    const keys = Object.keys(valid.errors).filter((k) => LABEL_KEYS.has(k));
    return submission.form ? back(`problem=invalid${keys.length ? `&fields=${keys.join(",")}` : ""}`) : json(400, { error: "invalid", fields: valid.errors });
  }

  const missing = submission.confirm ? missingRequired(valid.answers) : [];
  if (missing.length && !submission.form) {
    return json(400, { error: "invalid", fields: Object.fromEntries(missing.map((k) => [k, "Answer this before you confirm the description."])) });
  }
  const confirmed = submission.confirm && missing.length === 0;

  const companyId = identity.companyId!;
  const result = await appendRevision(env.DB, { companyId, userId: identity.userId, basedOn: submission.basedOn as number, answers: valid.answers, note: submission.note, confirmed, questionnaireVersion: QUESTIONNAIRE_VERSION });
  if (!result.ok && result.reason === "too_many") return submission.form ? back("problem=too_many") : json(409, { error: "too_many_revisions" });
  if (!result.ok) return submission.form ? back("stale=1") : json(409, { error: "stale", latest: result.latest });

  if (submission.form) return back(`saved=${result.revision}${confirmed ? "&confirmed=1" : ""}${missing.length ? `&missing=${missing.join(",")}` : ""}`);
  return json(201, { revision: result.revision, confirmed });
}
