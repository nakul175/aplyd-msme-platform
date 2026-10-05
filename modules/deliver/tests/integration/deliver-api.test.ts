// Choosing a provider, the milestone plan, delivery, acceptance, the payment record and the close, through the real handlers against a
// real D1 database (workerd's SQLite through Miniflare) with the real migrations and the SYNTHETIC seed. Every test starts its own database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { handleSessionWrite } from "../../../platform/src/api/session.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { ORIGIN, cookieFrom, createTestEnvironment, get, post } from "../../../platform/tests/support/d1.ts";
import { handleAssessmentCreate, handleAssessmentRead, handleDecisionCreate, handleSignOff } from "../../../diagnose/src/api/diagnose.ts";
import type { Result } from "../../../diagnose/src/engine.ts";
import { handleProviderCreate, handleProviderList, handleProviderUnlist, handleTermsSet } from "../../../procure/src/api/providers.ts";
import { handleRequirementCreate, handleRequirementWithdraw } from "../../../procure/src/api/requirements.ts";
import { handleEngagementCreate, handleEngagementEvent, handleEngagementList, handleEngagementRead, handleMilestoneAdd } from "../../src/api/engagements.ts";
import type { PresentedEngagement } from "../../src/api/engagements.ts";
import { LIBRARY } from "../../../diagnose/src/library.ts";
import { createEngagement } from "../../src/db/engagements.ts";
import { MAX_DELIVERIES, MAX_MILESTONES, MILESTONE_KINDS } from "../../src/state.ts";

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
const ownerA = () => signIn("owner-a@synthetic.invalid");
const ownerB = () => signIn("owner-b@synthetic.invalid");
const operator = () => signIn("operator@synthetic.invalid");
const req = (path: string, cookie: string | undefined, body: unknown = {}, headers: Record<string, string> = {}) => post(path, body, { ...(cookie ? { cookie } : {}), ...headers });
const form = (path: string, cookie: string, fields: [string, string][] = []) => new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie }, body: new URLSearchParams(fields) });

// --- the pieces a delivery stands on: a signed-off assessment, a requirement, a listed provider
type Detail = { id: string; result: Result };
async function signedOffA(cookie: string): Promise<Detail> {
  const made = await handleAssessmentCreate(req(`/api/companies/${A}/assessments`, cookie), env, A);
  assert.ok(made.status === 201 || made.status === 200);
  const { id } = (await made.json()) as { id: string };
  const detail = (await (await handleAssessmentRead(get(`/api/companies/${A}/assessments/${id}`, cookie), env, A, id)).json()) as Detail;
  for (const item of detail.result.items) assert.equal((await handleDecisionCreate(req(`/api/companies/${A}/assessments/${id}/decisions`, cookie, { opportunityId: item.opportunityId, decision: "accept" }), env, A, id)).status, 201);
  assert.equal((await handleSignOff(req(`/api/companies/${A}/assessments/${id}/signoff`, cookie), env, A, id)).status, 201);
  return detail;
}

async function addListedProvider(op: string, name: string, services = [{ opportunityId: KIND, cluster: CLUSTER }]): Promise<string> {
  const created = await handleProviderCreate(req("/api/operator/providers", op, { name, summary: "SYNTHETIC provider", services }), env);
  assert.equal(created.status, 201, name);
  const { id } = (await created.json()) as { id: string };
  assert.equal((await handleProviderList(req(`/api/operator/providers/${id}/list`, op, {}), env, id)).status, 201, `listing ${name}`);
  return id;
}

/** Company A with a requirement for the first idea in cluster 1, and one listed provider for it. */
async function setup() {
  const a = await ownerA();
  const op = await operator();
  assert.equal((await handleTermsSet(req("/api/operator/listing-terms", op, { feeInr: 1500 }), env)).status, 201);
  const providerId = await addListedProvider(op, "Alpha Works");
  const detail = await signedOffA(a);
  const made = await handleRequirementCreate(req(`/api/companies/${A}/requirements`, a, { assessmentId: detail.id, opportunityId: KIND, cluster: CLUSTER }), env, A);
  assert.equal(made.status, 201);
  const { id: requirementId } = (await made.json()) as { id: string };
  return { a, op, providerId, requirementId, detail };
}

// --- the deliver endpoints
const engage = (companyId: string, rid: string, cookie: string | undefined, body: unknown, headers: Record<string, string> = {}) => handleEngagementCreate(req(`/api/companies/${companyId}/requirements/${rid}/engagement`, cookie, body, headers), env, companyId, rid);
const milestone = (companyId: string, eid: string, cookie: string | undefined, body: unknown, headers: Record<string, string> = {}) => handleMilestoneAdd(req(`/api/companies/${companyId}/engagements/${eid}/milestones`, cookie, body, headers), env, companyId, eid);
const event = (companyId: string, eid: string, cookie: string | undefined, body: unknown, headers: Record<string, string> = {}) => handleEngagementEvent(req(`/api/companies/${companyId}/engagements/${eid}/events`, cookie, body, headers), env, companyId, eid);
const read = (companyId: string, eid: string, cookie?: string) => handleEngagementRead(get(`/api/companies/${companyId}/engagements/${eid}`, cookie), env, companyId, eid);
const list = (companyId: string, cookie?: string) => handleEngagementList(get(`/api/companies/${companyId}/engagements`, cookie), env, companyId);
const view = async (companyId: string, eid: string, cookie: string) => (await (await read(companyId, eid, cookie)).json()) as PresentedEngagement;

const MILESTONE = { title: "Job log running on the shop floor", acceptanceTest: "Every job of one shift is logged on the tablet and matches the paper sheet.", dueOn: "2026-12-15", agreedInr: 40000 };
const SECOND = { title: "Training and handover", acceptanceTest: "Two supervisors log a job without help.", dueOn: "2027-01-15", agreedInr: 10000 };

async function engaged() {
  const s = await setup();
  const made = await engage(A, s.requirementId, s.a, { providerId: s.providerId });
  assert.equal(made.status, 201);
  const { id } = (await made.json()) as { id: string };
  return { ...s, id };
}
async function planned(extra: Record<string, unknown>[] = [MILESTONE, SECOND]) {
  const e = await engaged();
  const ids: string[] = [];
  for (const m of extra) {
    const res = await milestone(A, e.id, e.a, m);
    assert.equal(res.status, 201, JSON.stringify(m));
    ids.push(((await res.json()) as { id: string }).id);
  }
  return { ...e, ids };
}
async function agreed(extra?: Record<string, unknown>[]) {
  const p = await planned(extra);
  assert.equal((await event(A, p.id, p.a, { kind: "plan_agreed" })).status, 201);
  return p;
}

const count = async (table: string, where = "1 = 1") => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).first<{ n: number }>())!.n;
const audits = async (event: string) => (await db.prepare("SELECT user_id, company_id, detail FROM audit_events WHERE event = ? ORDER BY id").bind(event).all<{ user_id: string | null; company_id: string | null; detail: string }>()).results;

test("an owner chooses a listed provider for a requirement; it is recorded once, the same choice again changes nothing, another provider is refused", async () => {
  const { a, op, providerId, requirementId } = await setup();
  const first = await engage(A, requirementId, a, { providerId });
  assert.equal(first.status, 201);
  const made = (await first.json()) as { id: string; created: boolean };
  assert.equal(made.created, true);

  const again = await engage(A, requirementId, a, { providerId });
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { id: made.id, created: false });
  const other = await addListedProvider(op, "Beta Works");
  const second = await engage(A, requirementId, a, { providerId: other });
  assert.equal(second.status, 409);
  assert.deepEqual(await second.json(), { error: "already_engaged" });
  assert.equal(await count("engagements"), 1);
  assert.equal((await audits("engagement.created")).length, 1);
  const [entry] = await audits("engagement.created");
  assert.equal(entry.user_id, "user-synthetic-owner-a");
  assert.equal(entry.company_id, A);

  const e = await view(A, made.id, a);
  assert.equal(e.providerName, "Alpha Works");
  assert.equal(e.title, "Keep every job on a simple shared log");
  assert.equal(e.status, "planning");
  assert.deepEqual(e.milestones, []);
  assert.equal(e.agreedTotalInr, 0);
  const listed = (await (await list(A, a)).json()) as { engagements: PresentedEngagement[] };
  assert.deepEqual(listed.engagements.map((x) => x.id), [made.id]);
});

