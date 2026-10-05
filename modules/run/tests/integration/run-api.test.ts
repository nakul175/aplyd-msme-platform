// The Run endpoints against a real D1 database (Miniflare), with the real migrations. Days are made to pass by handing the handlers
// a clock: the application stamps each event with the time it is given, and the database refuses a review that is not yet due by
// comparing that stamp with the time of the first acceptance, so a test can stand at 29 days and at 30 without waiting.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { handleSessionWrite } from "../../../platform/src/api/session.ts";
import { handleFactoryRead, handleRevisionCreate } from "../../../factory/src/api/factory.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { ORIGIN, cookieFrom, createTestEnvironment, get, post } from "../../../platform/tests/support/d1.ts";
import { handleAssessmentCreate, handleAssessmentRead, handleDecisionCreate, handleSignOff } from "../../../diagnose/src/api/diagnose.ts";
import type { Result } from "../../../diagnose/src/engine.ts";
import { handleProviderCreate, handleProviderList, handleTermsSet } from "../../../procure/src/api/providers.ts";
import { handleRequirementCreate, handleRequirementWithdraw } from "../../../procure/src/api/requirements.ts";
import { handleEngagementCreate, handleEngagementEvent, handleMilestoneAdd } from "../../../deliver/src/api/engagements.ts";
import { handleOutcomeRead, handleOutcomeRecord } from "../../src/api/outcomes.ts";
import type { PresentedOutcomes } from "../../src/api/outcomes.ts";
import { listOutcomes, recordBaseline, recordReview } from "../../src/db/outcomes.ts";
import { MAX_NOTE_LENGTH, MAX_VALUE, REVIEW_DAYS } from "../../src/state.ts";

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
const DAY = 86_400_000;

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

async function addListedProvider(op: string, name: string, kind: string): Promise<string> {
  const created = await handleProviderCreate(req("/api/operator/providers", op, { name, summary: "SYNTHETIC provider", services: [{ opportunityId: kind, cluster: CLUSTER }] }), env);
  assert.equal(created.status, 201, name);
  const { id } = (await created.json()) as { id: string };
  assert.equal((await handleProviderList(req(`/api/operator/providers/${id}/list`, op, {}), env, id)).status, 201, `listing ${name}`);
  return id;
}

/** Makes a requirement for item `n` of the assessment and chooses a listed provider for it. Returns the engagement. */
async function engageFor(s: { a: string; op: string; detail: Detail }, n: number): Promise<{ id: string; kind: string; requirementId: string }> {
  const kind = s.detail.result.items[n].opportunityId;
  const providerId = await addListedProvider(s.op, `Provider ${n}`, kind);
  const made = await handleRequirementCreate(req(`/api/companies/${A}/requirements`, s.a, { assessmentId: s.detail.id, opportunityId: kind, cluster: CLUSTER }), env, A);
  assert.equal(made.status, 201);
  const { id: requirementId } = (await made.json()) as { id: string };
  const e = await handleEngagementCreate(req(`/api/companies/${A}/requirements/${requirementId}/engagement`, s.a, { providerId }), env, A, requirementId);
  assert.equal(e.status, 201);
  return { id: ((await e.json()) as { id: string }).id, kind, requirementId };
}

async function base() {
  const a = await ownerA();
  const op = await operator();
  assert.equal((await handleTermsSet(req("/api/operator/listing-terms", op, { feeInr: 1500 }), env)).status, 201);
  const detail = await signedOffA(a);
  return { a, op, detail };
}

const MILESTONE = { title: "Job log running on the shop floor", acceptanceTest: "Every job of one shift is logged on the tablet and matches the paper sheet.", dueOn: "2026-12-15", agreedInr: 40000 };
const deliverEvent = (eid: string, cookie: string, body: unknown) => handleEngagementEvent(req(`/api/companies/${A}/engagements/${eid}/events`, cookie, body), env, A, eid);

/** An engagement with an agreed plan of one milestone, nothing delivered yet. */
async function planned() {
  const s = await base();
  const e = await engageFor(s, 0);
  const m = await handleMilestoneAdd(req(`/api/companies/${A}/engagements/${e.id}/milestones`, s.a, MILESTONE), env, A, e.id);
  assert.equal(m.status, 201);
  const milestoneId = ((await m.json()) as { id: string }).id;
  assert.equal((await deliverEvent(e.id, s.a, { kind: "plan_agreed" })).status, 201);
  return { ...s, ...e, milestoneId };
}
async function accept(p: { id: string; a: string; milestoneId: string }) {
  assert.equal((await deliverEvent(p.id, p.a, { kind: "delivered", milestoneId: p.milestoneId })).status, 201);
  assert.equal((await deliverEvent(p.id, p.a, { kind: "accepted", milestoneId: p.milestoneId })).status, 201);
}

const outcomes = (companyId: string, eid: string, cookie: string | undefined, body: unknown, now?: Date, headers: Record<string, string> = {}) =>
  handleOutcomeRecord(req(`/api/companies/${companyId}/engagements/${eid}/outcomes`, cookie, body, headers), env, companyId, eid, now ? () => now : undefined);
const readOutcomes = (companyId: string, eid: string, cookie: string | undefined, now?: Date) => handleOutcomeRead(get(`/api/companies/${companyId}/engagements/${eid}/outcomes`, cookie), env, companyId, eid, now ? () => now : undefined);
const view = async (eid: string, cookie: string, now?: Date) => (await (await readOutcomes(A, eid, cookie, now)).json()) as PresentedOutcomes;
const REVIEW = { kind: "review", reviewNo: 1, value: 60, verdict: "met", inUse: "yes" };
const after = (iso: string, days: number, extraMs = 0) => new Date(new Date(iso).getTime() + days * DAY + extraMs);

const count = async (table: string, where = "1 = 1") => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).first<{ n: number }>())!.n;
const audits = async (event: string) => (await db.prepare("SELECT user_id, company_id, detail FROM audit_events WHERE event = ? ORDER BY id").bind(event).all<{ user_id: string | null; company_id: string | null; detail: string }>()).results;

