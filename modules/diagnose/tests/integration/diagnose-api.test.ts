import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { handleSessionWrite } from "../../../platform/src/api/session.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { ORIGIN, cookieFrom, createTestEnvironment, get, post } from "../../../platform/tests/support/d1.ts";
import { handleRevisionCreate } from "../../../factory/src/api/factory.ts";
import { handleAssessmentCreate, handleAssessmentList, handleAssessmentRead, handleDecisionCreate, handleSignOff } from "../../src/api/diagnose.ts";
import { ENGINE_VERSION } from "../../src/engine.ts";
import type { Result } from "../../src/engine.ts";
import { LIBRARY_VERSION } from "../../src/library.ts";

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

async function signIn(email: string): Promise<string> {
  const res = await handleSessionWrite(post("/api/session", { email }), env);
  assert.equal(res.status, 200);
  return cookieFrom(res);
}
const ownerA = () => signIn("owner-a@synthetic.invalid");
const ownerB = () => signIn("owner-b@synthetic.invalid");

const req = (path: string, cookie: string | undefined, body: unknown = {}, headers: Record<string, string> = {}) => post(path, body, { ...(cookie ? { cookie } : {}), ...headers });
const make = (companyId: string, cookie?: string, body: unknown = {}, headers: Record<string, string> = {}) => handleAssessmentCreate(req(`/api/companies/${companyId}/assessments`, cookie, body, headers), env, companyId);
const list = (companyId: string, cookie?: string) => handleAssessmentList(get(`/api/companies/${companyId}/assessments`, cookie), env, companyId);
const readOne = (companyId: string, id: string, cookie?: string) => handleAssessmentRead(get(`/api/companies/${companyId}/assessments/${id}`, cookie), env, companyId, id);
const decide = (companyId: string, id: string, cookie: string | undefined, body: unknown) => handleDecisionCreate(req(`/api/companies/${companyId}/assessments/${id}/decisions`, cookie, body), env, companyId, id);
const signOff = (companyId: string, id: string, cookie: string | undefined, body: unknown = {}) => handleSignOff(req(`/api/companies/${companyId}/assessments/${id}/signoff`, cookie, body), env, companyId, id);
const saveFactory = (companyId: string, cookie: string, body: unknown) => handleRevisionCreate(req(`/api/companies/${companyId}/factory/revisions`, cookie, body), env, companyId);

type Detail = {
  id: string;
  factoryRevisionNo: number;
  result: Result;
  standing: { opportunityId: string; decision: string; note: string }[];
  history: { opportunityId: string; decision: string }[];
  signoff: { at: string; digest: string; digestMatches: boolean; note: string } | null;
};
async function makeOne(companyId = A, cookie?: string): Promise<{ id: string; cookie: string; detail: Detail }> {
  const c = cookie ?? (await ownerA());
  const res = await make(companyId, c);
  assert.ok(res.status === 201 || res.status === 200, `made (${res.status})`);
  const { id } = (await res.json()) as { id: string };
  return { id, cookie: c, detail: (await (await readOne(companyId, id, c)).json()) as Detail };
}
async function decideAll(companyId: string, detail: Detail, cookie: string, decision = "accept") {
  for (const item of detail.result.items) assert.equal((await decide(companyId, detail.id, cookie, { opportunityId: item.opportunityId, decision })).status, 201, item.opportunityId);
}

const count = async (table: string, where = "1 = 1", ...binds: string[]) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).bind(...binds).first<{ n: number }>())!.n;
const audits = async (event: string) =>
  (await db.prepare("SELECT user_id, company_id, detail FROM audit_events WHERE event = ? ORDER BY id").bind(event).all<{ user_id: string | null; company_id: string | null; detail: string }>()).results;

const REQUIRED = { sector: "pharma", products: "Tablets", employees: "50_249", processes: ["packaging"], problems: ["rejects_rework"] };

