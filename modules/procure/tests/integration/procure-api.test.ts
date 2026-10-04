// Requirements, pools, the provider registry and the listing fee, through the real handlers against a real D1 database
// (workerd's SQLite through Miniflare) with the real migrations and the SYNTHETIC seed. Every test starts its own database.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { handleSessionWrite } from "../../../platform/src/api/session.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { ORIGIN, cookieFrom, createTestEnvironment, get, post } from "../../../platform/tests/support/d1.ts";
import { handleFactoryRead, handleRevisionCreate } from "../../../factory/src/api/factory.ts";
import { handleAssessmentCreate, handleAssessmentRead, handleDecisionCreate, handleSignOff } from "../../../diagnose/src/api/diagnose.ts";
import type { Result } from "../../../diagnose/src/engine.ts";
import { handlePools, handleOperatorProviders, handlePublicProviders, handleProviderCreate, handleProviderList, handleProviderUnlist, handleTermsRead, handleTermsSet } from "../../src/api/providers.ts";
import { handleRequirementCreate, handleRequirementList, handleRequirementWithdraw } from "../../src/api/requirements.ts";

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
const OTHER_CLUSTER = "synthetic-cluster-2";
const KIND = "digital_job_log"; // the first idea for company A's seeded description

async function signIn(email: string): Promise<string> {
  const res = await handleSessionWrite(post("/api/session", { email }), env);
  assert.equal(res.status, 200, `sign-in as ${email}`);
  return cookieFrom(res);
}
const ownerA = () => signIn("owner-a@synthetic.invalid");
const ownerB = () => signIn("owner-b@synthetic.invalid");
const operator = () => signIn("operator@synthetic.invalid");

const req = (path: string, cookie: string | undefined, body: unknown = {}, headers: Record<string, string> = {}) => post(path, body, { ...(cookie ? { cookie } : {}), ...headers });

// --- an owner's side
const makeReq = (companyId: string, cookie: string | undefined, body: unknown, headers: Record<string, string> = {}) => handleRequirementCreate(req(`/api/companies/${companyId}/requirements`, cookie, body, headers), env, companyId);
const listReq = (companyId: string, cookie?: string) => handleRequirementList(get(`/api/companies/${companyId}/requirements`, cookie), env, companyId);
const withdraw = (companyId: string, rid: string, cookie: string | undefined, body: unknown = {}, headers: Record<string, string> = {}) =>
  handleRequirementWithdraw(req(`/api/companies/${companyId}/requirements/${rid}/withdraw`, cookie, body, headers), env, companyId, rid);

type Listed = {
  id: string;
  assessmentId: string;
  opportunityId: string;
  cluster: string;
  title: string;
  kind: string;
  withdrawnAt: string | null;
  pool: { shown: false; floor: number } | { shown: true; companies: number } | null;
  providers: { id: string; name: string; summary: string }[];
};
const requirementsOf = async (companyId: string, cookie: string) => ((await (await listReq(companyId, cookie)).json()) as { requirements: Listed[] }).requirements;

// --- an assessment, signed off
const make = (companyId: string, cookie: string) => handleAssessmentCreate(req(`/api/companies/${companyId}/assessments`, cookie), env, companyId);
const decide = (companyId: string, id: string, cookie: string, body: unknown) => handleDecisionCreate(req(`/api/companies/${companyId}/assessments/${id}/decisions`, cookie, body), env, companyId, id);
const signOff = (companyId: string, id: string, cookie: string) => handleSignOff(req(`/api/companies/${companyId}/assessments/${id}/signoff`, cookie), env, companyId, id);
const saveFactory = (companyId: string, cookie: string, body: unknown) => handleRevisionCreate(req(`/api/companies/${companyId}/factory/revisions`, cookie, body), env, companyId);

type Detail = { id: string; result: Result };
const answersOfA = async (): Promise<Record<string, unknown>> => {
  const cookie = await ownerA();
  const body = (await (await handleFactoryRead(get(`/api/companies/${A}/factory`, cookie), env, A)).json()) as { latestConfirmed: { answers: Record<string, unknown> } };
  return body.latestConfirmed.answers;
};

/** An assessment of the company (confirming a description first if it has none), with every idea decided as `decisionFor` says, signed off. */
async function signedOff(companyId: string, cookie: string, decisionFor: (opportunityId: string, n: number) => string = () => "accept"): Promise<Detail> {
  const made = await make(companyId, cookie);
  if (made.status === 409) {
    assert.equal((await saveFactory(companyId, cookie, { basedOn: 0, answers: await answersOfA(), confirm: true })).status, 201, "a description to confirm");
  }
  const res = made.status === 409 ? await make(companyId, cookie) : made;
  assert.ok(res.status === 201 || res.status === 200, `an assessment (${res.status})`);
  const { id } = (await res.json()) as { id: string };
  const detail = (await (await handleAssessmentRead(get(`/api/companies/${companyId}/assessments/${id}`, cookie), env, companyId, id)).json()) as Detail;
  for (const [n, item] of detail.result.items.entries()) assert.equal((await decide(companyId, id, cookie, { opportunityId: item.opportunityId, decision: decisionFor(item.opportunityId, n) })).status, 201);
  assert.equal((await signOff(companyId, id, cookie)).status, 201);
  return detail;
}

/** A new synthetic company with an owner, signed in, with a signed-off assessment in which every idea is accepted. */
async function newOwner(n: number): Promise<{ companyId: string; cookie: string; detail: Detail }> {
  const companyId = `company-synthetic-extra-${n}`;
  await db.prepare("INSERT INTO companies (id, name, is_synthetic, created_at) VALUES (?, ?, 1, '2026-10-05T00:00:00.000Z')").bind(companyId, `SYNTHETIC Extra ${n}`).run();
  await db.prepare("INSERT INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES (?, ?, ?, ?, 'owner', 1)").bind(`user-extra-${n}`, companyId, `extra-${n}@synthetic.invalid`, `SYNTHETIC Extra ${n}`).run();
  const cookie = await signIn(`extra-${n}@synthetic.invalid`);
  return { companyId, cookie, detail: await signedOff(companyId, cookie) };
}

const body = (detail: Detail, opportunityId = KIND, cluster = CLUSTER) => ({ assessmentId: detail.id, opportunityId, cluster });

