// The facts the progress strip and the home page are worked out from, read from a real D1 database (workerd's SQLite through Miniflare)
// with the real migrations and the SYNTHETIC seed, after each step an owner takes through the real handlers. What progress.ts says at each
// step is the whole point: the home page must name the step that the records say is next, and must not read another company's records.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { handleSessionWrite } from "../../../platform/src/api/session.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { cookieFrom, createTestEnvironment, get, post } from "../../../platform/tests/support/d1.ts";
import { appendRevision, loadLatest } from "../../../factory/src/db/revisions.ts";
import { listAssessments } from "../../../diagnose/src/db/assessments.ts";
import { handleAssessmentCreate, handleAssessmentRead, handleDecisionCreate, handleSignOff } from "../../../diagnose/src/api/diagnose.ts";
import type { Result } from "../../../diagnose/src/engine.ts";
import { handleEngagementCreate, handleEngagementEvent, handleMilestoneAdd } from "../../../deliver/src/api/engagements.ts";
import { handleProviderCreate, handleProviderList, handleTermsSet } from "../../../procure/src/api/providers.ts";
import { handleRequirementCreate } from "../../../procure/src/api/requirements.ts";
import { loadFacts } from "../../src/facts.ts";
import { NO_FACTS, nextStep, stageStatuses } from "../../src/progress.ts";

let env: AppEnv;
let db: D1Database;
let dispose: () => Promise<void>;
beforeEach(async () => {
  ({ env, db, dispose } = await createTestEnvironment());
});
afterEach(async () => {
  await dispose();
});

const A = "company-synthetic-a";
const B = "company-synthetic-b";
const CLUSTER = "synthetic-cluster-1";
const KIND = "digital_job_log";

async function signIn(email: string): Promise<string> {
  const res = await handleSessionWrite(post("/api/session", { email }), env);
  assert.equal(res.status, 200, `sign-in as ${email}`);
  return cookieFrom(res);
}
const req = (path: string, cookie: string, body: unknown = {}) => post(path, body, { cookie });
const keyOf = async (company: string) => nextStep(await loadFacts(db, company), new Date()).key;

test("what the home page calls the next step follows the records, from a confirmed description to an accepted milestone", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const op = await signIn("operator@synthetic.invalid");

  const start = await loadFacts(db, A);
  assert.deepEqual(start.factory, { latestRevision: 1, anyConfirmed: true }, "the seeded company has a confirmed first version");
  assert.equal(start.assessment, null);
  assert.equal(await keyOf(A), "diagnose");

  const made = await handleAssessmentCreate(req(`/api/companies/${A}/assessments`, a), env, A);
  assert.ok(made.status === 201 || made.status === 200);
  const { id } = (await made.json()) as { id: string };
  const detail = (await (await handleAssessmentRead(get(`/api/companies/${A}/assessments/${id}`, a), env, A, id)).json()) as { result: Result };
  assert.deepEqual((await loadFacts(db, A)).assessment, { items: detail.result.items.length, decided: 0, signedOff: false });
  assert.equal(await keyOf(A), "decide");

  for (const item of detail.result.items) assert.equal((await handleDecisionCreate(req(`/api/companies/${A}/assessments/${id}/decisions`, a, { opportunityId: item.opportunityId, decision: "accept" }), env, A, id)).status, 201);
  assert.equal(await keyOf(A), "sign_off");
  assert.equal((await handleSignOff(req(`/api/companies/${A}/assessments/${id}/signoff`, a), env, A, id)).status, 201);
  assert.equal((await loadFacts(db, A)).assessment?.signedOff, true);
  assert.equal(await keyOf(A), "make_requirement");

  assert.equal((await handleTermsSet(req("/api/operator/listing-terms", op, { feeInr: 1500 }), env)).status, 201);
  const created = await handleProviderCreate(req("/api/operator/providers", op, { name: "Alpha Works", summary: "SYNTHETIC provider", services: [{ opportunityId: KIND, cluster: CLUSTER }] }), env);
  const providerId = ((await created.json()) as { id: string }).id;
  assert.equal((await handleProviderList(req(`/api/operator/providers/${providerId}/list`, op, {}), env, providerId)).status, 201);

  const requirement = await handleRequirementCreate(req(`/api/companies/${A}/requirements`, a, { assessmentId: id, opportunityId: KIND, cluster: CLUSTER }), env, A);
  assert.equal(requirement.status, 201);
  const requirementId = ((await requirement.json()) as { id: string }).id;
  const afterRequirement = await loadFacts(db, A);
  assert.equal(afterRequirement.requirements, 1);
  assert.equal(afterRequirement.requirementsWithoutProvider, 1);
  assert.equal(await keyOf(A), "choose_provider");

  const engaged = await handleEngagementCreate(req(`/api/companies/${A}/requirements/${requirementId}/engagement`, a, { providerId }), env, A, requirementId);
  assert.equal(engaged.status, 201);
  const engagementId = ((await engaged.json()) as { id: string }).id;
  const afterChoice = await loadFacts(db, A);
  assert.equal(afterChoice.requirementsWithoutProvider, 0);
  assert.equal(afterChoice.engagements.length, 1);
  assert.equal(afterChoice.engagements[0]!.planAgreed, false);
  assert.equal(await keyOf(A), "agree_plan");

  const m = await handleMilestoneAdd(req(`/api/companies/${A}/engagements/${engagementId}/milestones`, a, { title: "Job log running", acceptanceTest: "Every job of one shift is logged and matches the paper sheet.", dueOn: "2026-12-15", agreedInr: 40000 }), env, A, engagementId);
  assert.equal(m.status, 201);
  const milestoneId = ((await m.json()) as { id: string }).id;
  const event = (body: Record<string, unknown>) => handleEngagementEvent(req(`/api/companies/${A}/engagements/${engagementId}/events`, a, body), env, A, engagementId);
  assert.equal((await event({ kind: "plan_agreed" })).status, 201);
  const agreed = (await loadFacts(db, A)).engagements[0]!;
  assert.deepEqual({ planAgreed: agreed.planAgreed, milestones: agreed.milestones, baselineRecorded: agreed.baselineRecorded, firstAcceptedAt: agreed.firstAcceptedAt }, { planAgreed: true, milestones: ["planned"], baselineRecorded: false, firstAcceptedAt: null });
  assert.equal(await keyOf(A), "record_baseline");

  assert.equal((await event({ kind: "delivered", milestoneId })).status, 201);
  assert.deepEqual((await loadFacts(db, A)).engagements[0]!.milestones, ["delivered"]);
  assert.equal(await keyOf(A), "judge_delivery");

  assert.equal((await event({ kind: "accepted", milestoneId })).status, 201);
  const accepted = (await loadFacts(db, A)).engagements[0]!;
  assert.deepEqual(accepted.milestones, ["accepted"]);
  assert.ok(accepted.firstAcceptedAt, "the first acceptance is dated");
  const after = nextStep(await loadFacts(db, A), new Date());
  assert.equal(after.key, "keep_going", "nothing is the owner's turn until a review opens");
  assert.match(after.body, /The next review opens on \d{4}-\d{2}-\d{2}\./);
  assert.deepEqual(stageStatuses(await loadFacts(db, A), new Date()), { describe: "done", diagnose: "done", procure: "done", deliver: "todo", run: "current" });

  // A review, 31 days on, is the owner's turn.
  const later = new Date(new Date(accepted.firstAcceptedAt!).getTime() + 31 * 86_400_000);
  assert.equal(nextStep(await loadFacts(db, A), later).key, "review_due");
});