test("an owner makes an assessment from their confirmed description and reads it back, ranked, labelled and SYNTHETIC", async () => {
  const cookie = await ownerA();
  const res = await make(A, cookie);
  assert.equal(res.status, 201);
  const made = (await res.json()) as { id: string; created: boolean; factoryRevisionNo: number };
  assert.equal(made.created, true);
  assert.equal(made.factoryRevisionNo, 1);

  const detail = (await (await readOne(A, made.id, cookie)).json()) as Detail & { libraryVersion: number; engineVersion: number };
  assert.equal(detail.result.synthetic, true);
  assert.equal(detail.result.engine, "rules");
  assert.equal(detail.libraryVersion, LIBRARY_VERSION);
  assert.equal(detail.engineVersion, ENGINE_VERSION);
  assert.equal(detail.result.items[0].opportunityId, "digital_job_log");
  assert.deepEqual(detail.result.items.map((i) => i.rank), detail.result.items.map((_, n) => n + 1));
  assert.ok(detail.result.items.some((i) => i.kind === "ai") && detail.result.items.some((i) => i.kind === "non_ai"), "both kinds are offered");
  assert.deepEqual(detail.standing, []);
  assert.equal(detail.signoff, null);

  const listed = (await (await list(A, cookie)).json()) as { assessments: { id: string; items: number; decided: number; signedOffAt: string | null; factoryRevisionNo: number }[] };
  assert.equal(listed.assessments.length, 1);
  assert.equal(listed.assessments[0].id, made.id);
  assert.equal(listed.assessments[0].items, detail.result.items.length);
  assert.equal(listed.assessments[0].decided, 0);
  assert.equal(listed.assessments[0].signedOffAt, null);

  const [entry] = await audits("assessment.created");
  assert.equal(entry.user_id, "user-synthetic-owner-a");
  assert.equal(entry.company_id, A);
  assert.deepEqual(JSON.parse(entry.detail), { assessment: made.id, revision: 1 });
});

test("making it again changes nothing: the same assessment comes back with 200, and one row and one audit entry exist", async () => {
  const cookie = await ownerA();
  const first = (await (await make(A, cookie)).json()) as { id: string };
  const again = await make(A, cookie);
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { id: first.id, created: false, factoryRevisionNo: 1 });
  assert.equal(await count("assessments"), 1);
  assert.equal((await audits("assessment.created")).length, 1);
});

test("a company with no confirmed description gets 409 and nothing is made, even when it has a draft", async () => {
  const cookie = await ownerB();
  assert.deepEqual(await (await make(B, cookie)).json(), { error: "no_confirmed_description" });
  assert.equal((await saveFactory(B, cookie, { basedOn: 0, answers: { sector: "pharma", products: "Tablets" } })).status, 201);
  const draftOnly = await make(B, cookie);
  assert.equal(draftOnly.status, 409);
  assert.equal(await count("assessments"), 0);
  assert.equal((await saveFactory(B, cookie, { basedOn: 1, answers: REQUIRED, confirm: true })).status, 201);
  assert.equal((await make(B, cookie)).status, 201);
});

test("it is made from the newest confirmed version, not from a later draft, and a new confirmed version gives a new assessment", async () => {
  const cookie = await ownerA();
  const first = await makeOne(A, cookie);
  assert.equal((await saveFactory(A, cookie, { basedOn: 1, answers: { problems: ["energy_cost"] } })).status, 201); // a draft, v2
  assert.equal((await (await make(A, cookie)).json() as { id: string }).id, first.id, "the draft changes nothing");
  assert.equal((await saveFactory(A, cookie, { basedOn: 2, answers: { ...(await latestAnswers(cookie)), problems: ["energy_cost"] }, confirm: true })).status, 201); // v3, confirmed
  const second = (await (await make(A, cookie)).json()) as { id: string; created: boolean; factoryRevisionNo: number };
  assert.equal(second.created, true);
  assert.equal(second.factoryRevisionNo, 3);
  assert.notEqual(second.id, first.id);
  const newer = (await (await readOne(A, second.id, cookie)).json()) as Detail;
  assert.ok(newer.result.items.every((i) => i.addresses.includes("Power and fuel cost")));
  const older = (await (await readOne(A, first.id, cookie)).json()) as Detail;
  assert.deepEqual(older.result, first.detail.result, "the first assessment is unchanged");
  assert.equal(((await (await list(A, cookie)).json()) as { assessments: unknown[] }).assessments.length, 2);
});