// --- the operator's side
const opGet = (handler: (r: Request, e: AppEnv) => Promise<Response>, cookie?: string) => handler(get("/x", cookie), env);
const setFee = (cookie: string | undefined, payload: unknown, headers: Record<string, string> = {}) => handleTermsSet(req("/api/operator/listing-terms", cookie, payload, headers), env);
const newProvider = (cookie: string | undefined, payload: unknown, headers: Record<string, string> = {}) => handleProviderCreate(req("/api/operator/providers", cookie, payload, headers), env);
const listIt = (cookie: string | undefined, pid: string, payload: unknown = {}, headers: Record<string, string> = {}) => handleProviderList(req(`/api/operator/providers/${pid}/list`, cookie, payload, headers), env, pid);
const unlistIt = (cookie: string | undefined, pid: string, payload: unknown = {}) => handleProviderUnlist(req(`/api/operator/providers/${pid}/unlist`, cookie, payload), env, pid);
const formPost = (path: string, cookie: string, fields: [string, string][] = []) => new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie }, body: new URLSearchParams(fields) });
const providersFor = async (cookie: string) => ((await (await handlePublicProviders(get("/api/providers", cookie), env)).json()) as { providers: { id: string; name: string; services: { opportunityId: string; cluster: string }[] }[] }).providers;

async function addProvider(cookie: string, name: string, services = [{ opportunityId: KIND, cluster: CLUSTER }], summary = "SYNTHETIC provider") {
  const res = await newProvider(cookie, { name, summary, services });
  assert.equal(res.status, 201, `provider ${name}`);
  return ((await res.json()) as { id: string }).id;
}

const count = async (table: string, where = "1 = 1", ...binds: (string | number)[]) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).bind(...binds).first<{ n: number }>())!.n;
const audits = async (event: string) =>
  (await db.prepare("SELECT user_id, company_id, detail FROM audit_events WHERE event = ? ORDER BY id").bind(event).all<{ user_id: string | null; company_id: string | null; detail: string }>()).results;
const fails = async (sql: string, pattern: RegExp, ...binds: (string | number | null)[]) => {
  await assert.rejects(db.prepare(sql).bind(...binds).run(), pattern);
};

// ------------------------------------------------------------------------------------------------ requirements

test("an owner makes a requirement from an idea they accepted in a signed-off assessment, and reads it back with its pool hidden and no providers", async () => {
  const cookie = await ownerA();
  const detail = await signedOff(A, cookie);
  const res = await makeReq(A, cookie, body(detail));
  assert.equal(res.status, 201);
  const made = (await res.json()) as { id: string; created: boolean; cluster: string };
  assert.equal(made.created, true);
  assert.equal(made.cluster, CLUSTER);

  const [row] = await requirementsOf(A, cookie);
  assert.equal(row.id, made.id);
  assert.equal(row.assessmentId, detail.id);
  assert.equal(row.opportunityId, KIND);
  assert.equal(row.title, detail.result.items.find((i) => i.opportunityId === KIND)!.title);
  assert.equal(row.kind, "non_ai");
  assert.equal(row.withdrawnAt, null);
  assert.deepEqual(row.pool, { shown: false, floor: 5 });
  assert.deepEqual(row.providers, []);

  const stored = await db.prepare("SELECT spec, created_by FROM requirements WHERE id = ?").bind(made.id).first<{ spec: string; created_by: string }>();
  const spec = JSON.parse(stored!.spec) as { title: string; source: string; libraryVersion: number; costs: { oneTime: { low: number } } };
  assert.equal(spec.source, "assumption", "a copy of the assessed idea, with its source");
  assert.equal(spec.libraryVersion, 1);
  assert.ok(spec.costs.oneTime.low > 0);
  assert.equal(stored!.created_by, "user-synthetic-owner-a");
  const [entry] = await audits("requirement.created");
  assert.equal(entry.user_id, "user-synthetic-owner-a");
  assert.equal(entry.company_id, A);
  assert.deepEqual(JSON.parse(entry.detail), { requirement: made.id, opportunity: KIND, cluster: CLUSTER });
});

test("asking again for the same idea changes nothing: 200 with the same id, one row, one audit entry, even for another cluster", async () => {
  const cookie = await ownerA();
  const detail = await signedOff(A, cookie);
  const first = (await (await makeReq(A, cookie, body(detail))).json()) as { id: string };
  const again = await makeReq(A, cookie, body(detail));
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { id: first.id, created: false, cluster: CLUSTER });
  const other = await makeReq(A, cookie, body(detail, KIND, OTHER_CLUSTER));
  assert.equal(other.status, 200);
  assert.equal(((await other.json()) as { id: string }).id, first.id, "the first requirement stands; the cluster it was made in is kept");
  assert.equal(await count("requirements"), 1);
  assert.equal((await audits("requirement.created")).length, 1);
});

test("a requirement needs a signed-off assessment: a half-decided one is refused with 409 and nothing is stored", async () => {
  const cookie = await ownerA();
  const made = await make(A, cookie);
  const { id } = (await made.json()) as { id: string };
  const detail = (await (await handleAssessmentRead(get(`/api/companies/${A}/assessments/${id}`, cookie), env, A, id)).json()) as Detail;
  assert.equal((await decide(A, id, cookie, { opportunityId: KIND, decision: "accept" })).status, 201);
  const res = await makeReq(A, cookie, body(detail));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "not_signed_off" });
  assert.equal(await count("requirements"), 0);
  assert.equal((await audits("requirement.created")).length, 0);
});

test("a requirement needs an idea the owner accepted: an idea put off or turned down is refused with 409, and the latest decision is the one that counts", async () => {
  const cookie = await ownerA();
  const detail = await signedOff(A, cookie, (id, n) => (n === 0 ? "reject" : n === 1 ? "defer" : "accept"));
  const [first, second, third] = detail.result.items.map((i) => i.opportunityId);
  for (const id of [first, second]) {
    const res = await makeReq(A, cookie, body(detail, id));
    assert.equal(res.status, 409, id);
    assert.deepEqual(await res.json(), { error: "not_accepted" });
  }
  assert.equal((await makeReq(A, cookie, body(detail, third))).status, 201);
  assert.equal(await count("requirements"), 1);

  // The latest decision stands: reject, then accept before the sign-off, gives an accepted idea.
  const b = await ownerB();
  assert.equal((await saveFactory(B, b, { basedOn: 0, answers: await answersOfA(), confirm: true })).status, 201);
  const { id: bid } = (await (await make(B, b)).json()) as { id: string };
  const bd = (await (await handleAssessmentRead(get(`/api/companies/${B}/assessments/${bid}`, b), env, B, bid)).json()) as Detail;
  for (const item of bd.result.items) {
    await decide(B, bid, b, { opportunityId: item.opportunityId, decision: "reject" });
    await decide(B, bid, b, { opportunityId: item.opportunityId, decision: "accept" });
  }
  assert.equal((await signOff(B, bid, b)).status, 201);
  assert.equal((await makeReq(B, b, body(bd))).status, 201);
});

