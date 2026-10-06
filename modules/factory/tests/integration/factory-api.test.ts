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
  assert.equal(bad.status, 303, "a form that cannot be saved goes back to the page, not to a page of JSON");
  assert.equal(bad.headers.get("location"), "/factory?problem=invalid&fields=year_started");
  assert.equal(await count(B), 1);
});

test("a form with an unreadable based_on is refused, with a message on the page", async () => {
  const cookie = await ownerB();
  for (const basedOn of ["", "-1", "1.5", "abc", "99999999999"]) {
    const res = await formPost(B, cookie, [["based_on", basedOn], ["intent", "save"], ["a.sector", "pharma"]]);
    assert.equal(res.status, 303, JSON.stringify(basedOn));
    assert.equal(res.headers.get("location"), "/factory?problem=request", JSON.stringify(basedOn));
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
  await assert.rejects(db.prepare(`INSERT INTO factory_revisions ${row} VALUES ('company-synthetic-b', 0, 'x', 'user-synthetic-owner-b', 0, 1, '{}', '')`).run(), /CHECK|follows the one before it/, "revision 0 is refused by the rule or by the CHECK");
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

// ------------------------------------------------------------------------------------ the independent review's findings (slice 2)

test("a form that cannot be saved goes back to the page with a message and names the questions, never a page of JSON; a refused form saves nothing, and a field the questionnaire does not have is ignored, never echoed", async () => {
  const cookie = await ownerB();
  const go = async (fields: [string, string][]) => {
    const res = await formPost(B, cookie, fields);
    assert.equal(res.status, 303, JSON.stringify(fields));
    return res.headers.get("location");
  };
  // four of "biggest problems" when at most three may be chosen (the case the review found)
  assert.equal(await go([["based_on", "0"], ["intent", "save"], ["a.problems", "rejects_rework"], ["a.problems", "late_delivery"], ["a.problems", "machine_breakdowns"], ["a.problems", "cash_flow"]]), "/factory?problem=invalid&fields=problems");
  // an out-of-range number, two questions at once
  assert.equal(await go([["based_on", "0"], ["intent", "save"], ["a.year_started", "abc"], ["a.employees", "no_such_option"]]), "/factory?problem=invalid&fields=employees,year_started");
  // nothing to save at all: the message has no question to name
  assert.equal(await go([["based_on", "0"], ["intent", "save"]]), "/factory?problem=invalid");
  // a note that is too long, and a note with a control character
  assert.equal(await go([["based_on", "0"], ["intent", "save"], ["a.sector", "pharma"], ["note", "x".repeat(501)]]), "/factory?problem=note");
  assert.equal(await go([["based_on", "0"], ["intent", "save"], ["a.sector", "pharma"], ["note", "a\u0000b"]]), "/factory?problem=note");
  assert.equal(await count(B), 0);
  assert.equal((await audits("factory.revision.created")).filter((a) => a.company_id === B).length, 0);
  // A form field the questionnaire does not have is not read at all (only the questionnaire's own names are looked for), so it can
  // neither fail the save nor be named back; the rest is saved as sent.
  const unknown = await go([["based_on", "0"], ["intent", "save"], ["a.sector", "pharma"], ["a.<script>alert(1)</script>", "x"]]);
  assert.equal(unknown, "/factory?saved=1");
  assert.equal(await count(B), 1);
  assert.ok(!/script|alert/i.test((await db.prepare("SELECT answers FROM factory_revisions WHERE company_id = ?").bind(B).first<{ answers: string }>())!.answers), "the unknown field was not stored");
});

test("the same refusals reach a program as JSON, as before", async () => {
  const cookie = await ownerB();
  const res = await save(B, cookie, { basedOn: 0, answers: { problems: ["rejects_rework", "late_delivery", "machine_breakdowns", "cash_flow"] } });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; fields: Record<string, string> };
  assert.equal(body.error, "invalid");
  assert.ok(body.fields.problems);
});

test("a note gets the checks the answers get: control characters and text-direction overrides are refused, in JSON and in a form, and nothing is saved", async () => {
  const cookie = await ownerB();
  for (const note of ["a\u0000b", "ab\u202ecd", "ab\u2066cd", "a\u200bb", "a\u001bb"]) {
    const res = await save(B, cookie, { basedOn: 0, answers: { sector: "pharma" }, note });
    assert.equal(res.status, 400, JSON.stringify(note));
    assert.ok(((await res.json()) as { fields: Record<string, string> }).fields.note, JSON.stringify(note));
  }
  assert.equal(await count(B), 0);
  assert.equal((await save(B, cookie, { basedOn: 0, answers: { sector: "pharma" }, note: "क्\u200dष and a plain note" })).status, 201, "Indian scripts still go through");
});

test("a company may save at most 500 versions: the 501st is refused with 409 and a message, by the application and by the database, and nothing is added", async () => {
  const cookie = await ownerB();
  await db.prepare("INSERT INTO factory_revisions (company_id, revision_no, created_at, created_by, confirmed, questionnaire_version, answers, note) WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 499) SELECT 'company-synthetic-b', i, 'x', 'user-synthetic-owner-b', 0, 1, '{}', '' FROM n").run();
  assert.equal(await count(B), 499);
  assert.equal((await save(B, cookie, { basedOn: 499, answers: { sector: "pharma" } })).status, 201, "the 500th is saved");
  const res = await save(B, cookie, { basedOn: 500, answers: { sector: "pharma" } });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "too_many_revisions" });
  const form = await formPost(B, cookie, [["based_on", "500"], ["intent", "save"], ["a.sector", "pharma"]]);
  assert.equal(form.headers.get("location"), "/factory?problem=too_many");
  assert.equal(await count(B), 500);
  await assert.rejects(
    db.prepare("INSERT INTO factory_revisions (company_id, revision_no, created_at, created_by, confirmed, questionnaire_version, answers, note) VALUES ('company-synthetic-b', 501, 'x', 'user-synthetic-owner-b', 0, 1, '{}', '')").run(),
    /the most revisions it may have/,
  );
  assert.equal((await audits("factory.revision.created")).filter((a) => a.company_id === B).length, 1, "only the 500th was audited");
  // another company is not affected by this one's total
  assert.equal((await save(A, await ownerA(), { basedOn: 1, answers: { shifts: "two" } })).status, 201);
});