async function latestAnswers(cookie: string): Promise<Record<string, unknown>> {
  const { handleFactoryRead } = await import("../../../factory/src/api/factory.ts");
  const body = (await (await handleFactoryRead(get(`/api/companies/${A}/factory`, cookie), env, A)).json()) as { latestConfirmed: { answers: Record<string, unknown> } };
  return body.latestConfirmed.answers;
}

test("one company's owner cannot read, make, decide on or sign another company's assessment: 404 that looks like a missing one, nothing written, audited", async () => {
  const a = await makeOne();
  const cookie = await ownerB();
  const before = { events: await count("assessment_events"), assessments: await count("assessments") };

  const outcomes = [
    await list(A, cookie),
    await readOne(A, a.id, cookie),
    await make(A, cookie),
    await decide(A, a.id, cookie, { opportunityId: a.detail.result.items[0].opportunityId, decision: "reject" }),
    await signOff(A, a.id, cookie),
  ];
  for (const res of outcomes) {
    assert.equal(res.status, 404);
    const text = await res.text();
    assert.equal(text, JSON.stringify({ error: "not_found" }));
    assert.ok(!text.includes("digital_job_log") && !text.includes(a.id));
  }
  assert.deepEqual({ events: await count("assessment_events"), assessments: await count("assessments") }, before);
  const missing = await readOne("company-that-does-not-exist", a.id, cookie);
  assert.equal(await missing.text(), JSON.stringify({ error: "not_found" }), "refused looks the same as missing");
  assert.equal((await audits("assessment.read.denied")).length, 3, "list, read and the missing company");
  assert.equal((await audits("assessment.write.denied")).length, 3, "make, decide and sign off");
  for (const e of [...(await audits("assessment.read.denied")), ...(await audits("assessment.write.denied"))]) assert.equal(e.company_id, B);
});

test("naming the other company's assessment under your own company is a 404 for read, decision and sign-off, and writes nothing", async () => {
  const a = await makeOne();
  const cookie = await ownerB();
  const before = await count("assessment_events");
  assert.equal((await readOne(B, a.id, cookie)).status, 404);
  assert.equal((await decide(B, a.id, cookie, { opportunityId: a.detail.result.items[0].opportunityId, decision: "reject" })).status, 404);
  assert.equal((await signOff(B, a.id, cookie)).status, 404);
  assert.equal(await count("assessment_events"), before);
  assert.equal((await readOne(B, "no-such-assessment", cookie)).status, 404);
  assert.equal((await readOne(B, "x".repeat(200), cookie)).status, 404);
});

test("the operator, a signed-out visitor and a tampered session get nothing", async () => {
  const a = await makeOne();
  const operator = await signIn("operator@synthetic.invalid");
  for (const res of [await list(A, operator), await readOne(A, a.id, operator), await make(A, operator), await decide(A, a.id, operator, { opportunityId: "x", decision: "accept" }), await signOff(A, a.id, operator)]) assert.equal(res.status, 404);
  for (const res of [await list(A), await readOne(A, a.id), await make(A), await decide(A, a.id, undefined, {}), await signOff(A, a.id, undefined)]) assert.equal(res.status, 401);
  const cookie = await ownerA();
  assert.equal((await readOne(A, a.id, cookie.slice(0, -2) + (cookie.endsWith("AA") ? "BB" : "AA"))).status, 401);
});