test("requests that name nothing real are refused: no idea, an idea not in the assessment, an unknown cluster, wrong types, an unknown assessment", async () => {
  const cookie = await ownerA();
  const detail = await signedOff(A, cookie);
  const cases: [unknown, number, string?][] = [
    [{}, 400, "assessmentId"],
    [{ assessmentId: detail.id, cluster: CLUSTER }, 400, "opportunityId"],
    [{ assessmentId: detail.id, opportunityId: "not_an_idea", cluster: CLUSTER }, 400, "opportunityId"],
    [{ assessmentId: detail.id, opportunityId: KIND, cluster: "somewhere-else" }, 400, "cluster"],
    [{ assessmentId: detail.id, opportunityId: KIND }, 400, "cluster"],
    [{ assessmentId: detail.id, opportunityId: KIND, cluster: ["synthetic-cluster-1"] }, 400, "cluster"],
    [{ assessmentId: 7, opportunityId: KIND, cluster: CLUSTER }, 400, "assessmentId"],
    [{ assessmentId: "x".repeat(65), opportunityId: KIND, cluster: CLUSTER }, 400, "assessmentId"],
    [{ assessmentId: detail.id, opportunityId: "x".repeat(81), cluster: CLUSTER }, 400, "opportunityId"],
    [{ assessmentId: "no-such-assessment", opportunityId: KIND, cluster: CLUSTER }, 404],
  ];
  for (const [payload, status, field] of cases) {
    const res = await makeReq(A, cookie, payload);
    assert.equal(res.status, status, JSON.stringify(payload));
    if (field) assert.ok(field in ((await res.json()) as { fields: Record<string, string> }).fields, `names ${field}`);
  }
  assert.equal(await count("requirements"), 0);
});

test("one company cannot see or touch another's requirements: its own list is its own, and naming the other company is a 404 that is audited", async () => {
  const a = await ownerA();
  const b = await ownerB();
  const detail = await signedOff(A, a);
  const made = (await (await makeReq(A, a, body(detail))).json()) as { id: string };

  assert.deepEqual(await requirementsOf(B, b), [], "B's own list does not hold A's requirement");
  for (const res of [await listReq(A, b), await makeReq(A, b, body(detail)), await withdraw(A, made.id, b)]) {
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "not_found" });
  }
  // The requirement's id under B's own company is a 404 too, and so is A's assessment under B's company.
  assert.equal((await withdraw(B, made.id, b)).status, 404);
  assert.equal((await makeReq(B, b, body(detail))).status, 404);
  assert.equal(await count("requirements"), 1);
  assert.equal(await count("requirement_events"), 0);
  const refused = await audits("requirement.write.denied");
  assert.equal(refused.length, 2);
  assert.ok(refused.every((e) => e.user_id === "user-synthetic-owner-b" && e.company_id === B));
  assert.equal((await audits("requirement.read.denied")).length, 1);
});

test("the operator, a signed-out visitor, a person of the company who is not its owner, and a request from another website get nothing", async () => {
  const a = await ownerA();
  const detail = await signedOff(A, a);
  const made = (await (await makeReq(A, a, body(detail))).json()) as { id: string };

  const op = await operator();
  for (const res of [await listReq(A, op), await makeReq(A, op, body(detail)), await withdraw(A, made.id, op)]) assert.equal(res.status, 404, "the operator reads no company");
  for (const res of [await listReq(A), await makeReq(A, undefined, body(detail)), await withdraw(A, made.id, undefined)]) assert.equal(res.status, 401);

  await db.prepare("INSERT INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES ('user-synthetic-viewer-a', ?, 'viewer-a@synthetic.invalid', 'SYNTHETIC Viewer A', 'viewer', 1)").bind(A).run();
  const viewer = await signIn("viewer-a@synthetic.invalid");
  assert.equal((await listReq(A, viewer)).status, 200, "a person of the company may read");
  assert.equal((await makeReq(A, viewer, body(detail))).status, 403);
  assert.equal((await withdraw(A, made.id, viewer)).status, 403);

  const evil = { origin: "https://evil.example" };
  assert.equal((await makeReq(A, a, body(detail, "inspection_checklist_and_gauges"), evil)).status, 403);
  assert.equal((await withdraw(A, made.id, a, {}, evil)).status, 403);
  assert.equal(await count("requirements"), 1);
  assert.equal(await count("requirement_events"), 0);
});

test("a body of a type the interface never sends, or one that is too large, is refused before anything is read into a record", async () => {
  const a = await ownerA();
  const detail = await signedOff(A, a);
  const raw = (type: string | null, text: string) =>
    handleRequirementCreate(new Request(`${ORIGIN}/api/companies/${A}/requirements`, { method: "POST", headers: { origin: ORIGIN, cookie: a, ...(type ? { "content-type": type } : {}) }, body: type ? text : new TextEncoder().encode(text) }), env, A);
  assert.equal((await raw("text/plain", JSON.stringify(body(detail)))).status, 415);
  assert.equal((await raw(null, JSON.stringify(body(detail)))).status, 415);
  assert.equal((await raw("application/json", "x".repeat(70_000))).status, 413);
  assert.equal((await raw("application/json", "{not json")).status, 400);
  assert.equal(await count("requirements"), 0);
});

test("a requirement can be withdrawn once; it stays on record, marked, and its pool and providers are no longer shown", async () => {
  const a = await ownerA();
  const detail = await signedOff(A, a);
  const { id } = (await (await makeReq(A, a, body(detail))).json()) as { id: string };
  const op = await operator();
  await setFee(op, { feeInr: 1000 });
  const pid = await addProvider(op, "Alpha");
  assert.equal((await listIt(op, pid)).status, 201);
  assert.equal((await requirementsOf(A, a))[0].providers.length, 1);

  const res = await withdraw(A, id, a, { note: "changed our minds" });
  assert.equal(res.status, 201);
  const [row] = await requirementsOf(A, a);
  assert.ok(row.withdrawnAt, "marked withdrawn");
  assert.equal(row.pool, null);
  assert.deepEqual(row.providers, []);
  assert.equal(await count("requirements"), 1, "the requirement itself stays");
  assert.equal((await db.prepare("SELECT note FROM requirement_events WHERE requirement_id = ?").bind(id).first<{ note: string }>())!.note, "changed our minds");
  const twice = await withdraw(A, id, a);
  assert.equal(twice.status, 409);
  assert.deepEqual(await twice.json(), { error: "already_withdrawn" });
  assert.equal(await count("requirement_events"), 1);
  assert.equal((await audits("requirement.withdrawn")).length, 1);
  assert.equal((await withdraw(A, "no-such-requirement", a)).status, 404);
  assert.equal((await withdraw(A, id, a, { note: "x".repeat(501) })).status, 400);
  assert.equal((await withdraw(A, id, a, { note: 5 })).status, 400);
});

