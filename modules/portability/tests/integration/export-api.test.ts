// GET /api/companies/{id}/export against a real D1 database (Miniflare), with the real migrations and the SYNTHETIC seed. Two companies
// are given records through the application's own handlers: A has every kind of record, B has its own. The file for A is then checked
// against the rows in the database and searched for anything of B's. One database is shared by the tests in this file, so each test
// that counts audit entries counts what it added.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { handleAssessmentCreate, handleAssessmentRead, handleDecisionCreate, handleSignOff } from "../../../diagnose/src/api/diagnose.ts";
import type { Result } from "../../../diagnose/src/engine.ts";
import { handleEngagementCreate, handleEngagementEvent, handleMilestoneAdd } from "../../../deliver/src/api/engagements.ts";
import { handleFactoryRead, handleRevisionCreate } from "../../../factory/src/api/factory.ts";
import { handleCompanyRead } from "../../../platform/src/api/companies.ts";
import { handleSessionWrite } from "../../../platform/src/api/session.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { cookieFrom, createTestEnvironment, get, post } from "../../../platform/tests/support/d1.ts";
import { handleProviderCreate, handleProviderList, handleTermsSet } from "../../../procure/src/api/providers.ts";
import { handleRequirementCreate, handleRequirementList, handleRequirementWithdraw } from "../../../procure/src/api/requirements.ts";
import { handleOutcomeRecord } from "../../../run/src/api/outcomes.ts";
import { handleCompanyExport } from "../../src/api/export.ts";
import { EXPORT_FORMAT, EXPORT_VERSION, SECTIONS, recordTotal } from "../../src/bundle.ts";
import type { ExportBundle } from "../../src/bundle.ts";
import { FORBIDDEN_KEY, keysOf } from "../support/forbidden.ts";

const A = "company-synthetic-a";
const B = "company-synthetic-b";
const C = "company-synthetic-empty";
const CLUSTER = "synthetic-cluster-1";
/** A fee no record of an owner's has, so finding it in the file would mean the listing terms leaked in. SYNTHETIC. */
const FEE = 1739;

let env: AppEnv;
let db: D1Database;
let dispose: () => Promise<void>;
let a: string;
let b: string;
let op: string;

async function signIn(email: string): Promise<string> {
  const res = await handleSessionWrite(post("/api/session", { email }), env);
  assert.equal(res.status, 200, `sign-in as ${email}`);
  return cookieFrom(res);
}
const req = (path: string, cookie: string, body: unknown = {}) => post(path, body, { cookie });
const exportOf = (companyId: string, cookie?: string) => handleCompanyExport(get(`/api/companies/${companyId}/export`, cookie), env, companyId);
const bundleOf = async (companyId: string, cookie: string) => {
  const res = await exportOf(companyId, cookie);
  assert.equal(res.status, 200);
  return { res, text: await res.text() };
};
const count = async (sql: string, ...binds: string[]) => (await db.prepare(sql).bind(...binds).first<{ n: number }>())!.n;
const audits = async (event: string) =>
  (await db.prepare("SELECT id, user_id, company_id, detail FROM audit_events WHERE event = ? ORDER BY id").bind(event).all<{ id: number; user_id: string | null; company_id: string | null; detail: string }>()).results;
const auditTotal = () => count("SELECT COUNT(*) AS n FROM audit_events");

type Detail = { id: string; result: Result };

/** A signed-off assessment of the company. The first idea is decided twice (deferred, then accepted), so decisions outnumber ideas. */
async function signedOff(companyId: string, cookie: string): Promise<Detail> {
  const made = await handleAssessmentCreate(req(`/api/companies/${companyId}/assessments`, cookie), env, companyId);
  assert.ok(made.status === 201 || made.status === 200, `an assessment (${made.status})`);
  const { id } = (await made.json()) as { id: string };
  const detail = (await (await handleAssessmentRead(get(`/api/companies/${companyId}/assessments/${id}`, cookie), env, companyId, id)).json()) as Detail;
  const decide = (opportunityId: string, decision: string) => handleDecisionCreate(req(`/api/companies/${companyId}/assessments/${id}/decisions`, cookie, { opportunityId, decision, note: "SYNTHETIC note" }), env, companyId, id);
  assert.equal((await decide(detail.result.items[0]!.opportunityId, "defer")).status, 201);
  for (const item of detail.result.items) assert.equal((await decide(item.opportunityId, "accept")).status, 201);
  assert.equal((await handleSignOff(req(`/api/companies/${companyId}/assessments/${id}/signoff`, cookie), env, companyId, id)).status, 201);
  return detail;
}