test("a baseline is recorded once, before anything is accepted, and is read back with what the assessment expected", async () => {
  const p = await planned();
  const before = await view(p.id, p.a);
  assert.equal(before.canRecordBaseline, true);
  assert.equal(before.baseline, null);
  assert.equal(before.firstAcceptedAt, null);
  assert.equal(before.expected?.measure.length! > 0, true);
  assert.deepEqual(before.reviews.map((r) => r.state), ["waiting", "waiting", "waiting"]);

  const first = await outcomes(A, p.id, p.a, { kind: "baseline", value: 42, note: "From the paper sheets of September." });
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { ok: true });
  const v = await view(p.id, p.a);
  assert.equal(v.baseline?.value, 42);
  assert.equal(v.baseline?.note, "From the paper sheets of September.");
  assert.equal(v.canRecordBaseline, false);

  const again = await outcomes(A, p.id, p.a, { kind: "baseline", value: 43 });
  assert.equal(again.status, 409);
  assert.deepEqual(await again.json(), { error: "baseline_exists" });
  assert.equal(await count("outcome_events"), 1);
  assert.equal((await view(p.id, p.a)).baseline?.value, 42, "the first number stands");
  const [entry] = await audits("outcome.baseline");
  assert.equal((await audits("outcome.baseline")).length, 1, "the refused one is not audited as a baseline");
  assert.equal(entry.user_id, "user-synthetic-owner-a");
  assert.equal(entry.company_id, A);
});

test("what the assessment expected is the figure for this engagement's own idea, whichever idea it is", async () => {
  const s = await base();
  const items = s.detail.result.items;
  assert.ok(items.length >= 3, "the synthetic assessment has at least three ideas");
  const shown: string[] = [];
  for (const n of [0, 1, 2]) {
    const e = await engageFor(s, n);
    const expected = (await view(e.id, s.a)).expected;
    const b = items[n].benefit;
    assert.deepEqual(expected, { measure: b.measure, unit: b.unit, low: b.low, high: b.high, synthetic: true }, `idea ${n}: ${items[n].opportunityId}`);
    shown.push(JSON.stringify(expected));
  }
  assert.ok(new Set(shown).size >= 2, "the ideas do not all share one figure, so the test can tell one from another");
});

test("a baseline cannot be taken once something has been accepted, and nothing is written when it is refused", async () => {
  const p = await planned();
  await accept(p);
  const late = await outcomes(A, p.id, p.a, { kind: "baseline", value: 42 });
  assert.equal(late.status, 409);
  assert.deepEqual(await late.json(), { error: "baseline_too_late" });
  assert.equal(await count("outcome_events"), 0);
  const v = await view(p.id, p.a);
  assert.equal(v.canRecordBaseline, false);
  assert.equal(v.baseline, null);
  assert.equal((await audits("outcome.baseline")).length, 0);
});

test("a delivered but not yet accepted milestone does not close the baseline: only an acceptance does", async () => {
  const p = await planned();
  assert.equal((await deliverEvent(p.id, p.a, { kind: "delivered", milestoneId: p.milestoneId })).status, 201);
  assert.equal((await view(p.id, p.a)).canRecordBaseline, true);
  assert.equal((await outcomes(A, p.id, p.a, { kind: "baseline", value: 5 })).status, 201);
});

test("a review needs an accepted milestone", async () => {
  const p = await planned();
  const far = new Date(Date.now() + 1000 * DAY);
  const res = await outcomes(A, p.id, p.a, REVIEW, far);
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "nothing_accepted" });
  assert.equal(await count("outcome_events"), 0);
  // Delivered, and even a rejection, are not an acceptance.
  assert.equal((await deliverEvent(p.id, p.a, { kind: "delivered", milestoneId: p.milestoneId })).status, 201);
  assert.equal((await deliverEvent(p.id, p.a, { kind: "rejected", milestoneId: p.milestoneId })).status, 201);
  assert.equal((await outcomes(A, p.id, p.a, REVIEW, far)).status, 409);
});

test("each review opens on its day and not before: 30, 90 and 180 days after the first acceptance, measured to the millisecond", async () => {
  const p = await planned();
  await accept(p);
  const first = (await view(p.id, p.a)).firstAcceptedAt!;
  assert.ok(first);
  const body = (no: number) => ({ ...REVIEW, reviewNo: no, value: 50 + no });
  const refused = async (no: number, days: number) => {
    const res = await outcomes(A, p.id, p.a, body(no), after(first, days, -1));
    assert.equal(res.status, 409, `review ${no} one millisecond before day ${days}`);
    assert.deepEqual(await res.json(), { error: "not_due" });
  };
  const written = async (no: number, days: number) => assert.equal((await outcomes(A, p.id, p.a, body(no), after(first, days))).status, 201, `review ${no} on day ${days}`);

  assert.equal((await outcomes(A, p.id, p.a, body(1), after(first, 0))).status, 409);
  await refused(1, REVIEW_DAYS[0]);
  await refused(2, REVIEW_DAYS[1]);
  await refused(3, REVIEW_DAYS[2]);
  assert.equal(await count("outcome_events"), 0, "nothing was written by the refusals");
  await written(1, REVIEW_DAYS[0]);
  await written(2, REVIEW_DAYS[1]);
  await written(3, REVIEW_DAYS[2]);
  assert.equal(await count("outcome_events", "kind = 'review'"), 3);
  const trail = await audits("outcome.review");
  assert.equal(trail.length, 3);
  assert.deepEqual(trail.map((t) => JSON.parse(t.detail)), [1, 2, 3].map((no) => ({ engagement: p.id, review: no })), "each audit entry names the engagement and which review it was");
});

test("the reviews are timed from the first acceptance, not the latest, when several milestones are accepted at different times", async () => {
  const s = await base();
  const e = await engageFor(s, 0);
  const ids: string[] = [];
  for (const title of ["First part", "Second part"]) {
    const m = await handleMilestoneAdd(req(`/api/companies/${A}/engagements/${e.id}/milestones`, s.a, { ...MILESTONE, title }), env, A, e.id);
    assert.equal(m.status, 201);
    ids.push(((await m.json()) as { id: string }).id);
  }
  assert.equal((await deliverEvent(e.id, s.a, { kind: "plan_agreed" })).status, 201);
  await accept({ id: e.id, a: s.a, milestoneId: ids[0] });
  await new Promise((r) => setTimeout(r, 25));
  await accept({ id: e.id, a: s.a, milestoneId: ids[1] });
  const stamps = (await db.prepare("SELECT at FROM engagement_events WHERE engagement_id = ? AND kind = 'accepted' ORDER BY id").bind(e.id).all<{ at: string }>()).results.map((r) => r.at);
  assert.equal(stamps.length, 2);
  assert.ok(stamps[1] > stamps[0], "the two acceptances have different stamps");
  assert.equal((await view(e.id, s.a)).firstAcceptedAt, stamps[0]);
  const [first, latest] = stamps;
  const body = { ...REVIEW, reviewNo: 1, value: 51 };
  // The day the first acceptance's 30 days end, the latest acceptance's have not: the review is open, because the clock started at the first.
  assert.ok(after(first, REVIEW_DAYS[0]).getTime() < after(latest, REVIEW_DAYS[0]).getTime());
  assert.equal((await outcomes(A, e.id, s.a, body, after(first, REVIEW_DAYS[0], -1))).status, 409, "one millisecond before the first acceptance's 30 days");
  assert.equal((await outcomes(A, e.id, s.a, body, after(first, REVIEW_DAYS[0]))).status, 201, "on the first acceptance's 30th day");
});