test("a person in the company who is not its owner may read but not make, decide or sign off: 403, audited, nothing written", async () => {
  const a = await makeOne();
  await db.prepare("INSERT INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES ('user-synthetic-viewer-a', ?, 'viewer-a@synthetic.invalid', 'SYNTHETIC Viewer A', 'viewer', 1)").bind(A).run();
  const cookie = await signIn("viewer-a@synthetic.invalid");
  assert.equal((await readOne(A, a.id, cookie)).status, 200);
  assert.equal((await list(A, cookie)).status, 200);
  const before = { events: await count("assessment_events"), assessments: await count("assessments") };
  for (const res of [await make(A, cookie), await decide(A, a.id, cookie, { opportunityId: a.detail.result.items[0].opportunityId, decision: "accept" }), await signOff(A, a.id, cookie)]) {
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "forbidden" });
  }
  assert.deepEqual({ events: await count("assessment_events"), assessments: await count("assessments") }, before);
  assert.equal((await audits("assessment.write.denied")).length, 3);
});

test("a request another website started is refused with its body read, for each of the three writes, and writes nothing", async () => {
  const a = await makeOne();
  const cookie = await ownerA();
  const evil = { origin: "https://evil.example" };
  const item = a.detail.result.items[0].opportunityId;
  const attempts = [
    req(`/api/companies/${A}/assessments`, cookie, {}, evil),
    req(`/api/companies/${A}/assessments/${a.id}/decisions`, cookie, { opportunityId: item, decision: "accept" }, evil),
    req(`/api/companies/${A}/assessments/${a.id}/signoff`, cookie, {}, evil),
  ];
  const results = [await handleAssessmentCreate(attempts[0], env, A), await handleDecisionCreate(attempts[1], env, A, a.id), await handleSignOff(attempts[2], env, A, a.id)];
  for (const [n, res] of results.entries()) {
    assert.equal(res.status, 403, `write ${n}`);
    assert.equal(attempts[n].bodyUsed, true, `the body of write ${n} was read`);
  }
  assert.equal(await count("assessment_events"), 0);
});

test("an owner decides on each item; the latest decision on an item stands and the earlier ones stay in the history", async () => {
  const { id, cookie, detail } = await makeOne();
  const [first, second] = detail.result.items;
  assert.equal((await decide(A, id, cookie, { opportunityId: first.opportunityId, decision: "defer", note: "  after the festival season " })).status, 201);
  assert.equal((await decide(A, id, cookie, { opportunityId: first.opportunityId, decision: "accept", note: "changed my mind" })).status, 201);
  assert.equal((await decide(A, id, cookie, { opportunityId: second.opportunityId, decision: "reject" })).status, 201);
  const after = (await (await readOne(A, id, cookie)).json()) as Detail;
  assert.deepEqual(after.standing, [
    { opportunityId: first.opportunityId, decision: "accept", note: "changed my mind" },
    { opportunityId: second.opportunityId, decision: "reject", note: "" },
  ]);
  assert.deepEqual(after.history.map((h) => [h.opportunityId, h.decision]), [[first.opportunityId, "defer"], [first.opportunityId, "accept"], [second.opportunityId, "reject"]]);
  const listed = (await (await list(A, cookie)).json()) as { assessments: { decided: number }[] };
  assert.equal(listed.assessments[0].decided, 2, "two items decided, not three events");
  const logged = await audits("assessment.decision");
  assert.equal(logged.length, 3);
  assert.deepEqual(JSON.parse(logged[0].detail), { assessment: id, opportunity: first.opportunityId, decision: "defer" });
  const stored = await db.prepare("SELECT note FROM assessment_events WHERE decision = 'defer'").first<{ note: string }>();
  assert.equal(stored?.note, "after the festival season", "the note is trimmed");
});

