import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { handleCompanyRead } from "../../../platform/src/api/companies.ts";
import { handleHealth } from "../../../platform/src/api/health.ts";
import { handleSessionWrite } from "../../../platform/src/api/session.ts";
import type { AppEnv } from "../../../platform/src/env.ts";
import { ORIGIN, cookieFrom, createTestEnvironment, get, post } from "../../../platform/tests/support/d1.ts";
import { handleFactoryRead, handleRevisionCreate } from "../../src/api/factory.ts";
import { QUESTIONNAIRE_VERSION } from "../../src/questionnaire.ts";

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

const save = (companyId: string, cookie: string | undefined, body: unknown, headers: Record<string, string> = {}) =>
  handleRevisionCreate(post(`/api/companies/${companyId}/factory/revisions`, body, { ...(cookie ? { cookie } : {}), ...headers }), env, companyId);
const read = (companyId: string, cookie?: string) => handleFactoryRead(get(`/api/companies/${companyId}/factory`, cookie), env, companyId);
const formPost = (companyId: string, cookie: string, fields: [string, string][]) =>
  handleRevisionCreate(
    new Request(`${ORIGIN}/api/companies/${companyId}/factory/revisions`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie }, body: new URLSearchParams(fields) }),
    env,
    companyId,
  );

const count = async (company?: string) =>
  (await db.prepare(company ? "SELECT COUNT(*) AS n FROM factory_revisions WHERE company_id = ?" : "SELECT COUNT(*) AS n FROM factory_revisions").bind(...(company ? [company] : [])).first<{ n: number }>())!.n;
const audits = async (event: string) =>
  (await db.prepare("SELECT user_id, company_id, detail FROM audit_events WHERE event = ?").bind(event).all<{ user_id: string | null; company_id: string | null; detail: string }>()).results;

const REQUIRED = { sector: "pharma", products: "Tablets", employees: "50_249", processes: ["packaging"], problems: ["rejects_rework"] };

test("an owner reads their own factory record: the seeded confirmed description, its history and nothing else", async () => {
  const res = await read(A, await ownerA());
  assert.equal(res.status, 200);
  const body = (await res.json()) as { questionnaireVersion: number; latest: { revision: number; confirmed: boolean; answers: Record<string, unknown> } | null; latestConfirmed: { revision: number } | null; history: { revision: number }[] };
  assert.equal(body.questionnaireVersion, QUESTIONNAIRE_VERSION);
  assert.equal(body.latest?.revision, 1);
  assert.equal(body.latest?.confirmed, true);
  assert.equal(body.latestConfirmed?.revision, 1);
  assert.equal(body.latest?.answers.sector, "textiles_garments");
  assert.deepEqual(body.history.map((h) => h.revision), [1]);
  assert.ok(String(body.latest?.answers.products).startsWith("SYNTHETIC"));
});

test("a company with no description yet reads an empty record", async () => {
  const body = (await (await read(B, await ownerB())).json()) as { latest: unknown; latestConfirmed: unknown; history: unknown[] };
  assert.equal(body.latest, null);
  assert.equal(body.latestConfirmed, null);
  assert.deepEqual(body.history, []);
});

test("an owner cannot read another company's factory record: 404, nothing of it, same answer as a missing company, and audited", async () => {
  const cookie = await ownerB();
  const res = await read(A, cookie);
  assert.equal(res.status, 404);
  const text = await res.text();
  assert.ok(!text.includes("SYNTHETIC school uniforms"), "no field of the other company's record");
  assert.ok(!text.includes("textiles"), "not even a value");
  const missing = await read("company-that-does-not-exist", cookie);
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), text, "refused looks the same as missing");
  const denied = await audits("factory.read.denied");
  assert.equal(denied.length, 2);
  assert.equal(denied[0].company_id, B);
  assert.equal(JSON.parse(denied[0].detail).requested, A);
});

