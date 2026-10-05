import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { authorizeCompanyRead, authorizeCompanyWrite, authorizeOperator, authorizeSignedIn } from "../../src/api/authorize.ts";
import { handleCompanyRead } from "../../src/api/companies.ts";
import { handleHealth } from "../../src/api/health.ts";
import { handleSessionRead, handleSessionWrite } from "../../src/api/session.ts";
import { ORIGIN, TEST_SECRET, cookieFrom, createTestEnvironment, get, post } from "../support/d1.ts";
import { SESSION_SECONDS, signSession } from "../../src/identity/session.ts";
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
  assert.deepEqual(await res.json(), { status: "ok", database: "ok", auditGuard: "ok" });
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
  // Owner B has written nothing, so the user can be deleted. A user who has saved a factory revision cannot be deleted at all (foreign key), by design.
  const cookie = await signIn("owner-b@synthetic.invalid");
  assert.equal((await handleCompanyRead(get(`/api/companies/${B}`, cookie), env, B)).status, 200);
  await db.prepare("DELETE FROM users WHERE id = ?").bind("user-synthetic-owner-b").run();
  assert.equal((await handleCompanyRead(get(`/api/companies/${B}`, cookie), env, B)).status, 401);
});

test("an unknown user is refused and nothing is written, so unauthenticated requests cannot fill the audit log", async () => {
  const warn = mock.method(console, "warn", () => {});
  try {
    for (let i = 0; i < 25; i++) {
      const res = await handleSessionWrite(post("/api/session", { email: `someone${i}@elsewhere.example` }), env);
      assert.equal(res.status, 401);
      assert.equal(res.headers.get("set-cookie"), null);
    }
    assert.equal(warn.mock.callCount(), 25, "each refusal goes to the log stream instead");
    assert.ok(!JSON.stringify(warn.mock.calls.map((c) => c.arguments)).includes("elsewhere.example"), "the address is not logged either");
  } finally {
    warn.mock.restore();
  }
  const { results } = await db.prepare("SELECT COUNT(*) AS n FROM audit_events").all<{ n: number }>();
  assert.equal(results[0].n, 0);
});