test("the database refuses what the application would not: no requirement from an unsigned or undecided assessment or another company's, and none can be changed, removed or replaced", async () => {
  const a = await ownerA();
  const detail = await signedOff(A, a, (_, n) => (n === 0 ? "defer" : "accept"));
  const [deferred, accepted] = detail.result.items.map((i) => i.opportunityId);
  const insert = (company: string, assessment: string, opportunity: string, id = crypto.randomUUID()) =>
    db
      .prepare("INSERT INTO requirements (id, company_id, assessment_id, opportunity_id, cluster, spec, created_at, created_by) VALUES (?, ?, ?, ?, ?, '{}', '2026-10-05T00:00:00.000Z', 'user-synthetic-owner-a')")
      .bind(id, company, assessment, opportunity, CLUSTER)
      .run();
  await assert.rejects(insert(A, detail.id, deferred), /needs an accepted item/);
  await assert.rejects(insert(A, detail.id, "not_an_idea"), /needs an accepted item/);
  // Both rules apply to these; which trigger SQLite runs first is not defined, so either message will do.
  const either = /needs a signed-off assessment|needs an accepted item/;
  await assert.rejects(insert(B, detail.id, accepted), either, "another company's assessment");
  await assert.rejects(insert(A, "no-such-assessment", accepted), either);

  // An assessment not yet signed off: a fresh one for a second description version.
  // An assessment that is not signed off: one made for company B and left undecided.
  const b = await ownerB();
  assert.equal((await saveFactory(B, b, { basedOn: 0, answers: await answersOfA(), confirm: true })).status, 201);
  const { id: bid } = (await (await make(B, b)).json()) as { id: string };
  await assert.rejects(insert(B, bid, accepted), either);

  const { id } = (await (await makeReq(A, a, body(detail, accepted))).json()) as { id: string };
  await fails("UPDATE requirements SET cluster = 'x' WHERE id = ?", /append-only/, id);
  await fails("DELETE FROM requirements WHERE id = ?", /append-only/, id);
  await fails("INSERT OR REPLACE INTO requirements (id, company_id, assessment_id, opportunity_id, cluster, spec, created_at, created_by) VALUES (?, ?, ?, ?, ?, '{}', 'now', 'user-synthetic-owner-a')", /append-only/, id, A, detail.id, accepted, CLUSTER);
  await fails("INSERT OR REPLACE INTO requirements (id, company_id, assessment_id, opportunity_id, cluster, spec, created_at, created_by) VALUES (?, ?, ?, ?, ?, '{}', 'now', 'user-synthetic-owner-a')", /append-only/, "another-id", A, detail.id, accepted, CLUSTER);
  assert.equal(await count("requirements"), 1);

  assert.equal((await withdraw(A, id, a)).status, 201);
  await fails("UPDATE requirement_events SET note = 'x'", /append-only/);
  await fails("DELETE FROM requirement_events", /append-only/);
  await fails("INSERT OR REPLACE INTO requirement_events (requirement_id, company_id, at, user_id, kind) VALUES (?, ?, 'now', 'user-synthetic-owner-a', 'withdraw')", /append-only/, id, A);
  await fails("INSERT INTO requirement_events (requirement_id, company_id, at, user_id, kind) VALUES (?, ?, 'now', 'user-synthetic-owner-a', 'withdraw')", /append-only/, id, A);
  assert.equal(await count("requirement_events"), 1);
  // A withdrawal that names another company's requirement under its own company id: the composite foreign key refuses it.
  const third = detail.result.items.map((i) => i.opportunityId)[2];
  const { id: open } = (await (await makeReq(A, a, body(detail, third))).json()) as { id: string };
  await assert.rejects(db.prepare("INSERT INTO requirement_events (requirement_id, company_id, at, user_id, kind) VALUES (?, ?, 'now', 'user-synthetic-owner-b', 'withdraw')").bind(open, B).run(), /FOREIGN KEY/, "another company's withdrawal of this requirement");
});

// ------------------------------------------------------------------------------------------------ pools (C-04)

/** n companies (A, B, then new ones) each with an open requirement for KIND in CLUSTER. */
async function poolOf(n: number, cluster = CLUSTER): Promise<{ companyId: string; cookie: string; id: string }[]> {
  const out: { companyId: string; cookie: string; id: string }[] = [];
  for (let i = 0; i < n; i++) {
    let companyId: string, cookie: string, detail: Detail;
    if (i === 0) {
      companyId = A;
      cookie = await ownerA();
      detail = await signedOff(A, cookie);
    } else if (i === 1) {
      companyId = B;
      cookie = await ownerB();
      detail = await signedOff(B, cookie);
    } else ({ companyId, cookie, detail } = await newOwner(i));
    const res = await makeReq(companyId, cookie, body(detail, KIND, cluster));
    assert.equal(res.status, 201, `company ${i}`);
    out.push({ companyId, cookie, id: ((await res.json()) as { id: string }).id });
  }
  return out;
}

test("a pool of fewer than five companies shows no number to anyone, its own members included; at five, every member sees it; a withdrawal takes it back below", async () => {
  const four = await poolOf(4);
  for (const m of four) {
    const text = await (await listReq(m.companyId, m.cookie)).text();
    const [row] = (JSON.parse(text) as { requirements: Listed[] }).requirements;
    assert.deepEqual(row.pool, { shown: false, floor: 5 }, m.companyId);
    assert.ok(!/"companies"/.test(text), "no count in the answer");
  }
  const op = await operator();
  assert.deepEqual(await (await opGet(handlePools, op)).json(), { pools: [] }, "the operator is not told of a pool below the floor either");

  const fifth = await newOwner(4);
  const res = await makeReq(fifth.companyId, fifth.cookie, body(fifth.detail));
  assert.equal(res.status, 201);
  const members = [...four, { companyId: fifth.companyId, cookie: fifth.cookie, id: ((await res.json()) as { id: string }).id }];
  for (const m of members) assert.deepEqual((await requirementsOf(m.companyId, m.cookie))[0].pool, { shown: true, companies: 5 }, m.companyId);
  assert.deepEqual(await (await opGet(handlePools, op)).json(), { pools: [{ cluster: CLUSTER, opportunityId: KIND, companies: 5 }] });

  assert.equal((await withdraw(members[2].companyId, members[2].id, members[2].cookie)).status, 201);
  assert.deepEqual((await requirementsOf(members[0].companyId, members[0].cookie))[0].pool, { shown: false, floor: 5 }, "back below the floor, the number is withheld again");
  assert.deepEqual(await (await opGet(handlePools, op)).json(), { pools: [] });
});

