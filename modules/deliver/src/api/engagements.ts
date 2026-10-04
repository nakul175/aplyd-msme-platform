// Deliver: an owner chooses one of the providers listed for a requirement, builds the milestone plan with the acceptance test for
// each, agrees it, and then records what happens: delivered (as the provider told them), accepted or rejected against the test, a
// payment made outside the platform, and the close. The scope rule is the platform's own and is applied here on the server. No
// money moves, providers do not sign in (OQ-13), and the platform's own earnings are not touched by any of it (D-03).
import { authorizeCompanyRead, authorizeCompanyWrite } from "../../../platform/src/api/authorize.ts";
import { bodyField, takeBody } from "../../../platform/src/api/body.ts";
import { json, redirect } from "../../../platform/src/api/http.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { hasControlCharacters } from "../../../factory/src/questionnaire.ts";
import { addMilestone, appendEvent, createEngagement, listEngagements, loadEngagement } from "../db/engagements.ts";
import type { EngagementRecord, MilestoneRecord } from "../db/engagements.ts";
import { EVENT_KINDS, MAX_AMOUNT_INR, MAX_NOTE_LENGTH, MAX_TEST_LENGTH, MAX_TITLE_LENGTH, MILESTONE_KINDS, isCalendarDate, milestoneState, nextKinds, statusOf } from "../state.ts";
import type { EngagementStatus, EventKind, MilestoneKind, MilestoneState } from "../state.ts";

export type PresentedMilestone = MilestoneRecord & {
  state: MilestoneState;
  /** How many times it has been recorded as delivered (the database allows MAX_DELIVERIES). */
  deliveries: number;
  /** What the owner may record next on it right now (nothing before the plan is agreed or after the close). */
  next: MilestoneKind[];
  paidInr: number | null;
  history: { at: string; kind: EventKind; note: string }[];
};
export type PresentedEngagement = {
  id: string;
  requirementId: string;
  providerId: string;
  providerName: string;
  providerSummary: string;
  title: string;
  cluster: string;
  createdAt: string;
  status: EngagementStatus;
  planAgreedAt: string | null;
  closedAt: string | null;
  milestones: PresentedMilestone[];
  agreedTotalInr: number;
  paidTotalInr: number;
};

/** What a viewer needs: the plan with each milestone's state and what may be done next, and the totals. */
export function presentEngagement(e: EngagementRecord): PresentedEngagement {
  const planAgreed = e.events.find((x) => x.kind === "plan_agreed") ?? null;
  const closed = e.events.find((x) => x.kind === "closed") ?? null;
  const milestones = e.milestones.map((m) => {
    const own = e.events.filter((x) => x.milestoneId === m.id);
    const state = milestoneState(own.map((x) => x.kind as MilestoneKind));
    const payment = own.find((x) => x.kind === "payment_recorded");
    const deliveries = own.filter((x) => x.kind === "delivered").length;
    return { ...m, state, deliveries, next: planAgreed && !closed ? nextKinds(state, deliveries) : [], paidInr: payment?.amountInr ?? null, history: own.map((x) => ({ at: x.at, kind: x.kind, note: x.note })) };
  });
  return {
    id: e.id,
    requirementId: e.requirementId,
    providerId: e.providerId,
    providerName: e.providerName,
    providerSummary: e.providerSummary,
    title: e.title,
    cluster: e.cluster,
    createdAt: e.createdAt,
    status: statusOf({ planAgreed: planAgreed !== null, closed: closed !== null, states: milestones.map((m) => m.state) }),
    planAgreedAt: planAgreed?.at ?? null,
    closedAt: closed?.at ?? null,
    milestones,
    agreedTotalInr: milestones.reduce((sum, m) => sum + m.agreedInr, 0),
    paidTotalInr: milestones.reduce((sum, m) => sum + (m.paidInr ?? 0), 0),
  };
}

export const presentEngagements = async (db: D1Database, companyId: string) => (await listEngagements(db, companyId)).map(presentEngagement);

/** GET the company's engagements. */
export async function handleEngagementList(request: Request, env: AppEnv, requestedId: string): Promise<Response> {
  const allowed = await authorizeCompanyRead(request, env, requestedId, "engagement.read.denied");
  if (allowed instanceof Response) return allowed;
  return json(200, { engagements: await presentEngagements(allowed.db, allowed.companyId) });
}

/** GET one engagement of the company. An id that is another company's looks the same as one that does not exist. */
export async function handleEngagementRead(request: Request, env: AppEnv, requestedId: string, engagementId: string): Promise<Response> {
  const allowed = await authorizeCompanyRead(request, env, requestedId, "engagement.read.denied");
  if (allowed instanceof Response) return allowed;
  const record = await loadEngagement(allowed.db, allowed.companyId, engagementId);
  return record ? json(200, presentEngagement(record)) : json(404, { error: "not_found" });
}

const MISSING = "/deliver?problem=missing";

/** POST: choose a provider for a requirement. Choosing the same one again returns the engagement already there (200, not 201). */
export async function handleEngagementCreate(request: Request, env: AppEnv, requestedId: string, requirementId: string): Promise<Response> {
  const allowed = await authorizeCompanyWrite(request, env, requestedId, "engagement.write.denied");
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";

  const providerId = bodyField(body, form ? "provider" : "providerId");
  if (typeof providerId !== "string" || providerId.length === 0 || providerId.length > 64) return form ? redirect("/procure?problem=engage") : json(400, { error: "invalid", fields: { providerId: "Choose a provider from the list." } });
  if (requirementId.length === 0 || requirementId.length > 64) return form ? redirect("/procure?problem=missing") : json(404, { error: "not_found" });

  const made = await createEngagement(allowed.db, { companyId: allowed.companyId, userId: allowed.identity.userId, requirementId, providerId });
  if (made.ok) return form ? redirect("/deliver?made=1") : json(made.created ? 201 : 200, { id: made.id, created: made.created });
  if (made.reason === "not_found") return form ? redirect("/procure?problem=missing") : json(404, { error: "not_found" });
  if (made.reason === "requirement_withdrawn") return form ? redirect("/procure?problem=withdrawn") : json(409, { error: "requirement_withdrawn" });
  return form ? redirect(`/procure?problem=${made.reason}`) : json(409, { error: made.reason });
}