test("a user that is not marked synthetic cannot sign in through the synthetic sign-in", async () => {
  await db.prepare("INSERT INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES (?, ?, ?, ?, ?, 0)").bind("user-real-looking", A, "real@example.invalid", "Not synthetic", "owner").run();
  const res = await handleSessionWrite(post("/api/session", { email: "real@example.invalid" }), env);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("sign-in refuses outside a synthetic environment and without a secret", async () => {
  for (const changed of [{ APLYD_ENV: "production" }, { APLYD_ENV: undefined }, { SESSION_SECRET: undefined }, { SESSION_SECRET: "x" }, { SESSION_SECRET: "a".repeat(40) }, { SESSION_SECRET: TEST_SECRET.slice(0, 31) }]) {
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

test("the audit log refuses INSERT OR REPLACE and REPLACE INTO that reuse an id, while ordinary inserts still work", async () => {
  await signIn("owner-a@synthetic.invalid");
  const { results: before } = await db.prepare("SELECT id, event FROM audit_events").all<{ id: number; event: string }>();
  assert.equal(before.length, 1);
  const id = before[0].id;
  await assert.rejects(db.prepare("INSERT OR REPLACE INTO audit_events (id, at, event, detail) VALUES (?, 'x', 'forged', '{}')").bind(id).run(), /append-only/);
  await assert.rejects(db.prepare("REPLACE INTO audit_events (id, at, event, detail) VALUES (?, 'x', 'forged', '{}')").bind(id).run(), /append-only/);
  await assert.rejects(db.prepare("INSERT INTO audit_events (id, at, event, detail) VALUES (?, 'x', 'forged', '{}') ON CONFLICT(id) DO UPDATE SET event = 'forged'").bind(id).run(), /append-only/);
  assert.equal((await auditEvents("session.created")).length, 1, "the original row is untouched");
  assert.equal((await auditEvents("forged")).length, 0);
  await db.prepare("INSERT INTO audit_events (at, event, detail) VALUES ('x', 'ordinary', '{}')").run();
  await db.prepare("INSERT INTO audit_events (id, at, event, detail) VALUES (?, 'x', 'explicit-fresh-id', '{}')").bind(id + 100).run();
  assert.equal((await auditEvents("ordinary")).length, 1);
  assert.equal((await auditEvents("explicit-fresh-id")).length, 1);
});

test("health reports degraded when the audit triggers are missing", async () => {
  await db.prepare("DROP TRIGGER audit_events_no_replace").run();
  const res = await handleHealth(get("/api/health"), env);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { status: "degraded", database: "ok", auditGuard: "missing" });
});

test("the session cookie has exactly the documented attributes", async () => {
  const res = await handleSessionWrite(post("/api/session", { email: "owner-a@synthetic.invalid" }), env);
  const header = res.headers.get("set-cookie") ?? "";
  assert.match(header, /^aplyd_session=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=28800$/);
  assert.equal(SESSION_SECONDS, 28800);
  const signedOut = await handleSessionWrite(post("/api/session", { intent: "sign-out" }), env);
  assert.equal(signedOut.headers.get("set-cookie"), "aplyd_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
});

test("a session lasts eight hours to the second, measured by the clock the handlers actually use", async () => {
  const start = 1_900_000_000_000;
  const now = mock.method(Date, "now", () => start);
  try {
    const cookie = await signIn("owner-a@synthetic.invalid");
    now.mock.mockImplementation(() => start + (SESSION_SECONDS - 1) * 1000);
    assert.equal((await handleSessionRead(get("/api/session", cookie), env)).status, 200, "one second before the end");
    assert.equal((await handleCompanyRead(get(`/api/companies/${A}`, cookie), env, A)).status, 200);
    now.mock.mockImplementation(() => start + SESSION_SECONDS * 1000);
    assert.equal((await handleSessionRead(get("/api/session", cookie), env)).status, 401, "at the end");
    assert.equal((await handleCompanyRead(get(`/api/companies/${A}`, cookie), env, A)).status, 401);
    now.mock.mockImplementation(() => start + 10 * SESSION_SECONDS * 1000);
    assert.equal((await handleSessionRead(get("/api/session", cookie), env)).status, 401, "long after");
  } finally {
    now.mock.restore();
  }
});

test("a secret that is too short signs nobody in and verifies nobody, even for a token it signed itself", async () => {
  const weakSecret = TEST_SECRET.slice(0, 31);
  const weak = { ...env, SESSION_SECRET: weakSecret };
  const withWeak = `aplyd_session=${await signSession("user-synthetic-owner-a", weakSecret, Math.floor(Date.now() / 1000))}`;
  const withStrong = `aplyd_session=${await signSession("user-synthetic-owner-a", TEST_SECRET, Math.floor(Date.now() / 1000))}`;
  assert.equal((await handleSessionRead(get("/api/session", withStrong), env)).status, 200, "control: the same token shape verifies under a proper secret");
  assert.equal((await handleSessionRead(get("/api/session", withWeak), weak)).status, 401, "a genuine token under a short secret is not accepted");
  assert.equal((await handleSessionWrite(post("/api/session", { email: "owner-a@synthetic.invalid" }), weak)).status, 503);
});

test("near-miss company ids are refused for a signed-in owner", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const nearMisses = [A.toUpperCase(), ` ${A}`, `${A} `, `${A}\0`, A.slice(0, -1), `${A}x`, `${A}%00`, `${A}/..`, "", B];
  for (const id of nearMisses) assert.equal((await handleCompanyRead(get(`/api/companies/${encodeURIComponent(id)}`, cookie), env, id)).status, 404, JSON.stringify(id));
  assert.equal((await handleCompanyRead(get(`/api/companies/${A}`, cookie), env, A)).status, 200, "control");
});

test("only 64 characters of a refused company id are stored in the audit log", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const long = "x".repeat(5000);
  await handleCompanyRead(get("/api/companies/long", cookie), env, long);
  const [row] = await auditEvents("company.read.denied");
  assert.equal(JSON.parse(row.detail).requested.length, 64);
});

test("a cookie sent twice counts as nobody", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  assert.equal((await handleSessionRead(get("/api/session", `${cookie}; ${cookie}`), env)).status, 401);
  assert.equal((await handleSessionRead(get("/api/session", `aplyd_session=; ${cookie}`), env)).status, 401);
});

test("sign-in and sign-out accept only the two content types the interface sends, and unreadable bodies get 400", async () => {
  const send = (type: string | null, body: string) => handleSessionWrite(new Request(`${ORIGIN}/api/session`, { method: "POST", headers: { ...(type ? { "content-type": type } : {}), origin: ORIGIN }, body }), env);
  assert.equal((await send("text/plain", JSON.stringify({ email: "owner-a@synthetic.invalid" }))).status, 415);
  assert.equal((await send("multipart/form-data; boundary=application/x-www-form-urlencoded", "garbage")).status, 415);
  assert.equal((await send(null, "{}")).status, 415);
  assert.equal((await send("application/json", "{")).status, 400);
  for (const body of ["null", "[]", '"owner"', "7"]) assert.equal((await send("application/json", body)).status, 400, body);
  assert.equal((await send("application/json; charset=utf-8", JSON.stringify({ email: "owner-a@synthetic.invalid" }))).status, 200, "a charset parameter is fine");
  assert.equal((await send("Application/X-WWW-Form-Urlencoded", "email=owner-a%40synthetic.invalid")).status, 303);
  assert.equal((await auditEvents("session.created")).length, 2);
});

test("a request refused as cross-site has its body read, so the connection is left clean", async () => {
  const req = post("/api/session", { email: "owner-a@synthetic.invalid" }, { origin: "https://evil.example" });
  assert.equal((await handleSessionWrite(req, env)).status, 403);
  assert.equal(req.bodyUsed, true);
});

test("signing out while signed in is audited, and signing out as nobody is not", async () => {
  await handleSessionWrite(post("/api/session", { intent: "sign-out" }), env);
  assert.equal((await auditEvents("session.ended")).length, 0);
  const cookie = await signIn("owner-a@synthetic.invalid");
  const res = await handleSessionWrite(post("/api/session", { intent: "sign-out" }, { cookie }), env);
  assert.equal(res.status, 200);
  const ended = await auditEvents("session.ended");
  assert.equal(ended.length, 1);
  assert.equal(ended[0].user_id, "user-synthetic-owner-a");
});

// BR-UX-06: what a person at a form meets when the session has ended is the sign-in page, never a page of JSON; a program is answered as before.
const FORM = "application/x-www-form-urlencoded";
const MULTIPART = "multipart/form-data; boundary=----aplyd";
const sent = (path: string, type: string | null, cookie?: string, body = "note=typed+by+the+owner") =>
  new Request(`${ORIGIN}${path}`, { method: "POST", headers: { origin: ORIGIN, ...(type ? { "content-type": type } : {}), ...(cookie ? { cookie } : {}) }, body });
const shown = async (res: Response) => ({ status: res.status, location: res.headers.get("location"), json: (res.headers.get("content-type") ?? "").startsWith("application/json") ? await res.json() : null });
const EXPIRED = { status: 303, location: "/sign-in?expired=1", json: null };
const NO_SESSION = { status: 401, location: null, json: { error: "not_signed_in" } };

test("a form post with no session, a tampered session or an ended session is sent to the sign-in page by every kind of check; a program still gets 401 JSON", async () => {
  const good = await signIn("owner-a@synthetic.invalid");
  const tampered = good.slice(0, -2) + (good.endsWith("AA") ? "BB" : "AA");
  const company = `/api/companies/${A}/x`;
  const checks: [string, (r: Request) => Promise<unknown>][] = [
    ["company change", (r) => authorizeCompanyWrite(r, env, A, "x.write.denied")],
    ["operator change", (r) => authorizeOperator(r, env, "operator.write.denied", true)],
    ["signed-in change", (r) => authorizeSignedIn(r, env)],
  ];
  const ended = async () => {
    const start = Date.now();
    const cookie = await signIn("owner-a@synthetic.invalid");
    return { cookie, later: () => mock.method(Date, "now", () => start + (SESSION_SECONDS + 5) * 1000) };
  };
  for (const [name, check] of checks) {
    for (const [what, cookie] of [["no cookie", undefined], ["a tampered cookie", tampered], ["an empty cookie", "aplyd_session="]] as const) {
      for (const type of [FORM, MULTIPART]) assert.deepEqual(await shown((await check(sent(company, type, cookie))) as Response), EXPIRED, `${name}, ${what}, ${type}`);
      for (const type of ["application/json", "text/plain", null]) assert.deepEqual(await shown((await check(sent(company, type, cookie, "{}"))) as Response), NO_SESSION, `${name}, ${what}, ${type}`);
    }
    const old = await ended();
    const clock = old.later();
    try {
      assert.deepEqual(await shown((await check(sent(company, FORM, old.cookie))) as Response), EXPIRED, `${name}, a session that ended eight hours ago, form`);
      assert.deepEqual(await shown((await check(sent(company, "application/json", old.cookie, "{}"))) as Response), NO_SESSION, `${name}, the same session, program`);
    } finally {
      clock.mock.restore();
    }
  }
  assert.equal((await auditEvents("x.write.denied")).length + (await auditEvents("operator.write.denied")).length, 0, "a request with no session is not audited");
});

test("a read with no session stays JSON, even for a browser that sends a form content type, and the body of a refused post is read so the connection is left clean", async () => {
  const get401 = (type: string) => new Request(`${ORIGIN}/api/companies/${A}`, { headers: { "content-type": type } });
  assert.deepEqual(await shown(await handleCompanyRead(get401(FORM), env, A)), NO_SESSION);
  assert.deepEqual(await shown((await authorizeCompanyRead(get401(FORM), env, A, "x.read.denied")) as Response), NO_SESSION);
  assert.deepEqual(await shown(await handleSessionRead(get("/api/session"), env)), NO_SESSION);
  const form = sent(`/api/companies/${A}/x`, FORM);
  assert.deepEqual(await shown((await authorizeCompanyWrite(form, env, A, "x.write.denied")) as Response), EXPIRED);
  assert.equal(form.bodyUsed, true);
});

test("the refusal changes only what is shown: with a valid session the same checks decide exactly as before", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const b = await signIn("owner-b@synthetic.invalid");
  const op = await signIn("operator@synthetic.invalid");
  const path = `/api/companies/${A}/x`;
  const allowed = (await authorizeCompanyWrite(sent(path, FORM, a), env, A, "x.write.denied")) as { companyId?: string };
  assert.equal(allowed.companyId, A, "the owner is let through");
  assert.deepEqual(await shown((await authorizeCompanyWrite(sent(path, FORM, b), env, A, "x.write.denied")) as Response), { status: 404, location: null, json: { error: "not_found" } }, "another company's owner is still 404");
  assert.deepEqual(await shown((await authorizeOperator(sent(path, FORM, a), env, "operator.write.denied", true)) as Response), { status: 403, location: null, json: { error: "forbidden" } }, "an owner at an operator form is still 403");
  assert.ok("db" in ((await authorizeOperator(sent(path, FORM, op), env, "operator.write.denied", true)) as object), "the operator is let through");
});
