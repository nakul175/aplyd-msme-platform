// The demonstration, added by the launcher to the built application and read back over HTTP: what it holds, that the floor of five behaves as the
// script says, that the company the presenter walks is untouched, that the fee reaches no owner, and that the script page exists only in demonstration
// mode. Needs `pnpm build` first.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { AUTH, PASSWORD, launchServe, stopAllLaunched } from "../../../hosting/tests/support/launcher.ts";
import type { Launched } from "../../../hosting/tests/support/launcher.ts";
import { DEMO_COMPANIES, DEMO_PROVIDERS, FIRST_CLUSTER, FIRST_IDEA, PLACEHOLDER_FEE_INR, SECOND_CLUSTER, SECOND_IDEA } from "../../src/cast.ts";
import { Session } from "../../src/client.ts";

let demo: Launched;
let plain: Launched;
before(async () => {
  demo = await launchServe({ DEMO_USER: "demo", DEMO_PASSWORD: PASSWORD, APLYD_DEMO: "true" });
  plain = await launchServe({ DEMO_USER: "demo", DEMO_PASSWORD: PASSWORD });
});
after(stopAllLaunched);

/** The application behind the gate: the launcher's own address, with the gate's password on every request, as a browser given the password would send it. */
const direct = (base: string) => (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), authorization: AUTH } });