test("a decision that is not valid is refused with a message and writes nothing", async () => {
  const { id, cookie, detail } = await makeOne();
  const item = detail.result.items[0].opportunityId;
  const cases: [unknown, number, string][] = [
    [{ opportunityId: item, decision: "maybe" }, 400, "decision"],
    [{ opportunityId: item }, 400, "decision"],
    [{ decision: "accept" }, 400, "opportunityId"],
    [{ opportunityId: "", decision: "accept" }, 400, "opportunityId"],
    [{ opportunityId: 7, decision: "accept" }, 400, "opportunityId"],
    [{ opportunityId: item, decision: "accept", note: 5 }, 400, "note"],
    [{ opportunityId: item, decision: "accept", note: "x".repeat(501) }, 400, "note"],
    [{ opportunityId: item, decision: "accept", note: "a\u0000b" }, 400, "note"],
    [{ opportunityId: "no_such_item", decision: "accept" }, 400, "opportunityId"],
    [{ opportunityId: "x".repeat(81), decision: "accept" }, 400, "opportunityId"],
  ];
  for (const [body, status, field] of cases) {
    const res = await decide(A, id, cookie, body);
    assert.equal(res.status, status, JSON.stringify(body).slice(0, 80));
    assert.ok(((await res.json()) as { fields: Record<string, string> }).fields[field], `${field} has a message`);
  }
  assert.equal(await count("assessment_events"), 0);
  assert.equal((await decide(A, id, cookie, { opportunityId: item, decision: "accept", note: "x".repeat(500) })).status, 201, "500 characters is allowed");
});

test("an item that exists in the library but is not in this assessment cannot be decided on", async () => {
  const { id, cookie, detail } = await makeOne();
  const inLibraryOnly = "energy_review_and_tariff_check";
  assert.ok(!detail.result.items.some((i) => i.opportunityId === inLibraryOnly));
  assert.equal((await decide(A, id, cookie, { opportunityId: inLibraryOnly, decision: "accept" })).status, 400);
  assert.equal(await count("assessment_events"), 0);
});

test("the sign-off needs a decision on every item, and says so", async () => {
  const { id, cookie, detail } = await makeOne();
  assert.equal((await signOff(A, id, cookie)).status, 409, "no decisions");
  for (const item of detail.result.items.slice(0, -1)) await decide(A, id, cookie, { opportunityId: item.opportunityId, decision: "accept" });
  const res = await signOff(A, id, cookie);
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "undecided" });
  assert.equal(await count("assessment_events", "kind = 'signoff'"), 0);
  assert.equal((await audits("assessment.signed_off")).length, 0);
});

test("a signed-off assessment records who, when and a digest that matches; and nothing more can be decided", async () => {
  const { id, cookie, detail } = await makeOne();
  await decideAll(A, detail, cookie, "accept");
  await decide(A, id, cookie, { opportunityId: detail.result.items[1].opportunityId, decision: "defer", note: "later" });
  const res = await signOff(A, id, cookie, { note: "Read it with my brother." });
  assert.equal(res.status, 201);
  const { digest } = (await res.json()) as { digest: string };
  assert.match(digest, /^[0-9a-f]{64}$/);

  const after = (await (await readOne(A, id, cookie)).json()) as Detail;
  assert.ok(after.signoff);
  assert.equal(after.signoff.digest, digest);
  assert.equal(after.signoff.digestMatches, true);
  assert.equal(after.signoff.note, "Read it with my brother.");
  assert.equal(after.standing.find((s) => s.opportunityId === detail.result.items[1].opportunityId)?.decision, "defer");
  const late = await decide(A, id, cookie, { opportunityId: detail.result.items[0].opportunityId, decision: "reject" });
  assert.equal(late.status, 409);
  assert.deepEqual(await late.json(), { error: "signed_off" });
  const twice = await signOff(A, id, cookie);
  assert.equal(twice.status, 409);
  assert.deepEqual(await twice.json(), { error: "already_signed_off" });
  assert.equal(await count("assessment_events", "kind = 'signoff'"), 1);
  const listed = (await (await list(A, cookie)).json()) as { assessments: { signedOffAt: string | null }[] };
  assert.ok(listed.assessments[0].signedOffAt);
  const [signed] = await audits("assessment.signed_off");
  assert.equal(signed.user_id, "user-synthetic-owner-a");
});