test("only requirements of the same kind in the same cluster pool, a company counts once however many requirements it has, and a withdrawn one is not counted", async () => {
  const four = await poolOf(4);
  const fifth = await newOwner(4);
  // A fifth company in another cluster does not complete the pool.
  assert.equal((await makeReq(fifth.companyId, fifth.cookie, body(fifth.detail, KIND, OTHER_CLUSTER))).status, 201);
  assert.deepEqual((await requirementsOf(four[0].companyId, four[0].cookie))[0].pool, { shown: false, floor: 5 });
  // A fifth company asking for another kind in the same cluster does not either.
  const other = fifth.detail.result.items.map((i) => i.opportunityId).find((id) => id !== KIND)!;
  assert.equal((await makeReq(fifth.companyId, fifth.cookie, body(fifth.detail, other, CLUSTER))).status, 201);
  assert.deepEqual((await requirementsOf(four[0].companyId, four[0].cookie))[0].pool, { shown: false, floor: 5 });

  // The same company asking twice (from two assessments of two description versions) is still one company.
  const a = four[0];
  assert.equal((await saveFactory(A, a.cookie, { basedOn: 1, answers: { ...(await answersOfA()), employees: "250_plus" }, confirm: true })).status, 201);
  const second = await signedOff(A, a.cookie);
  assert.notEqual(second.id, (await requirementsOf(A, a.cookie))[0].assessmentId, "a second assessment");
  assert.equal((await makeReq(A, a.cookie, body(second))).status, 201);
  assert.equal(await count("requirements", "company_id = ? AND opportunity_id = ?", A, KIND), 2);
  assert.deepEqual((await requirementsOf(B, four[1].cookie))[0].pool, { shown: false, floor: 5 }, "A's two requirements count as one company");
  assert.deepEqual(await (await opGet(handlePools, await operator())).json(), { pools: [] });
});

test("the operator's list of pools holds counts only: no company id, name, user or requirement id", async () => {
  await poolOf(5);
  const res = await opGet(handlePools, await operator());
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { pools: [{ cluster: CLUSTER, opportunityId: KIND, companies: 5 }] });
  assert.ok(!/company-|user-|SYNTHETIC|Extra/.test(text));
});

test("only the operator reads the pools, the providers' registry with unlisted ones, or the fee; an owner is refused and audited, a visitor is not signed in", async () => {
  const a = await ownerA();
  for (const handler of [handlePools, handleOperatorProviders, handleTermsRead]) {
    assert.equal((await opGet(handler, a)).status, 403);
    assert.equal((await opGet(handler)).status, 401);
    assert.equal((await opGet(handler, await operator())).status, 200);
  }
  const denied = await audits("operator.read.denied");
  assert.equal(denied.length, 3);
  assert.ok(denied.every((e) => e.user_id === "user-synthetic-owner-a" && e.company_id === A));
});

test("an account with the operator role that belongs to a company is not an operator: it is refused like an owner is", async () => {
  await db.prepare("INSERT INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES ('user-odd', ?, 'odd@synthetic.invalid', 'SYNTHETIC Odd', 'operator', 1)").bind(A).run();
  const odd = await signIn("odd@synthetic.invalid");
  for (const handler of [handlePools, handleOperatorProviders, handleTermsRead]) assert.equal((await opGet(handler, odd)).status, 403);
  assert.equal((await setFee(odd, { feeInr: 5 })).status, 403);
  assert.equal(await count("listing_terms"), 0);
});

// ------------------------------------------------------------------------------------------------ providers and the listing fee (D-03)

test("an account with no company that does not have the operator role is not an operator either: refused like an owner is", async () => {
  await db.prepare("INSERT INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES ('user-stray', NULL, 'stray@synthetic.invalid', 'SYNTHETIC Stray', 'owner', 1)").run();
  const stray = await signIn("stray@synthetic.invalid");
  for (const handler of [handlePools, handleOperatorProviders, handleTermsRead]) assert.equal((await opGet(handler, stray)).status, 403);
  assert.equal((await setFee(stray, { feeInr: 5 })).status, 403);
  assert.equal((await newProvider(stray, { name: "Nope", summary: "", services: [{ opportunityId: KIND, cluster: CLUSTER }] })).status, 403);
  assert.equal(await count("listing_terms"), 0);
  assert.equal(await count("providers"), 0);
});

test("the operator enters a provider, sets the one fee, and lists it; until then it is not shown to owners; there is no listing while the fee is undecided", async () => {
  const op = await operator();
  const a = await ownerA();
  const detail = await signedOff(A, a);
  await makeReq(A, a, body(detail));
  const pid = await addProvider(op, "Alpha Works");
  assert.deepEqual(await providersFor(a), [], "not listed yet");

  const undecided = await listIt(op, pid);
  assert.equal(undecided.status, 409);
  assert.deepEqual(await undecided.json(), { error: "fee_undecided" });
  assert.equal(await count("provider_events"), 0);
  assert.deepEqual(await (await opGet(handleTermsRead, op)).json(), { terms: null, history: [] }, "no fee is invented");

  const set = await setFee(op, { feeInr: 1234, note: "SYNTHETIC test value, not a proposal" });
  assert.equal(set.status, 201);
  assert.equal(((await set.json()) as { terms: { version: number; feeInr: number } }).terms.feeInr, 1234);
  const listed = await listIt(op, pid);
  assert.equal(listed.status, 201);
  assert.deepEqual(await listed.json(), { ok: true, feeInr: 1234 });

  assert.deepEqual(await providersFor(a), [{ id: pid, name: "Alpha Works", summary: "SYNTHETIC provider", services: [{ opportunityId: KIND, cluster: CLUSTER }] }]);
  const [row] = await requirementsOf(A, a);
  assert.deepEqual(row.providers, [{ id: pid, name: "Alpha Works", summary: "SYNTHETIC provider" }]);
  const stored = await db.prepare("SELECT kind, terms_version, fee_inr, user_id FROM provider_events WHERE provider_id = ?").bind(pid).first<{ kind: string; terms_version: number; fee_inr: number; user_id: string }>();
  assert.deepEqual(stored, { kind: "list", terms_version: 1, fee_inr: 1234, user_id: "user-synthetic-operator" });
  for (const event of ["listing_terms.set", "provider.created", "provider.listed"]) assert.equal((await audits(event)).length, 1, event);
  assert.equal((await audits("provider.listed"))[0].company_id, null);
});

test("a provider is shown to an owner only for the kind and cluster it serves", async () => {
  const op = await operator();
  await setFee(op, { feeInr: 500 });
  const here = await addProvider(op, "Serves here", [{ opportunityId: KIND, cluster: CLUSTER }]);
  const elsewhere = await addProvider(op, "Other cluster", [{ opportunityId: KIND, cluster: OTHER_CLUSTER }]);
  const otherKind = await addProvider(op, "Other kind", [{ opportunityId: "inspection_checklist_and_gauges", cluster: CLUSTER }]);
  const both = await addProvider(op, "Both", [{ opportunityId: KIND, cluster: CLUSTER }, { opportunityId: KIND, cluster: OTHER_CLUSTER }]);
  for (const pid of [here, elsewhere, otherKind, both]) assert.equal((await listIt(op, pid)).status, 201);
  const a = await ownerA();
  await makeReq(A, a, body(await signedOff(A, a)));
  assert.deepEqual((await requirementsOf(A, a))[0].providers.map((p) => p.name), ["Both", "Serves here"]);
});

