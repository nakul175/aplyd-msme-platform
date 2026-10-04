import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { handleCompanyRead } from "../../src/api/companies.ts";
import { handleHealth } from "../../src/api/health.ts";
import { handleSessionRead, handleSessionWrite } from "../../src/api/session.ts";
import { ORIGIN, cookieFrom, createTestEnvironment, get, post } from "../support/d1.ts";
import type { AppEnv } from "../../src/env.ts";

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

async function auditEvents(event: string) {
  const { results } = await db.prepare("SELECT user_id, company_id, detail FROM audit_events WHERE event = ?").bind(event).all<{ user_id: string | null; company_id: string | null; detail: string }>();
  return results;
}

test("health reports the database", async () => {
  const res = await handleHealth(get("/api/health"), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok", database: "ok" });
});

test("a synthetic owner signs in and reads their own company", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const who = await handleSessionRead(get("/api/session", cookie), env);
  assert.equal(who.status, 200);
  assert.equal(((await who.json()) as { companyId: string }).companyId, A);
  const res = await handleCompanyRead(get(`/api/companies/${A}`, cookie), env, A);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: A, name: "SYNTHETIC Company A", synthetic: true, createdAt: "2026-10-04T00:00:00.000Z" });
});

test("an owner cannot read another company: 404, no data, and the attempt is audited", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const res = await handleCompanyRead(get(`/api/companies/${B}`, cookie), env, B);
  assert.equal(res.status, 404);
  const text = await res.text();
  assert.ok(!text.includes("SYNTHETIC Company B"), "the other company's name must not appear");
  assert.deepEqual(await (await handleCompanyRead(get("/api/companies/does-not-exist", cookie), env, "does-not-exist")).json(), JSON.parse(text), "a refused read looks the same as a missing record");
  const denied = await auditEvents("company.read.denied");
  assert.equal(denied.length, 2);
  assert.equal(denied[0].company_id, A);
  assert.equal(JSON.parse(denied[0].detail).requested, B);
});

test("the same holds the other way round", async () => {
  const cookie = await signIn("owner-b@synthetic.invalid");
  assert.equal((await handleCompanyRead(get(`/api/companies/${A}`, cookie), env, A)).status, 404);
  assert.equal((await handleCompanyRead(get(`/api/companies/${B}`, cookie), env, B)).status, 200);
});

test("the platform operator reads no company", async () => {
  const cookie = await signIn("operator@synthetic.invalid");
  for (const id of [A, B]) assert.equal((await handleCompanyRead(get(`/api/companies/${id}`, cookie), env, id)).status, 404);
});

test("nobody signed in reads nothing, and a tampered session counts as nobody", async () => {
  assert.equal((await handleCompanyRead(get(`/api/companies/${A}`), env, A)).status, 401);
  const cookie = await signIn("owner-a@synthetic.invalid");
  const tampered = cookie.slice(0, -2) + (cookie.endsWith("AA") ? "BB" : "AA");
  assert.equal((await handleCompanyRead(get(`/api/companies/${A}`, tampered), env, A)).status, 401);
  assert.equal((await handleSessionRead(get("/api/session", tampered), env)).status, 401);
});

test("identity is never taken from request headers", async () => {
  const forged = new Request(`${ORIGIN}/api/companies/${A}`, {
    headers: { "x-user-id": "user-synthetic-owner-a", "x-company-id": A, "cf-access-authenticated-user-email": "owner-a@synthetic.invalid", authorization: "Bearer user-synthetic-owner-a" },
  });
  assert.equal((await handleCompanyRead(forged, env, A)).status, 401);
});

test("a user removed from the database loses access at once", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  await db.prepare("DELETE FROM users WHERE id = ?").bind("user-synthetic-owner-a").run();
  assert.equal((await handleCompanyRead(get(`/api/companies/${A}`, cookie), env, A)).status, 401);
});

test("an unknown user is refused, and the refused address is not stored", async () => {
  const res = await handleSessionWrite(post("/api/session", { email: "someone@elsewhere.example" }), env);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("set-cookie"), null);
  const refused = await auditEvents("session.refused");
  assert.equal(refused.length, 1);
  const { results } = await db.prepare("SELECT detail, user_id, company_id FROM audit_events").all();
  assert.ok(!JSON.stringify(results).includes("elsewhere.example"));
});

test("sign-in refuses outside a synthetic environment and without a secret", async () => {
  for (const changed of [{ APLYD_ENV: "production" }, { APLYD_ENV: undefined }, { SESSION_SECRET: undefined }]) {
    const res = await handleSessionWrite(post("/api/session", { email: "owner-a@synthetic.invalid" }), { ...env, ...changed });
    assert.equal(res.status, 503, JSON.stringify(changed));
    assert.equal(res.headers.get("set-cookie"), null);
  }
});

test("a sign-in that another website started is refused", async () => {
  const res = await handleSessionWrite(post("/api/session", { email: "owner-a@synthetic.invalid" }, { origin: "https://evil.example" }), env);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.equal((await auditEvents("session.created")).length, 0);
});

test("sign-in and sign-out through a form redirect to the home page", async () => {
  const body = new URLSearchParams({ email: "owner-a@synthetic.invalid" });
  const form = (b: URLSearchParams) => new Request(`${ORIGIN}/api/session`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN }, body: b });
  const signedIn = await handleSessionWrite(form(body), env);
  assert.equal(signedIn.status, 303);
  assert.equal(signedIn.headers.get("location"), "/");
  assert.ok(signedIn.headers.get("set-cookie")?.includes("HttpOnly"));
  const signedOut = await handleSessionWrite(form(new URLSearchParams({ intent: "sign-out" })), env);
  assert.equal(signedOut.status, 303);
  assert.ok(signedOut.headers.get("set-cookie")?.includes("Max-Age=0"));
});

test("sign-in is audited with the person and company, never the address", async () => {
  await signIn("owner-a@synthetic.invalid");
  const created = await auditEvents("session.created");
  assert.equal(created.length, 1);
  assert.equal(created[0].user_id, "user-synthetic-owner-a");
  assert.equal(created[0].company_id, A);
});

test("the audit log refuses edits and deletes", async () => {
  await signIn("owner-a@synthetic.invalid");
  await assert.rejects(db.prepare("UPDATE audit_events SET event = 'changed'").run(), /append-only/);
  await assert.rejects(db.prepare("DELETE FROM audit_events").run(), /append-only/);
  assert.equal((await auditEvents("session.created")).length, 1);
});