test("the history lists the newest 100 versions and says how many there are; older ones are kept and still open by number", async () => {
  const cookie = await ownerB();
  await db.prepare("INSERT INTO factory_revisions (company_id, revision_no, created_at, created_by, confirmed, questionnaire_version, answers, note) WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 130) SELECT 'company-synthetic-b', i, 'x', 'user-synthetic-owner-b', 0, 1, '{}', '' FROM n").run();
  const body = (await (await read(B, cookie)).json()) as { history: { revision: number }[]; revisionsSaved: number; latest: { revision: number } };
  assert.equal(body.history.length, 100);
  assert.deepEqual([body.history[0].revision, body.history[99].revision], [130, 31]);
  assert.equal(body.revisionsSaved, 130);
  assert.equal(body.latest.revision, 130);
  const { loadRevision } = await import("../../src/db/revisions.ts");
  assert.equal((await loadRevision(db, B, 5))?.revision, 5, "an old one is still there");
});

test("the database itself refuses answers that are not a JSON object, and a revision number that skips one", async () => {
  const row = "(company_id, revision_no, created_at, created_by, confirmed, questionnaire_version, answers, note)";
  const insert = (no: number, answers: string) => db.prepare(`INSERT INTO factory_revisions ${row} VALUES ('company-synthetic-b', ${no}, 'x', 'user-synthetic-owner-b', 0, 1, ?, '')`).bind(answers).run();
  for (const bad of ["not json", "", "[]", "7", "null", '"text"', "{broken"]) {
    await assert.rejects(insert(1, bad), /a JSON object/, JSON.stringify(bad));
  }
  // The bytes of {} bound as a BLOB are valid JSON to json_valid() and were kept as a BLOB, which the page could not read back
  // (found by the review of the review fixes): the answers must be stored as text.
  const asBlob = new Uint8Array([0x7b, 0x7d]);
  await assert.rejects(db.prepare(`INSERT INTO factory_revisions ${row} VALUES ('company-synthetic-b', 1, 'x', 'user-synthetic-owner-b', 0, 1, ?, '')`).bind(asBlob).run(), /a JSON object/, "answers as a BLOB");
  await assert.rejects(db.prepare(`INSERT INTO factory_revisions ${row} VALUES ('company-synthetic-b', 2, 'x', 'user-synthetic-owner-b', 0, 1, ?, '')`).bind(asBlob).run(), /a JSON object|follows the one before it/, "a blob after a gap is refused whichever rule answers");
  await assert.rejects(insert(50, "{}"), /follows the one before it/, "the case the review found: revision 50 with nothing before it");
  assert.equal(await count(B), 0);
  await insert(1, '{"shifts":"one"}');
  await assert.rejects(insert(3, "{}"), /follows the one before it/);
  await insert(2, "{}");
  assert.equal(await count(B), 2);
  // another company's numbers are its own
  await db.prepare(`INSERT INTO factory_revisions ${row} VALUES ('company-synthetic-a', 2, 'x', 'user-synthetic-owner-a', 0, 1, '{}', '')`).run();
});