test("the choice needs a provider that is listed now and serves this idea in this cluster, and a requirement that is open", async () => {
  const { a, op, requirementId } = await setup();
  const notListed = ((await (await handleProviderCreate(req("/api/operator/providers", op, { name: "Quiet Co", services: [{ opportunityId: KIND, cluster: CLUSTER }] }), env)).json()) as { id: string }).id;
  const wrongCluster = await addListedProvider(op, "Elsewhere Ltd", [{ opportunityId: KIND, cluster: "synthetic-cluster-2" }]);
  const wrongIdea = await addListedProvider(op, "Other Idea Ltd", [{ opportunityId: LIBRARY.find((o) => o.id !== KIND)!.id, cluster: CLUSTER }]);
  const unlisted = await addListedProvider(op, "Gone Ltd");
  assert.equal((await handleProviderUnlist(req(`/api/operator/providers/${unlisted}/unlist`, op, {}), env, unlisted)).status, 201);
  for (const [name, providerId] of [["not listed", notListed], ["another cluster", wrongCluster], ["another idea", wrongIdea], ["unlisted", unlisted], ["unknown", "no-such-provider"]] as const) {
    const res = await engage(A, requirementId, a, { providerId });
    assert.equal(res.status, 409, name);
    assert.deepEqual(await res.json(), { error: "provider_unavailable" }, name);
  }
  assert.equal(await count("engagements"), 0);
  assert.equal((await audits("engagement.created")).length, 0);

  // A requirement that was withdrawn cannot be engaged.
  assert.equal((await handleRequirementWithdraw(req(`/api/companies/${A}/requirements/${requirementId}/withdraw`, a, {}), env, A, requirementId)).status, 201);
  const good = await addListedProvider(op, "Fine Ltd");
  const res = await engage(A, requirementId, a, { providerId: good });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "requirement_withdrawn" });
  assert.equal(await count("engagements"), 0);
});

test("once a provider is chosen the requirement cannot be withdrawn, and unlisting the provider later does not end the engagement", async () => {
  const { a, op, providerId, requirementId, id } = await engaged();
  const res = await handleRequirementWithdraw(req(`/api/companies/${A}/requirements/${requirementId}/withdraw`, a, {}), env, A, requirementId);
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "engaged" });
  assert.equal(await count("requirement_events"), 0);
  assert.equal((await handleProviderUnlist(req(`/api/operator/providers/${providerId}/unlist`, op, {}), env, providerId)).status, 201);
  const m = await milestone(A, id, a, MILESTONE);
  assert.equal(m.status, 201, "the plan can still be made");
  assert.equal((await view(A, id, a)).status, "planning");
});

test("the plan is built one milestone at a time, numbered in order, and checked: a name, a test, a real date, a whole number of rupees", async () => {
  const { a, id } = await engaged();
  const one = (await (await milestone(A, id, a, MILESTONE)).json()) as { id: string; seq: number };
  const two = (await (await milestone(A, id, a, SECOND)).json()) as { id: string; seq: number };
  assert.deepEqual([one.seq, two.seq], [1, 2]);
  const bad: [string, Record<string, unknown>, string][] = [
    ["no title", { ...MILESTONE, title: "  " }, "title"],
    ["a long title", { ...MILESTONE, title: "x".repeat(121) }, "title"],
    ["a control character", { ...MILESTONE, title: "a\u0000b" }, "title"],
    ["no test", { ...MILESTONE, acceptanceTest: "" }, "acceptanceTest"],
    ["a long test", { ...MILESTONE, acceptanceTest: "x".repeat(501) }, "acceptanceTest"],
    ["a title that is not text", { ...MILESTONE, title: 7 }, "title"],
    ["a date that is not one", { ...MILESTONE, dueOn: "2026-02-30" }, "dueOn"],
    ["a date in another form", { ...MILESTONE, dueOn: "15/12/2026" }, "dueOn"],
    ["no date", { ...MILESTONE, dueOn: undefined }, "dueOn"],
    ["zero rupees", { ...MILESTONE, agreedInr: 0 }, "agreedInr"],
    ["a fraction", { ...MILESTONE, agreedInr: 10.5 }, "agreedInr"],
    ["too many rupees", { ...MILESTONE, agreedInr: 100_000_001 }, "agreedInr"],
    ["rupees as words", { ...MILESTONE, agreedInr: "ten thousand" }, "agreedInr"],
  ];
  for (const [name, payload, field] of bad) {
    const res = await milestone(A, id, a, payload);
    assert.equal(res.status, 400, name);
    assert.ok(field in ((await res.json()) as { fields: Record<string, string> }).fields, name);
  }
  assert.equal((await milestone(A, id, a, { ...MILESTONE, agreedInr: "25000" })).status, 201, "rupees as digits in text are read");
  assert.equal(await count("milestones"), 3);
  assert.equal((await audits("milestone.added")).length, 3);
});

test("a plan holds at most MAX_MILESTONES, and the number in the database is the one in the code", async () => {
  const { a, id, op, detail } = await engaged();
  for (let n = 1; n <= MAX_MILESTONES; n += 1) assert.equal((await milestone(A, id, a, { ...MILESTONE, title: `Step ${n}` })).status, 201);
  const refused = await milestone(A, id, a, MILESTONE);
  assert.equal(refused.status, 409);
  assert.deepEqual(await refused.json(), { error: "too_many" });
  assert.equal(await count("milestones"), MAX_MILESTONES);
  // the cap is per plan: a second engagement of the same company, for another idea, starts empty although twelve milestones exist
  const second = detail.result.items.find((i) => i.opportunityId !== KIND)!.opportunityId;
  const otherProvider = await addListedProvider(op, "Beta Works", [{ opportunityId: second, cluster: CLUSTER }]);
  const asked = await handleRequirementCreate(req(`/api/companies/${A}/requirements`, a, { assessmentId: detail.id, opportunityId: second, cluster: CLUSTER }), env, A);
  assert.equal(asked.status, 201);
  const otherEngagement = await engage(A, ((await asked.json()) as { id: string }).id, a, { providerId: otherProvider });
  assert.equal(otherEngagement.status, 201);
  assert.equal((await milestone(A, ((await otherEngagement.json()) as { id: string }).id, a, MILESTONE)).status, 201, "twelve milestones in one plan do not fill another");
  const sql = readFileSync(new URL("../../../../drizzle/0011_deliver_guards.sql", import.meta.url), "utf8");
  assert.equal(Number(/milestones_limit[\s\S]*?>= (\d+)/.exec(sql)?.[1]), MAX_MILESTONES);
  const tables = readFileSync(new URL("../../../../drizzle/0010_deliver_tables.sql", import.meta.url), "utf8");
  assert.match(tables, new RegExp(`seq. BETWEEN 1 AND ${MAX_MILESTONES}\\b`));
});

