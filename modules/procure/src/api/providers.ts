// The provider registry, the listing fee and the pools the platform can take to providers. Entered and managed by a platform
// operator (a signed-in person with the operator role and no company); a provider does not sign in here. Every signed-in person
// may read the list of listed providers. No endpoint here reads a company's record.
import { authorizeOperator, authorizeSignedIn } from "../../../platform/src/api/authorize.ts";
import { bodyField, takeBody } from "../../../platform/src/api/body.ts";
import type { Body } from "../../../platform/src/api/body.ts";
import { json, redirect } from "../../../platform/src/api/http.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { LIBRARY } from "../../../diagnose/src/library.ts";
import { hasControlCharacters } from "../../../factory/src/questionnaire.ts";
import { isCluster } from "../clusters.ts";
import { listPoolsAtFloor } from "../db/pool.ts";
import { createProvider, currentTerms, listAllProviders, listProvider, listPublicProviders, listTermsHistory, setTerms, unlistProvider } from "../db/providers.ts";
import type { Service } from "../db/providers.ts";

export const MAX_NAME_LENGTH = 100;
export const MAX_SUMMARY_LENGTH = 300;
export const MAX_NOTE_LENGTH = 500;
export const MAX_SERVICES = 20;
/** A sanity bound on the fee, in rupees. It is not a proposal; the fee itself is undecided (OQ-11). */
export const MAX_FEE_INR = 10_000_000;

const OPPORTUNITY_IDS = new Set(LIBRARY.map((o) => o.id));
/** Trimmed text within the limit and free of control characters, or null. An absent value is "" when it is optional and null when it is required. */
function text(raw: unknown, max: number, required: boolean): string | null {
  if (raw === undefined || raw === null) return required ? null : "";
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (required && t.length === 0) return null;
  if (t.length > max || hasControlCharacters(t)) return null;
  return t;
}

/** GET every listed provider. For any signed-in person. */
export async function handlePublicProviders(request: Request, env: AppEnv): Promise<Response> {
  const allowed = await authorizeSignedIn(request, env);
  if (allowed instanceof Response) return allowed;
  return json(200, { providers: await listPublicProviders(allowed.db) });
}

/** GET (operator) every provider, listed or not, and the terms in force. */
export async function handleOperatorProviders(request: Request, env: AppEnv): Promise<Response> {
  const allowed = await authorizeOperator(request, env, "operator.read.denied", false);
  if (allowed instanceof Response) return allowed;
  return json(200, { providers: await listAllProviders(allowed.db), terms: await currentTerms(allowed.db) });
}

function readServices(body: Body): Service[] | null {
  if (body.kind === "json") {
    const raw = body.value.services;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SERVICES) return null;
    const out: Service[] = [];
    for (const s of raw) {
      if (typeof s !== "object" || s === null) return null;
      const { opportunityId, cluster } = s as Record<string, unknown>;
      if (typeof opportunityId !== "string" || !OPPORTUNITY_IDS.has(opportunityId) || !isCluster(cluster)) return null;
      out.push({ opportunityId, cluster });
    }
    return out;
  }
  if (body.kind === "form") {
    const opportunities = body.form.getAll("opportunity");
    const clusters = body.form.getAll("cluster");
    if (opportunities.length === 0 || clusters.length === 0 || opportunities.length * clusters.length > MAX_SERVICES) return null;
    if (!opportunities.every((o) => OPPORTUNITY_IDS.has(o)) || !clusters.every(isCluster)) return null;
    return [...new Set(opportunities)].flatMap((opportunityId) => [...new Set(clusters)].map((cluster) => ({ opportunityId, cluster })));
  }
  return null;
}

/** POST (operator) a provider and what it serves. It is not listed until listed. */
export async function handleProviderCreate(request: Request, env: AppEnv): Promise<Response> {
  const allowed = await authorizeOperator(request, env, "operator.write.denied", true);
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";
  const back = (query: string) => redirect(`/operator?${query}`);

  const name = text(bodyField(body, "name"), MAX_NAME_LENGTH, true);
  const summary = text(bodyField(body, "summary"), MAX_SUMMARY_LENGTH, false);
  const services = readServices(body);
  const fields: Record<string, string> = {};
  if (name === null) fields.name = `Give a name of up to ${MAX_NAME_LENGTH} characters.`;
  if (summary === null) fields.summary = `Keep the summary to text under ${MAX_SUMMARY_LENGTH} characters.`;
  if (services === null) fields.services = "Choose what it serves: ideas from the library, in clusters from the list.";
  if (Object.keys(fields).length) return form ? back("problem=provider") : json(400, { error: "invalid", fields });

  const made = await createProvider(allowed.db, { userId: allowed.identity.userId, name: name as string, summary: summary as string, services: services as Service[] });
  if (!made.ok) return form ? back("problem=provider") : json(400, { error: "invalid", fields: { services: "Each service may be named once." } });
  return form ? back(`made=${encodeURIComponent(made.id)}`) : json(201, { id: made.id });
}