test("the digest is recomputed on every read: a change made outside the application shows as a mismatch", async () => {
  const { id, cookie, detail } = await makeOne();
  await decideAll(A, detail, cookie);
  assert.equal((await signOff(A, id, cookie)).status, 201);
  assert.equal(((await (await readOne(A, id, cookie)).json()) as Detail).signoff?.digestMatches, true);
  // Only by dropping the guard can the stored rows be changed at all; this shows what a reader would then see.
  await db.prepare("DROP TRIGGER assessment_events_no_update").run();
  await db.prepare("UPDATE assessment_events SET decision = 'reject' WHERE kind = 'decision' AND opportunity_id = ?").bind(detail.result.items[0].opportunityId).run();
  assert.equal(((await (await readOne(A, id, cookie)).json()) as Detail).signoff?.digestMatches, false);
});

test("two sign-offs racing on the same assessment cannot both succeed, and a sign-off never covers a decision it did not read", async () => {
  const { id, cookie, detail } = await makeOne();
  await decideAll(A, detail, cookie);
  const results = await Promise.all([signOff(A, id, cookie), signOff(A, id, cookie), signOff(A, id, cookie)]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.ok(results.every((r) => r.status === 201 || r.status === 409));
  assert.equal(await count("assessment_events", "kind = 'signoff'"), 1);
});

test("a decision that lands between reading and signing makes the sign-off fail with 'changed', not sign something unread", async () => {
  const { id, cookie, detail } = await makeOne();
  await decideAll(A, detail, cookie);
  const { appendSignOff } = await import("../../src/db/assessments.ts");
  const stale = await appendSignOff(db, { companyId: A, userId: "user-synthetic-owner-a", assessmentId: id, note: "", digest: "0".repeat(64), decisionCount: detail.result.items.length - 1 });
  assert.deepEqual(stale, { ok: false, reason: "changed" });
  assert.equal(await count("assessment_events", "kind = 'signoff'"), 0);
});

test("the database refuses what the application would never send: edits, deletes, replaces, and breaking the sign-off rules", async () => {
  const { id, cookie, detail } = await makeOne();
  const item = detail.result.items[0].opportunityId;
  await decide(A, id, cookie, { opportunityId: item, decision: "accept" });
  await assert.rejects(db.prepare("UPDATE assessments SET result = '{}'").run(), /append-only/);
  await assert.rejects(db.prepare("DELETE FROM assessments").run(), /append-only/);
  await assert.rejects(db.prepare("UPDATE assessment_events SET note = 'x'").run(), /append-only/);
  await assert.rejects(db.prepare("DELETE FROM assessment_events").run(), /append-only/);
  await assert.rejects(db.prepare("INSERT OR REPLACE INTO assessments (id, company_id, factory_revision_no, library_version, engine_version, created_at, created_by, result) VALUES (?, ?, 1, 1, 1, 'x', 'user-synthetic-owner-a', '{\"items\":[]}')").bind(id, A).run(), /append-only/);
  await assert.rejects(db.prepare("REPLACE INTO assessments (id, company_id, factory_revision_no, library_version, engine_version, created_at, created_by, result) VALUES ('another', ?, 1, ?, ?, 'x', 'user-synthetic-owner-a', '{\"items\":[]}')").bind(A, LIBRARY_VERSION, ENGINE_VERSION).run(), /append-only/, "a different id with the same inputs is also a replace");
  await assert.rejects(db.prepare("INSERT OR REPLACE INTO assessment_events (id, assessment_id, company_id, at, user_id, kind, opportunity_id, decision) VALUES (1, ?, ?, 'x', 'user-synthetic-owner-a', 'decision', ?, 'reject')").bind(id, A, item).run(), /append-only/);

  const insertEvent = (kind: string, opportunity: string | null, decision: string | null, digest: string | null) =>
    db.prepare("INSERT INTO assessment_events (assessment_id, company_id, at, user_id, kind, opportunity_id, decision, digest) VALUES (?, ?, 'x', 'user-synthetic-owner-a', ?, ?, ?, ?)").bind(id, A, kind, opportunity, decision, digest).run();
  await assert.rejects(insertEvent("decision", "not_in_this_assessment", "accept", null), /must name an item/);
  await assert.rejects(insertEvent("signoff", null, null, "d".repeat(64)), /every item needs a decision/);
  await assert.rejects(db.prepare("INSERT INTO assessment_events (assessment_id, company_id, at, user_id, kind, opportunity_id, decision) VALUES (?, ?, 'x', 'user-synthetic-owner-a', 'decision', ?, 'accept')").bind(id, B, item).run(), /FOREIGN KEY/, "an event cannot name another company's assessment");

  await decideAll(A, detail, cookie);
  // Triggers run before CHECK constraints, so the shape of an event is only reached once its rules pass.
  await assert.rejects(insertEvent("decision", item, "maybe", null), /CHECK/);
  await assert.rejects(insertEvent("signoff", item, null, "d".repeat(64)), /CHECK/);
  await assert.rejects(insertEvent("decision", item, "accept", "d".repeat(64)), /CHECK/);
  await assert.rejects(insertEvent("signoff", null, null, null), /CHECK|NOT NULL/);
  await insertEvent("signoff", null, null, "d".repeat(64));
  await assert.rejects(insertEvent("decision", item, "reject", null), /signed off/);
  await assert.rejects(insertEvent("signoff", null, null, "e".repeat(64)), /UNIQUE/);
});

test("an assessment cannot be stored for a version that is a draft, does not exist, or belongs to another company", async () => {
  const cookie = await ownerA();
  assert.equal((await saveFactory(A, cookie, { basedOn: 1, answers: { shifts: "two" } })).status, 201);
  const insert = (company: string, revision: number) =>
    db.prepare("INSERT INTO assessments (id, company_id, factory_revision_no, library_version, engine_version, created_at, created_by, result) VALUES (?, ?, ?, 1, 99, 'x', 'user-synthetic-owner-a', '{\"items\":[]}')").bind(crypto.randomUUID(), company, revision).run();
  await assert.rejects(insert(A, 2), /confirmed description/, "v2 is a draft");
  await assert.rejects(insert(A, 7), /confirmed description/, "v7 does not exist");
  await assert.rejects(insert(B, 1), /confirmed description/, "B has no v1");
  await insert(A, 1);
});

test("both new tables hold only what the application put there, and the health check sees every guard", async () => {
  const health = await (await import("../../../platform/src/api/health.ts")).handleHealth(get("/api/health"), env);
  assert.deepEqual(await health.json(), { status: "ok", database: "ok", auditGuard: "ok" });
  await db.prepare("DROP TRIGGER assessment_events_signed_off_is_final").run();
  const degraded = await (await import("../../../platform/src/api/health.ts")).handleHealth(get("/api/health"), env);
  assert.equal(degraded.status, 503);
  assert.deepEqual(await degraded.json(), { status: "degraded", database: "ok", auditGuard: "missing" });
});

test("bodies: a form post works, JSON works, an empty POST makes an assessment, and other types and sizes are refused before use", async () => {
  const cookie = await ownerA();
  // A string body makes Request add "text/plain" itself, so a body with no content type is sent as bytes, and no body as nothing.
  const send = (path: string, type: string | null, body: string | null, handler: (r: Request) => Promise<Response>) =>
    handler(new Request(`${ORIGIN}${path}`, { method: "POST", headers: { ...(type ? { "content-type": type } : {}), origin: ORIGIN, cookie }, body: body === null ? undefined : type ? body : new TextEncoder().encode(body) }));
  const makeVia = (type: string | null, body: string | null) => send(`/api/companies/${A}/assessments`, type, body, (r) => handleAssessmentCreate(r, env, A));

  const empty = await makeVia(null, null);
  assert.equal(empty.status, 201, "no body, no content type");
  const form = await makeVia("application/x-www-form-urlencoded", "");
  assert.equal(form.status, 303, "a form post is redirected to the page");
  assert.match(form.headers.get("location") ?? "", /^\/diagnose\?a=/);
  assert.equal((await makeVia("text/plain", "{}")).status, 415);
  assert.equal((await makeVia("text/plain", "x".repeat(70_000))).status, 415, "an unsupported type is refused before its body is read or measured");
  assert.equal((await makeVia("application/json", "{")).status, 400);
  for (const body of ["null", "[]", '"x"', "7"]) assert.equal((await makeVia("application/json", body)).status, 400, body);
  assert.equal((await makeVia("application/json", JSON.stringify({ pad: "x".repeat(70_000) }))).status, 413);
  assert.equal((await makeVia(null, "unlabelled content")).status, 415, "a body with no content type is refused");
  assert.equal(await count("assessments"), 1);
});

test("form posts for a decision and a sign-off redirect back to the page with what happened", async () => {
  const { id, cookie, detail } = await makeOne();
  const form = (path: string, fields: [string, string][], handler: (r: Request) => Promise<Response>) =>
    handler(new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie }, body: new URLSearchParams(fields) }));
  const decideForm = (fields: [string, string][]) => form(`/api/companies/${A}/assessments/${id}/decisions`, fields, (r) => handleDecisionCreate(r, env, A, id));
  const signForm = (fields: [string, string][]) => form(`/api/companies/${A}/assessments/${id}/signoff`, fields, (r) => handleSignOff(r, env, A, id));
  const item = detail.result.items[0].opportunityId;

  const saved = await decideForm([["opportunity", item], ["decision", "accept"], ["note", "ok"]]);
  assert.equal(saved.status, 303);
  assert.equal(saved.headers.get("location"), `/diagnose?a=${id}&saved=${item}`);
  assert.equal((await decideForm([["opportunity", item], ["decision", "maybe"]])).headers.get("location"), `/diagnose?a=${id}&problem=decision`);
  assert.equal((await signForm([])).headers.get("location"), `/diagnose?a=${id}&problem=undecided`);
  for (const i of detail.result.items.slice(1)) await decideForm([["opportunity", i.opportunityId], ["decision", "defer"]]);
  assert.equal((await signForm([["note", "x".repeat(501)]])).headers.get("location"), `/diagnose?a=${id}&problem=note`);
  assert.equal((await signForm([["note", "done"]])).headers.get("location"), `/diagnose?a=${id}&signed=1`);
  assert.equal((await decideForm([["opportunity", item], ["decision", "reject"]])).headers.get("location"), `/diagnose?a=${id}&problem=signed`);
  assert.equal((await signForm([])).headers.get("location"), `/diagnose?a=${id}&problem=signed`);
});

test("a form that makes an assessment without a confirmed description is sent to the page that explains why", async () => {
  const cookie = await ownerB();
  const res = await handleAssessmentCreate(new Request(`${ORIGIN}/api/companies/${B}/assessments`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie }, body: "" }), env, B);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/diagnose?needs=confirm");
});

test("the seeded database has no assessment, so the first run is a visible act", async () => {
  assert.equal(await count("assessments"), 0);
  assert.equal(await count("assessment_events"), 0);
});

test("an assessment is not affected by a later change in the factory description: a new confirmed version leaves the old result as it was stored", async () => {
  const cookie = await ownerA();
  const first = await makeOne(A, cookie);
  const stored = (await db.prepare("SELECT result FROM assessments WHERE id = ?").bind(first.id).first<{ result: string }>())!.result;
  await saveFactory(A, cookie, { basedOn: 1, answers: { ...(await latestAnswers(cookie)), problems: ["safety"] }, confirm: true });
  await make(A, cookie);
  assert.equal((await db.prepare("SELECT result FROM assessments WHERE id = ?").bind(first.id).first<{ result: string }>())!.result, stored);
});