test("a milestone is delivered at most MAX_DELIVERIES times: a delivery and a rejection cannot be repeated for ever, the cap is per milestone, and a milestone can always still be finished", async () => {
  const { a, id, ids } = await agreed();
  const [first, second] = ids;
  for (let n = 1; n <= MAX_DELIVERIES; n += 1) {
    assert.equal((await event(A, id, a, { kind: "delivered", milestoneId: first })).status, 201, `delivery ${n}`);
    assert.equal((await event(A, id, a, { kind: "rejected", milestoneId: first })).status, 201, `rejection ${n}`);
  }
  const written = await count("engagement_events", `milestone_id = '${first}'`);
  assert.equal(written, 2 * MAX_DELIVERIES);
  const refused = await event(A, id, a, { kind: "delivered", milestoneId: first });
  assert.equal(refused.status, 409);
  assert.deepEqual(await refused.json(), { error: "too_many_deliveries" });
  assert.equal(await count("engagement_events", `milestone_id = '${first}'`), written, "nothing was written");
  const posted = await handleEngagementEvent(form(`/api/companies/${A}/engagements/${id}/events`, a, [["kind", "delivered"], ["milestone", first]]), env, A, id);
  assert.equal(posted.status, 303);
  assert.equal(posted.headers.get("location"), "/deliver?problem=too_many_deliveries");

  // another milestone is not affected, and one that has used all but its last delivery can still be accepted and paid
  for (let n = 1; n < MAX_DELIVERIES; n += 1) {
    assert.equal((await event(A, id, a, { kind: "delivered", milestoneId: second })).status, 201);
    assert.equal((await event(A, id, a, { kind: "rejected", milestoneId: second })).status, 201);
  }
  for (const kind of ["delivered", "accepted"]) assert.equal((await event(A, id, a, { kind, milestoneId: second })).status, 201, kind);
  assert.equal((await event(A, id, a, { kind: "payment_recorded", milestoneId: second, amountInr: 10000 })).status, 201, "the payment is still possible");
  assert.equal(await count("engagement_events", `milestone_id = '${second}'`), 2 * MAX_DELIVERIES + 1, "29 events: the most a milestone holds");
  assert.equal((await event(A, id, a, { kind: "closed" })).status, 201);
  // The trigger in force is the one migration 0014 recreated (0011 made it, and applied migrations are not edited).
  for (const file of ["0011_deliver_guards.sql", "0014_review_fixes.sql"]) {
    const sql = readFileSync(new URL(`../../../../drizzle/${file}`, import.meta.url), "utf8");
    assert.equal(Number(/CREATE TRIGGER engagement_events_delivery_limit[\s\S]*?>= (\d+)/.exec(sql)?.[1]), MAX_DELIVERIES, file);
  }
});

test("a close is looked for in the engagement asked about, not in the company: with one engagement closed, another's agreed plan is still told it is locked", async () => {
  const { a, op, id: first, detail } = await engaged();
  assert.equal((await event(A, first, a, { kind: "closed" })).status, 201);
  const secondIdea = detail.result.items.find((i) => i.opportunityId !== KIND)!.opportunityId;
  const otherProvider = await addListedProvider(op, "Beta Works", [{ opportunityId: secondIdea, cluster: CLUSTER }]);
  const asked = await handleRequirementCreate(req(`/api/companies/${A}/requirements`, a, { assessmentId: detail.id, opportunityId: secondIdea, cluster: CLUSTER }), env, A);
  const made = await engage(A, ((await asked.json()) as { id: string }).id, a, { providerId: otherProvider });
  const second = ((await made.json()) as { id: string }).id;
  assert.equal((await milestone(A, second, a, MILESTONE)).status, 201);
  assert.equal((await event(A, second, a, { kind: "plan_agreed" })).status, 201);
  assert.deepEqual(await (await milestone(A, second, a, SECOND)).json(), { error: "plan_locked" }, "agreed, not closed: the other engagement's close is not this one's");
  assert.deepEqual(await (await milestone(A, first, a, SECOND)).json(), { error: "closed" });
});

test("at the delivery cap the page is offered nothing to deliver: the count rides with each milestone, and the offer comes back and goes in step with the database", async () => {
  const { a, id, ids } = await agreed();
  const [first] = ids;
  const milestoneOf = async (n: number) => (await view(A, id, a)).milestones[n];
  for (let n = 1; n < MAX_DELIVERIES; n += 1) {
    assert.equal((await event(A, id, a, { kind: "delivered", milestoneId: first })).status, 201);
    assert.equal((await event(A, id, a, { kind: "rejected", milestoneId: first })).status, 201);
  }
  let m = await milestoneOf(0);
  assert.deepEqual([m.state, m.deliveries, m.next], ["rejected", MAX_DELIVERIES - 1, ["delivered"]], "one delivery left: still offered");
  assert.equal((await event(A, id, a, { kind: "delivered", milestoneId: first })).status, 201);
  m = await milestoneOf(0);
  assert.deepEqual([m.state, m.deliveries, m.next], ["delivered", MAX_DELIVERIES, ["accepted", "rejected"]], "the last delivery can still be decided");
  assert.equal((await event(A, id, a, { kind: "rejected", milestoneId: first })).status, 201);
  m = await milestoneOf(0);
  assert.deepEqual([m.state, m.deliveries, m.next], ["rejected", MAX_DELIVERIES, []], "rejected at the cap: nothing to offer, because the database would refuse it");
  assert.deepEqual((await milestoneOf(1)).next, ["delivered"], "the other milestone is not affected");
  assert.equal((await event(A, id, a, { kind: "delivered", milestoneId: first })).status, 409, "and the refusal is what the page no longer invites");
  assert.equal((await event(A, id, a, { kind: "closed" })).status, 201, "closing is the way out");
});

/**
 * Whether the database itself would take an event of this kind on this milestone now. The statement is run inside a batch that
 * ends in one that cannot succeed, so a statement the triggers accept is rolled back and nothing is left written.
 */
async function databaseAccepts(engagementId: string, milestoneId: string, kind: string): Promise<boolean> {
  const before = await count("engagement_events");
  const insert = db
    .prepare("INSERT INTO engagement_events (engagement_id, company_id, at, user_id, kind, milestone_id, amount_inr, note) VALUES (?, ?, 'probe', 'user-synthetic-owner-a', ?, ?, ?, '')")
    .bind(engagementId, A, kind, milestoneId, kind === "payment_recorded" ? 1000 : null);
  let accepted: boolean;
  try {
    await db.batch([insert, db.prepare("SELECT 1 FROM probe_rolls_everything_back")]);
    accepted = false;
  } catch (error) {
    // The last statement fails for a table that does not exist. If that is the error, the insert before it was accepted.
    accepted = /probe_rolls_everything_back/.test(String(error));
  }
  assert.equal(await count("engagement_events"), before, "a probe leaves nothing behind");
  return accepted;
}

test("what the page offers is exactly what the database would accept: every state and every kind, before the plan is agreed, while it runs, at the cap, and after the close", async () => {
  const titles = ["planned", "delivered", "accepted", "rejected", "paid", "rejected at the cap", "delivered at the cap"];
  const p = await planned(titles.map((title) => ({ ...MILESTONE, title })));
  const [, delivered, accepted, rejected, paid, rejectedAtCap, deliveredAtCap] = p.ids;
  const probeAll = async (label: string, expected: Record<string, string[]>) => {
    const shown = await view(A, p.id, p.a);
    for (const m of shown.milestones) {
      for (const kind of MILESTONE_KINDS) {
        assert.equal(await databaseAccepts(p.id, m.id, kind), m.next.includes(kind), `${label}: ${kind} on "${m.title}" (state ${m.state}, ${m.deliveries} deliveries, next ${JSON.stringify(m.next)})`);
      }
      if (expected[m.title]) assert.deepEqual(m.next, expected[m.title], `${label}: what is offered on "${m.title}"`);
    }
  };

  await probeAll("before the plan is agreed", Object.fromEntries(titles.map((t) => [t, []])));
  assert.equal((await event(A, p.id, p.a, { kind: "plan_agreed" })).status, 201);

  const send = async (kind: string, milestoneId: string, amountInr?: number) => assert.equal((await event(A, p.id, p.a, { kind, milestoneId, amountInr })).status, 201, kind);
  await send("delivered", delivered);
  await send("delivered", accepted); await send("accepted", accepted);
  await send("delivered", rejected); await send("rejected", rejected);
  await send("delivered", paid); await send("accepted", paid); await send("payment_recorded", paid, 40000);
  for (let n = 0; n < MAX_DELIVERIES; n += 1) { await send("delivered", rejectedAtCap); await send("rejected", rejectedAtCap); }
  for (let n = 1; n < MAX_DELIVERIES; n += 1) { await send("delivered", deliveredAtCap); await send("rejected", deliveredAtCap); }
  await send("delivered", deliveredAtCap);

  await probeAll("while the plan runs", {
    planned: ["delivered"],
    delivered: ["accepted", "rejected"],
    accepted: ["payment_recorded"],
    rejected: ["delivered"],
    paid: [],
    "rejected at the cap": [],
    "delivered at the cap": ["accepted", "rejected"],
  });

  assert.equal((await event(A, p.id, p.a, { kind: "closed" })).status, 201);
  await probeAll("after the close", Object.fromEntries(titles.map((t) => [t, []])));
});