async function requirementFor(companyId: string, cookie: string, detail: Detail, n: number): Promise<string> {
  const res = await handleRequirementCreate(req(`/api/companies/${companyId}/requirements`, cookie, { assessmentId: detail.id, opportunityId: detail.result.items[n]!.opportunityId, cluster: CLUSTER }), env, companyId);
  assert.equal(res.status, 201);
  return ((await res.json()) as { id: string }).id;
}

async function engage(companyId: string, cookie: string, requirementId: string, providerId: string): Promise<string> {
  const res = await handleEngagementCreate(req(`/api/companies/${companyId}/requirements/${requirementId}/engagement`, cookie, { providerId }), env, companyId, requirementId);
  assert.equal(res.status, 201);
  return ((await res.json()) as { id: string }).id;
}

before(async () => {
  ({ env, db, dispose } = await createTestEnvironment());
  a = await signIn("owner-a@synthetic.invalid");
  b = await signIn("owner-b@synthetic.invalid");
  op = await signIn("operator@synthetic.invalid");
  assert.equal((await handleTermsSet(req("/api/operator/listing-terms", op, { feeInr: FEE }), env)).status, 201);

  // Company A: a draft on top of the seeded description, an assessment, two requests (one withdrawn), a provider chosen, a plan agreed, a starting number.
  const answers = ((await (await handleFactoryRead(get(`/api/companies/${A}/factory`, a), env, A)).json()) as { latestConfirmed: { answers: Record<string, unknown> } }).latestConfirmed.answers;
  assert.equal((await handleRevisionCreate(req(`/api/companies/${A}/factory/revisions`, a, { basedOn: 1, answers: { ...answers, products: "SYNTHETIC draft of A" }, confirm: false, note: "SYNTHETIC draft" }), env, A)).status, 201);
  const detailA = await signedOff(A, a);
  assert.ok(detailA.result.items.length >= 2, "the seeded description gives at least two ideas");
  const keep = await requirementFor(A, a, detailA, 0);
  const drop = await requirementFor(A, a, detailA, 1);
  assert.equal((await handleRequirementWithdraw(req(`/api/companies/${A}/requirements/${drop}/withdraw`, a, { note: "SYNTHETIC not now" }), env, A, drop)).status, 201);
  const made = await handleProviderCreate(req("/api/operator/providers", op, { name: "SYNTHETIC Provider P", summary: "SYNTHETIC summary written by the operator", services: [{ opportunityId: detailA.result.items[0]!.opportunityId, cluster: CLUSTER }] }), env);
  assert.equal(made.status, 201);
  const providerId = ((await made.json()) as { id: string }).id;
  assert.equal((await handleProviderList(req(`/api/operator/providers/${providerId}/list`, op), env, providerId)).status, 201);
  const engagementA = await engage(A, a, keep, providerId);
  assert.equal((await handleMilestoneAdd(req(`/api/companies/${A}/engagements/${engagementA}/milestones`, a, { title: "SYNTHETIC milestone", acceptanceTest: "SYNTHETIC test", dueOn: "2026-12-15", agreedInr: 40000 }), env, A, engagementA)).status, 201);
  assert.equal((await handleEngagementEvent(req(`/api/companies/${A}/engagements/${engagementA}/events`, a, { kind: "plan_agreed" }), env, A, engagementA)).status, 201);
  assert.equal((await handleOutcomeRecord(req(`/api/companies/${A}/engagements/${engagementA}/outcomes`, a, { kind: "baseline", value: 12, note: "SYNTHETIC before" }), env, A, engagementA)).status, 201);

  // Company B: its own description, assessment, request and engagement with the same provider.
  assert.equal((await handleRevisionCreate(req(`/api/companies/${B}/factory/revisions`, b, { basedOn: 0, answers: { ...answers, products: "SYNTHETIC products of B only" }, confirm: true }), env, B)).status, 201);
  const detailB = await signedOff(B, b);
  const reqB = await requirementFor(B, b, detailB, 0);
  await engage(B, b, reqB, providerId);

  // Company C: an owner and nothing recorded.
  await db.prepare("INSERT INTO companies (id, name, is_synthetic, created_at) VALUES (?, 'SYNTHETIC Empty Company', 1, '2026-10-05T00:00:00.000Z')").bind(C).run();
  await db.prepare("INSERT INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES ('user-synthetic-owner-empty', ?, 'owner-empty@synthetic.invalid', 'SYNTHETIC Owner Empty', 'owner', 1)").bind(C).run();
});