test("a review that is late is still recorded, reviews are independent of one another, and each is recorded once", async () => {
  const p = await planned();
  await accept(p);
  const first = (await view(p.id, p.a)).firstAcceptedAt!;
  const late = after(first, 400);
  assert.equal((await outcomes(A, p.id, p.a, { ...REVIEW, reviewNo: 3, value: 70 }, late)).status, 201, "the last review can be recorded before the others");
  assert.equal((await outcomes(A, p.id, p.a, { ...REVIEW, reviewNo: 1, value: 55 }, late)).status, 201);
  const twice = await outcomes(A, p.id, p.a, { ...REVIEW, reviewNo: 1, value: 99 }, late);
  assert.equal(twice.status, 409);
  assert.deepEqual(await twice.json(), { error: "review_exists" });
  assert.equal((await outcomes(A, p.id, p.a, { ...REVIEW, reviewNo: 1, value: 99 }, after(first, 0))).status, 409, "once, before due or not");
  const v = await view(p.id, p.a, late);
  assert.deepEqual(v.reviews.map((r) => r.state), ["recorded", "due", "recorded"]);
  assert.equal(v.reviews[0].record?.value, 55, "the first number stands");
  assert.equal(await count("outcome_events"), 2);
});

test("the change since the baseline is the latest review less the baseline; the latest is the highest review number recorded", async () => {
  const p = await planned();
  assert.equal((await view(p.id, p.a)).changeSinceBaseline, null);
  assert.equal((await outcomes(A, p.id, p.a, { kind: "baseline", value: 40 })).status, 201);
  assert.equal((await view(p.id, p.a)).changeSinceBaseline, null, "no review yet");
  await accept(p);
  const first = (await view(p.id, p.a)).firstAcceptedAt!;
  const late = after(first, 400);
  assert.equal((await outcomes(A, p.id, p.a, { ...REVIEW, reviewNo: 2, value: 35 }, late)).status, 201);
  assert.equal((await view(p.id, p.a, late)).changeSinceBaseline, -5);
  assert.equal((await outcomes(A, p.id, p.a, { ...REVIEW, reviewNo: 1, value: 90 }, late)).status, 201);
  assert.equal((await view(p.id, p.a, late)).changeSinceBaseline, -5, "review 1 was recorded later but review 2 is the latest look");
  assert.equal((await outcomes(A, p.id, p.a, { ...REVIEW, reviewNo: 3, value: 40 }, late)).status, 201);
  assert.equal((await view(p.id, p.a, late)).changeSinceBaseline, 0);
});

test("without a baseline the reviews are recorded and there is no change to show", async () => {
  const p = await planned();
  await accept(p);
  const first = (await view(p.id, p.a)).firstAcceptedAt!;
  assert.equal((await outcomes(A, p.id, p.a, REVIEW, after(first, 31))).status, 201);
  const v = await view(p.id, p.a, after(first, 31));
  assert.equal(v.baseline, null);
  assert.equal(v.changeSinceBaseline, null);
});

test("what is sent is checked: the number, the kind, the verdict, whether it is in use, the review, the note", async () => {
  const p = await planned();
  await accept(p);
  const first = (await view(p.id, p.a)).firstAcceptedAt!;
  const now = after(first, 400);
  const bad = async (body: Record<string, unknown>, field: string) => {
    const res = await outcomes(A, p.id, p.a, body, now);
    assert.equal(res.status, 400, JSON.stringify(body));
    const json = (await res.json()) as { error: string; fields: Record<string, string> };
    assert.equal(json.error, "invalid");
    assert.ok(field in json.fields, `${field} in ${Object.keys(json.fields)}`);
  };
  await bad({ ...REVIEW, value: -1 }, "value");
  await bad({ ...REVIEW, value: MAX_VALUE + 1 }, "value");
  await bad({ ...REVIEW, value: 1.5 }, "value");
  await bad({ ...REVIEW, value: "abc" }, "value");
  await bad({ ...REVIEW, value: "" }, "value");
  for (const text of ["1.5", "1.0", "2.", ".5", "1e3", "-1", "+1", "0x10", "1 2", " ", "12345678901", "\u0661\u0662", "1,000"]) await bad({ ...REVIEW, value: text }, "value");
  await bad({ ...REVIEW, value: undefined }, "value");
  await bad({ ...REVIEW, kind: "other" }, "kind");
  await bad({ ...REVIEW, kind: undefined }, "kind");
  await bad({ ...REVIEW, reviewNo: 0 }, "reviewNo");
  await bad({ ...REVIEW, reviewNo: 4 }, "reviewNo");
  await bad({ ...REVIEW, reviewNo: "1" }, "reviewNo");
  await bad({ ...REVIEW, verdict: "great" }, "verdict");
  await bad({ ...REVIEW, verdict: undefined }, "verdict");
  await bad({ ...REVIEW, inUse: "maybe" }, "inUse");
  await bad({ ...REVIEW, inUse: undefined }, "inUse");
  await bad({ ...REVIEW, note: "x".repeat(MAX_NOTE_LENGTH + 1) }, "note");
  await bad({ ...REVIEW, note: "a\u0000b" }, "note");
  await bad({ ...REVIEW, note: 7 }, "note");
  await bad({ kind: "baseline", value: 3, verdict: "met" }, "verdict");
  await bad({ kind: "baseline", value: 3, reviewNo: 1 }, "reviewNo");
  await bad({ kind: "baseline", value: 3, inUse: "yes" }, "inUse");
  assert.equal(await count("outcome_events"), 0);
  // The edges of what is allowed are allowed.
  assert.equal((await outcomes(A, p.id, p.a, { ...REVIEW, value: 0, note: "x".repeat(MAX_NOTE_LENGTH) }, now)).status, 201);
  assert.equal((await outcomes(A, p.id, p.a, { ...REVIEW, reviewNo: 2, value: MAX_VALUE }, now)).status, 201);
  assert.equal((await outcomes(A, p.id, p.a, { ...REVIEW, reviewNo: 3, value: "17" }, now)).status, 201, "a whole number written as text is a whole number");
});