test("agreeing the plan needs a milestone, happens once, and fixes the plan: no milestone can be added after", async () => {
  const { a, id } = await engaged();
  const empty = await event(A, id, a, { kind: "plan_agreed" });
  assert.equal(empty.status, 409);
  assert.deepEqual(await empty.json(), { error: "no_milestones" });
  assert.equal((await milestone(A, id, a, MILESTONE)).status, 201);
  assert.equal((await event(A, id, a, { kind: "plan_agreed", note: "Agreed on the phone with the provider." })).status, 201);
  const twice = await event(A, id, a, { kind: "plan_agreed" });
  assert.equal(twice.status, 409);
  assert.deepEqual(await twice.json(), { error: "already_agreed" });
  const late = await milestone(A, id, a, SECOND);
  assert.equal(late.status, 409);
  assert.deepEqual(await late.json(), { error: "plan_locked" });
  const e = await view(A, id, a);
  assert.equal(e.status, "in_progress");
  assert.ok(e.planAgreedAt);
  assert.equal(e.milestones.length, 1);
  assert.deepEqual(e.milestones[0].next, ["delivered"]);
  assert.equal(await count("engagement_events", "kind = 'plan_agreed'"), 1);
});

test("the whole path: delivered, rejected, delivered again, accepted, paid, closed; the states, the next steps and the totals are right at each step", async () => {
  const { a, id, ids } = await agreed();
  const [first, second] = ids;
  const state = async (n: number) => (await view(A, id, a)).milestones[n];

  assert.equal((await state(0)).state, "planned");
  assert.equal((await event(A, id, a, { kind: "delivered", milestoneId: first, note: "The provider says it is running." })).status, 201);
  assert.equal((await state(0)).state, "delivered");
  assert.deepEqual((await state(0)).next, ["accepted", "rejected"]);
  assert.equal((await event(A, id, a, { kind: "rejected", milestoneId: first, note: "Two jobs are missing from the log." })).status, 201);
  assert.equal((await state(0)).state, "rejected");
  assert.deepEqual((await state(0)).next, ["delivered"]);
  assert.equal((await event(A, id, a, { kind: "delivered", milestoneId: first, note: "Fixed." })).status, 201);
  assert.equal((await event(A, id, a, { kind: "accepted", milestoneId: first })).status, 201);
  assert.equal((await state(0)).state, "accepted");
  assert.deepEqual((await state(0)).next, ["payment_recorded"]);
  assert.equal((await event(A, id, a, { kind: "payment_recorded", milestoneId: first, amountInr: 40000, note: "Bank transfer, reference 12345." })).status, 201);
  const paid = await state(0);
  assert.equal(paid.state, "paid");
  assert.equal(paid.paidInr, 40000);
  assert.deepEqual(paid.next, []);
  assert.deepEqual(paid.history.map((h) => h.kind), ["delivered", "rejected", "delivered", "accepted", "payment_recorded"]);
  assert.equal((await state(1)).state, "planned", "the other milestone is untouched");

  let e = await view(A, id, a);
  assert.equal(e.status, "in_progress");
  assert.equal(e.agreedTotalInr, 50000);
  assert.equal(e.paidTotalInr, 40000);

  assert.equal((await event(A, id, a, { kind: "delivered", milestoneId: second })).status, 201);
  assert.equal((await event(A, id, a, { kind: "accepted", milestoneId: second })).status, 201);
  assert.equal((await event(A, id, a, { kind: "close", note: "x" })).status, 400, "an unknown kind");
  assert.equal((await event(A, id, a, { kind: "closed", note: "Everything delivered." })).status, 201);
  e = await view(A, id, a);
  assert.equal(e.status, "complete", "closed with every milestone accepted");
  assert.ok(e.closedAt);
  assert.deepEqual(e.milestones.map((m) => m.next), [[], []], "nothing more can be recorded");
  for (const kind of ["delivered", "accepted", "rejected"]) {
    const late = await event(A, id, a, { kind, milestoneId: second });
    assert.equal(late.status, 409, kind);
    assert.deepEqual(await late.json(), { error: "closed" });
  }
  const closedAgain = await event(A, id, a, { kind: "closed" });
  assert.equal(closedAgain.status, 409);
  assert.deepEqual(await closedAgain.json(), { error: "closed" });

  for (const name of ["engagement.plan_agreed", "engagement.delivered", "engagement.rejected", "engagement.accepted", "engagement.payment_recorded", "engagement.closed"]) assert.ok((await audits(name)).length >= 1, name);
  assert.equal((await audits("engagement.delivered")).length, 3);
});

test("closing early is recorded as ending early, and an engagement closed before the plan was agreed is the same", async () => {
  const early = await agreed();
  assert.equal((await event(A, early.id, early.a, { kind: "delivered", milestoneId: early.ids[0] })).status, 201);
  assert.equal((await event(A, early.id, early.a, { kind: "accepted", milestoneId: early.ids[0] })).status, 201);
  assert.equal((await event(A, early.id, early.a, { kind: "closed", note: "The provider stopped answering." })).status, 201);
  assert.equal((await view(A, early.id, early.a)).status, "ended_early", "one of two milestones accepted");
});

test("an engagement closed before any plan was agreed ends early, and nothing can be added to it", async () => {
  const e = await engaged();
  assert.equal((await milestone(A, e.id, e.a, MILESTONE)).status, 201);
  assert.equal((await event(A, e.id, e.a, { kind: "closed", note: "Changed my mind." })).status, 201);
  assert.equal((await view(A, e.id, e.a)).status, "ended_early");
  const late = await milestone(A, e.id, e.a, SECOND);
  assert.equal(late.status, 409);
  assert.deepEqual(await late.json(), { error: "closed" }, "the plan was never agreed: the engagement is closed, and the owner is told that");
  const posted = await handleMilestoneAdd(form(`/api/companies/${A}/engagements/${e.id}/milestones`, e.a, [["title", "T"], ["test", "T"], ["due", "2026-12-15"], ["amount", "100"]]), env, A, e.id);
  assert.equal(posted.headers.get("location"), "/deliver?problem=closed");
});

test("a plan that is agreed and a plan that is closed are told apart: adding to an agreed plan says the plan is locked, adding after the close says it is closed", async () => {
  const p = await agreed();
  const locked = await milestone(A, p.id, p.a, MILESTONE);
  assert.deepEqual(await locked.json(), { error: "plan_locked" });
  assert.equal((await event(A, p.id, p.a, { kind: "closed" })).status, 201);
  const closed = await milestone(A, p.id, p.a, MILESTONE);
  assert.deepEqual(await closed.json(), { error: "closed" }, "agreed and then closed: closed is what is true now");
  assert.equal(await count("milestones"), 2);
});