test("the operator, a signed-out visitor and a tampered session read no factory record", async () => {
  assert.equal((await read(A, await signIn("operator@synthetic.invalid"))).status, 404);
  assert.equal((await read(A)).status, 401);
  const cookie = await ownerA();
  assert.equal((await read(A, cookie.slice(0, -2) + (cookie.endsWith("AA") ? "BB" : "AA"))).status, 401);
});

test("an owner appends a new version; the old one stays, the latest changes, and latest-confirmed does not", async () => {
  const cookie = await ownerA();
  const res = await save(A, cookie, { basedOn: 1, answers: { shifts: "two", products: "  Shirts and trousers " }, note: "added a shift" });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { revision: 2, confirmed: false });
  const body = (await (await read(A, cookie)).json()) as { latest: { revision: number; confirmed: boolean; note: string; answers: Record<string, unknown>; createdBy: string }; latestConfirmed: { revision: number }; history: { revision: number; confirmed: boolean; note: string }[] };
  assert.equal(body.latest.revision, 2);
  assert.equal(body.latest.confirmed, false);
  assert.equal(body.latest.note, "added a shift");
  assert.equal(body.latest.createdBy, "user-synthetic-owner-a");
  assert.deepEqual(body.latest.answers, { shifts: "two", products: "Shirts and trousers" }, "only what was sent, trimmed");
  assert.equal(body.latestConfirmed.revision, 1);
  assert.deepEqual(body.history.map((h) => [h.revision, h.confirmed]), [[2, false], [1, true]]);
  const [created] = await audits("factory.revision.created");
  assert.equal(created.user_id, "user-synthetic-owner-a");
  assert.equal(created.company_id, A);
  assert.deepEqual(JSON.parse(created.detail), { revision: 2, confirmed: false });
});

test("the first description of a company is revision 1 from basedOn 0, and confirming it makes it the latest confirmed", async () => {
  const cookie = await ownerB();
  const res = await save(B, cookie, { basedOn: 0, answers: REQUIRED, confirm: true });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { revision: 1, confirmed: true });
  const body = (await (await read(B, cookie)).json()) as { latestConfirmed: { revision: number; questionnaireVersion: number } };
  assert.equal(body.latestConfirmed.revision, 1);
  assert.equal(body.latestConfirmed.questionnaireVersion, QUESTIONNAIRE_VERSION);
});

test("another company's owner cannot write to this company: 404, nothing written, audited", async () => {
  const before = await count();
  const res = await save(A, await ownerB(), { basedOn: 1, answers: { shifts: "three" } });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
  assert.equal(await count(), before);
  const [denied] = await audits("factory.write.denied");
  assert.equal(denied.company_id, B);
  assert.equal(JSON.parse(denied.detail).requested, A);
  assert.equal((await audits("factory.revision.created")).length, 0);
});

test("the operator and a signed-out visitor cannot write", async () => {
  const before = await count();
  assert.equal((await save(A, await signIn("operator@synthetic.invalid"), { basedOn: 1, answers: { shifts: "three" } })).status, 404);
  assert.equal((await save(A, undefined, { basedOn: 1, answers: { shifts: "three" } })).status, 401);
  assert.equal(await count(), before);
});

test("a person of the same company who is not an owner can read the record but not write to it", async () => {
  await db.prepare("INSERT INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES ('user-synthetic-viewer-a', ?, 'viewer-a@synthetic.invalid', 'SYNTHETIC Viewer A', 'viewer', 1)").bind(A).run();
  const cookie = await signIn("viewer-a@synthetic.invalid");
  assert.equal((await read(A, cookie)).status, 200);
  const before = await count();
  const res = await save(A, cookie, { basedOn: 1, answers: { shifts: "three" } });
  assert.equal(res.status, 403);
  assert.equal(await count(), before);
  assert.equal((await audits("factory.write.denied")).length, 1);
});