test("a person in another company, the operator and a visitor cannot read or write: a 404 identical to a missing engagement, audited, nothing written", async () => {
  const p = await planned();
  const b = await ownerB();
  const op = await operator();
  const missing = await (await readOutcomes(A, "no-such-engagement", p.a)).text();
  const far = new Date(Date.now() + 1000 * DAY);
  const refused = [
    await readOutcomes(A, p.id, b),
    await readOutcomes(A, p.id, op),
    await readOutcomes(B, p.id, b),
    await outcomes(A, p.id, b, { kind: "baseline", value: 1 }),
    await outcomes(A, p.id, op, { kind: "baseline", value: 1 }),
    await outcomes(B, p.id, b, { kind: "baseline", value: 1 }),
    await outcomes(B, p.id, b, REVIEW, far),
  ];
  for (const r of refused) {
    assert.equal(r.status, 404);
    assert.equal(await r.text(), missing);
  }
  assert.equal((await readOutcomes(A, p.id, undefined)).status, 401);
  assert.equal((await outcomes(A, p.id, undefined, { kind: "baseline", value: 1 })).status, 401);
  assert.equal(await count("outcome_events"), 0);
  assert.equal((await audits("outcome.write.denied")).length, 2, "the other company's owner and the operator, each once");
  assert.equal((await audits("outcome.read.denied")).length, 2, "the same two");
  // The owner's own company with an engagement that is not there, or is another company's, is the same answer and writes nothing.
  assert.equal((await outcomes(A, "no-such-engagement", p.a, { kind: "baseline", value: 1 })).status, 404);
  assert.equal((await outcomes(A, "x".repeat(65), p.a, { kind: "baseline", value: 1 })).status, 404);
  assert.equal(await count("outcome_events"), 0);
});

test("the data layer on its own refuses another company's engagement, and the database refuses what the layer would not send", async () => {
  const p = await planned();
  const common = { userId: "user-synthetic-owner-b", engagementId: p.id, value: 1, note: "", at: new Date() };
  assert.deepEqual(await recordBaseline(db, { ...common, companyId: B }), { ok: false, reason: "not_found" });
  assert.deepEqual(await recordReview(db, { ...common, companyId: B, reviewNo: 1, verdict: "met", inUse: "yes", at: new Date(Date.now() + 1000 * DAY) }), { ok: false, reason: "not_found" });
  assert.equal(await count("outcome_events"), 0);
  assert.equal((await audits("outcome.baseline")).length, 0, "nothing was added, so nothing is audited");
  // Straight at the table, round the application: another company's id with this company's engagement is refused by the key.
  await assert.rejects(db.prepare("INSERT INTO outcome_events (engagement_id, company_id, at, user_id, kind, value, note) VALUES (?, ?, ?, 'user-synthetic-owner-b', 'baseline', 1, '')").bind(p.id, B, new Date().toISOString()).run(), /FOREIGN KEY/);

  // The list is bound to the company in its own statement, not only by the handler's check of the engagement before it (the review
  // found this clause had no behavioural test: only a regular expression over the source saw it go).
  assert.deepEqual(await recordBaseline(db, { ...common, userId: "user-synthetic-owner-a", companyId: A }), { ok: true });
  assert.equal((await listOutcomes(db, A, p.id)).length, 1, "the owner's own list holds the baseline");
  assert.deepEqual(await listOutcomes(db, B, p.id), [], "another company's id lists nothing of this engagement");
  assert.deepEqual(await listOutcomes(db, A, "no-such-engagement"), [], "and the engagement is bound too");
});

test("the table is append-only whichever way it is written to: no update, no delete, no replace on the id or on either unique key", async () => {
  const p = await planned();
  assert.equal((await outcomes(A, p.id, p.a, { kind: "baseline", value: 40, note: "first" })).status, 201);
  await accept(p);
  const first = (await view(p.id, p.a)).firstAcceptedAt!;
  const now = after(first, 400);
  assert.equal((await outcomes(A, p.id, p.a, { ...REVIEW, value: 55 }, now)).status, 201);
  const snapshot = async () => JSON.stringify((await db.prepare("SELECT * FROM outcome_events ORDER BY id").all()).results);
  const before = await snapshot();
  const ids = (await db.prepare("SELECT id, kind FROM outcome_events ORDER BY id").all<{ id: number; kind: string }>()).results;
  const baselineId = ids.find((r) => r.kind === "baseline")!.id;
  const reviewId = ids.find((r) => r.kind === "review")!.id;

  const at = now.toISOString();
  // Replacing a row by id with a row that none of the once-only or due rules would refuse (a review number not yet recorded), so the
  // only thing between the first row and its replacement is the no-replace trigger on the id.
  const swap = (id: number, reviewNo: number) =>
    `INSERT OR REPLACE INTO outcome_events (id, engagement_id, company_id, at, user_id, kind, review_no, value, verdict, in_use, note) VALUES (${id}, '${p.id}', '${A}', '${at}', 'user-synthetic-owner-a', 'review', ${reviewNo}, 99, 'not_met', 'no', 'swapped')`;
  const attempts = [
    swap(baselineId, 3),
    swap(reviewId, 2),
    "UPDATE outcome_events SET value = 1",
    "UPDATE outcome_events SET kind = 'review' WHERE kind = 'baseline'",
    "DELETE FROM outcome_events",
    `INSERT OR REPLACE INTO outcome_events (id, engagement_id, company_id, at, user_id, kind, value, note) VALUES (1, '${p.id}', '${A}', '${at}', 'user-synthetic-owner-a', 'baseline', 1, '')`,
    `REPLACE INTO outcome_events (engagement_id, company_id, at, user_id, kind, value, note) VALUES ('${p.id}', '${A}', '${at}', 'user-synthetic-owner-a', 'baseline', 1, '')`,
    `INSERT OR REPLACE INTO outcome_events (engagement_id, company_id, at, user_id, kind, review_no, value, verdict, in_use, note) VALUES ('${p.id}', '${A}', '${at}', 'user-synthetic-owner-a', 'review', 1, 1, 'not_met', 'no', '')`,
    `INSERT OR IGNORE INTO outcome_events (engagement_id, company_id, at, user_id, kind, value, note) VALUES ('${p.id}', '${A}', '${at}', 'user-synthetic-owner-a', 'baseline', 1, '')`,
    `INSERT INTO outcome_events (engagement_id, company_id, at, user_id, kind, value, note) VALUES ('${p.id}', '${A}', '${at}', 'user-synthetic-owner-a', 'baseline', 1, '') ON CONFLICT DO UPDATE SET value = 1`,
  ];
  for (const sql of attempts) {
    await assert.rejects(db.prepare(sql).run(), /append-only|recorded once|before anything is accepted|not due yet|needs an accepted/, `not refused: ${sql}`);
  }
  assert.equal(await snapshot(), before, "every row is byte for byte as it was");
});