test("the order is enforced: nothing is delivered, accepted or paid before the plan is agreed, and a milestone cannot skip a step", async () => {
  const p = await planned();
  const [first, second] = p.ids;
  for (const kind of ["delivered", "accepted", "rejected"]) {
    const res = await event(A, p.id, p.a, { kind, milestoneId: first });
    assert.equal(res.status, 409, kind);
    assert.deepEqual(await res.json(), { error: "not_agreed" }, kind);
  }
  assert.deepEqual(await (await event(A, p.id, p.a, { kind: "payment_recorded", milestoneId: first, amountInr: 1 })).json(), { error: "not_agreed" });
  assert.equal((await event(A, p.id, p.a, { kind: "plan_agreed" })).status, 201);

  const wrong = async (kind: string, milestoneId: string, extra: Record<string, unknown> = {}) => {
    const res = await event(A, p.id, p.a, { kind, milestoneId, ...extra });
    assert.equal(res.status, 409, `${kind} on ${milestoneId === first ? "first" : "second"}`);
    assert.deepEqual(await res.json(), { error: "wrong_state" });
  };
  await wrong("accepted", first);
  await wrong("rejected", first);
  await wrong("payment_recorded", first, { amountInr: 40000 });
  assert.equal((await event(A, p.id, p.a, { kind: "delivered", milestoneId: first })).status, 201);
  await wrong("delivered", first);
  await wrong("payment_recorded", first, { amountInr: 40000 });
  assert.equal((await event(A, p.id, p.a, { kind: "accepted", milestoneId: first })).status, 201);
  await wrong("accepted", first);
  await wrong("rejected", first);
  await wrong("delivered", first);
  assert.equal((await event(A, p.id, p.a, { kind: "payment_recorded", milestoneId: first, amountInr: 39000, note: "Held back 1,000 for the missing manual." })).status, 201);
  await wrong("payment_recorded", first, { amountInr: 1000 });
  assert.equal((await view(A, p.id, p.a)).milestones[0].paidInr, 39000, "a payment of another amount than agreed is recorded as it was");
  await wrong("accepted", second);
  assert.equal(await count("engagement_events", "kind = 'payment_recorded'"), 1);
});

test("what an event may carry is checked: a milestone for a milestone event, an amount only for a payment, text notes", async () => {
  const p = await agreed();
  const [first] = p.ids;
  const bad: [string, Record<string, unknown>, string][] = [
    ["delivered without a milestone", { kind: "delivered" }, "milestoneId"],
    ["plan_agreed naming a milestone", { kind: "closed", milestoneId: first }, "milestoneId"],
    ["an amount on a delivery", { kind: "delivered", milestoneId: first, amountInr: 10 }, "amountInr"],
    ["a payment without an amount", { kind: "payment_recorded", milestoneId: first }, "amountInr"],
    ["a payment of zero", { kind: "payment_recorded", milestoneId: first, amountInr: 0 }, "amountInr"],
    // An amount sent as text must be digits and nothing else: a decimal, an exponent, a sign or a space-only string is not a whole number of rupees.
    ...["1.0", "2.", ".5", "1e3", "-5", "+5", "0x10", "1,000", " ", "٣"].map((text): [string, Record<string, unknown>, string] => [`a payment written as "${text}"`, { kind: "payment_recorded", milestoneId: first, amountInr: text }, "amountInr"]),
    ["a payment of more than the limit", { kind: "payment_recorded", milestoneId: first, amountInr: 100_000_001 }, "amountInr"],
    ["a fractional payment", { kind: "payment_recorded", milestoneId: first, amountInr: 10.5 }, "amountInr"],
    ["a note that is not text", { kind: "delivered", milestoneId: first, note: 5 }, "note"],
    ["a long note", { kind: "delivered", milestoneId: first, note: "x".repeat(501) }, "note"],
    ["no kind", {}, "kind"],
  ];
  for (const [name, payload, field] of bad) {
    const res = await event(A, p.id, p.a, payload);
    assert.equal(res.status, 400, name);
    assert.ok(field in ((await res.json()) as { fields: Record<string, string> }).fields, name);
  }
  assert.equal(await count("engagement_events", "kind <> 'plan_agreed'"), 0);
});

test("a milestone of another engagement, or another company's, cannot be named: 404 and nothing written", async () => {
  const p = await agreed();
  const e2 = await (async () => {
    // A second requirement and engagement in the same company.
    const detailRes = await handleAssessmentCreate(req(`/api/companies/${A}/assessments`, p.a), env, A);
    const { id: assessmentId } = (await detailRes.json()) as { id: string };
    const items = ((await (await handleAssessmentRead(get(`/api/companies/${A}/assessments/${assessmentId}`, p.a), env, A, assessmentId)).json()) as Detail).result.items;
    const other = items.find((i) => i.opportunityId !== KIND)!;
    const made = await handleRequirementCreate(req(`/api/companies/${A}/requirements`, p.a, { assessmentId, opportunityId: other.opportunityId, cluster: CLUSTER }), env, A);
    const { id: rid } = (await made.json()) as { id: string };
    const prov = await addListedProvider(p.op, "Second Works", [{ opportunityId: other.opportunityId, cluster: CLUSTER }]);
    const eng = await engage(A, rid, p.a, { providerId: prov });
    return ((await eng.json()) as { id: string }).id;
  })();
  assert.equal((await milestone(A, e2, p.a, MILESTONE)).status, 201);
  assert.equal((await event(A, e2, p.a, { kind: "plan_agreed" })).status, 201);
  const before = await count("engagement_events");
  const res = await event(A, e2, p.a, { kind: "delivered", milestoneId: p.ids[0] });
  assert.equal(res.status, 404, "the first engagement's milestone named under the second");
  assert.equal(await count("engagement_events"), before);
});

test("scope: another company's owner, the operator and a signed-out visitor get nothing, and the same 404 as a missing record; nothing is written, and the attempt is audited", async () => {
  const p = await agreed();
  const b = await ownerB();
  const op = await operator();
  const missing = await read(B, "no-such-engagement", b);
  assert.equal(missing.status, 404);
  const missingText = await missing.text();
  const refused = [
    await read(A, p.id, b),
    await list(A, b),
    await read(A, p.id, op),
    await list(A, op),
    await engage(A, p.requirementId, b, { providerId: p.providerId }),
    await milestone(A, p.id, b, MILESTONE),
    await event(A, p.id, b, { kind: "closed" }),
    await engage(A, p.requirementId, op, { providerId: p.providerId }),
    await milestone(A, p.id, op, MILESTONE),
    await event(A, p.id, op, { kind: "closed" }),
  ];
  for (const r of refused) {
    assert.equal(r.status, 404);
    assert.equal(await r.text(), missingText);
  }
  assert.equal((await read(A, p.id, undefined)).status, 401);
  assert.equal((await event(A, p.id, undefined, { kind: "closed" })).status, 401);
  assert.equal(await count("engagement_events", "kind = 'closed'"), 0);
  assert.deepEqual(await (await list(B, b)).json(), { engagements: [] });
  assert.ok((await audits("engagement.write.denied")).length >= 6);
  assert.ok((await audits("engagement.read.denied")).length >= 4);

  // Naming the other company's engagement under one's own company is the same 404, and writes nothing.
  assert.equal((await read(B, p.id, b)).status, 404);
  assert.equal((await event(B, p.id, b, { kind: "closed" })).status, 404);
  assert.equal((await milestone(B, p.id, b, MILESTONE)).status, 404);
  assert.equal(await count("engagement_events", "kind = 'closed'"), 0);
  assert.equal(await count("milestones"), 2);
});