after(async () => {
  await dispose();
});

test("an owner exports their own company: 200, a JSON file to save, and every count is the number of rows the database holds", async () => {
  const { res, text } = await bundleOf(A, a);
  assert.match(res.headers.get("content-type") ?? "", /^application\/json; charset=utf-8$/);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("content-disposition") ?? "", /^attachment; filename="aplyd-records-company-synthetic-a-\d{4}-\d{2}-\d{2}\.json"$/);
  const bundle = JSON.parse(text) as ExportBundle;
  assert.equal(bundle.format, EXPORT_FORMAT);
  assert.equal(bundle.version, EXPORT_VERSION);
  assert.equal(bundle.synthetic, true);
  assert.equal(bundle.tag, "SYNTHETIC");
  assert.equal(bundle.companyId, A);
  assert.equal(bundle.company.name, "SYNTHETIC Company A");
  for (const s of SECTIONS) assert.ok(s in bundle, s);

  const rows = {
    factoryDescriptions: await count("SELECT COUNT(*) AS n FROM factory_revisions WHERE company_id = ?", A),
    assessments: await count("SELECT COUNT(*) AS n FROM assessments WHERE company_id = ?", A),
    decisions: await count("SELECT COUNT(*) AS n FROM assessment_events WHERE company_id = ? AND kind = 'decision'", A),
    signOffs: await count("SELECT COUNT(*) AS n FROM assessment_events WHERE company_id = ? AND kind = 'signoff'", A),
    requirements: await count("SELECT COUNT(*) AS n FROM requirements WHERE company_id = ?", A),
    withdrawnRequirements: await count("SELECT COUNT(*) AS n FROM requirement_events WHERE company_id = ? AND kind = 'withdraw'", A),
    engagements: await count("SELECT COUNT(*) AS n FROM engagements WHERE company_id = ?", A),
    milestones: await count("SELECT COUNT(*) AS n FROM milestones WHERE company_id = ?", A),
    engagementEvents: await count("SELECT COUNT(*) AS n FROM engagement_events WHERE company_id = ?", A),
    measurements: await count("SELECT COUNT(*) AS n FROM outcome_events WHERE company_id = ?", A),
  };
  assert.deepEqual(rows, { factoryDescriptions: 2, assessments: 1, decisions: bundle.counts.ideas + 1, signOffs: 1, requirements: 2, withdrawnRequirements: 1, engagements: 1, milestones: 1, engagementEvents: 1, measurements: 1 });
  const { ideas, ...counted } = bundle.counts;
  assert.deepEqual(counted, rows);
  assert.ok(ideas >= 2);

  // The lists hold what the counts say, with every version of the description, and the withdrawn request marked.
  assert.deepEqual(bundle.factoryDescriptions.map((r) => [r.revision, r.confirmed]), [[1, true], [2, false]]);
  assert.equal(bundle.assessments[0]!.decisions.length, rows.decisions);
  assert.equal(bundle.assessments[0]!.signOffs.length, 1);
  assert.match(bundle.assessments[0]!.signOffs[0]!.digest ?? "", /^[0-9a-f]{64}$/);
  assert.deepEqual(bundle.requirements.map((r) => r.withdrawn).sort(), [false, true]);
  assert.equal(bundle.engagements[0]!.chosenProvider.name, "SYNTHETIC Provider P");
  assert.deepEqual(bundle.engagements[0]!.milestones.map((m) => m.agreedInr), [40000]);
  assert.deepEqual(bundle.engagements[0]!.events.map((e) => e.kind), ["plan_agreed"]);
  assert.deepEqual(bundle.measurements.map((m) => [m.engagementId, m.kind, m.value]), [[bundle.engagements[0]!.id, "baseline", 12]]);
});