test("two saves from the same starting version: the first wins, the second is told it is stale and writes nothing", async () => {
  const cookie = await ownerA();
  assert.equal((await save(A, cookie, { basedOn: 1, answers: { shifts: "two" } })).status, 201);
  const second = await save(A, cookie, { basedOn: 1, answers: { shifts: "three" } });
  assert.equal(second.status, 409);
  assert.deepEqual(await second.json(), { error: "stale", latest: 2 });
  assert.equal(await count(A), 2);
  assert.equal((await audits("factory.revision.created")).length, 1, "no audit entry for the save that did not happen");
  assert.equal((await save(A, cookie, { basedOn: 5, answers: { shifts: "three" } })).status, 409, "a version that does not exist yet");
  assert.equal((await save(A, cookie, { basedOn: 0, answers: { shifts: "three" } })).status, 409, "starting again from nothing cannot overwrite");
  assert.equal(await count(A), 2);
});

test("basedOn must be a whole number from 0", async () => {
  const cookie = await ownerA();
  for (const basedOn of [undefined, null, -1, 1.5, "1", "", true, [1], { n: 1 }]) {
    const res = await save(A, cookie, { basedOn, answers: { shifts: "two" } });
    assert.equal(res.status, 400, JSON.stringify(basedOn));
  }
  assert.equal(await count(A), 1);
});

test("answers that break the questionnaire are refused with a message per question and nothing is written", async () => {
  const cookie = await ownerA();
  const res = await save(A, cookie, { basedOn: 1, answers: { sector: "steel", colour: "blue", problems: ["a", "b", "c", "d"], year_started: 3000, products: "x".repeat(501) } });
  assert.equal(res.status, 400);
  const { fields } = (await res.json()) as { fields: Record<string, string> };
  assert.deepEqual(Object.keys(fields).sort(), ["colour", "problems", "products", "sector", "year_started"]);
  assert.equal(await count(A), 1);
  assert.equal((await save(A, cookie, { basedOn: 1, answers: {} })).status, 400, "nothing to save");
  assert.equal((await save(A, cookie, { basedOn: 1 })).status, 400, "no answers key");
  assert.equal((await save(A, cookie, { basedOn: 1, answers: { shifts: "two" }, note: "n".repeat(501) })).status, 400, "note too long");
  assert.equal((await save(A, cookie, { basedOn: 1, answers: { shifts: "two" }, note: 7 })).status, 400);
  assert.equal((await save(A, cookie, { basedOn: 1, answers: { shifts: "two" }, confirm: "yes" })).status, 400);
  assert.equal(await count(A), 1);
});

test("confirming through the API needs the required questions; a draft does not", async () => {
  const cookie = await ownerB();
  const refused = await save(B, cookie, { basedOn: 0, answers: { sector: "pharma" }, confirm: true });
  assert.equal(refused.status, 400);
  const { fields } = (await refused.json()) as { fields: Record<string, string> };
  assert.deepEqual(Object.keys(fields).sort(), ["employees", "problems", "processes", "products"]);
  assert.equal(await count(B), 0);
  assert.equal((await save(B, cookie, { basedOn: 0, answers: { sector: "pharma" } })).status, 201);
});

test("a form that asks to confirm without the required answers is saved as a draft, so nothing typed is lost", async () => {
  const cookie = await ownerB();
  const res = await formPost(B, cookie, [["based_on", "0"], ["intent", "confirm"], ["a.sector", "pharma"], ["a.products", "Tablets"]]);
  assert.equal(res.status, 303);
  const location = new URL(res.headers.get("location")!, ORIGIN);
  assert.equal(location.pathname, "/factory");
  assert.equal(location.searchParams.get("saved"), "1");
  assert.equal(location.searchParams.get("confirmed"), null);
  assert.equal(location.searchParams.get("missing"), "employees,processes,problems");
  const [row] = (await db.prepare("SELECT confirmed, answers FROM factory_revisions WHERE company_id = ?").bind(B).all<{ confirmed: number; answers: string }>()).results;
  assert.equal(row.confirmed, 0);
  assert.deepEqual(JSON.parse(row.answers), { sector: "pharma", products: "Tablets" });
});