const readNote = (body: Body): string | null => text(bodyField(body, "note"), MAX_NOTE_LENGTH, false);

/**
 * POST (operator) list a provider. The body is read for a note and for nothing else: whatever fee it names is ignored, because
 * the fee is the one in force for every provider (D-03).
 */
export async function handleProviderList(request: Request, env: AppEnv, providerId: string): Promise<Response> {
  const allowed = await authorizeOperator(request, env, "operator.write.denied", true);
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";
  const note = readNote(body);
  if (note === null) return form ? redirect("/operator?problem=note") : json(400, { error: "invalid", fields: { note: `Keep the note to text under ${MAX_NOTE_LENGTH} characters.` } });
  if (providerId.length === 0 || providerId.length > 64) return form ? redirect("/operator?problem=missing") : json(404, { error: "not_found" });

  const result = await listProvider(allowed.db, { userId: allowed.identity.userId, providerId, note });
  if (result.ok) return form ? redirect("/operator?listed=1") : json(201, { ok: true, feeInr: result.feeInr });
  if (result.reason === "not_found") return form ? redirect("/operator?problem=missing") : json(404, { error: "not_found" });
  return form ? redirect(`/operator?problem=${result.reason}`) : json(409, { error: result.reason });
}

/** POST (operator) unlist a provider. Its earlier listing and fee stay on record. */
export async function handleProviderUnlist(request: Request, env: AppEnv, providerId: string): Promise<Response> {
  const allowed = await authorizeOperator(request, env, "operator.write.denied", true);
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";
  const note = readNote(body);
  if (note === null) return form ? redirect("/operator?problem=note") : json(400, { error: "invalid", fields: { note: `Keep the note to text under ${MAX_NOTE_LENGTH} characters.` } });
  if (providerId.length === 0 || providerId.length > 64) return form ? redirect("/operator?problem=missing") : json(404, { error: "not_found" });

  const result = await unlistProvider(allowed.db, { userId: allowed.identity.userId, providerId, note });
  if (result.ok) return form ? redirect("/operator?unlisted=1") : json(201, { ok: true });
  if (result.reason === "not_found") return form ? redirect("/operator?problem=missing") : json(404, { error: "not_found" });
  return form ? redirect("/operator?problem=not_listed") : json(409, { error: "not_listed" });
}

/** GET (operator) the fee in force and every earlier version. */
export async function handleTermsRead(request: Request, env: AppEnv): Promise<Response> {
  const allowed = await authorizeOperator(request, env, "operator.read.denied", false);
  if (allowed instanceof Response) return allowed;
  return json(200, { terms: await currentTerms(allowed.db), history: await listTermsHistory(allowed.db) });
}

/** POST (operator) a new listing fee, in whole rupees: one number for every provider. */
export async function handleTermsSet(request: Request, env: AppEnv): Promise<Response> {
  const allowed = await authorizeOperator(request, env, "operator.write.denied", true);
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";
  const raw = bodyField(body, "feeInr");
  const fee = typeof raw === "number" ? raw : typeof raw === "string" && /^\d{1,8}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  const note = readNote(body);
  const fields: Record<string, string> = {};
  if (!Number.isInteger(fee) || fee < 1 || fee > MAX_FEE_INR) fields.feeInr = `Give a whole number of rupees from 1 to ${MAX_FEE_INR}.`;
  if (note === null) fields.note = `Keep the note to text under ${MAX_NOTE_LENGTH} characters.`;
  if (Object.keys(fields).length) return form ? redirect("/operator?problem=fee") : json(400, { error: "invalid", fields });
  const terms = await setTerms(allowed.db, { userId: allowed.identity.userId, feeInr: fee, note: note as string });
  return form ? redirect("/operator?fee=1") : json(201, { terms });
}

/** The pools of at least five companies, for the operator: counts only. A smaller pool is not listed, so its size is not published to anyone (C-04). */
export const presentPools = (db: D1Database) => listPoolsAtFloor(db);

/** GET (operator) the pools of at least five companies. */
export async function handlePools(request: Request, env: AppEnv): Promise<Response> {
  const allowed = await authorizeOperator(request, env, "operator.read.denied", false);
  if (allowed instanceof Response) return allowed;
  return json(200, { pools: await presentPools(allowed.db) });
}