test("a person in the company who is not its owner may read but not change anything: 403, audited, nothing written", async () => {
  const p = await agreed();
  await db.prepare("INSERT INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES ('user-synthetic-viewer-a', ?, 'viewer-a@synthetic.invalid', 'SYNTHETIC Viewer A', 'viewer', 1)").bind(A).run();
  const viewer = await signIn("viewer-a@synthetic.invalid");
  assert.equal((await read(A, p.id, viewer)).status, 200);
  assert.equal((await list(A, viewer)).status, 200);
  const before = { events: await count("engagement_events"), milestones: await count("milestones"), engagements: await count("engagements") };
  for (const res of [await engage(A, p.requirementId, viewer, { providerId: p.providerId }), await milestone(A, p.id, viewer, MILESTONE), await event(A, p.id, viewer, { kind: "delivered", milestoneId: p.ids[0] })]) {
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "forbidden" });
  }
  assert.deepEqual({ events: await count("engagement_events"), milestones: await count("milestones"), engagements: await count("engagements") }, before);
});

test("a request another website started is refused with its body read, for each of the three writes, and writes nothing", async () => {
  const p = await agreed();
  const evil = { origin: "https://evil.example" };
  for (const res of [await engage(A, p.requirementId, p.a, { providerId: p.providerId }, evil), await milestone(A, p.id, p.a, MILESTONE, evil), await event(A, p.id, p.a, { kind: "closed" }, evil)]) {
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "cross_site_refused" });
  }
  assert.equal(await count("engagement_events", "kind = 'closed'"), 0);
  assert.equal(await count("milestones"), 2);
});

test("form posts go back to the page with what happened and are never answered with JSON, whatever happens", async () => {
  const p = await engaged();
  const post1 = (path: string, handler: (r: Request) => Promise<Response>, fields: [string, string][]) => handler(form(path, p.a, fields));
  const addForm = (fields: [string, string][]) => post1(`/api/companies/${A}/engagements/${p.id}/milestones`, (r) => handleMilestoneAdd(r, env, A, p.id), fields);
  const eventForm = (fields: [string, string][], eid = p.id) => post1(`/api/companies/${A}/engagements/${eid}/events`, (r) => handleEngagementEvent(r, env, A, eid), fields);
  const where = (res: Response) => {
    assert.equal(res.status, 303, "a form post is redirected, not answered with a document");
    return res.headers.get("location");
  };

  assert.equal(where(await addForm([["title", ""], ["test", "x"], ["due", "2026-12-01"], ["amount", "100"]])), "/deliver?problem=invalid");
  assert.equal(where(await addForm([["title", "Step one"], ["test", "Check it"], ["due", "2026-12-01"], ["amount", "100"]])), "/deliver?saved=milestone");
  const mid = (await db.prepare("SELECT id FROM milestones WHERE engagement_id = ?").bind(p.id).first<{ id: string }>())!.id;
  assert.equal(where(await eventForm([["kind", "delivered"], ["milestone", mid]])), "/deliver?problem=not_agreed");
  assert.equal(where(await eventForm([["kind", "plan_agreed"]])), "/deliver?saved=plan_agreed");
  assert.equal(where(await addForm([["title", "Late"], ["test", "Check it"], ["due", "2026-12-01"], ["amount", "100"]])), "/deliver?problem=plan_locked");
  assert.equal(where(await eventForm([["kind", "plan_agreed"]])), "/deliver?problem=already_agreed");
  assert.equal(where(await eventForm([["kind", "payment_recorded"], ["milestone", "m"], ["amount", "abc"]])), "/deliver?problem=invalid");
  assert.equal(where(await eventForm([["kind", "delivered"], ["milestone", "not-a-milestone-of-this-one"]])), "/deliver?problem=missing");
  assert.equal(where(await eventForm([["kind", "closed"]], "no-such-engagement")), "/deliver?problem=missing", "an engagement that is not there");
  assert.equal(where(await eventForm([["kind", "closed"]])), "/deliver?saved=closed");
  assert.equal(where(await eventForm([["kind", "closed"]])), "/deliver?problem=closed");

  const engageForm = (rid: string, provider: string) => handleEngagementCreate(form(`/api/companies/${A}/requirements/${rid}/engagement`, p.a, [["provider", provider]]), env, A, rid);
  assert.equal(where(await engageForm("nope", p.providerId)), "/procure?problem=missing");
  assert.equal(where(await engageForm(p.requirementId, "")), "/procure?problem=engage");
  assert.equal(where(await engageForm(p.requirementId, p.providerId)), "/deliver?made=1", "the same choice again is fine");
  const other = await addListedProvider(p.op, "Beta Works");
  assert.equal(where(await engageForm(p.requirementId, other)), "/procure?problem=already_engaged");
  assert.equal(where(await handleRequirementWithdraw(form(`/api/companies/${A}/requirements/${p.requirementId}/withdraw`, p.a), env, A, p.requirementId)), "/procure?problem=engaged");
});

test("the database refuses what the application would never send: edits, deletes, replaces of any key, and breaking the order", async () => {
  const p = await agreed();
  const [first, second] = p.ids;
  assert.equal((await event(A, p.id, p.a, { kind: "delivered", milestoneId: first })).status, 201);
  assert.equal((await event(A, p.id, p.a, { kind: "accepted", milestoneId: first })).status, 201);
  assert.equal((await event(A, p.id, p.a, { kind: "payment_recorded", milestoneId: first, amountInr: 40000 })).status, 201);
  const user = "user-synthetic-owner-a";
  const events = () => db.prepare("SELECT * FROM engagement_events ORDER BY id").all();
  const before = { events: (await events()).results, milestones: (await db.prepare("SELECT * FROM milestones ORDER BY id").all()).results, engagements: (await db.prepare("SELECT * FROM engagements").all()).results };

  for (const table of ["engagements", "milestones", "engagement_events"]) {
    await assert.rejects(db.prepare(`UPDATE ${table} SET company_id = company_id`).run(), /append-only/, `update ${table}`);
    await assert.rejects(db.prepare(`DELETE FROM ${table}`).run(), /append-only/, `delete ${table}`);
  }
  // Every unique key, by every way of replacing a row.
  const asEngagement = (verb: string, id: string, requirement: string) =>
    db.prepare(`${verb} INTO engagements (id, company_id, requirement_id, provider_id, created_at, created_by) VALUES (?, ?, ?, ?, 'x', ?)`).bind(id, A, requirement, p.providerId, user).run();
  await assert.rejects(asEngagement("INSERT OR REPLACE", p.id, p.requirementId), /append-only/, "engagement, same id (and the same requirement)");
  await assert.rejects(asEngagement("REPLACE", "another-id", p.requirementId), /append-only/, "engagement, same requirement");
  const asMilestone = (verb: string, id: string, seq: number) =>
    db.prepare(`${verb} INTO milestones (id, engagement_id, company_id, seq, title, acceptance_test, due_on, agreed_inr, created_at, created_by) VALUES (?, ?, ?, ?, 't', 't', '2026-12-01', 1, 'x', ?)`).bind(id, p.id, A, seq, user).run();
  await assert.rejects(asMilestone("INSERT OR REPLACE", first, 9), /append-only|cannot be added/, "milestone, same id (the plan is agreed, so either rule may answer)");
  await assert.rejects(asMilestone("REPLACE", "another-id", 1), /append-only|cannot be added/, "milestone, same place in the plan");
  const asEvent = (verb: string, kind: string, milestone: string | null, amount: number | null, id: number | null = null) =>
    db.prepare(`${verb} INTO engagement_events (id, engagement_id, company_id, at, user_id, kind, milestone_id, amount_inr, note) VALUES (?, ?, ?, 'forged', ?, ?, ?, ?, 'forged')`).bind(id, p.id, A, user, kind, milestone, amount).run();
  await assert.rejects(asEvent("INSERT OR REPLACE", "delivered", second, null, 1), /append-only/, "event, same id");
  await assert.rejects(asEvent("INSERT OR REPLACE", "plan_agreed", null, null), /already agreed/, "a second agreement of the plan, as a replace");
  await assert.rejects(asEvent("REPLACE", "plan_agreed", null, null), /already agreed/);
  await assert.rejects(asEvent("INSERT OR REPLACE", "payment_recorded", first, 1), /recorded once/, "a second payment, as a replace");
  await assert.rejects(asEvent("REPLACE", "payment_recorded", first, 1), /recorded once/);
  assert.equal((await event(A, p.id, p.a, { kind: "closed" })).status, 201);
  await assert.rejects(asEvent("INSERT OR REPLACE", "closed", null, null), /already closed/, "a second close, as a replace");
  await assert.rejects(asEvent("INSERT", "delivered", second, null), /is closed/);

  const after = { events: (await events()).results, milestones: (await db.prepare("SELECT * FROM milestones ORDER BY id").all()).results, engagements: (await db.prepare("SELECT * FROM engagements").all()).results };
  assert.deepEqual(after.milestones, before.milestones);
  assert.deepEqual(after.engagements, before.engagements);
  assert.deepEqual(after.events.slice(0, before.events.length), before.events, "every earlier event is exactly as it was");
  assert.equal(after.events.length, before.events.length + 1, "only the close was added");
});

