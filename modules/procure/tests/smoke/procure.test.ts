// Requirements, providers and the listing fee on the built application, over HTTP. Needs `pnpm build` first. The tests run in
// order against one database: the later ones use what the earlier ones made.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startBuiltApp } from "../../../platform/tests/support/worker.ts";
import type { RunningWorker } from "../../../platform/tests/support/worker.ts";

const A = "company-synthetic-a";
const B = "company-synthetic-b";
const KIND = "digital_job_log";
const CLUSTER = "synthetic-cluster-1";
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
const page = async (cookie: string | undefined, path: string) => withoutMarkers(await (await fetch(`${app.base}${path}`, { headers: cookie ? { cookie } : {} })).text());
const send = (cookie: string, path: string, body: unknown) => fetch(`${app.base}${path}`, { method: "POST", redirect: "manual", headers: { cookie, origin: app.base, "content-type": "application/json" }, body: JSON.stringify(body) });
const form = (cookie: string, path: string, fields: [string, string][] = []) =>
  fetch(`${app.base}${path}`, { method: "POST", redirect: "manual", headers: { cookie, origin: app.base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });
const getJson = async (cookie: string | undefined, path: string) => (await fetch(`${app.base}${path}`, { headers: cookie ? { cookie } : {} })).json();

test("before anything is signed off the owner is told what is needed; the operator page and the owner page each say who they are for", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const html = await page(a, "/procure");
  assert.match(html, /What you need/);
  assert.match(html, /You have not signed one off yet/);
  assert.match(html, /No quote, price, contract or payment exists here/);
  assert.match(html, /None yet/);
  const operator = await signIn("operator@synthetic.invalid");
  assert.match(await page(operator, "/procure"), /for the owner of a company/);
  assert.match(await page(a, "/operator"), /for a platform operator/);
  assert.match(await page(undefined, "/procure"), /href="\/sign-in"/);
  assert.match(await page(undefined, "/operator"), /href="\/sign-in"/);
  const home = await page(a, "/");
  assert.match(home, /href="\/procure"/);
  assert.ok(!home.includes('href="/operator"'));
  assert.match(await page(operator, "/"), /href="\/operator"/);
});

test("the operator sees that no fee is set, and nothing can be listed until it is", async () => {
  const op = await signIn("operator@synthetic.invalid");
  const html = await page(op, "/operator");
  assert.match(html, /The fee has not been decided \(OQ-11\), so no provider can be listed/);
  assert.match(html, /No pool has reached five companies/);
  const added = await form(op, "/api/operator/providers", [["name", "Alpha Works"], ["summary", "SYNTHETIC test provider"], ["opportunity", KIND], ["cluster", CLUSTER], ["cluster", "synthetic-cluster-2"]]);
  assert.equal(added.status, 303);
  assert.match(added.headers.get("location")!, /^\/operator\?made=[0-9a-f-]{36}$/);
  const listing = (await getJson(op, "/api/operator/providers")) as { providers: { id: string; services: unknown[]; listed: boolean }[]; terms: unknown };
  assert.equal(listing.terms, null);
  assert.equal(listing.providers[0].services.length, 2, "one idea in two clusters");
  const refused = await form(op, `/api/operator/providers/${listing.providers[0].id}/list`);
  assert.equal(refused.status, 303);
  assert.equal(refused.headers.get("location"), "/operator?problem=fee_undecided");
  assert.match(await page(op, "/operator?problem=fee_undecided"), /No listing fee has been set/);
});

test("an owner signs off an assessment, accepts an idea, and makes a requirement; the page says the pool is too small to show a number", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const made = await form(a, `/api/companies/${A}/assessments`);
  assert.equal(made.status, 303);
  const detail = (await getJson(a, `/api/companies/${A}/assessments/${new URL(made.headers.get("location")!, app.base).searchParams.get("a")}`)) as { id: string; result: { items: { opportunityId: string }[] } };
  for (const item of detail.result.items) assert.equal((await form(a, `/api/companies/${A}/assessments/${detail.id}/decisions`, [["opportunity", item.opportunityId], ["decision", "accept"]])).status, 303);
  assert.equal((await form(a, `/api/companies/${A}/assessments/${detail.id}/signoff`)).status, 303);

  const html = await page(a, "/procure");
  assert.match(html, /Ideas you accepted/);
  assert.match(html, /Keep every job on a simple shared log/);
  assert.match(html, /Make a requirement from Keep every job on a simple shared log/);
  assert.match(html, /SYNTHETIC cluster 1/);

  const noCluster = await form(a, `/api/companies/${A}/requirements`, [["assessment", detail.id], ["opportunity", KIND]]);
  assert.equal(noCluster.status, 303);
  assert.equal(noCluster.headers.get("location"), "/procure?problem=request");
  const res = await form(a, `/api/companies/${A}/requirements`, [["assessment", detail.id], ["opportunity", KIND], ["cluster", CLUSTER]]);
  assert.equal(res.status, 303);
  assert.match(res.headers.get("location")!, /^\/procure\?made=[0-9a-f-]{36}$/);

  const after = await page(a, res.headers.get("location")!);
  assert.match(after, /Your requirement was recorded/);
  assert.match(after, /Requirement recorded<\/strong> for SYNTHETIC cluster 1/);
  assert.match(after, /Fewer than 5 companies have asked for this in your cluster, so the number is not shown to anyone/);
  assert.ok(!/companies in this cluster have asked for the same thing/.test(after), "no count is shown");
  assert.match(after, /No provider is listed for this in your cluster yet/);
  assert.match(after, /APLYD&#x27;s earnings do not depend on which one you choose|APLYD's earnings do not depend on which one you choose/);
  const list = (await getJson(a, `/api/companies/${A}/requirements`)) as { requirements: { pool: unknown; opportunityId: string }[] };
  assert.equal(list.requirements.length, 1);
  assert.deepEqual(list.requirements[0].pool, { shown: false, floor: 5 });
});

