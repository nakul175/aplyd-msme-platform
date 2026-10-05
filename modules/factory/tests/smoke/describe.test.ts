// The Describe step on the built application, over HTTP. Needs `pnpm build` first.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startBuiltApp } from "../../../platform/tests/support/worker.ts";
import type { RunningWorker } from "../../../platform/tests/support/worker.ts";

const A = "company-synthetic-a";
const B = "company-synthetic-b";
let app: RunningWorker;

before(async () => {
  app = await startBuiltApp({ APLYD_ENV: "test", SESSION_SECRET: `smoke-${crypto.randomUUID()}` });
});
after(async () => {
  await app?.stop();
});

/** Server-rendered React puts <!-- --> between a sentence's text and its values; a person never sees them. */
const withoutMarkers = (html: string) => html.replace(/<!-- -->/g, "");
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
async function signIn(email: string): Promise<string> {
  const res = await fetch(`${app.base}/api/session`, { method: "POST", headers: { "content-type": "application/json", origin: app.base }, body: JSON.stringify({ email }) });
  assert.equal(res.status, 200, email);
  return cookieOf(res);
}
const post = (cookie: string, companyId: string, body: BodyInit, type: string, extra: Record<string, string> = {}) =>
  fetch(`${app.base}/api/companies/${companyId}/factory/revisions`, { method: "POST", redirect: "manual", headers: { cookie, origin: app.base, "content-type": type, ...extra }, body });

test("the Describe page shows the signed-in owner's own confirmed description and nothing of the other company", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const res = await fetch(`${app.base}/factory`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const page = withoutMarkers(await res.text());
  assert.match(page, /Describe your factory/);
  assert.match(page, /Newest version: 1, confirmed as accurate/);
  assert.ok(page.includes("SYNTHETIC school uniforms and cotton shirts"), "the saved answer is filled in");
  assert.match(page, /action="\/api\/companies\/company-synthetic-a\/factory\/revisions"/);
  assert.ok(!page.includes(B), "the other company's id is nowhere on the page");
});

test("an owner with nothing saved sees an empty form, and a visitor who is not signed in is sent to sign in", async () => {
  const cookie = await signIn("owner-b@synthetic.invalid");
  const page = withoutMarkers(await (await fetch(`${app.base}/factory`, { headers: { cookie } })).text());
  assert.match(page, /Nothing saved yet/);
  assert.ok(!page.includes("school uniforms"), "no text from company A");
  const anonymous = await (await fetch(`${app.base}/factory`)).text();
  assert.match(anonymous, /href="\/sign-in"/);
  assert.ok(!anonymous.includes("school uniforms") && !anonymous.includes("describe-form"));
});

test("the operator, who belongs to no company, is told the page is for owners and sees no company's description", async () => {
  const cookie = await signIn("operator@synthetic.invalid");
  const page = await (await fetch(`${app.base}/factory`, { headers: { cookie } })).text();
  assert.match(page, /for the owner of a company/);
  assert.ok(!page.includes("school uniforms") && !page.includes("describe-form"));
});

test("the API serves an owner their own description and answers the other company's with the same 404 as a missing one", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const own = await fetch(`${app.base}/api/companies/${A}/factory`, { headers: { cookie } });
  assert.equal(own.status, 200);
  const body = (await own.json()) as { latest: { revision: number; confirmed: boolean }; history: unknown[] };
  assert.equal(body.latest.revision, 1);
  assert.equal(body.latest.confirmed, true);
  const other = await fetch(`${app.base}/api/companies/${B}/factory`, { headers: { cookie } });
  const missing = await fetch(`${app.base}/api/companies/company-that-does-not-exist/factory`, { headers: { cookie } });
  assert.equal(other.status, 404);
  assert.equal(await other.text(), await missing.text());
  assert.equal((await fetch(`${app.base}/api/companies/${A}/factory`)).status, 401);
});