test("a complete form confirms; a stale form is sent back with a notice and writes nothing", async () => {
  const cookie = await ownerB();
  const complete: [string, string][] = [["a.sector", "pharma"], ["a.products", "Tablets"], ["a.employees", "50_249"], ["a.processes", "packaging"], ["a.processes", "testing_inspection"], ["a.problems", "rejects_rework"]];
  const ok = await formPost(B, cookie, [["based_on", "0"], ["intent", "confirm"], ...complete]);
  assert.equal(ok.status, 303);
  const target = new URL(ok.headers.get("location")!, ORIGIN);
  assert.equal(target.searchParams.get("saved"), "1");
  assert.equal(target.searchParams.get("confirmed"), "1");
  const stale = await formPost(B, cookie, [["based_on", "0"], ["intent", "save"], ["a.sector", "electronics"]]);
  assert.equal(stale.status, 303);
  assert.equal(new URL(stale.headers.get("location")!, ORIGIN).searchParams.get("stale"), "1");
  assert.equal(await count(B), 1);
  const bad = await formPost(B, cookie, [["based_on", "1"], ["intent", "save"], ["a.year_started", "abc"]]);
  assert.equal(bad.status, 400);
  assert.equal(await count(B), 1);
});

test("a form with an unreadable based_on is refused", async () => {
  const cookie = await ownerB();
  for (const basedOn of ["", "-1", "1.5", "abc", "99999999999"]) {
    const res = await formPost(B, cookie, [["based_on", basedOn], ["intent", "save"], ["a.sector", "pharma"]]);
    assert.equal(res.status, 400, JSON.stringify(basedOn));
  }
  assert.equal(await count(B), 0);
});

test("a save that another website started is refused, its body read, and nothing is written", async () => {
  const req = post(`/api/companies/${A}/factory/revisions`, { basedOn: 1, answers: { shifts: "two" } }, { cookie: await ownerA(), origin: "https://evil.example" });
  const res = await handleRevisionCreate(req, env, A);
  assert.equal(res.status, 403);
  assert.equal(req.bodyUsed, true);
  assert.equal(await count(A), 1);
});

test("content types and body sizes are checked", async () => {
  const cookie = await ownerA();
  const send = (type: string, body: string) => handleRevisionCreate(new Request(`${ORIGIN}/api/companies/${A}/factory/revisions`, { method: "POST", headers: { "content-type": type, origin: ORIGIN, cookie }, body }), env, A);
  assert.equal((await send("text/plain", "{}")).status, 415);
  assert.equal((await send("text/plain", "x".repeat(70_000))).status, 415, "a type the interface never sends is refused before its body is read or measured");
  assert.equal((await send("application/json", "{")).status, 400);
  for (const body of ["null", "[]", '"x"', "7"]) assert.equal((await send("application/json", body)).status, 400, body);
  assert.equal((await send("application/json", JSON.stringify({ basedOn: 1, answers: { shifts: "two" }, pad: "x".repeat(70_000) }))).status, 413);
  assert.equal((await send("application/x-www-form-urlencoded", `based_on=1&${"a.equipment=x&".repeat(10_000)}`)).status, 413);
  assert.equal(await count(A), 1);
});