test("only a save that lost a race for the same revision is called stale; any other failure of the write is raised, not blamed on someone else's save", async () => {
  const { appendRevision } = await import("../../src/db/revisions.ts");
  const fake = (error: Error): D1Database => {
    const statement = { bind: () => statement, first: async () => ({ n: 7 }) } as unknown as D1PreparedStatement;
    return { prepare: () => statement, batch: async () => { throw error; } } as unknown as D1Database;
  };
  const input = { companyId: B, userId: "user-synthetic-owner-b", basedOn: 0, answers: {}, note: "", confirmed: false, questionnaireVersion: 1 };
  await assert.rejects(appendRevision(fake(new Error("D1_ERROR: disk image is malformed")), input), /malformed/);
  await assert.rejects(appendRevision(fake(new Error("D1_ERROR: a revision number follows the one before it")), input), /follows the one before it/);
  await assert.rejects(appendRevision(fake(new Error("D1_ERROR: UNIQUE constraint failed: assessments.id")), input), /assessments/);
  assert.deepEqual(await appendRevision(fake(new Error("D1_ERROR: UNIQUE constraint failed: factory_revisions.company_id, factory_revisions.revision_no")), input), { ok: false, reason: "stale", latest: 7 }, "the lost race is stale");
  assert.deepEqual(await appendRevision(fake(new Error("D1_ERROR: factory_revisions is append-only")), input), { ok: false, reason: "stale", latest: 7 });
});

test("health notices a trigger of the right name on the wrong table, as well as a missing one", async () => {
  assert.equal((await handleHealth(get("/api/health"), env)).status, 200);
  await db.prepare("DROP TRIGGER factory_revisions_no_gaps").run();
  await db.prepare("CREATE TRIGGER factory_revisions_no_gaps BEFORE INSERT ON companies WHEN 0 BEGIN SELECT 1; END").run();
  const res = await handleHealth(get("/api/health"), env);
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { auditGuard: string }).auditGuard, "missing");
});

test("the limit written into migration 0014 is the one the application states", async () => {
  const { readFileSync } = await import("node:fs");
  const { MAX_REVISIONS_PER_COMPANY } = await import("../../src/db/revisions.ts");
  const sql = readFileSync(new URL("../../../../drizzle/0014_review_fixes.sql", import.meta.url), "utf8");
  assert.match(sql, new RegExp(`>= ${MAX_REVISIONS_PER_COMPANY}\\b`));
});

test("a note of a revision is at most 500 characters in the table, as it is in the handler, and counted in characters", async () => {
  const row = "(company_id, revision_no, created_at, created_by, confirmed, questionnaire_version, answers, note)";
  const insert = (no: number, note: string) => db.prepare(`INSERT INTO factory_revisions ${row} VALUES ('company-synthetic-b', ${no}, 'x', 'user-synthetic-owner-b', 0, 1, '{}', ?)`).bind(note).run();
  await assert.rejects(insert(1, "n".repeat(501)), /at most 500 characters/);
  await assert.rejects(insert(1, "é".repeat(501)), /at most 500 characters/, "characters, not bytes");
  // SQLite's length() stops at a NUL, so 'a', a NUL and 100,000 more characters counted as one; the second bound is on bytes.
  await assert.rejects(insert(1, `a\u0000${"b".repeat(100_000)}`), /at most 500 characters/, "text after a NUL still counts");
  await assert.rejects(insert(1, `a\u0000${"b".repeat(2000)}`), /at most 500 characters/, "the byte bound is 2,000");
  assert.equal(await count(B), 0);
  await insert(1, "n".repeat(500));
  await insert(2, "é".repeat(500));
  await insert(3, "a\u0000b"); // a short note with a NUL in it is still stored: the bound is on length, not on content
  assert.equal(await count(B), 3);
});