test("the operator sets the fee and lists the provider; the owner then sees it for the idea and cluster it serves, and the operator page shows the fee it was listed at", async () => {
  const op = await signIn("operator@synthetic.invalid");
  const bad = await form(op, "/api/operator/listing-terms", [["feeInr", "free"]]);
  assert.equal(bad.headers.get("location"), "/operator?problem=fee");
  const set = await form(op, "/api/operator/listing-terms", [["feeInr", "1,234".replace(",", "")], ["note", "SYNTHETIC test value, not a proposal"]]);
  assert.equal(set.status, 303);
  assert.equal(set.headers.get("location"), "/operator?fee=1");
  assert.match(await page(op, "/operator?fee=1"), /In force: <strong>₹1,234<\/strong>/);
  const providers = ((await getJson(op, "/api/operator/providers")) as { providers: { id: string }[] }).providers;
  const listed = await form(op, `/api/operator/providers/${providers[0].id}/list`);
  assert.equal(listed.headers.get("location"), "/operator?listed=1");
  const html = await page(op, "/operator?listed=1");
  assert.match(html, /The provider is listed, at the fee in force/);
  assert.match(html, /Fee ₹1,234/);
  assert.match(html, /Unlist Alpha Works/);

  const a = await signIn("owner-a@synthetic.invalid");
  const owner = await page(a, "/procure");
  assert.match(owner, /Alpha Works/);
  assert.match(owner, /SYNTHETIC test provider/);
  assert.ok(!owner.includes("1,234") && !owner.includes("Fee ₹"), "an owner is not shown the fee a provider pays");
  const publicList = (await getJson(a, "/api/providers")) as { providers: Record<string, unknown>[] };
  assert.equal(publicList.providers.length, 1);
  assert.ok(!JSON.stringify(publicList).includes("1234") && !("listedFeeInr" in publicList.providers[0]), "the public list carries no fee");
});

test("across companies and roles: another owner and the operator get the same 404 as a missing record; an owner cannot use the operator's endpoints", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const b = await signIn("owner-b@synthetic.invalid");
  const op = await signIn("operator@synthetic.invalid");
  const mine = ((await getJson(a, `/api/companies/${A}/requirements`)) as { requirements: { id: string }[] }).requirements[0];
  const missing = await fetch(`${app.base}/api/companies/${B}/requirements/none/withdraw`, { method: "POST", headers: { cookie: b, origin: app.base, "content-type": "application/json" }, body: "{}" });
  assert.equal(missing.status, 404);
  const missingText = await missing.text();
  const refused = [
    await fetch(`${app.base}/api/companies/${A}/requirements`, { headers: { cookie: b } }),
    await fetch(`${app.base}/api/companies/${A}/requirements`, { headers: { cookie: op } }),
    await send(b, `/api/companies/${A}/requirements/${mine.id}/withdraw`, {}),
    await send(op, `/api/companies/${A}/requirements`, { assessmentId: "x", opportunityId: KIND, cluster: CLUSTER }),
  ];
  for (const r of refused) {
    assert.equal(r.status, 404);
    assert.equal(await r.text(), missingText);
  }
  assert.deepEqual(await getJson(b, `/api/companies/${B}/requirements`), { requirements: [] }, "B's own list holds nothing of A's");
  assert.ok(!(await page(b, "/procure")).includes("Alpha Works"), "B has no requirement, so B is shown no provider");

  assert.equal((await send(a, "/api/operator/listing-terms", { feeInr: 1 })).status, 403);
  assert.equal((await fetch(`${app.base}/api/operator/pools`, { headers: { cookie: a } })).status, 403);
  assert.equal((await fetch(`${app.base}/api/operator/providers`)).status, 401);
  assert.equal((await fetch(`${app.base}/api/providers`)).status, 401);
});

test("withdrawing a requirement takes it out of the page's open list and leaves it on record", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const mine = ((await getJson(a, `/api/companies/${A}/requirements`)) as { requirements: { id: string }[] }).requirements[0];
  const res = await form(a, `/api/companies/${A}/requirements/${mine.id}/withdraw`, [["note", "not now"]]);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/procure?withdrawn=1");
  const html = await page(a, "/procure?withdrawn=1");
  assert.match(html, /Your requirement was withdrawn/);
  assert.match(html, /Withdrawn on \d{4}-\d{2}-\d{2}\. It no longer counts in any pool/);
  assert.ok(!html.includes("Withdraw Keep every job"), "no withdraw button on a withdrawn requirement");
  const again = await form(a, `/api/companies/${A}/requirements/${mine.id}/withdraw`);
  assert.equal(again.headers.get("location"), "/procure?problem=withdrawn");
  const list = (await getJson(a, `/api/companies/${A}/requirements`)) as { requirements: { withdrawnAt: string | null; pool: unknown; providers: unknown[] }[] };
  assert.ok(list.requirements[0].withdrawnAt);
  assert.equal(list.requirements[0].pool, null);
  assert.deepEqual(list.requirements[0].providers, []);
});