test("while the plan is still open, a milestone cannot be replaced either: not by its id and not by its place in the plan", async () => {
  const p = await planned();
  const [first] = p.ids;
  const before = (await db.prepare("SELECT * FROM milestones ORDER BY seq").all()).results;
  const asMilestone = (verb: string, id: string, seq: number) =>
    db.prepare(`${verb} INTO milestones (id, engagement_id, company_id, seq, title, acceptance_test, due_on, agreed_inr, created_at, created_by) VALUES (?, ?, ?, ?, 'forged', 'forged', '2026-12-01', 1, 'x', 'user-synthetic-owner-a')`).bind(id, p.id, A, seq).run();
  await assert.rejects(asMilestone("INSERT OR REPLACE", first, 9), /append-only/, "same id, another place");
  await assert.rejects(asMilestone("REPLACE", "another-id", 1), /append-only/, "another id, the same place");
  await assert.rejects(asMilestone("INSERT OR REPLACE", first, 1), /append-only/, "same id, same place");
  assert.deepEqual((await db.prepare("SELECT * FROM milestones ORDER BY seq").all()).results, before);
});

test("the database refuses the shape and the references of an event, a milestone and an engagement", async () => {
  const p = await agreed();
  const [first] = p.ids;
  const user = "user-synthetic-owner-a";
  const ev = (kind: string, milestone: string | null, amount: number | null, engagement = p.id) =>
    db.prepare("INSERT INTO engagement_events (engagement_id, company_id, at, user_id, kind, milestone_id, amount_inr) VALUES (?, ?, 'x', ?, ?, ?, ?)").bind(engagement, A, user, kind, milestone, amount).run();
  await assert.rejects(ev("delivered", null, null), /CHECK/);
  await assert.rejects(ev("closed", first, null), /CHECK/);
  await assert.rejects(ev("delivered", first, 5), /CHECK/);
  await assert.rejects(ev("delivered", first, null, "no-such-engagement"), /FOREIGN KEY|plan is not agreed/, "a trigger may answer before the key is checked");
  await assert.rejects(ev("whatever", null, null), /CHECK/);
  await assert.rejects(db.prepare("INSERT INTO engagement_events (engagement_id, company_id, at, user_id, kind) VALUES (?, ?, 'x', ?, 'closed')").bind(p.id, B, user).run(), /FOREIGN KEY/, "an event cannot name another company's engagement");
  const ms = (title: string, test: string, due: string, amount: number, seq = 3) =>
    db.prepare("INSERT INTO milestones (id, engagement_id, company_id, seq, title, acceptance_test, due_on, agreed_inr, created_at, created_by) VALUES ('m-x', ?, ?, ?, ?, ?, ?, ?, 'x', ?)").bind(p.id, A, seq, title, test, due, amount, user).run();
  await assert.rejects(ms("t", "t", "2026-12-01", 1), /the plan is agreed/);
  const fresh = await engaged().catch(() => null);
  assert.equal(fresh, null, "a second requirement and provider are needed for a second engagement; this setup has one");
});

test("choosing providers listed at different fees leaves the fee tables untouched, and the whole delivery path writes nothing to them (D-03)", async () => {
  const { a, op, providerId, requirementId } = await setup();
  const cheap = await addListedProvider(op, "Cheap Works");
  assert.equal((await handleTermsSet(req("/api/operator/listing-terms", op, { feeInr: 90000 }), env)).status, 201);
  const dear = await addListedProvider(op, "Dear Works");
  const fees = async () => ({ terms: (await db.prepare("SELECT * FROM listing_terms ORDER BY version").all()).results, listings: (await db.prepare("SELECT * FROM provider_events ORDER BY id").all()).results });
  const before = await fees();
  assert.notDeepEqual(before.listings.map((l) => (l as { fee_inr: number }).fee_inr).filter((f, i, all) => all.indexOf(f) === i).length, 1, "the providers really were listed at different fees");

  const made = await engage(A, requirementId, a, { providerId: dear });
  assert.equal(made.status, 201, "the dearer provider can be chosen exactly as the cheaper one can");
  const { id } = (await made.json()) as { id: string };
  assert.equal((await milestone(A, id, a, MILESTONE)).status, 201);
  assert.equal((await event(A, id, a, { kind: "plan_agreed" })).status, 201);
  const m = (await view(A, id, a)).milestones[0].id;
  for (const body of [{ kind: "delivered", milestoneId: m }, { kind: "accepted", milestoneId: m }, { kind: "payment_recorded", milestoneId: m, amountInr: 40000 }, { kind: "closed" }]) assert.equal((await event(A, id, a, body)).status, 201);
  assert.deepEqual(await fees(), before, "no listing and no fee changed");
  assert.equal(await count("audit_events", "event LIKE 'listing%' OR event LIKE 'provider.%'"), (await audits("listing_terms.set")).length + (await audits("provider.created")).length + (await audits("provider.listed")).length);
  void cheap;
  void providerId;
});

test("the data layer on its own refuses another company's requirement, and shows nothing of an engagement that is not the company's", async () => {
  // The handler checks the requirement first and the composite foreign key backs it up; this calls the layer underneath directly,
  // so a statement that stopped binding the requirement to the company would be seen here and not hidden behind the other two.
  const { requirementId, providerId } = await setup();
  const userB = "user-synthetic-owner-b";
  const before = await createEngagement(db, { companyId: B, userId: userB, requirementId, providerId });
  assert.deepEqual(before, { ok: false, reason: "not_found" });
  assert.equal(await count("engagements"), 0);

  const own = await createEngagement(db, { companyId: A, userId: "user-synthetic-owner-a", requirementId, providerId });
  assert.equal(own.ok, true);
  const after = await createEngagement(db, { companyId: B, userId: userB, requirementId, providerId });
  assert.deepEqual(after, { ok: false, reason: "not_found" }, "the other company is not told an engagement exists, nor which provider it has");
  assert.equal(await count("engagements"), 1);
  assert.equal((await audits("engagement.created")).length, 1);
});

test("what the page may offer next follows the plan: nothing before the plan is agreed, the next step once it is, and nothing once the engagement is closed", async () => {
  const p = await planned();
  const nexts = async () => (await view(A, p.id, p.a)).milestones.map((m) => m.next);
  assert.deepEqual(await nexts(), [[], []], "a plan that is not agreed offers nothing to deliver, accept or pay");
  assert.equal((await event(A, p.id, p.a, { kind: "plan_agreed" })).status, 201);
  assert.deepEqual(await nexts(), [["delivered"], ["delivered"]]);
  assert.equal((await event(A, p.id, p.a, { kind: "closed" })).status, 201);
  assert.deepEqual(await nexts(), [[], []], "nothing is offered after the close");
});

// --- Rules the database now keeps for itself (migration 0014): each is tried with a row that breaks nothing else, so the message
// that refuses it is the rule's own.
const OWNER = "user-synthetic-owner-a";