test("the same mistakes always send the form back to the same address: the questions are named in alphabetical order, whatever order they were sent or checked in", async () => {
  const cookie = await ownerB();
  const go = async (fields: [string, string][]) => (await formPost(B, cookie, fields)).headers.get("location");
  const one = await go([["based_on", "0"], ["intent", "save"], ["a.year_started", "abc"], ["a.employees", "no_such_option"], ["a.shifts", "no_such_option"]]);
  const two = await go([["based_on", "0"], ["intent", "save"], ["a.shifts", "no_such_option"], ["a.employees", "no_such_option"], ["a.year_started", "abc"]]);
  assert.equal(one, "/factory?problem=invalid&fields=employees,shifts,year_started");
  assert.equal(two, one);
});

test("a form post from the Describe page with no session, a tampered one or one that has ended is sent to the sign-in page with nothing saved, and a program still gets 401 JSON (BR-UX-06)", async () => {
  const before = await count();
  const cookie = await ownerA();
  const tampered = cookie.slice(0, -2) + (cookie.endsWith("AA") ? "BB" : "AA");
  const fields: [string, string][] = [["based_on", "1"], ["a.shifts", "two"], ["intent", "save"]];
  const seen = async (res: Response) => ({ status: res.status, location: res.headers.get("location"), json: (res.headers.get("content-type") ?? "").startsWith("application/json") });
  for (const jar of [undefined, tampered, "aplyd_session="]) {
    const req = new Request(`${ORIGIN}/api/companies/${A}/factory/revisions`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, ...(jar ? { cookie: jar } : {}) }, body: new URLSearchParams(fields) });
    assert.deepEqual(await seen(await handleRevisionCreate(req, env, A)), { status: 303, location: "/sign-in?expired=1", json: false }, String(jar));
    assert.equal(req.bodyUsed, true, "the body was read and discarded");
  }
  const multipart = new FormData();
  multipart.set("based_on", "1");
  assert.deepEqual(await seen(await handleRevisionCreate(new Request(`${ORIGIN}/api/companies/${A}/factory/revisions`, { method: "POST", headers: { origin: ORIGIN }, body: multipart }), env, A)), { status: 303, location: "/sign-in?expired=1", json: false }, "multipart form");
  assert.deepEqual(await seen(await save(A, undefined, { basedOn: 1, answers: { shifts: "two" } })), { status: 401, location: null, json: true }, "a program");
  assert.equal(await count(), before, "nothing was saved");
  assert.equal((await audits("factory.write.denied")).length, 0, "nobody was known, so nothing is audited");
  // With a valid session the same form is saved as before.
  assert.equal((await formPost(A, cookie, fields)).status, 303);
  assert.equal(await count(), before + 1);
});

// ------------------------------------------------------------------------------------ slice 12a: a refused save gives back what was typed (S5-02, BR-DESC-03, FR-DESC-15)

/** The pieces of the typed-answers cookie a response sets (the cleared ones have no value). */
const keptPieces = (res: Response) => res.headers.getSetCookie().filter((c) => c.startsWith("aplyd_describe_draft_")).map((c) => ({ name: c.split("=")[0]!, value: c.slice(c.indexOf("=") + 1, c.indexOf(";")), line: c }));