test("the database itself refuses a review that is early, a baseline that is late, and a second of either, whoever writes", async () => {
  const p = await planned();
  const insertReview = (no: number, at: string) => db.prepare(`INSERT INTO outcome_events (engagement_id, company_id, at, user_id, kind, review_no, value, verdict, in_use, note) VALUES (?, ?, ?, 'user-synthetic-owner-a', 'review', ?, 1, 'met', 'yes', '')`).bind(p.id, A, at, no).run();
  const insertBaseline = (at: string) => db.prepare(`INSERT INTO outcome_events (engagement_id, company_id, at, user_id, kind, value, note) VALUES (?, ?, ?, 'user-synthetic-owner-a', 'baseline', 1, '')`).bind(p.id, A, at).run();
  await assert.rejects(insertReview(1, "2099-01-01T00:00:00.000Z"), /needs an accepted milestone/);
  await accept(p);
  const first = (await view(p.id, p.a)).firstAcceptedAt!;
  await assert.rejects(insertBaseline(first), /before anything is accepted/);
  await assert.rejects(insertReview(1, after(first, 30, -1).toISOString()), /not due yet/);
  await assert.rejects(insertReview(2, after(first, 90, -1).toISOString()), /not due yet/);
  await assert.rejects(insertReview(3, after(first, 180, -1).toISOString()), /not due yet/);
  await insertReview(3, after(first, 180).toISOString());
  // A fraction on a second review of the same number is refused for being a fraction and for nothing else: the once-only rule leaves
  // a row that is not whole to the whole-number rule, so one message answers.
  await assert.rejects(
    db.prepare(`INSERT INTO outcome_events (engagement_id, company_id, at, user_id, kind, review_no, value, verdict, in_use, note) VALUES (?, ?, ?, 'user-synthetic-owner-a', 'review', 3, 1.5, 'met', 'yes', '')`).bind(p.id, A, after(first, 181).toISOString()).run(),
    (error: unknown) => /whole number/.test(String(error)) && !/recorded once/.test(String(error)),
  );
  for (const unreadable of ["x", "", "not a time", "2026-13-45T00:00:00.000Z"]) await assert.rejects(insertReview(2, unreadable), /not due yet/, `a stamp that is not a time (${JSON.stringify(unreadable)}) is refused, not let through`);
  await assert.rejects(insertReview(3, after(first, 181).toISOString()), /recorded once/);
  assert.equal(await count("outcome_events"), 1);
});

test("the table's own rules hold for whoever writes: ranges, shapes of each kind, the lists of verdicts, whole numbers, the length of a note", async () => {
  const p = await planned();
  let at = new Date().toISOString();
  const insert = (cols: string, values: unknown[]) =>
    db.prepare(`INSERT INTO outcome_events (engagement_id, company_id, at, user_id, ${cols}) VALUES (?, ?, ?, 'user-synthetic-owner-a', ${values.map(() => "?").join(", ")})`).bind(p.id, A, at, ...values).run();
  const baseline = (value: unknown, note = "") => insert("kind, value, note", ["baseline", value, note]);
  const review = (extra: { no?: unknown; value?: unknown; verdict?: unknown; inUse?: unknown }) =>
    insert("kind, review_no, value, verdict, in_use, note", ["review", extra.no ?? 1, extra.value ?? 1, extra.verdict ?? "met", extra.inUse ?? "yes", ""]);

  // the range of a figure
  await assert.rejects(baseline(-1), /CHECK/, "a negative figure");
  await assert.rejects(baseline(1_000_000_001), /CHECK/, "one over the largest");
  await assert.rejects(baseline("abc"), /CHECK|whole number/, "text is not a figure (the range check and the whole-number rule both refuse it, and either may answer)");
  // a figure is a whole number: the column keeps 1.5 as 1.5 and the range check lets it through, so a rule of its own refuses it
  for (const fraction of [1.5, 0.5, 999_999_999.5, 1e-9]) await assert.rejects(baseline(fraction), /whole number/, `${fraction}`);
  // the length of a note
  await assert.rejects(baseline(1, "x".repeat(501)), /CHECK/);
  // each kind has its own shape
  await assert.rejects(insert("kind, value, verdict, in_use", ["baseline", 1, "met", "yes"]), /CHECK/, "a baseline has no verdict (and no in-use answer)");
  await assert.rejects(insert("kind, value, verdict", ["baseline", 1, "met"]), /CHECK/, "a baseline with a verdict and nothing else of a review's");
  await assert.rejects(insert("kind, value, review_no", ["baseline", 1, 1]), /CHECK/, "a baseline has no review number");
  await assert.rejects(insert("kind, value, in_use", ["baseline", 1, "yes"]), /CHECK/, "a baseline does not say whether it is in use");
  await assert.rejects(insert("kind, value", ["other", 1]), /CHECK/, "a kind that is neither");
  assert.equal(await count("outcome_events"), 0, "nothing was written by any of them");

  // The same for a review. It is written on an engagement that has an accepted milestone, at a time long after it, so that none of
  // the rules about order and dates has anything to say and the table's own rules are the only thing between the row and the table.
  await accept(p);
  at = "2099-01-01T00:00:00.000Z";
  await assert.rejects(review({ value: 2.25 }), /whole number/, "a review's figure too");
  await assert.rejects(insert("kind, value", ["review", 1]), /CHECK/, "a review needs a number, a verdict and whether it is in use");
  await assert.rejects(insert("kind, review_no, value, in_use", ["review", 1, 1, "yes"]), /CHECK/, "a review without a verdict");
  await assert.rejects(insert("kind, review_no, value, verdict", ["review", 1, 1, "met"]), /CHECK/, "a review without whether it is in use");
  await assert.rejects(insert("kind, value, verdict, in_use", ["review", 1, "met", "yes"]), /CHECK/, "a review without its number");
  for (const no of [0, 4, -1]) await assert.rejects(review({ no }), /CHECK/, `review number ${no}`);
  for (const no of [1.5, 2.5, 3.0000001]) await assert.rejects(review({ no }), /whole number/, `review number ${no} is between 1 and 3 and is not a number of a review`);
  for (const verdict of ["MET", "ok", "", "partly "]) await assert.rejects(review({ verdict }), /CHECK/, `verdict ${JSON.stringify(verdict)}`);
  for (const inUse of ["YES", "maybe", ""]) await assert.rejects(review({ inUse }), /CHECK/, `in use ${JSON.stringify(inUse)}`);
  assert.equal(await count("outcome_events"), 0, "nothing was written by any of them");
  await review({ value: 0 });
  assert.equal(await count("outcome_events"), 1, "a review that breaks no rule is accepted: the refusals above were for the reasons given");
});