test("the table refuses edits, deletes and any insert that would replace a row", async () => {
  const cookie = await ownerA();
  assert.equal((await save(A, cookie, { basedOn: 1, answers: { shifts: "two" } })).status, 201);
  const row = "(company_id, revision_no, created_at, created_by, confirmed, questionnaire_version, answers, note)";
  const same = "'company-synthetic-a', 2, 'x', 'user-synthetic-owner-a', 1, 1, '{\"forged\":true}', ''";
  await assert.rejects(db.prepare("UPDATE factory_revisions SET answers = '{}'").run(), /append-only/);
  await assert.rejects(db.prepare("DELETE FROM factory_revisions").run(), /append-only/);
  await assert.rejects(db.prepare(`INSERT OR REPLACE INTO factory_revisions ${row} VALUES (${same})`).run(), /append-only/, "replace on (company, revision)");
  await assert.rejects(db.prepare(`REPLACE INTO factory_revisions ${row} VALUES (${same})`).run(), /append-only/);
  await assert.rejects(db.prepare(`INSERT OR REPLACE INTO factory_revisions (id, ${row.slice(1)} VALUES (1, ${same})`).run(), /append-only/, "replace on id");
  await assert.rejects(db.prepare(`INSERT INTO factory_revisions ${row} VALUES (${same}) ON CONFLICT DO UPDATE SET answers = '{}'`).run(), /append-only/);
  await assert.rejects(db.prepare(`INSERT INTO factory_revisions ${row} VALUES ('company-synthetic-a', 2, 'x', 'user-synthetic-owner-a', 1, 1, '{}', '')`).run(), /append-only/, "a plain duplicate");
  const { results } = await db.prepare("SELECT answers FROM factory_revisions WHERE company_id = ? AND revision_no = 2").bind(A).all<{ answers: string }>();
  assert.deepEqual(JSON.parse(results[0].answers), { shifts: "two" });
  await db.prepare(`INSERT INTO factory_revisions ${row} VALUES ('company-synthetic-a', 3, 'x', 'user-synthetic-owner-a', 0, 1, '{"shifts":"one"}', '')`).run();
  assert.equal(await count(A), 3);
});

test("the table's own constraints hold: a company and user that exist, a confirmed flag of 0 or 1, a positive revision number", async () => {
  const row = "(company_id, revision_no, created_at, created_by, confirmed, questionnaire_version, answers, note)";
  await assert.rejects(db.prepare(`INSERT INTO factory_revisions ${row} VALUES ('no-such-company', 1, 'x', 'user-synthetic-owner-a', 0, 1, '{}', '')`).run(), /FOREIGN KEY/);
  await assert.rejects(db.prepare(`INSERT INTO factory_revisions ${row} VALUES ('company-synthetic-b', 1, 'x', 'no-such-user', 0, 1, '{}', '')`).run(), /FOREIGN KEY/);
  await assert.rejects(db.prepare(`INSERT INTO factory_revisions ${row} VALUES ('company-synthetic-b', 1, 'x', 'user-synthetic-owner-b', 2, 1, '{}', '')`).run(), /CHECK/);
  await assert.rejects(db.prepare(`INSERT INTO factory_revisions ${row} VALUES ('company-synthetic-b', 0, 'x', 'user-synthetic-owner-b', 0, 1, '{}', '')`).run(), /CHECK/);
});

test("health fails when a factory trigger is missing", async () => {
  assert.equal((await handleHealth(get("/api/health"), env)).status, 200);
  await db.prepare("DROP TRIGGER factory_revisions_no_replace").run();
  const res = await handleHealth(get("/api/health"), env);
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { auditGuard: string }).auditGuard, "missing");
});

test("the company record API is unchanged by the new table", async () => {
  const cookie = await ownerA();
  assert.equal((await handleCompanyRead(get(`/api/companies/${A}`, cookie), env, A)).status, 200);
  assert.equal((await handleCompanyRead(get(`/api/companies/${B}`, cookie), env, B)).status, 404);
});

test("the seed can be applied twice without error and without a second copy", async () => {
  const { applyMigrations } = await import("../../../platform/src/db/migrate.ts");
  const { seedStatements } = await import("../../../platform/src/db/migrate.ts");
  assert.ok(seedStatements().some((s) => s.includes("factory_revisions")), "the factory seed is part of the seed");
  for (const sql of seedStatements()) await db.prepare(sql).run();
  assert.equal(await count(A), 1);
  assert.equal(typeof applyMigrations, "function");
});