test("S5-02: a refused form keeps what was typed in a short-lived cookie for /factory; nothing typed is in the address; nothing is saved", async () => {
  const cookie = await ownerB();
  const typed: [string, string][] = [["based_on", "0"], ["intent", "save"], ["a.products", "SYNTHETIC wire harnesses"], ["a.problems", "rejects_rework"], ["a.problems", "late_deliveries"], ["a.problems", "breakdowns"], ["a.problems", "energy_cost"], ["note", "typed by hand"]];
  const res = await formPost(B, cookie, typed);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/factory?problem=invalid&fields=problems", "the address is what it was: no typed word in it");
  assert.ok(!decodeURIComponent(res.headers.get("location")!).includes("harnesses"));
  const kept = keptPieces(res);
  assert.deepEqual(kept.map((k) => k.name), ["aplyd_describe_draft_0", "aplyd_describe_draft_1", "aplyd_describe_draft_2"]);
  assert.ok(kept[0]!.value.length > 0 && kept[1]!.value === "" && kept[2]!.value === "", "one piece holds it; the other two are cleared");
  for (const k of kept) assert.match(k.line, /; HttpOnly; Secure; SameSite=Strict; Path=\/factory; Max-Age=\d+$/);
  assert.match(kept[0]!.line, /Max-Age=120$/);
  assert.match(kept[1]!.line, /Max-Age=0$/);
  // what the page will read back: this company's typed answers, as sent, and not another company's
  const { readDraft, draftAnswers } = await import("../../src/draft.ts");
  const header = `${kept[0]!.name}=${kept[0]!.value}`;
  assert.deepEqual(draftAnswers(readDraft(header, B)!).problems, ["rejects_rework", "late_deliveries", "breakdowns", "energy_cost"]);
  assert.equal(readDraft(header, A), null, "company A's owner on the same browser does not get company B's typed answers");
  assert.equal(await count(B), 0, "nothing was saved");
  assert.equal((await audits("factory.revision.created")).filter((a) => a.company_id === B).length, 0);
  // the same refusal sent twice leaves the record as it was
  await formPost(B, cookie, typed);
  assert.equal(await count(B), 0);
});

test("S5-02: a stale form keeps what was typed too, writes nothing, and a form that is saved clears the cookie", async () => {
  const cookie = await ownerB();
  const first = await formPost(B, cookie, [["based_on", "0"], ["intent", "save"], ["a.sector", "pharma"]]);
  assert.equal(new URL(first.headers.get("location")!, ORIGIN).searchParams.get("saved"), "1");
  assert.ok(keptPieces(first).every((k) => k.value === "" && /Max-Age=0$/.test(k.line)), "a save that went through clears any earlier typed answers");
  const stale = await formPost(B, cookie, [["based_on", "0"], ["intent", "save"], ["a.products", "SYNTHETIC cables"], ["a.sector", "electronics"]]);
  assert.equal(stale.headers.get("location"), "/factory?stale=1");
  assert.ok(keptPieces(stale)[0]!.value.length > 0, "the typed answers are kept");
  assert.equal(await count(B), 1, "nothing was written");
  const { readDraft } = await import("../../src/draft.ts");
  const back = readDraft(`${keptPieces(stale)[0]!.name}=${keptPieces(stale)[0]!.value}`, B)!;
  assert.deepEqual(back.fields, { products: ["SYNTHETIC cables"], sector: ["electronics"] });
  const again = await formPost(B, cookie, [["based_on", "1"], ["intent", "save"], ["a.products", "SYNTHETIC cables"]]);
  assert.equal(new URL(again.headers.get("location")!, ORIGIN).searchParams.get("saved"), "2");
  assert.ok(keptPieces(again).every((k) => k.value === ""), "cleared once saved");
});

test("S5-02: a form with nothing typed sets no answers; a program that sends JSON gets JSON and no cookie", async () => {
  const cookie = await ownerB();
  const empty = await formPost(B, cookie, [["based_on", "0"], ["intent", "save"], ["a.products", "  "]]);
  assert.equal(empty.headers.get("location"), "/factory?problem=invalid");
  assert.ok(keptPieces(empty).every((k) => k.value === ""), "nothing typed, nothing kept");
  const json = await save(B, cookie, { basedOn: 0, answers: { problems: ["a", "b", "c", "d"] } });
  assert.equal(json.status, 400);
  assert.equal(json.headers.getSetCookie().length, 0, "no cookie on a JSON answer");
  assert.equal(await count(B), 0);
});

test("S5-02: answers too long to fit in the cookie are not kept and the refusal still goes back to the page", async () => {
  const cookie = await ownerB();
  const res = await formPost(B, cookie, [["based_on", "0"], ["intent", "save"], ["a.problems", "x"], ["a.own_words", "सर्".repeat(1200)]]);
  assert.equal(res.status, 303);
  assert.ok(keptPieces(res).every((k) => k.value === ""), "too long to keep, so nothing is kept and nothing broken is sent");
  assert.equal(await count(B), 0);
});