test("a company reads only its own facts: another company that has done nothing is asked to start", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const made = await handleAssessmentCreate(req(`/api/companies/${A}/assessments`, a), env, A);
  assert.ok(made.status === 201 || made.status === 200);
  const b = await loadFacts(db, B);
  assert.equal(b.assessment, null, "company B has no assessment, whatever company A made");
  assert.equal(b.requirements, 0);
  assert.deepEqual(b.engagements, []);
  assert.notDeepEqual(await loadFacts(db, A), b);
  assert.deepEqual(await loadFacts(db, "company-that-does-not-exist"), NO_FACTS);
});

test("with a newer assessment not yet signed off, an older one that was is the one the work in progress came from", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const first = (await (await handleAssessmentCreate(req(`/api/companies/${A}/assessments`, a), env, A)).json()) as { id: string };
  const detail = (await (await handleAssessmentRead(get(`/api/companies/${A}/assessments/${first.id}`, a), env, A, first.id)).json()) as { result: Result };
  for (const item of detail.result.items) await handleDecisionCreate(req(`/api/companies/${A}/assessments/${first.id}/decisions`, a, { opportunityId: item.opportunityId, decision: "accept" }), env, A, first.id);
  await handleSignOff(req(`/api/companies/${A}/assessments/${first.id}/signoff`, a), env, A, first.id);
  // An assessment is made from one version of the description, so a second one needs a second version (saved as a draft here).
  const latest = (await loadLatest(db, A, "any"))!;
  const saved = await appendRevision(db, { companyId: A, userId: "user-synthetic-owner-a", basedOn: latest.revision, answers: latest.answers, note: "SYNTHETIC second version", confirmed: true, questionnaireVersion: latest.questionnaireVersion });
  assert.equal(saved.ok, true);
  assert.equal((await handleAssessmentCreate(req(`/api/companies/${A}/assessments`, a), env, A)).status, 201);
  const all = await listAssessments(db, A);
  assert.equal(all.length, 2, "two assessments exist");
  assert.equal(all[0]!.signedOffAt, null, "the newest is not signed off");
  const facts = await loadFacts(db, A);
  assert.equal(facts.assessment?.signedOff, true, "the signed-off assessment counts");
});