test("the database refuses a milestone the plan would never hold: a fraction, a text in place of a number, a date that is not one, a name or a test of only blanks", async () => {
  const p = await planned([MILESTONE]);
  let n = 0;
  const insert = (over: Partial<Record<"seq" | "title" | "test" | "due" | "amount", unknown>> = {}) => {
    const v = { seq: 2, title: "a name", test: "a test", due: "2026-12-01", amount: 1000, ...over };
    n += 1;
    return db
      .prepare("INSERT INTO milestones (id, engagement_id, company_id, seq, title, acceptance_test, due_on, agreed_inr, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'x', ?)")
      .bind(`m-direct-${n}`, p.id, A, v.seq, v.title, v.test, v.due, v.amount, OWNER)
      .run();
  };
  const before = await count("milestones");
  await assert.rejects(insert({ seq: 1.5 }), /whole numbers/, "a place in the plan of 1.5");
  await assert.rejects(insert({ amount: 1000.5 }), /whole numbers/, "a price of 1000.5 rupees");
  await assert.rejects(insert({ amount: "a lot" }), /whole numbers/, "a price that is words");
  for (const due of ["2026-02-30", "2026-13-01", "2026-00-10", "2026-06-31", "2027-02-29", "9999-99-99", "0000-00-00"]) {
    await assert.rejects(insert({ due }), /real date/, `${due} is not a date`);
  }
  for (const due of ["1999-12-31", "2101-01-01"]) await assert.rejects(insert({ due }), /real date/, `${due} is outside 2000 to 2100`);
  const blanks = [" ", "   ", "\t", "\n", " \t\n\r ", "\u000b\u000c"];
  for (const blank of blanks) {
    await assert.rejects(insert({ title: blank }), /a name and a test/, `a name of ${JSON.stringify(blank)}`);
    await assert.rejects(insert({ test: blank }), /a name and a test/, `a test of ${JSON.stringify(blank)}`);
  }
  assert.equal(await count("milestones"), before, "none of them was written");

  // what is allowed: the edges of the date range, a leap day, a name with blanks around it, and the largest price.
  await insert({ seq: 2, due: "2000-01-01" });
  await insert({ seq: 3, due: "2100-12-31" });
  await insert({ seq: 4, due: "2028-02-29" });
  await insert({ seq: 5, title: "  a name with blanks around it  ", test: " x " });
  await insert({ seq: 6, amount: 100000000 });
  assert.equal(await count("milestones"), before + 5);
});

test("the database refuses a payment with no amount or a fraction of a rupee, and takes a whole amount however it is written", async () => {
  const p = await agreed([MILESTONE]);
  const [first] = p.ids;
  assert.equal((await event(A, p.id, p.a, { kind: "delivered", milestoneId: first })).status, 201);
  assert.equal((await event(A, p.id, p.a, { kind: "accepted", milestoneId: first })).status, 201);
  const pay = (amount: unknown, note = "") =>
    db
      .prepare("INSERT INTO engagement_events (engagement_id, company_id, at, user_id, kind, milestone_id, amount_inr, note) VALUES (?, ?, 'x', ?, 'payment_recorded', ?, ?, ?)")
      .bind(p.id, A, OWNER, first, amount, note)
      .run();
  const before = await count("engagement_events");
  await assert.rejects(pay(null), /a payment has an amount/, "the shape check passes a NULL, so the trigger is what refuses it");
  await assert.rejects(pay(1.5), /whole number of rupees/, "1.5 rupees passes BETWEEN 1 AND 100000000");
  await assert.rejects(pay(40000.25), /whole number of rupees/);
  await assert.rejects(pay(0), /CHECK/, "a CHECK still refuses zero");
  await assert.rejects(pay(100000001), /CHECK/, "and a payment above the largest one");
  assert.equal(await count("engagement_events"), before);
  // 40000.0 is the whole number 40000 once the column has stored it
  await pay(40000.0);
  assert.equal(await count("engagement_events"), before + 1);
  assert.equal((await db.prepare("SELECT typeof(amount_inr) AS t, amount_inr AS a FROM engagement_events WHERE kind = 'payment_recorded'").first<{ t: string; a: number }>())?.t, "integer");
});

test("a note of an engagement event is at most 500 characters in the table, as it is in the handler", async () => {
  const p = await agreed([MILESTONE]);
  const [first] = p.ids;
  const long = "n".repeat(501);
  const exact = "n".repeat(500);
  const deliver = (note: string) =>
    db.prepare("INSERT INTO engagement_events (engagement_id, company_id, at, user_id, kind, milestone_id, note) VALUES (?, ?, 'x', ?, 'delivered', ?, ?)").bind(p.id, A, OWNER, first, note).run();
  await assert.rejects(deliver(long), /at most 500 characters/);
  // SQLite's length() stops at a NUL: 'a', a NUL and 5,000 more characters counted as one (found by the review of the review fixes).
  await assert.rejects(deliver(`a\u0000${"b".repeat(5000)}`), /at most 500 characters/, "text after a NUL still counts");
  assert.equal(await count("engagement_events", "kind = 'delivered'"), 0);
  await deliver(exact);
  assert.equal(await count("engagement_events", "kind = 'delivered'"), 1);
});

test("a delivery refused for the limit is refused for it only, and one that awaits a decision is refused for that only: the two rules do not overlap", async () => {
  const p = await agreed([MILESTONE]);
  const [first] = p.ids;
  const deliver = () =>
    db.prepare("INSERT INTO engagement_events (engagement_id, company_id, at, user_id, kind, milestone_id) VALUES (?, ?, 'x', ?, 'delivered', ?)").bind(p.id, A, OWNER, first).run();
  for (let k = 1; k < MAX_DELIVERIES; k += 1) {
    assert.equal((await event(A, p.id, p.a, { kind: "delivered", milestoneId: first })).status, 201);
    assert.equal((await event(A, p.id, p.a, { kind: "rejected", milestoneId: first })).status, 201);
  }
  // the last delivery is made and waits for the owner's decision: it is the rule about order that refuses a second one
  assert.equal((await event(A, p.id, p.a, { kind: "delivered", milestoneId: first })).status, 201);
  await assert.rejects(deliver(), /delivered once, or again after it was rejected/, "waiting for a decision");
  await assert.rejects(deliver(), (error: unknown) => !/too many deliveries/.test(String(error)), "the limit does not answer while a delivery awaits a decision");
  // once it is rejected, only the limit refuses
  assert.equal((await event(A, p.id, p.a, { kind: "rejected", milestoneId: first })).status, 201);
  await assert.rejects(deliver(), /too many deliveries of this milestone/);
  await assert.rejects(deliver(), (error: unknown) => !/delivered once/.test(String(error)), "the rule about order does not answer at the limit");
});

test("an engagement is refused for one reason only: a withdrawn requirement is told so whether or not the provider is listed, and an open one is told about the provider", async () => {
  const { a, op, providerId, requirementId } = await setup();
  const asEngagement = () =>
    db.prepare("INSERT INTO engagements (id, company_id, requirement_id, provider_id, created_at, created_by) VALUES ('e-direct', ?, ?, ?, 'x', ?)").bind(A, requirementId, providerId, OWNER).run();
  assert.equal((await handleProviderUnlist(req(`/api/operator/providers/${providerId}/unlist`, op, {}), env, providerId)).status, 201);
  await assert.rejects(asEngagement(), /needs a listed provider/, "open requirement, unlisted provider");
  assert.equal((await handleRequirementWithdraw(req(`/api/companies/${A}/requirements/${requirementId}/withdraw`, a, {}), env, A, requirementId)).status, 201);
  await assert.rejects(asEngagement(), /needs an open requirement/, "withdrawn requirement and unlisted provider: the requirement is the reason");
  await assert.rejects(asEngagement(), (error: unknown) => !/listed provider/.test(String(error)), "the provider rule does not answer when the requirement already does");
  assert.equal(await count("engagements"), 0);
});