/** A session through the gate, for a person of the cast. */
async function signIn(base: string, email: string) {
  const res = await fetch(`${base}/api/session`, { method: "POST", headers: { authorization: AUTH, "content-type": "application/json", origin: base }, body: JSON.stringify({ email }) });
  assert.equal(res.status, 200, `sign-in as ${email}`);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  const get = async (path: string) => {
    const r = await fetch(`${base}${path}`, { headers: { authorization: AUTH, cookie } });
    return { status: r.status, text: await r.text() };
  };
  const post = async (path: string, body: unknown) => {
    const r = await fetch(`${base}${path}`, { method: "POST", headers: { authorization: AUTH, cookie, origin: base, "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  };
  return { get, post, json: async (path: string) => JSON.parse((await get(path)).text) };
}

test("the launcher reports what it added, and every person of the cast can sign in", () => {
  assert.match(demo.output(), /The demonstration was added: 5 companies, 3 providers, \d+ requests\./);
  assert.ok(!/The demonstration was added/.test(plain.output()), "a launcher without APLYD_DEMO adds nothing");
});

test("the people the sign-in page lists include every owner of the cast, marked SYNTHETIC", async () => {
  const html = await (await direct(demo.base)("/sign-in")).text();
  for (const c of DEMO_COMPANIES) assert.ok(html.includes(c.ownerName), c.ownerName);
  const plainHtml = await (await direct(plain.base)("/sign-in")).text();
  for (const c of DEMO_COMPANIES) assert.ok(!plainHtml.includes(c.ownerName), `${c.ownerName} is on the plain launcher's sign-in page`);
});

test("the operator sees one fee, three listed providers and the pool that has reached five, and not the pool that has not", async () => {
  const op = await signIn(demo.base, "operator@synthetic.invalid");
  const providers = await op.json("/api/operator/providers");
  assert.equal(providers.providers.length, 3);
  assert.deepEqual(providers.providers.map((p: any) => p.name).sort(), DEMO_PROVIDERS.map((p) => p.name).sort());
  assert.ok(providers.providers.every((p: any) => p.listed === true));
  assert.equal(providers.terms.feeInr, PLACEHOLDER_FEE_INR);
  const fees = new Set(providers.providers.map((p: any) => p.listedFeeInr));
  assert.deepEqual([...fees], [PLACEHOLDER_FEE_INR], "one fee for every provider (D-03)");
  const { pools } = await op.json("/api/operator/pools");
  assert.ok(pools.some((p: any) => p.cluster === FIRST_CLUSTER && p.opportunityId === FIRST_IDEA && p.companies >= 5));
  assert.ok(!pools.some((p: any) => p.cluster === SECOND_CLUSTER && p.opportunityId === SECOND_IDEA));
});

test("the finished example has a running engagement: starting number, one milestone accepted and paid, one delivered and waiting", async () => {
  const c = DEMO_COMPANIES.find((x) => x.stage === "running")!;
  const owner = await signIn(demo.base, c.ownerEmail);
  const { engagements } = await owner.json(`/api/companies/${c.id}/engagements`);
  assert.equal(engagements.length, 1);
  const e = engagements[0];
  assert.equal(e.milestones.length, 2);
  assert.ok(e.planAgreedAt);
  assert.deepEqual(e.milestones.map((m: any) => m.state), ["paid", "delivered"]);
  assert.equal(e.paidTotalInr, 125000);
  const outcomes = await owner.json(`/api/companies/${c.id}/engagements/${e.id}/outcomes`);
  assert.equal(outcomes.baseline.value, 42);
  assert.equal(outcomes.reviews.length, 3);
  assert.ok(outcomes.reviews.every((r: any) => r.record === null), "no review is recorded: they open on their dates");
});

test("every other company stands at the stage the cast says", async () => {
  for (const c of DEMO_COMPANIES.filter((x) => x.stage !== "running")) {
    const owner = await signIn(demo.base, c.ownerEmail);
    const { requirements } = await owner.json(`/api/companies/${c.id}/requirements`);
    assert.equal(requirements.length, c.asksSecond ? 2 : 1, `${c.name}'s requirements`);
    const { engagements } = await owner.json(`/api/companies/${c.id}/engagements`);
    if (c.stage === "requirements") assert.equal(engagements.length, 0, `${c.name} has chosen no one`);
    if (c.stage === "provider_chosen") assert.deepEqual(engagements.map((e: any) => [e.milestones.length, e.planAgreedAt]), [[0, null]], `${c.name} chose a provider and wrote no plan`);
    if (c.stage === "plan_agreed") assert.deepEqual(engagements.map((e: any) => [e.milestones.length, e.planAgreedAt !== null]), [[1, true]], `${c.name} agreed a one-milestone plan`);
  }
});

test("Company A, whom the presenter walks, has its confirmed description and nothing else; Company B has nothing", async () => {
  const a = await signIn(demo.base, "owner-a@synthetic.invalid");
  const factory = await a.json("/api/companies/company-synthetic-a/factory");
  assert.equal(factory.latest.revision, 1);
  assert.equal((await a.json("/api/companies/company-synthetic-a/assessments")).assessments.length, 0);
  assert.equal((await a.json("/api/companies/company-synthetic-a/requirements")).requirements.length, 0);
  assert.equal((await a.json("/api/companies/company-synthetic-a/engagements")).engagements.length, 0);
  const b = await signIn(demo.base, "owner-b@synthetic.invalid");
  assert.equal((await b.json("/api/companies/company-synthetic-b/assessments")).assessments.length, 0);
  assert.equal((await b.json("/api/companies/company-synthetic-b/requirements")).requirements.length, 0);
});

test("the seeder's own client has no way through the gate: it runs inside the launcher, beside the application, not through the public address", async () => {
  await assert.rejects(() => Session.signIn(demo.base, "owner-a@synthetic.invalid"), /answered 401/);
});

test("when the presenter walks Company A, the first pool says at least 5 and the second says nothing, as the script says", async () => {
  const owner = await signIn(demo.base, "owner-a@synthetic.invalid");
  const made = await owner.post("/api/companies/company-synthetic-a/assessments", {});
  assert.equal(made.status, 201);
  const aid = made.body.id as string;
  const assessment = await owner.json(`/api/companies/company-synthetic-a/assessments/${aid}`);
  for (const item of assessment.result.items) assert.equal((await owner.post(`/api/companies/company-synthetic-a/assessments/${aid}/decisions`, { opportunityId: item.opportunityId, decision: "accept", note: "" })).status, 201);
  assert.equal((await owner.post(`/api/companies/company-synthetic-a/assessments/${aid}/signoff`, { note: "" })).status, 201);
  assert.equal((await owner.post("/api/companies/company-synthetic-a/requirements", { assessmentId: aid, opportunityId: FIRST_IDEA, cluster: FIRST_CLUSTER })).status, 201);
  assert.equal((await owner.post("/api/companies/company-synthetic-a/requirements", { assessmentId: aid, opportunityId: SECOND_IDEA, cluster: SECOND_CLUSTER })).status, 201);
  const { requirements } = await owner.json("/api/companies/company-synthetic-a/requirements");
  const first = requirements.find((r: any) => r.opportunityId === FIRST_IDEA);
  const second = requirements.find((r: any) => r.opportunityId === SECOND_IDEA);
  assert.deepEqual(first.pool, { shown: true, atLeast: 5 });
  assert.deepEqual(second.pool, { shown: false, floor: 5 });
  const names = (r: any) => r.providers.map((p: any) => p.name).sort();
  assert.deepEqual(names(first), ["SYNTHETIC Provider 1", "SYNTHETIC Provider 2"]);
  assert.deepEqual(names(second), ["SYNTHETIC Provider 1", "SYNTHETIC Provider 3"]);
});

test("the listing fee is on no page or answer an owner can read (D-03)", async () => {
  const owner = await signIn(demo.base, "owner-b@synthetic.invalid");
  for (const path of ["/", "/factory", "/diagnose", "/procure", "/deliver", "/run", "/demo", "/api/providers"]) {
    const { text } = await owner.get(path);
    assert.ok(!/1,500|\b1500\b/.test(text), `${path} shows the fee`);
  }
});

test("the script page exists only in demonstration mode, and says it is synthetic", async () => {
  const page = await direct(demo.base)("/demo");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /SYNTHETIC/);
  assert.match(html, /What this does not show/);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) assert.ok(html.includes(`data-testid="step-${n}"`), `step ${n}`);
  assert.equal((await direct(plain.base)("/demo")).status, 404);
});