test("every provider is listed at the same fee, whatever it serves, whoever asked for what it serves, and whatever a request says: the fee never depends on the provider (D-03)", async () => {
  const op = await operator();
  assert.equal((await setFee(op, { feeInr: 777 })).status, 201);
  // Demand: a pool of five exists for the kind that "Popular" serves and none for the kind "Quiet" serves.
  await poolOf(5);
  const popular = await addProvider(op, "Popular", [{ opportunityId: KIND, cluster: CLUSTER }]);
  const quiet = await addProvider(op, "Quiet", [{ opportunityId: "energy_review_and_tariff_check", cluster: OTHER_CLUSTER }], "");
  const many = await addProvider(op, "Zed with many services", [KIND, "inspection_checklist_and_gauges", "preventive_maintenance_plan"].map((opportunityId) => ({ opportunityId, cluster: CLUSTER })), "A longer summary of what it does, for the test.");
  assert.equal((await listIt(op, quiet)).status, 201);
  // A request that names a fee for one provider is not obeyed: the body is read for a note only.
  const asked = await listIt(op, popular, { feeInr: 1, fee: 1, termsVersion: 99, note: "try to set a different fee" });
  assert.equal(asked.status, 201);
  assert.deepEqual(await asked.json(), { ok: true, feeInr: 777 });
  assert.equal((await listIt(op, many, { feeInr: 5000 })).status, 201);
  const fees = (await db.prepare("SELECT provider_id, fee_inr, terms_version FROM provider_events WHERE kind = 'list' ORDER BY id").all<{ provider_id: string; fee_inr: number; terms_version: number }>()).results;
  assert.equal(fees.length, 3);
  assert.deepEqual(new Set(fees.map((f) => f.fee_inr)), new Set([777]), "one fee for all three");
  assert.deepEqual(new Set(fees.map((f) => f.terms_version)), new Set([1]));

  // The database refuses a listing whose fee is not the one in force, however it is written.
  const unlisted = await addProvider(op, "Fourth");
  const directly = (fee: number, version: number) =>
    db.prepare("INSERT INTO provider_events (provider_id, at, user_id, kind, terms_version, fee_inr, note) VALUES (?, 'now', 'user-synthetic-operator', 'list', ?, ?, '')").bind(unlisted, version, fee).run();
  await assert.rejects(directly(1, 1), /carries the fee in force/);
  await assert.rejects(directly(778, 1), /carries the fee in force/);
  await assert.rejects(directly(777, 2), /carries the fee in force|FOREIGN KEY/);
  await directly(777, 1);
  assert.equal(await count("provider_events", "provider_id = ?", unlisted), 1);
});

test("a new fee is a new version: later listings carry it, earlier listings keep theirs, and a stale version cannot be used", async () => {
  const op = await operator();
  await setFee(op, { feeInr: 100 });
  const first = await addProvider(op, "First");
  await listIt(op, first);
  await setFee(op, { feeInr: 250, note: "second version" });
  const second = await addProvider(op, "Second");
  assert.deepEqual(await (await listIt(op, second)).json(), { ok: true, feeInr: 250 });
  const rows = (await db.prepare("SELECT provider_id, fee_inr, terms_version FROM provider_events WHERE kind = 'list' ORDER BY id").all<{ provider_id: string; fee_inr: number; terms_version: number }>()).results;
  assert.deepEqual(rows, [
    { provider_id: first, fee_inr: 100, terms_version: 1 },
    { provider_id: second, fee_inr: 250, terms_version: 2 },
  ]);
  const history = ((await (await opGet(handleTermsRead, op)).json()) as { terms: { version: number; feeInr: number }; history: { version: number; feeInr: number }[] });
  assert.equal(history.terms.version, 2);
  assert.deepEqual(history.history.map((h) => [h.version, h.feeInr]), [[2, 250], [1, 100]]);
  const third = await addProvider(op, "Third");
  await assert.rejects(
    db.prepare("INSERT INTO provider_events (provider_id, at, user_id, kind, terms_version, fee_inr, note) VALUES (?, 'now', 'user-synthetic-operator', 'list', 1, 100, '')").bind(third).run(),
    /carries the fee in force/,
    "the old version is no longer in force",
  );
});

test("a provider is listed and unlisted in turn; an unlisted one leaves the owners' views, and listing it again records the fee then in force", async () => {
  const op = await operator();
  await setFee(op, { feeInr: 100 });
  const pid = await addProvider(op, "Alpha");
  const a = await ownerA();
  assert.equal((await unlistIt(op, pid)).status, 409, "not listed yet");
  assert.equal((await listIt(op, pid)).status, 201);
  const again = await listIt(op, pid);
  assert.equal(again.status, 409);
  assert.deepEqual(await again.json(), { error: "already_listed" });
  assert.equal((await providersFor(a)).length, 1);
  assert.equal((await unlistIt(op, pid, { note: "withdrawn by the provider" })).status, 201);
  assert.deepEqual(await providersFor(a), []);
  await setFee(op, { feeInr: 120 });
  assert.deepEqual(await (await listIt(op, pid)).json(), { ok: true, feeInr: 120 });
  assert.equal(await count("provider_events", "provider_id = ?", pid), 3);
  assert.deepEqual((await db.prepare("SELECT kind, fee_inr FROM provider_events WHERE provider_id = ? ORDER BY id").bind(pid).all()).results, [
    { kind: "list", fee_inr: 100 },
    { kind: "unlist", fee_inr: null },
    { kind: "list", fee_inr: 120 },
  ]);
  assert.equal((await listIt(op, "no-such-provider")).status, 404);
  assert.equal((await unlistIt(op, "no-such-provider")).status, 404);
});

test("owners see providers in name order: not the order they were listed in, not by fee, not by anything else", async () => {
  const op = await operator();
  await setFee(op, { feeInr: 100 });
  const names = ["delta", "Bravo", "alpha", "Charlie"];
  const ids: string[] = [];
  for (const [i, name] of names.entries()) {
    ids.push(await addProvider(op, name));
    if (i === 1) await setFee(op, { feeInr: 900 }); // later listings are made under a different fee version
  }
  for (const pid of [ids[3], ids[0], ids[2], ids[1]]) assert.equal((await listIt(op, pid)).status, 201);
  const a = await ownerA();
  await makeReq(A, a, body(await signedOff(A, a)));
  const expected = ["alpha", "Bravo", "Charlie", "delta"];
  assert.deepEqual((await providersFor(a)).map((p) => p.name), expected);
  assert.deepEqual((await requirementsOf(A, a))[0].providers.map((p) => p.name), expected);
});