test("an owner saves a draft with a form post and is sent back to the page, which shows version 2 and keeps version 1", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const form = new URLSearchParams({ based_on: "1", intent: "save", "a.sector": "textiles_garments", "a.products": "SYNTHETIC uniforms, now also aprons", note: "added aprons" });
  const res = await post(cookie, A, form.toString(), "application/x-www-form-urlencoded");
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/factory?saved=2");
  const page = withoutMarkers(await (await fetch(`${app.base}/factory?saved=2`, { headers: { cookie } })).text());
  assert.match(page, /Version 2 saved as a draft/);
  assert.match(page, /Newest version: 2, a draft/);
  const history = (await (await fetch(`${app.base}/api/companies/${A}/factory`, { headers: { cookie } })).json()) as { history: { revision: number; note: string }[] };
  assert.deepEqual(history.history.map((h) => h.revision).sort(), [1, 2]);
  const old = withoutMarkers(await (await fetch(`${app.base}/factory?rev=1`, { headers: { cookie } })).text());
  assert.ok(old.includes("SYNTHETIC school uniforms and cotton shirts"), "version 1 is still there, unchanged");
  assert.match(old, /It cannot be changed/);
});

test("saving from a stale page changes nothing, and a form is told so", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const before = (await (await fetch(`${app.base}/api/companies/${A}/factory`, { headers: { cookie } })).json()) as { history: unknown[] };
  const form = new URLSearchParams({ based_on: "1", intent: "save", "a.sector": "pharma" });
  const res = await post(cookie, A, form.toString(), "application/x-www-form-urlencoded");
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/factory?stale=1");
  const after = (await (await fetch(`${app.base}/api/companies/${A}/factory`, { headers: { cookie } })).json()) as { history: unknown[] };
  assert.equal(after.history.length, before.history.length, "nothing was written");
  const json = await post(cookie, A, JSON.stringify({ basedOn: 1, answers: { sector: "pharma" } }), "application/json");
  assert.equal(json.status, 409);
});

test("one owner cannot write to another company, and the refusal reveals nothing", async () => {
  const cookie = await signIn("owner-b@synthetic.invalid");
  const attempt = await post(cookie, A, JSON.stringify({ basedOn: 0, answers: { sector: "pharma" } }), "application/json");
  assert.equal(attempt.status, 404);
  const missing = await post(cookie, "company-that-does-not-exist", JSON.stringify({ basedOn: 0, answers: { sector: "pharma" } }), "application/json");
  assert.equal(await attempt.text(), await missing.text());
  const a = await signIn("owner-a@synthetic.invalid");
  const history = (await (await fetch(`${app.base}/api/companies/${A}/factory`, { headers: { cookie: a } })).json()) as { latest: { answers: { sector: string } } };
  assert.equal(history.latest.answers.sector, "textiles_garments", "company A's description is unchanged");
});

test("an operator cannot write a company's description either", async () => {
  const cookie = await signIn("operator@synthetic.invalid");
  const res = await post(cookie, A, JSON.stringify({ basedOn: 0, answers: { sector: "pharma" } }), "application/json");
  assert.equal(res.status, 404);
});

test("a write another website started is refused before anything is read, and a plain-text body is refused with 415", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const cross = await post(cookie, A, JSON.stringify({ basedOn: 2, answers: { sector: "pharma" } }), "application/json", { origin: "https://evil.example" });
  assert.equal(cross.status, 403);
  const plain = await post(cookie, A, "sector=pharma", "text/plain");
  assert.equal(plain.status, 415);
});

test("Describe pages and API answers carry the security headers", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const responses = [
    await fetch(`${app.base}/factory`, { headers: { cookie } }),
    await fetch(`${app.base}/factory`),
    await fetch(`${app.base}/api/companies/${A}/factory`, { headers: { cookie } }),
    await fetch(`${app.base}/api/companies/${B}/factory`, { headers: { cookie } }),
    await post(cookie, A, "{}", "application/json", { origin: "https://evil.example" }),
  ];
  for (const res of responses) {
    assert.equal(res.headers.get("x-frame-options"), "DENY", res.url);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff", res.url);
    assert.match(res.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/, res.url);
  }
});

test("the health check still reports both append-only guards in place", async () => {
  assert.deepEqual(await (await fetch(`${app.base}/api/health`)).json(), { status: "ok", database: "ok", auditGuard: "ok" });
});