test("two engagements of one company keep their own numbers: each shows its own baseline, reviews and change, and nothing of the other's", async () => {
  const s = await base();
  const e1 = await engageFor(s, 0);
  const e2 = await engageFor(s, 1);
  const milestones: Record<string, string> = {};
  for (const e of [e1, e2]) {
    const m = await handleMilestoneAdd(req(`/api/companies/${A}/engagements/${e.id}/milestones`, s.a, MILESTONE), env, A, e.id);
    milestones[e.id] = ((await m.json()) as { id: string }).id;
    assert.equal((await deliverEvent(e.id, s.a, { kind: "plan_agreed" })).status, 201);
  }
  assert.equal((await outcomes(A, e1.id, s.a, { kind: "baseline", value: 11, note: "one" })).status, 201);
  assert.equal((await outcomes(A, e2.id, s.a, { kind: "baseline", value: 22, note: "two" })).status, 201);
  for (const e of [e1, e2]) {
    assert.equal((await deliverEvent(e.id, s.a, { kind: "delivered", milestoneId: milestones[e.id] })).status, 201);
    assert.equal((await deliverEvent(e.id, s.a, { kind: "accepted", milestoneId: milestones[e.id] })).status, 201);
  }
  const first = (await view(e1.id, s.a)).firstAcceptedAt!;
  const late = after(first, 400);
  assert.equal((await outcomes(A, e1.id, s.a, { kind: "review", reviewNo: 1, value: 15, verdict: "met", inUse: "yes", note: "first" }, late)).status, 201);
  assert.equal((await outcomes(A, e2.id, s.a, { kind: "review", reviewNo: 1, value: 90, verdict: "not_met", inUse: "no", note: "second" }, late)).status, 201);
  assert.equal((await outcomes(A, e2.id, s.a, { kind: "review", reviewNo: 3, value: 95, verdict: "partly", inUse: "yes" }, late)).status, 201);

  const one = await view(e1.id, s.a, late);
  const two = await view(e2.id, s.a, late);
  assert.deepEqual([one.baseline?.value, one.baseline?.note], [11, "one"]);
  assert.deepEqual([two.baseline?.value, two.baseline?.note], [22, "two"]);
  assert.deepEqual(one.reviews.map((r) => r.record && [r.record.value, r.record.verdict, r.record.inUse, r.record.note]), [[15, "met", "yes", "first"], null, null]);
  assert.deepEqual(two.reviews.map((r) => r.record && [r.record.value, r.record.verdict, r.record.inUse, r.record.note]), [[90, "not_met", "no", "second"], null, [95, "partly", "yes", ""]]);
  assert.equal(one.changeSinceBaseline, 4, "15 less 11");
  assert.equal(two.changeSinceBaseline, 73, "95 less 22: the latest of its own reviews");
  assert.equal(await count("outcome_events", `engagement_id = '${e1.id}'`), 2);
  assert.equal(await count("outcome_events", `engagement_id = '${e2.id}'`), 3);
});

test("the once-only and the clock rules hold for each engagement on its own: a second engagement of the same company is neither blocked by the first nor opened by it", async () => {
  const s = await base();
  const e1 = await engageFor(s, 0);
  const e2 = await engageFor(s, 1);
  const milestones: Record<string, string> = {};
  for (const e of [e1, e2]) {
    const m = await handleMilestoneAdd(req(`/api/companies/${A}/engagements/${e.id}/milestones`, s.a, MILESTONE), env, A, e.id);
    assert.equal(m.status, 201);
    milestones[e.id] = ((await m.json()) as { id: string }).id;
    assert.equal((await deliverEvent(e.id, s.a, { kind: "plan_agreed" })).status, 201);
  }
  const insertBaseline = (eid: string, at: string) => db.prepare("INSERT INTO outcome_events (engagement_id, company_id, at, user_id, kind, value, note) VALUES (?, ?, ?, 'user-synthetic-owner-a', 'baseline', 1, '')").bind(eid, A, at).run();
  const insertReview = (eid: string, no: number, at: string) => db.prepare("INSERT INTO outcome_events (engagement_id, company_id, at, user_id, kind, review_no, value, verdict, in_use, note) VALUES (?, ?, ?, 'user-synthetic-owner-a', 'review', ?, 1, 'met', 'yes', '')").bind(eid, A, at, no).run();
  const now = new Date().toISOString();
  const past = "2020-01-01T00:00:00.000Z";
  // engagement 2 was accepted long ago (rows written the way the application would have written them on that day)
  const direct = (eid: string, kind: string, at: string) => db.prepare("INSERT INTO engagement_events (engagement_id, company_id, at, user_id, kind, milestone_id, note) VALUES (?, ?, ?, 'user-synthetic-owner-a', ?, ?, '')").bind(eid, A, at, kind, milestones[eid]).run();
  await direct(e2.id, "delivered", past);
  await direct(e2.id, "accepted", past);

  // a baseline is closed by an acceptance in ITS engagement, not by one elsewhere in the company, and is once for each engagement
  await assert.rejects(insertBaseline(e2.id, now), /before anything is accepted/, "engagement 2 has an acceptance, so its baseline is too late");
  await insertBaseline(e1.id, now);
  await assert.rejects(insertBaseline(e1.id, now), /a baseline is recorded once/);
  await assert.rejects(
    db.prepare("INSERT INTO outcome_events (engagement_id, company_id, at, user_id, kind, value, note) VALUES (?, ?, ?, 'user-synthetic-owner-a', 'baseline', 1.5, '')").bind(e1.id, A, now).run(),
    (error: unknown) => /whole number/.test(String(error)) && !/recorded once/.test(String(error)),
    "a second baseline that is also a fraction is refused as a fraction only",
  );
  assert.equal(await count("outcome_events", "kind = 'baseline'"), 1);

  // a review needs an acceptance in its own engagement
  await assert.rejects(insertReview(e1.id, 1, "2099-01-01T00:00:00.000Z"), /needs an accepted milestone/, "engagement 1 has nothing accepted, however much engagement 2 has");
  // and is timed from its own first acceptance: engagement 2's review 1 is due, because its acceptance was long ago
  await insertReview(e2.id, 1, now);
  await assert.rejects(insertReview(e2.id, 1, now), /this review is recorded once/);

  // engagement 1 is accepted now: its review 1 is not due for 30 days, although engagement 2's was due years ago, and it can be recorded although engagement 2's number 1 is
  assert.equal((await deliverEvent(e1.id, s.a, { kind: "delivered", milestoneId: milestones[e1.id] })).status, 201);
  assert.equal((await deliverEvent(e1.id, s.a, { kind: "accepted", milestoneId: milestones[e1.id] })).status, 201);
  const acceptedHere = (await view(e1.id, s.a)).firstAcceptedAt!;
  await assert.rejects(insertReview(e1.id, 1, now), /not due yet/);
  await assert.rejects(insertReview(e1.id, 1, after(acceptedHere, 30, -1).toISOString()), /not due yet/);
  await insertReview(e1.id, 1, after(acceptedHere, 30).toISOString());
  assert.equal(await count("outcome_events", "kind = 'review' AND review_no = 1"), 2, "each review number is once for each engagement, not once for the company");
  await assert.rejects(insertBaseline(e1.id, after(acceptedHere, 31).toISOString()), /a baseline is recorded once/);
});