test("a provider never listed, or unlisted since, is not shown under an owner's requirement or in the public list: only the operator's registry shows it", async () => {
  const op = await operator();
  await setFee(op, { feeInr: 100 });
  await addProvider(op, "Never listed");
  const gone = await addProvider(op, "Listed then unlisted");
  const shown = await addProvider(op, "Listed");
  assert.equal((await listIt(op, gone)).status, 201);
  assert.equal((await unlistIt(op, gone)).status, 201);
  assert.equal((await listIt(op, shown)).status, 201);
  const a = await ownerA();
  await makeReq(A, a, body(await signedOff(A, a)));
  assert.deepEqual((await requirementsOf(A, a))[0].providers.map((p) => p.name), ["Listed"]);
  assert.deepEqual((await providersFor(a)).map((p) => p.name), ["Listed"]);
  const registry = ((await (await opGet(handleOperatorProviders, op)).json()) as { providers: { name: string }[] }).providers.map((p) => p.name);
  assert.deepEqual(registry, ["Listed", "Listed then unlisted", "Never listed"], "the registry shows all three");
  assert.equal((await unlistIt(op, shown)).status, 201);
  assert.deepEqual((await requirementsOf(A, a))[0].providers, []);
});

test("the operator's registry shows every provider with what it serves, whether it is listed and the fee it was listed at", async () => {
  const op = await operator();
  await setFee(op, { feeInr: 321 });
  const listed = await addProvider(op, "Listed");
  await addProvider(op, "Waiting");
  await listIt(op, listed);
  const all = ((await (await opGet(handleOperatorProviders, op)).json()) as { providers: { id: string; name: string; listed: boolean; listedFeeInr: number | null; services: unknown[] }[]; terms: { feeInr: number } }) ;
  assert.equal(all.terms.feeInr, 321);
  assert.deepEqual(all.providers.map((p) => [p.name, p.listed, p.listedFeeInr, p.services.length]), [["Listed", true, 321, 1], ["Waiting", false, null, 1]]);
});

test("only the operator changes the registry or the fee: an owner gets 403 and an audit entry, a visitor 401, another website 403; nothing is stored", async () => {
  const a = await ownerA();
  const op = await operator();
  const service = [{ opportunityId: KIND, cluster: CLUSTER }];
  const evil = { origin: "https://evil.example" };
  assert.equal((await setFee(a, { feeInr: 5 })).status, 403);
  assert.equal((await newProvider(a, { name: "Mine", services: service })).status, 403);
  assert.equal((await setFee(undefined, { feeInr: 5 })).status, 401);
  assert.equal((await newProvider(undefined, { name: "Anon", services: service })).status, 401);
  assert.equal((await setFee(op, { feeInr: 5 }, evil)).status, 403);
  assert.equal((await newProvider(op, { name: "Evil", services: service }, evil)).status, 403);
  assert.equal(await count("listing_terms"), 0);
  assert.equal(await count("providers"), 0);
  const pid = await addProvider(op, "Real");
  await setFee(op, { feeInr: 5 });
  assert.equal((await listIt(a, pid)).status, 403);
  assert.equal((await unlistIt(a, pid)).status, 403);
  assert.equal((await listIt(op, pid, {}, evil)).status, 403);
  assert.equal(await count("provider_events"), 0);
  const denied = await audits("operator.write.denied");
  assert.equal(denied.length, 4);
  assert.ok(denied.every((e) => e.user_id === "user-synthetic-owner-a"));
  // An owner may read the list of listed providers; that is the whole of what they see of the registry.
  assert.equal((await handlePublicProviders(get("/api/providers", a), env)).status, 200);
  assert.equal((await handlePublicProviders(get("/api/providers"), env)).status, 401);
});

test("a provider needs a sensible name, services from the library in listed clusters, each named once", async () => {
  const op = await operator();
  const service = { opportunityId: KIND, cluster: CLUSTER };
  const bad: unknown[] = [
    {},
    { name: "", services: [service] },
    { name: "   ", services: [service] },
    { name: "x".repeat(101), services: [service] },
    { name: "Has\u0000control", services: [service] },
    { name: 5, services: [service] },
    { name: "No services" },
    { name: "Empty services", services: [] },
    { name: "Bad kind", services: [{ opportunityId: "not_an_idea", cluster: CLUSTER }] },
    { name: "Bad cluster", services: [{ opportunityId: KIND, cluster: "nowhere" }] },
    { name: "Not objects", services: ["digital_job_log"] },
    { name: "Duplicate", services: [service, service] },
    { name: "Too many", services: Array.from({ length: 21 }, (_, i) => ({ opportunityId: KIND, cluster: i % 2 ? CLUSTER : OTHER_CLUSTER })) },
    { name: "Long summary", summary: "x".repeat(301), services: [service] },
    { name: "Summary type", summary: 5, services: [service] },
    { name: "__proto__", services: [{ opportunityId: "__proto__", cluster: CLUSTER }] },
  ];
  for (const payload of bad) assert.equal((await newProvider(op, payload)).status, 400, JSON.stringify(payload).slice(0, 80));
  assert.equal(await count("providers"), 0);
  assert.equal(await count("provider_services"), 0);
  assert.equal((await newProvider(op, { name: "Fine", services: [service] })).status, 201);
});

test("the fee is a whole number of rupees, set by the operator, and nothing else is accepted", async () => {
  const op = await operator();
  for (const feeInr of [0, -5, 1.5, "abc", "", null, undefined, 10_000_001, "1e3", "12 34", [5], {}, "٣"]) assert.equal((await setFee(op, { feeInr })).status, 400, String(feeInr));
  assert.equal((await setFee(op, { feeInr: 5, note: "x".repeat(501) })).status, 400);
  assert.equal(await count("listing_terms"), 0);
  assert.equal((await setFee(op, { feeInr: " 42 " })).status, 201, "a number typed in a form is trimmed");
  assert.equal((await setFee(op, { feeInr: 10_000_000 })).status, 201);
  assert.deepEqual((await db.prepare("SELECT fee_inr FROM listing_terms ORDER BY version").all()).results, [{ fee_inr: 42 }, { fee_inr: 10_000_000 }]);
  await fails("INSERT INTO listing_terms (at, user_id, fee_inr) VALUES ('now', 'user-synthetic-operator', 0)", /CHECK/);
});