test("the file for A holds nothing of B's: no id, name, address, description or record of B's, and no listing, fee or provider summary", async () => {
  const { text } = await bundleOf(A, a);
  const ofB = [
    B,
    "SYNTHETIC Company B",
    "user-synthetic-owner-b",
    "owner-b@synthetic.invalid",
    "SYNTHETIC products of B only",
    ...(await db.prepare("SELECT id FROM assessments WHERE company_id = ?").bind(B).all<{ id: string }>()).results.map((r) => r.id),
    ...(await db.prepare("SELECT id FROM requirements WHERE company_id = ?").bind(B).all<{ id: string }>()).results.map((r) => r.id),
    ...(await db.prepare("SELECT id FROM engagements WHERE company_id = ?").bind(B).all<{ id: string }>()).results.map((r) => r.id),
  ];
  assert.ok(ofB.length >= 8, "B has records to look for");
  for (const x of ofB) assert.ok(!text.includes(x), `the file for A contains ${x}`);
  for (const x of ["owner-a@synthetic.invalid", "user-synthetic-operator", "SYNTHETIC summary written by the operator", "aplyd_session"]) assert.ok(!text.includes(x), `the file contains ${x}`);
  const bundle = JSON.parse(text) as unknown;
  assert.deepEqual(keysOf(bundle).filter((k) => FORBIDDEN_KEY.test(k.key)).map((k) => k.path), []);
  const numbers: number[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "number") numbers.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(bundle);
  assert.ok(numbers.length > 10 && !numbers.includes(FEE), "the listing fee is not in the file");
  // Every company id the file names is A's.
  assert.deepEqual([...new Set(keysOf(bundle).filter((k) => k.key === "companyId").map((k) => k.path))], ["$.companyId"]);
});

test("another company's owner gets the same refusal as on every other company read, whether the company exists or not, and it is audited", async () => {
  const exports = (await audits("company.export")).length;
  const refused = await exportOf(A, b);
  assert.equal(refused.status, 404);
  const body = await refused.text();
  assert.deepEqual(JSON.parse(body), { error: "not_found" });
  assert.equal(refused.headers.get("content-disposition"), null, "no file is offered");
  const elsewhere = await handleRequirementList(get(`/api/companies/${A}/requirements`, b), env, A);
  assert.equal(elsewhere.status, 404);
  assert.equal(await elsewhere.text(), body, "the same answer as the requirements read");
  const company = await handleCompanyRead(get(`/api/companies/${A}`, b), env, A);
  assert.equal(company.status, 404);
  assert.equal(await company.text(), body, "the same answer as the company read");
  const missing = await exportOf("company-that-does-not-exist", b);
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), body, "a company that does not exist gets the same answer");

  const denied = (await audits("company.export.denied")).filter((r) => r.user_id === "user-synthetic-owner-b");
  assert.deepEqual(denied.map((r) => [r.company_id, JSON.parse(r.detail).requested]), [[B, A], [B, "company-that-does-not-exist"]]);
  assert.equal((await audits("company.export")).length, exports, "no export entry for a refusal");
});

test("a member of the company, who is not its owner, may export it, and the entry names the member", async () => {
  await db.prepare("INSERT INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES ('user-synthetic-viewer-a', ?, 'viewer-a@synthetic.invalid', 'SYNTHETIC Viewer A', 'viewer', 1)").bind(A).run();
  const viewer = await signIn("viewer-a@synthetic.invalid");
  const { text } = await bundleOf(A, viewer);
  assert.equal((JSON.parse(text) as ExportBundle).companyId, A);
  const last = (await audits("company.export")).at(-1)!;
  assert.deepEqual([last.user_id, last.company_id], ["user-synthetic-viewer-a", A]);
  const refused = await exportOf(B, viewer);
  assert.equal(refused.status, 404, "a member of A is refused B like anyone else");
});