test("form posts go back to the page with what happened, and are never answered with JSON", async () => {
  const p = await planned();
  const send = (fields: [string, string][], eid = p.id, now?: Date) => handleOutcomeRecord(form(`/api/companies/${A}/engagements/${eid}/outcomes`, p.a, fields), env, A, eid, now ? () => now : undefined);
  const where = (res: Response) => {
    assert.equal(res.status, 303, "a form post is redirected, not answered with a document");
    return res.headers.get("location");
  };
  assert.equal(where(await send([["kind", "baseline"], ["value", ""]])), "/run?problem=invalid");
  assert.equal(where(await send([["kind", "baseline"], ["value", "twelve"]])), "/run?problem=invalid");
  assert.equal(where(await send([["kind", "baseline"], ["value", "42"], ["note", "From the sheets"]])), "/run?saved=baseline");
  assert.equal(where(await send([["kind", "baseline"], ["value", "43"]])), "/run?problem=baseline_exists");
  assert.equal(where(await send([["kind", "baseline"], ["value", "43"]], "no-such-engagement")), "/run?problem=missing");
  assert.equal(where(await send([["kind", "baseline"], ["value", "43"]], "x".repeat(65))), "/run?problem=missing");
  const early: [string, string][] = [["kind", "review"], ["review", "1"], ["value", "60"], ["verdict", "met"], ["in_use", "yes"]];
  assert.equal(where(await send(early, p.id, new Date(Date.now() + 1000 * DAY))), "/run?problem=nothing_accepted");
  await accept(p);
  const first = (await view(p.id, p.a)).firstAcceptedAt!;
  assert.equal(where(await send([["kind", "baseline"], ["value", "44"]])), "/run?problem=baseline_exists", "a second baseline is 'recorded once', not 'too late'");
  assert.equal(where(await send(early, p.id, after(first, 29))), "/run?problem=not_due");
  assert.equal(where(await send([["kind", "review"], ["review", "9"], ["value", "60"], ["verdict", "met"], ["in_use", "yes"]], p.id, after(first, 31))), "/run?problem=invalid");
  assert.equal(where(await send([["kind", "review"], ["review", "1"], ["value", "60"], ["verdict", "met"]], p.id, after(first, 31))), "/run?problem=invalid", "no answer to 'still in use'");
  assert.equal(where(await send(early, p.id, after(first, 31))), "/run?saved=review");
  assert.equal(where(await send(early, p.id, after(first, 31))), "/run?problem=review_exists");
  assert.equal(await count("outcome_events"), 2);
});

test("a baseline refused as too late is named so, for a person who never took one", async () => {
  const p = await planned();
  await accept(p);
  const send = handleOutcomeRecord(form(`/api/companies/${A}/engagements/${p.id}/outcomes`, p.a, [["kind", "baseline"], ["value", "4"]]), env, A, p.id);
  assert.equal((await send).headers.get("location"), "/run?problem=baseline_too_late");
});

test("a person in the company who is not its owner may read but not record: 403, audited, nothing written", async () => {
  const p = await planned();
  await db.prepare("INSERT INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES ('user-synthetic-viewer-a', ?, 'viewer-a@synthetic.invalid', 'SYNTHETIC Viewer A', 'viewer', 1)").bind(A).run();
  const viewer = await signIn("viewer-a@synthetic.invalid");
  assert.equal((await readOutcomes(A, p.id, viewer)).status, 200);
  const res = await outcomes(A, p.id, viewer, { kind: "baseline", value: 1 });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "forbidden" });
  assert.equal(await count("outcome_events"), 0);
  assert.ok((await audits("outcome.write.denied")).length >= 1);
});

test("a request another website started is refused, and writes nothing", async () => {
  const p = await planned();
  const res = await outcomes(A, p.id, p.a, { kind: "baseline", value: 1 }, undefined, { origin: "https://evil.example" });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "cross_site_refused" });
  assert.equal(await count("outcome_events"), 0);
});

test("the next idea is the first one the owner accepted that has no requirement yet, in the assessment's order, and it moves on as requirements are made", async () => {
  const s = await base();
  const items = s.detail.result.items.map((i) => i.opportunityId);
  assert.ok(items.length >= 3, "the synthetic library gives this company at least three ideas");
  const e0 = await engageFor(s, 0);
  assert.equal((await view(e0.id, s.a)).next?.opportunityId, items[1]);
  const e1 = await engageFor(s, 1);
  assert.equal((await view(e0.id, s.a)).next?.opportunityId, items[2], "the second idea now has a requirement");
  assert.equal((await view(e1.id, s.a)).next?.opportunityId, items[2]);
  for (let n = 2; n < items.length; n++) await engageFor(s, n);
  assert.equal((await view(e0.id, s.a)).next, null, "every idea has a requirement");
});

test("the next idea is looked for among the requirements made from the same assessment: one made from a later assessment does not hide it", async () => {
  const s = await base();
  const e = await engageFor(s, 0);
  const before = (await view(e.id, s.a)).next;
  assert.ok(before, "with other ideas accepted there is a next one");

  // a newer confirmed description gives a second assessment; the owner accepts everything in it and makes a requirement for the
  // idea that is next in the FIRST assessment, from the second
  const latest = ((await (await handleFactoryRead(get(`/api/companies/${A}/factory`, s.a), env, A)).json()) as { latestConfirmed: { answers: Record<string, unknown> } }).latestConfirmed;
  assert.equal((await handleRevisionCreate(req(`/api/companies/${A}/factory/revisions`, s.a, { basedOn: 1, answers: { ...latest.answers, products: "SYNTHETIC changed product list" }, confirm: true }), env, A)).status, 201);
  const made = await handleAssessmentCreate(req(`/api/companies/${A}/assessments`, s.a), env, A);
  assert.equal(made.status, 201);
  const madeId = ((await made.json()) as { id: string }).id;
  const second = (await (await handleAssessmentRead(get(`/api/companies/${A}/assessments/${madeId}`, s.a), env, A, madeId)).json()) as Detail;
  assert.notEqual(second.id, s.detail.id);
  for (const item of second.result.items) assert.equal((await handleDecisionCreate(req(`/api/companies/${A}/assessments/${second.id}/decisions`, s.a, { opportunityId: item.opportunityId, decision: "accept" }), env, A, second.id)).status, 201);
  assert.equal((await handleSignOff(req(`/api/companies/${A}/assessments/${second.id}/signoff`, s.a), env, A, second.id)).status, 201);
  const hidden = second.result.items.find((i) => i.opportunityId === before!.opportunityId);
  assert.ok(hidden, "the idea that is next in the first assessment is in the second as well (the test needs it)");
  const asked = await handleRequirementCreate(req(`/api/companies/${A}/requirements`, s.a, { assessmentId: second.id, opportunityId: before!.opportunityId, cluster: CLUSTER }), env, A);
  assert.equal(asked.status, 201);

  assert.deepEqual((await view(e.id, s.a)).next, before, "still next: nothing was asked for it from the assessment this engagement came from");
});