test("the registry and the fee are append-only, and a provider with nothing it serves cannot be listed even by a direct insert", async () => {
  const op = await operator();
  await setFee(op, { feeInr: 100 });
  const pid = await addProvider(op, "Alpha");
  await listIt(op, pid);
  for (const table of ["providers", "provider_services", "provider_events", "listing_terms"]) {
    await fails(`UPDATE ${table} SET ${table === "listing_terms" ? "fee_inr = 1" : table === "providers" ? "name = 'x'" : table === "provider_services" ? "cluster = 'x'" : "note = 'x'"}`, /append-only/);
    await fails(`DELETE FROM ${table}`, /append-only/);
  }
  await fails("INSERT OR REPLACE INTO listing_terms (version, at, user_id, fee_inr) VALUES (1, 'now', 'user-synthetic-operator', 1)", /append-only/);
  await fails("INSERT OR REPLACE INTO providers (id, name, created_at, created_by) VALUES (?, 'renamed', 'now', 'user-synthetic-operator')", /append-only/, pid);
  await fails("INSERT OR REPLACE INTO provider_services (provider_id, opportunity_id, cluster) VALUES (?, ?, ?)", /append-only/, pid, KIND, CLUSTER);
  assert.equal((await db.prepare("SELECT fee_inr FROM listing_terms WHERE version = 1").first<{ fee_inr: number }>())!.fee_inr, 100);
  // A provider row with no services, written directly: it cannot be listed.
  await db.prepare("INSERT INTO providers (id, name, created_at, created_by) VALUES ('bare', 'Bare', 'now', 'user-synthetic-operator')").run();
  await assert.rejects(
    db.prepare("INSERT INTO provider_events (provider_id, at, user_id, kind, terms_version, fee_inr) VALUES ('bare', 'now', 'user-synthetic-operator', 'list', 1, 100)").run(),
    /needs a service/,
  );
  assert.equal((await listIt(op, "bare")).status, 409);
});

test("a body of the wrong type or size is refused by the operator endpoints too", async () => {
  const op = await operator();
  const raw = (handler: (r: Request, e: AppEnv) => Promise<Response>, type: string | null, text: string) =>
    handler(new Request(`${ORIGIN}/x`, { method: "POST", headers: { origin: ORIGIN, cookie: op, ...(type ? { "content-type": type } : {}) }, body: type ? text : new TextEncoder().encode(text) }), env);
  assert.equal((await raw(handleTermsSet, "text/plain", "feeInr=5")).status, 415);
  assert.equal((await raw(handleTermsSet, "application/json", "x".repeat(70_000))).status, 413);
  assert.equal((await raw(handleProviderCreate, "application/json", "[1]")).status, 400);
  assert.equal(await count("listing_terms"), 0);
  assert.equal(await count("providers"), 0);
});

// ------------------------------------------------------------------------------------------------ form posts

test("a form post that cannot be done goes back to the page with a message, never to a page of JSON; another company's record gets the message a missing one gets", async () => {
  const a = await ownerA();
  const b = await ownerB();
  const op = await operator();
  const detail = await signedOff(A, a);
  const { id } = (await (await makeReq(A, a, body(detail))).json()) as { id: string };
  const go = async (res: Promise<Response>) => {
    const r = await res;
    assert.equal(r.status, 303, `a form post is answered by a redirect, not ${r.status}`);
    return r.headers.get("location");
  };
  const procure = (path: string, cookie: string, fields: [string, string][] = []) => formPost(path, cookie, fields);

  // requirements: an assessment that is not there, another company's assessment, a bad cluster, a requirement that is not there, another company's, a second withdrawal, a bad note
  const missing = await go(handleRequirementCreate(procure(`/api/companies/${A}/requirements`, a, [["assessment", "no-such-assessment"], ["opportunity", KIND], ["cluster", CLUSTER]]), env, A));
  assert.equal(missing, "/procure?problem=missing");
  assert.equal(await go(handleRequirementCreate(procure(`/api/companies/${B}/requirements`, b, [["assessment", detail.id], ["opportunity", KIND], ["cluster", CLUSTER]]), env, B)), missing, "another company's assessment looks like a missing one");
  assert.equal(await go(handleRequirementCreate(procure(`/api/companies/${A}/requirements`, a, [["assessment", detail.id], ["opportunity", KIND], ["cluster", "nowhere"]]), env, A)), "/procure?problem=request");
  assert.equal(await go(handleRequirementWithdraw(procure(`/api/companies/${A}/requirements/none/withdraw`, a), env, A, "none")), "/procure?problem=missing");
  assert.equal(await go(handleRequirementWithdraw(procure(`/api/companies/${B}/requirements/${id}/withdraw`, b), env, B, id)), "/procure?problem=missing", "another company's requirement looks like a missing one");
  assert.equal(await go(handleRequirementWithdraw(procure(`/api/companies/${A}/requirements/${"x".repeat(65)}/withdraw`, a), env, A, "x".repeat(65))), "/procure?problem=missing");
  assert.equal(await go(handleRequirementWithdraw(procure(`/api/companies/${A}/requirements/${id}/withdraw`, a, [["note", "x".repeat(501)]]), env, A, id)), "/procure?problem=note");
  assert.equal(await go(handleRequirementWithdraw(procure(`/api/companies/${A}/requirements/${id}/withdraw`, a), env, A, id)), "/procure?withdrawn=1");
  assert.equal(await go(handleRequirementWithdraw(procure(`/api/companies/${A}/requirements/${id}/withdraw`, a), env, A, id)), "/procure?problem=withdrawn");

  // the operator's forms: a provider that is not there, a name that is too long an id, no fee set, a listing twice, an unlisting that was never listed
  assert.equal(await go(handleProviderList(procure("/api/operator/providers/none/list", op), env, "none")), "/operator?problem=missing");
  assert.equal(await go(handleProviderUnlist(procure("/api/operator/providers/none/unlist", op), env, "none")), "/operator?problem=missing");
  assert.equal(await go(handleProviderList(procure(`/api/operator/providers/${"x".repeat(65)}/list`, op), env, "x".repeat(65))), "/operator?problem=missing");
  assert.equal(await go(handleProviderUnlist(procure(`/api/operator/providers/${"x".repeat(65)}/unlist`, op), env, "x".repeat(65))), "/operator?problem=missing");
  const pid = await addProvider(op, "Alpha");
  assert.equal(await go(handleProviderList(procure(`/api/operator/providers/${pid}/list`, op), env, pid)), "/operator?problem=fee_undecided");
  assert.equal(await go(handleProviderUnlist(procure(`/api/operator/providers/${pid}/unlist`, op), env, pid)), "/operator?problem=not_listed");
  await setFee(op, { feeInr: 50 });
  assert.equal(await go(handleProviderList(procure(`/api/operator/providers/${pid}/list`, op), env, pid)), "/operator?listed=1");
  assert.equal(await go(handleProviderList(procure(`/api/operator/providers/${pid}/list`, op), env, pid)), "/operator?problem=already_listed");
});
