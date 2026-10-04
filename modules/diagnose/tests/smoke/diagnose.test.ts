// The Diagnose step on the built application, over HTTP. Needs `pnpm build` first.
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
const page = async (cookie: string | undefined, path = "/diagnose") => withoutMarkers(await (await fetch(`${app.base}${path}`, { headers: cookie ? { cookie } : {} })).text());
const send = (cookie: string, path: string, body: unknown, extra: Record<string, string> = {}) =>
  fetch(`${app.base}${path}`, { method: "POST", redirect: "manual", headers: { cookie, origin: app.base, "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
const form = (cookie: string, path: string, fields: Record<string, string> = {}) =>
  fetch(`${app.base}${path}`, { method: "POST", redirect: "manual", headers: { cookie, origin: app.base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });

type Detail = { id: string; result: { items: { opportunityId: string; title: string; kind: string }[] }; standing: unknown[]; signoff: { digestMatches: boolean } | null };

test("before anything is made, an owner with a confirmed description sees the button and no assessments; one without sees why not", async () => {
  const a = await page(await signIn("owner-a@synthetic.invalid"));
  assert.match(a, /What to do about it/);
  assert.match(a, /Your confirmed description is version 1/);
  assert.match(a, /Make an assessment from version 1/);
  assert.match(a, /None yet/);
  assert.match(a, /SYNTHETIC/);
  const b = await page(await signIn("owner-b@synthetic.invalid"));
  assert.match(b, /You have not confirmed one yet/);
  assert.ok(!b.includes("Make an assessment from"));
});

test("a visitor who is not signed in is asked to sign in, and the operator is told the page is for owners", async () => {
  assert.match(await page(undefined), /href="\/sign-in"/);
  const operator = await page(await signIn("operator@synthetic.invalid"));
  assert.match(operator, /for the owner of a company/);
  assert.ok(!operator.includes("Make an assessment"));
});

test("the form posts to make an assessment, and the page shows it ranked, labelled, with costs in rupees and a statement of what drafted it", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const res = await form(cookie, `/api/companies/${A}/assessments`);
  assert.equal(res.status, 303);
  const where = res.headers.get("location")!;
  assert.match(where, /^\/diagnose\?a=[0-9a-f-]{36}$/);
  const html = await page(cookie, where);
  assert.match(html, /Assessment from version 1 of your description/);
  assert.match(html, /not by an AI model/);
  assert.match(html, /Keep every job on a simple shared log/);
  assert.match(html, /No AI needed/);
  assert.match(html, /Uses AI/);
  assert.match(html, /₹2,00,000 to ₹10,00,000/, "Indian digit grouping");
  assert.match(html, /SYNTHETIC placeholder, not an estimate/);
  assert.match(html, /0 of 5 ideas decided/);
  assert.match(html, /<button type="submit" disabled="">Sign off this assessment/, "sign-off is disabled while ideas are undecided");
  assert.match(html, /Ideas left out \(2\)/);
  assert.ok(!html.includes(B));
});

test("the API lists, reads and refuses across companies with the same 404 as a missing record", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const made = await (await send(a, `/api/companies/${A}/assessments`, {})).json() as { id: string; created: boolean };
  assert.equal(made.created, false, "the form post above already made it: the same inputs give the same assessment");
  const list = (await (await fetch(`${app.base}/api/companies/${A}/assessments`, { headers: { cookie: a } })).json()) as { assessments: { id: string }[] };
  assert.equal(list.assessments.length, 1);
  const detail = (await (await fetch(`${app.base}/api/companies/${A}/assessments/${made.id}`, { headers: { cookie: a } })).json()) as Detail;
  assert.equal(detail.id, made.id);
  assert.equal(detail.result.items[0].opportunityId, "digital_job_log");

  const b = await signIn("owner-b@synthetic.invalid");
  const refused = [
    await fetch(`${app.base}/api/companies/${A}/assessments`, { headers: { cookie: b } }),
    await fetch(`${app.base}/api/companies/${A}/assessments/${made.id}`, { headers: { cookie: b } }),
    await fetch(`${app.base}/api/companies/${B}/assessments/${made.id}`, { headers: { cookie: b } }),
    await send(b, `/api/companies/${A}/assessments`, {}),
    await send(b, `/api/companies/${B}/assessments/${made.id}/decisions`, { opportunityId: "digital_job_log", decision: "reject" }),
  ];
  const missing = await fetch(`${app.base}/api/companies/${B}/assessments/no-such`, { headers: { cookie: b } });
  for (const r of refused) {
    assert.equal(r.status, 404);
    assert.equal(await r.text(), await missing.clone().text());
  }
  assert.equal((await fetch(`${app.base}/api/companies/${A}/assessments`)).status, 401);
  assert.equal((await send(b, `/api/companies/${B}/assessments`, {})).status, 409, "B has no confirmed description");
  assert.ok(!(await page(b, `/diagnose?a=${made.id}`)).includes("Keep every job"), "B's page does not show A's assessment, even when named");
});

test("deciding on every idea and signing off over HTTP fixes the assessment, and the page says so with a matching fingerprint", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const { id } = (await (await send(cookie, `/api/companies/${A}/assessments`, {})).json()) as { id: string };
  const detail = (await (await fetch(`${app.base}/api/companies/${A}/assessments/${id}`, { headers: { cookie } })).json()) as Detail;
  assert.equal((await send(cookie, `/api/companies/${A}/assessments/${id}/signoff`, {})).status, 409, "undecided");
  for (const item of detail.result.items) assert.equal((await send(cookie, `/api/companies/${A}/assessments/${id}/decisions`, { opportunityId: item.opportunityId, decision: item.kind === "ai" ? "defer" : "accept" })).status, 201);
  const mid = await page(cookie, `/diagnose?a=${id}`);
  assert.match(mid, /5 of 5 ideas decided/);
  assert.ok(!/<button type="submit" disabled="">Sign off/.test(mid), "the sign-off button is enabled once every idea is decided");

  const signed = await form(cookie, `/api/companies/${A}/assessments/${id}/signoff`, { note: "Read it." });
  assert.equal(signed.status, 303);
  assert.equal(signed.headers.get("location"), `/diagnose?a=${id}&signed=1`);
  const html = await page(cookie, signed.headers.get("location")!);
  assert.match(html, /Signed off. This assessment is now fixed/);
  assert.match(html, /checked just now: it matches/);
  assert.ok(!html.includes("Save decision on"), "no decision forms after sign-off");
  assert.equal((await send(cookie, `/api/companies/${A}/assessments/${id}/decisions`, { opportunityId: detail.result.items[0].opportunityId, decision: "reject" })).status, 409);
  const after = (await (await fetch(`${app.base}/api/companies/${A}/assessments/${id}`, { headers: { cookie } })).json()) as Detail;
  assert.equal(after.signoff?.digestMatches, true);
});

test("writes another website started are refused, and a plain-text post is refused with 415", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const evil = { origin: "https://evil.example" };
  assert.equal((await send(cookie, `/api/companies/${A}/assessments`, {}, evil)).status, 403);
  assert.equal((await send(cookie, `/api/companies/${A}/assessments/x/decisions`, {}, evil)).status, 403);
  assert.equal((await send(cookie, `/api/companies/${A}/assessments/x/signoff`, {}, evil)).status, 403);
  const plain = await fetch(`${app.base}/api/companies/${A}/assessments`, { method: "POST", headers: { cookie, origin: app.base, "content-type": "text/plain" }, body: "x" });
  assert.equal(plain.status, 415);
});

test("Diagnose pages and API answers carry the security headers, and the health check sees every guard", async () => {
  const cookie = await signIn("owner-a@synthetic.invalid");
  const responses = [
    await fetch(`${app.base}/diagnose`, { headers: { cookie } }),
    await fetch(`${app.base}/diagnose`),
    await fetch(`${app.base}/api/companies/${A}/assessments`, { headers: { cookie } }),
    await fetch(`${app.base}/api/companies/${B}/assessments/x`, { headers: { cookie } }),
    await send(cookie, `/api/companies/${A}/assessments`, {}, { origin: "https://evil.example" }),
  ];
  for (const res of responses) {
    assert.equal(res.headers.get("x-frame-options"), "DENY", res.url);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff", res.url);
  }
  assert.deepEqual(await (await fetch(`${app.base}/api/health`)).json(), { status: "ok", database: "ok", auditGuard: "ok" });
});