test("an idea the owner did not accept is never offered as next", async () => {
  const s = await ownerA().then(async (a) => ({ a, op: await operator() }));
  assert.equal((await handleTermsSet(req("/api/operator/listing-terms", s.op, { feeInr: 1500 }), env)).status, 201);
  const made = await handleAssessmentCreate(req(`/api/companies/${A}/assessments`, s.a), env, A);
  const { id } = (await made.json()) as { id: string };
  const detail = (await (await handleAssessmentRead(get(`/api/companies/${A}/assessments/${id}`, s.a), env, A, id)).json()) as Detail;
  const [first, second, ...rest] = detail.result.items;
  assert.equal((await handleDecisionCreate(req(`/api/companies/${A}/assessments/${id}/decisions`, s.a, { opportunityId: first.opportunityId, decision: "accept" }), env, A, id)).status, 201);
  assert.equal((await handleDecisionCreate(req(`/api/companies/${A}/assessments/${id}/decisions`, s.a, { opportunityId: second.opportunityId, decision: "reject" }), env, A, id)).status, 201);
  for (const item of rest) assert.equal((await handleDecisionCreate(req(`/api/companies/${A}/assessments/${id}/decisions`, s.a, { opportunityId: item.opportunityId, decision: "reject" }), env, A, id)).status, 201);
  assert.equal((await handleSignOff(req(`/api/companies/${A}/assessments/${id}/signoff`, s.a), env, A, id)).status, 201);
  const e = await engageFor({ a: s.a, op: s.op, detail: { id, result: detail.result } }, 0);
  assert.equal((await view(e.id, s.a)).next, null, "the only other ideas were declined");
});

test("nothing here carries a fee or a share, and what the owner records changes nothing about the providers' terms", async () => {
  const p = await planned();
  const terms = async () => JSON.stringify([(await db.prepare("SELECT * FROM listing_terms ORDER BY version").all()).results, (await db.prepare("SELECT * FROM provider_events ORDER BY id").all()).results]);
  const before = await terms();
  await outcomes(A, p.id, p.a, { kind: "baseline", value: 40 });
  await accept(p);
  const first = (await view(p.id, p.a)).firstAcceptedAt!;
  await outcomes(A, p.id, p.a, REVIEW, after(first, 31));
  assert.equal(await terms(), before);
  // The words of a measure may be anything ("share of jobs on time"); what is checked is the shape of what the owner is sent.
  const keys = (value: unknown): string[] => (Array.isArray(value) ? value.flatMap(keys) : value && typeof value === "object" ? Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)]) : []);
  const shown = keys(await view(p.id, p.a, after(first, 31)));
  assert.ok(shown.length > 10);
  for (const key of shown) assert.doesNotMatch(key, /fee|commission|share|price|rupee|inr|amount|money|pay/i, `a field called ${key} is in what the owner is shown`);
  const columns = (await db.prepare("SELECT name FROM pragma_table_info('outcome_events')").all<{ name: string }>()).results.map((c) => c.name);
  assert.deepEqual(columns, ["id", "engagement_id", "company_id", "at", "user_id", "kind", "review_no", "value", "verdict", "in_use", "note"]);
});

test("an idea whose requirement was withdrawn is not offered as next: a withdrawn requirement cannot be made again, so the link would lead to a refusal", async () => {
  const s = await base();
  const items = s.detail.result.items.map((i) => i.opportunityId);
  const e0 = await engageFor(s, 0);
  assert.equal((await view(e0.id, s.a)).next?.opportunityId, items[1]);
  // a requirement for the second idea is made and withdrawn (it has no engagement, so it can be)
  const made = await handleRequirementCreate(req(`/api/companies/${A}/requirements`, s.a, { assessmentId: s.detail.id, opportunityId: items[1], cluster: CLUSTER }), env, A);
  assert.equal(made.status, 201);
  const { id } = (await made.json()) as { id: string };
  assert.equal((await handleRequirementWithdraw(req(`/api/companies/${A}/requirements/${id}/withdraw`, s.a, {}), env, A, id)).status, 201);
  assert.equal((await view(e0.id, s.a)).next?.opportunityId, items[2], "the withdrawn one is passed over");
  const again = await handleRequirementCreate(req(`/api/companies/${A}/requirements`, s.a, { assessmentId: s.detail.id, opportunityId: items[1], cluster: CLUSTER }), env, A);
  assert.equal(again.status, 409, "which is what the owner would meet if it were offered");
});

test("the expected range says it is SYNTHETIC in the data as well as on the page", async () => {
  const p = await planned();
  const shown = await view(p.id, p.a);
  assert.equal(shown.expected?.synthetic, true);
});

test("a form post refused before the person is known is answered as the platform answers every module: with JSON, and the page's own form never reaches it for another company", async () => {
  const p = await planned();
  const formTo = (path: string, cookie: string | undefined, headers: Record<string, string> = {}, body = "kind=baseline&value=5") =>
    new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, ...(cookie ? { cookie } : {}), ...headers }, body });
  const own = `/api/companies/${A}/engagements/${p.id}/outcomes`;
  const answer = async (res: Response) => ({ status: res.status, json: res.headers.get("content-type")?.startsWith("application/json") ?? false, location: res.headers.get("location") });
  assert.deepEqual(await answer(await handleOutcomeRecord(formTo(own, undefined), env, A, p.id)), { status: 401, json: true, location: null }, "no session");
  const b = await ownerB();
  assert.deepEqual(await answer(await handleOutcomeRecord(formTo(own, b), env, A, p.id)), { status: 404, json: true, location: null }, "another company's owner, naming this company");
  assert.deepEqual(await answer(await handleOutcomeRecord(formTo(own, await operator()), env, A, p.id)), { status: 404, json: true, location: null }, "the operator");
  assert.deepEqual(await answer(await handleOutcomeRecord(formTo(own, p.a, { origin: "https://evil.example" }), env, A, p.id)), { status: 403, json: true, location: null }, "another website");
  assert.deepEqual(await answer(await handleOutcomeRecord(formTo(own, p.a, {}, `kind=baseline&value=5&note=${"x".repeat(70_000)}`), env, A, p.id)), { status: 413, json: true, location: null }, "a body over the limit");
  assert.equal(await count("outcome_events"), 0, "nothing was written by any of them");
  // after the person is known, every refusal goes back to the page
  const refused = await answer(await handleOutcomeRecord(formTo(own, p.a, {}, "kind=baseline&value=abc"), env, A, p.id));
  assert.deepEqual(refused, { status: 303, json: false, location: "/run?problem=invalid" });
});