function readText(raw: unknown, max: number, required: boolean): string | null {
  if (raw === undefined || raw === null) return required ? null : "";
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.length > max || hasControlCharacters(text) || (required && text.length === 0)) return null;
  return text;
}

function readAmount(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d{1,9}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= MAX_AMOUNT_INR ? n : null;
}

/** POST: add the next milestone to a plan that is not yet agreed. */
export async function handleMilestoneAdd(request: Request, env: AppEnv, requestedId: string, engagementId: string): Promise<Response> {
  const allowed = await authorizeCompanyWrite(request, env, requestedId, "engagement.write.denied");
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";

  const title = readText(bodyField(body, "title"), MAX_TITLE_LENGTH, true);
  const acceptanceTest = readText(bodyField(body, form ? "test" : "acceptanceTest"), MAX_TEST_LENGTH, true);
  const dueRaw = bodyField(body, form ? "due" : "dueOn");
  const dueOn = typeof dueRaw === "string" && isCalendarDate(dueRaw.trim()) ? dueRaw.trim() : null;
  const agreedInr = readAmount(bodyField(body, form ? "amount" : "agreedInr"));
  const fields: Record<string, string> = {};
  if (title === null) fields.title = `Name the milestone, in up to ${MAX_TITLE_LENGTH} characters.`;
  if (acceptanceTest === null) fields.acceptanceTest = `Say how you will check it, in up to ${MAX_TEST_LENGTH} characters.`;
  if (dueOn === null) fields.dueOn = "Give a date, written YYYY-MM-DD.";
  if (agreedInr === null) fields.agreedInr = `Give a whole number of rupees from 1 to ${MAX_AMOUNT_INR}.`;
  if (Object.keys(fields).length) return form ? redirect("/deliver?problem=invalid") : json(400, { error: "invalid", fields });

  const added = await addMilestone(allowed.db, { companyId: allowed.companyId, userId: allowed.identity.userId, engagementId, title: title as string, acceptanceTest: acceptanceTest as string, dueOn: dueOn as string, agreedInr: agreedInr as number });
  if (added.ok) return form ? redirect("/deliver?saved=milestone") : json(201, { id: added.id, seq: added.seq });
  if (added.reason === "not_found") return form ? redirect(MISSING) : json(404, { error: "not_found" });
  return form ? redirect(`/deliver?problem=${added.reason}`) : json(409, { error: added.reason });
}

/** POST one event on an engagement: the plan agreed, a milestone delivered, accepted, rejected or paid, or the close. */
export async function handleEngagementEvent(request: Request, env: AppEnv, requestedId: string, engagementId: string): Promise<Response> {
  const allowed = await authorizeCompanyWrite(request, env, requestedId, "engagement.write.denied");
  if (allowed instanceof Response) return allowed;
  const body = await takeBody(request);
  if (body instanceof Response) return body;
  const form = body.kind === "form";

  const kind = bodyField(body, "kind");
  const milestoneRaw = bodyField(body, form ? "milestone" : "milestoneId");
  const note = readText(bodyField(body, "note"), MAX_NOTE_LENGTH, false);
  const fields: Record<string, string> = {};
  if (typeof kind !== "string" || !(EVENT_KINDS as readonly string[]).includes(kind)) fields.kind = "Say what happened.";
  const aboutMilestone = typeof kind === "string" && (MILESTONE_KINDS as readonly string[]).includes(kind);
  const milestoneId = typeof milestoneRaw === "string" && milestoneRaw.length > 0 && milestoneRaw.length <= 64 ? milestoneRaw : null;
  if (aboutMilestone && milestoneId === null) fields.milestoneId = "Say which milestone.";
  if (!aboutMilestone && milestoneRaw !== undefined && milestoneRaw !== null && milestoneRaw !== "") fields.milestoneId = "This does not name a milestone.";
  let amountInr: number | null = null;
  const amountRaw = bodyField(body, form ? "amount" : "amountInr");
  if (kind === "payment_recorded") {
    amountInr = readAmount(amountRaw);
    if (amountInr === null) fields.amountInr = `Give a whole number of rupees from 1 to ${MAX_AMOUNT_INR}.`;
  } else if (amountRaw !== undefined && amountRaw !== null && amountRaw !== "") fields.amountInr = "Only a payment has an amount.";
  if (note === null) fields.note = `Keep the note to text under ${MAX_NOTE_LENGTH} characters.`;
  if (Object.keys(fields).length) return form ? redirect("/deliver?problem=invalid") : json(400, { error: "invalid", fields });

  const done = await appendEvent(allowed.db, {
    companyId: allowed.companyId,
    userId: allowed.identity.userId,
    engagementId,
    kind: kind as EventKind,
    milestoneId: aboutMilestone ? milestoneId : null,
    amountInr,
    note: note as string,
  });
  if (done.ok) return form ? redirect(`/deliver?saved=${kind}`) : json(201, { ok: true });
  if (done.reason === "not_found") return form ? redirect(MISSING) : json(404, { error: "not_found" });
  return form ? redirect(`/deliver?problem=${done.reason}`) : json(409, { error: done.reason });
}