test("the operator, who has no company, is refused every company's file, and each refusal is audited", async () => {
  const before = (await audits("company.export.denied")).filter((r) => r.user_id === "user-synthetic-operator").length;
  for (const id of [A, B]) {
    const res = await exportOf(id, op);
    assert.equal(res.status, 404, id);
    assert.deepEqual(await res.json(), { error: "not_found" });
  }
  const rows = (await audits("company.export.denied")).filter((r) => r.user_id === "user-synthetic-operator");
  assert.equal(rows.length, before + 2);
  assert.deepEqual(rows.slice(-2).map((r) => [r.company_id, JSON.parse(r.detail).requested]), [[null, A], [null, B]]);
});

test("no session, a broken cookie, or a session whose user is gone: 401 and nothing is written", async () => {
  const total = await auditTotal();
  for (const cookie of [undefined, "aplyd_session=not-a-token", `${a}x`]) {
    const res = await exportOf(A, cookie);
    assert.equal(res.status, 401, String(cookie));
    assert.deepEqual(await res.json(), { error: "not_signed_in" });
  }
  await db.prepare("INSERT INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES ('user-synthetic-gone-a', ?, 'gone-a@synthetic.invalid', 'SYNTHETIC Gone A', 'owner', 1)").bind(A).run();
  const gone = await signIn("gone-a@synthetic.invalid");
  await db.prepare("DELETE FROM users WHERE id = 'user-synthetic-gone-a'").run();
  assert.equal((await exportOf(A, gone)).status, 401);
  assert.equal(await auditTotal(), total + 1, "only the sign-in of the extra user was audited");
});

test("a successful export writes exactly one entry, company.export, with the format version and the number of records; a repeat writes another", async () => {
  const before = await auditTotal();
  const { text } = await bundleOf(A, a);
  assert.equal(await auditTotal(), before + 1);
  const last = (await audits("company.export")).at(-1)!;
  assert.deepEqual([last.user_id, last.company_id], ["user-synthetic-owner-a", A]);
  const bundle = JSON.parse(text) as ExportBundle;
  assert.deepEqual(JSON.parse(last.detail), { version: EXPORT_VERSION, records: recordTotal(bundle.counts) });
  await bundleOf(A, a);
  assert.equal(await auditTotal(), before + 2);
});

test("a company with nothing recorded gets a file with every section empty and counts of zero", async () => {
  const owner = await signIn("owner-empty@synthetic.invalid");
  const { text } = await bundleOf(C, owner);
  const bundle = JSON.parse(text) as ExportBundle;
  assert.equal(bundle.companyId, C);
  for (const s of SECTIONS.filter((x) => x !== "company")) assert.deepEqual((bundle as unknown as Record<string, unknown>)[s], [], s);
  assert.ok(Object.values(bundle.counts).every((n) => n === 0));
});

test("the same records give the same file apart from the time it was made", async () => {
  const strip = (t: string) => ({ ...(JSON.parse(t) as ExportBundle), exportedAt: "" });
  const first = await handleCompanyExport(get(`/api/companies/${A}/export`, a), env, A, () => new Date("2026-10-06T00:00:00.000Z"));
  const second = await handleCompanyExport(get(`/api/companies/${A}/export`, a), env, A, () => new Date("2026-10-07T00:00:00.000Z"));
  assert.match(first.headers.get("content-disposition") ?? "", /2026-10-06\.json"$/);
  assert.match(second.headers.get("content-disposition") ?? "", /2026-10-07\.json"$/);
  assert.deepEqual(strip(await first.text()), strip(await second.text()));
});

test("with no database bound the answer is 503 and nothing else happens", async () => {
  const res = await handleCompanyExport(get(`/api/companies/${A}/export`, a), { ...env, DB: undefined }, A);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "storage_unavailable" });
});
