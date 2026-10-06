// Delivery on the built application, over HTTP. Needs `pnpm build` first. The tests run in order against one database: the later
// ones use what the earlier ones made.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startBuiltApp } from "../../../platform/tests/support/worker.ts";
import type { RunningWorker } from "../../../platform/tests/support/worker.ts";

const A = "company-synthetic-a";
const B = "company-synthetic-b";
const KIND = "digital_job_log";
const CLUSTER = "synthetic-cluster-1";
const FEE = 1234;
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

type View = { id: string; status: string; providerName: string; agreedTotalInr: number; paidTotalInr: number; milestones: { id: string; seq: number; state: string; next: string[]; paidInr: number | null }[] };
const engagements = async (cookie: string) => ((await getJson(cookie, `/api/companies/${A}/engagements`)) as { engagements: View[] }).engagements;

let providerId = "";
let requirementId = "";
let engagementId = "";
let assessmentId = "";
let secondIdea = "";

test("an owner who has no engagement is told where one starts; the page says who it is for; the home page links to it for an owner only", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const html = await page(a, "/deliver");
  assert.match(html, /Delivery/);
  assert.match(html, /No engagement yet/);
  assert.match(html, /does not contact the provider, hold money or move any/);
  assert.match(html, /The provider does not use this service/);
  const operator = await signIn("operator@synthetic.invalid");
  assert.match(await page(operator, "/deliver"), /for the owner of a company/);
  assert.match(await page(undefined, "/deliver"), /href="\/sign-in"/);
  assert.match(await page(a, "/"), /href="\/deliver"/);
  assert.ok(!(await page(operator, "/")).includes('href="/deliver"'));
});

test("set-up: the operator sets a fee and lists a provider; an owner signs off an assessment and makes a requirement; the page offers that provider", async () => {
  const op = await signIn("operator@synthetic.invalid");
  assert.equal((await form(op, "/api/operator/listing-terms", [["feeInr", String(FEE)], ["note", "SYNTHETIC test value, not a proposal"]])).status, 303);
  assert.equal((await form(op, "/api/operator/providers", [["name", "Alpha Works"], ["summary", "SYNTHETIC test provider"], ["opportunity", KIND], ["cluster", CLUSTER]])).status, 303);
  providerId = ((await getJson(op, "/api/operator/providers")) as { providers: { id: string }[] }).providers[0].id;
  assert.equal((await form(op, `/api/operator/providers/${providerId}/list`)).headers.get("location"), "/operator?listed=1");

  const a = await signIn("owner-a@synthetic.invalid");
  const made = await form(a, `/api/companies/${A}/assessments`);
  const assessment = new URL(made.headers.get("location")!, app.base).searchParams.get("a");
  const detail = (await getJson(a, `/api/companies/${A}/assessments/${assessment}`)) as { id: string; result: { items: { opportunityId: string }[] } };
  assessmentId = detail.id;
  secondIdea = detail.result.items.find((i) => i.opportunityId !== KIND)!.opportunityId;
  for (const item of detail.result.items) await form(a, `/api/companies/${A}/assessments/${detail.id}/decisions`, [["opportunity", item.opportunityId], ["decision", "accept"]]);
  assert.equal((await form(a, `/api/companies/${A}/assessments/${detail.id}/signoff`)).status, 303);
  assert.equal((await form(a, `/api/companies/${A}/requirements`, [["assessment", detail.id], ["opportunity", KIND], ["cluster", CLUSTER]])).status, 303);
  requirementId = ((await getJson(a, `/api/companies/${A}/requirements`)) as { requirements: { id: string }[] }).requirements[0].id;

  const html = await page(a, "/procure");
  assert.match(html, /Which provider do you want to work with\?/);
  assert.match(html, /<option value="[0-9a-f-]{36}">Alpha Works<\/option>/);
  assert.match(html, /It does not contact the provider, agree a price or move any money/);
});

test("choosing a provider opens an engagement; choosing it again changes nothing; a requirement with a provider chosen cannot be withdrawn", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const bad = await form(a, `/api/companies/${A}/requirements/${requirementId}/engagement`);
  assert.equal(bad.headers.get("location"), "/procure?problem=engage");
  assert.match(await page(a, "/procure?problem=engage"), /Choose a provider from the list/);
  const gone = await form(a, `/api/companies/${A}/requirements/${requirementId}/engagement`, [["provider", "no-such-provider"]]);
  assert.equal(gone.headers.get("location"), "/procure?problem=provider_unavailable");
  assert.match(await page(a, "/procure?problem=provider_unavailable"), /no longer listed for this requirement/);
  const missing = await form(a, `/api/companies/${A}/requirements/no-such-requirement/engagement`, [["provider", providerId]]);
  assert.equal(missing.headers.get("location"), "/procure?problem=missing");

  const made = await form(a, `/api/companies/${A}/requirements/${requirementId}/engagement`, [["provider", providerId]]);
  assert.equal(made.status, 303);
  assert.equal(made.headers.get("location"), "/deliver?made=1");
  const again = await form(a, `/api/companies/${A}/requirements/${requirementId}/engagement`, [["provider", providerId]]);
  assert.equal(again.headers.get("location"), "/deliver?made=1");
  const list = await engagements(a);
  assert.equal(list.length, 1, "choosing again made no second engagement");
  engagementId = list[0].id;

  const html = await page(a, "/deliver?made=1");
  assert.match(html, /You chose a provider\. Write the plan below\./);
  assert.match(html, /Keep every job on a simple shared log/);
  assert.match(html, /Provider: <strong>Alpha Works<\/strong>/);
  assert.match(html, /Planning/);
  assert.match(html, /None yet\. A plan is a list of parts/);
  assert.match(html, /Add a milestone/);
  assert.ok(!html.includes("Agree this plan"), "no plan to agree until a milestone is added");

  const procure = await page(a, "/procure");
  assert.match(procure, /You chose Alpha Works\./);
  assert.ok(!procure.includes("Choose a provider for"), "no second choice is offered");
  assert.ok(!/Withdraw Keep every job/.test(procure), "no withdraw button once a provider is chosen");
  const withdraw = await form(a, `/api/companies/${A}/requirements/${requirementId}/withdraw`);
  assert.equal(withdraw.headers.get("location"), "/procure?problem=engaged");
  assert.match(await page(a, "/procure?problem=engaged"), /so it cannot be withdrawn/);
});

test("the plan: a bad milestone and an empty plan are sent back with a message; two milestones are added; the plan is agreed and then locked", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const add = (fields: [string, string][]) => form(a, `/api/companies/${A}/engagements/${engagementId}/milestones`, fields);
  const events = (fields: [string, string][]) => form(a, `/api/companies/${A}/engagements/${engagementId}/events`, fields);

  assert.equal((await events([["kind", "plan_agreed"]])).headers.get("location"), "/deliver?problem=no_milestones");
  assert.match(await page(a, "/deliver?problem=no_milestones"), /Add at least one milestone before you agree the plan/);
  const invalid = await add([["title", "First part"], ["test", "Check it"], ["due", "2026-02-30"], ["amount", "1000"]]);
  assert.equal(invalid.headers.get("location"), "/deliver?problem=invalid");
  assert.match(await page(a, "/deliver?problem=invalid"), /a date written YYYY-MM-DD/);

  assert.equal((await add([["title", "Job log set up on the shop floor"], ["test", "Ten real jobs entered and found again by a supervisor"], ["due", "2026-12-15"], ["amount", "125000"]])).headers.get("location"), "/deliver?saved=milestone");
  assert.equal((await add([["title", "Supervisors trained"], ["test", "Every supervisor enters a job unaided"], ["due", "2027-01-31"], ["amount", "80000"]])).headers.get("location"), "/deliver?saved=milestone");
  let html = await page(a, "/deliver?saved=milestone");
  assert.match(html, /The milestone was added to the plan/);
  assert.match(html, /1\. Job log set up on the shop floor/);
  assert.match(html, /2\. Supervisors trained/);
  assert.match(html, /Price ₹1,25,000/, "Indian digit grouping");
  assert.match(html, /Plan total ₹2,05,000/);
  assert.match(html, /How you will check it:<\/strong> Ten real jobs entered/);
  assert.match(html, /What a good test looks like/, "the add form shows what a good test looks like");
  assert.match(html, /What is measured<\/dt><dd>the time from order to dispatch<\/dd><dt>The unit<\/dt><dd>days<\/dd><dt>What counts as done<\/dt>/);
  assert.ok(!html.includes('data-testid="test-flag-1"'), "a test with a number and a unit is not flagged");
  assert.ok(html.includes('data-testid="test-flag-2"'), "a test with no number is flagged");
  assert.match(html, /This test has no number, so someone else could not tell whether it was met\./, "flagged, and it was saved all the same");
  assert.match(html, /Agree this plan/);
  assert.ok(!html.includes("Record that milestone"), "nothing can be delivered before the plan is agreed");

  assert.equal((await events([["kind", "plan_agreed"]])).headers.get("location"), "/deliver?saved=plan_agreed");
  assert.equal((await events([["kind", "plan_agreed"]])).headers.get("location"), "/deliver?problem=already_agreed");
  assert.equal((await add([["title", "Late addition"], ["test", "Never"], ["due", "2027-02-01"], ["amount", "5"]])).headers.get("location"), "/deliver?problem=plan_locked");
  html = await page(a, "/deliver?saved=plan_agreed");
  assert.match(html, /You agreed the plan\. Nothing can be added to it now/);
  assert.match(html, /In progress/);
  assert.ok(!html.includes("Add a milestone") && !html.includes("Agree this plan"), "the plan form is gone once it is agreed");
  assert.match(html, /Record that milestone 1 was delivered/);
});

test("a milestone is delivered, accepted against the owner's test and paid; another is rejected, delivered again, accepted; the engagement is closed and is complete", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const [g] = await engagements(a);
  const [m1, m2] = g.milestones;
  const record = (fields: [string, string][]) => form(a, `/api/companies/${A}/engagements/${engagementId}/events`, fields);

  assert.equal((await record([["kind", "accepted"], ["milestone", m1.id]])).headers.get("location"), "/deliver?problem=wrong_state", "nothing is accepted before it is delivered");
  assert.equal((await record([["kind", "delivered"], ["milestone", m1.id], ["note", "Provider says it is live"]])).headers.get("location"), "/deliver?saved=delivered");
  let html = await page(a, "/deliver?saved=delivered");
  assert.match(html, /Recorded: delivered, as the provider told you/);
  assert.match(html, /Delivered, waiting for you/);
  assert.match(html, /Provider says it is live/);
  assert.match(html, /Accept milestone 1/);
  assert.match(html, /Reject milestone 1/);
  assert.match(html, /You have not recorded your starting number\. Once you accept a milestone, it can no longer be recorded\./, "beside Accept: accepting now ends the chance to record the starting number");
  assert.ok(html.includes(`href="/run#bl-${engagementId}"`), "with a link to the place on Results where it is recorded");
  assert.equal((await record([["kind", "delivered"], ["milestone", m1.id]])).headers.get("location"), "/deliver?problem=wrong_state", "delivered once");
  assert.equal((await record([["kind", "accepted"], ["milestone", m1.id], ["note", "All ten jobs found"]])).headers.get("location"), "/deliver?saved=accepted");
  assert.equal((await record([["kind", "payment_recorded"], ["milestone", m1.id], ["amount", "125000"], ["note", "Bank transfer"]])).headers.get("location"), "/deliver?saved=payment_recorded");
  assert.equal((await record([["kind", "payment_recorded"], ["milestone", m1.id], ["amount", "125000"]])).headers.get("location"), "/deliver?problem=wrong_state", "paid once");
  html = await page(a, "/deliver?saved=payment_recorded");
  assert.match(html, /Recorded: the payment you made outside this service/);
  assert.match(html, /you recorded a payment of ₹1,25,000/);
  assert.match(html, /Payments you have recorded: ₹1,25,000/);

  assert.equal((await record([["kind", "delivered"], ["milestone", m2.id]])).headers.get("location"), "/deliver?saved=delivered");
  html = await page(a, "/deliver?saved=delivered");
  assert.match(html, /Accept milestone 2/);
  assert.ok(!html.includes("You have not recorded your starting number"), "once a milestone is accepted the starting number is already out of reach, so there is nothing to warn about");
  assert.equal((await record([["kind", "rejected"], ["milestone", m2.id], ["note", "Two supervisors could not enter a job"]])).headers.get("location"), "/deliver?saved=rejected");
  html = await page(a, "/deliver?saved=rejected");
  assert.match(html, /Recorded: you rejected it\. It can be delivered again/);
  assert.match(html, /Record that milestone 2 was delivered/);
  assert.equal((await record([["kind", "delivered"], ["milestone", m2.id]])).headers.get("location"), "/deliver?saved=delivered");
  assert.equal((await record([["kind", "accepted"], ["milestone", m2.id]])).headers.get("location"), "/deliver?saved=accepted");

  assert.equal((await record([["kind", "closed"], ["note", "Finished"]])).headers.get("location"), "/deliver?saved=closed");
  html = await page(a, "/deliver?saved=closed");
  assert.match(html, /The engagement is closed\. Everything stays on record/);
  assert.match(html, /Complete/);
  assert.ok(!html.includes("Close this engagement") && !html.includes("Record a payment for milestone"), "nothing more can be recorded once it is closed");
  assert.equal((await record([["kind", "payment_recorded"], ["milestone", m2.id], ["amount", "80000"]])).headers.get("location"), "/deliver?problem=closed");
  assert.match(await page(a, "/deliver?problem=closed"), /This engagement is closed/);
  const [done] = await engagements(a);
  assert.equal(done.status, "complete");
  assert.equal(done.agreedTotalInr, 205000);
  assert.equal(done.paidTotalInr, 125000, "only what the owner recorded; an accepted milestone is not assumed paid");
});

test("another owner and the operator get the same 404 as a missing engagement, from the page's endpoints, and see none of it", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const b = await signIn("owner-b@synthetic.invalid");
  const op = await signIn("operator@synthetic.invalid");
  const [g] = await engagements(a);
  const missing = await fetch(`${app.base}/api/companies/${B}/engagements/none`, { headers: { cookie: b } });
  assert.equal(missing.status, 404);
  const missingText = await missing.text();
  const refused = [
    await fetch(`${app.base}/api/companies/${A}/engagements`, { headers: { cookie: b } }),
    await fetch(`${app.base}/api/companies/${A}/engagements/${g.id}`, { headers: { cookie: b } }),
    await fetch(`${app.base}/api/companies/${A}/engagements/${g.id}`, { headers: { cookie: op } }),
    await send(b, `/api/companies/${A}/engagements/${g.id}/events`, { kind: "closed" }),
    await send(b, `/api/companies/${A}/engagements/${g.id}/milestones`, { title: "x", acceptanceTest: "y", dueOn: "2027-01-01", agreedInr: 1 }),
    await send(op, `/api/companies/${A}/requirements/${requirementId}/engagement`, { providerId }),
  ];
  for (const r of refused) {
    assert.equal(r.status, 404);
    assert.equal(await r.text(), missingText);
  }
  assert.deepEqual(await getJson(b, `/api/companies/${B}/engagements`), { engagements: [] }, "B's own list holds nothing of A's");
  const html = await page(b, "/deliver");
  assert.match(html, /No engagement yet/);
  assert.ok(!html.includes("Alpha Works") && !html.includes("Job log set up"), "B is shown nothing of A's");
  assert.equal((await getJson(a, `/api/companies/${A}/engagements/${g.id}`) as View).status, "complete", "and A's engagement is unchanged");
});

test("D-03 at the page: nothing the owner sees on the delivery or requirement pages carries the listing fee, and the fee in force is still the one the operator set", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const op = await signIn("operator@synthetic.invalid");
  for (const path of ["/deliver", "/procure"]) {
    const html = await page(a, path);
    assert.ok(!html.includes("1,234") && !html.includes("1234"), `${path} shows no fee`);
  }
  const json = JSON.stringify(await getJson(a, `/api/companies/${A}/engagements`));
  assert.ok(!json.includes("1234") && !/fee/i.test(json), "the engagement endpoint carries no fee");
  assert.match(await page(op, "/operator"), /In force: <strong>₹1,234<\/strong>/);
});

test("at the delivery cap the page stops offering a delivery and says why: the milestone was rejected for the last time that can be recorded, and only closing the engagement is left", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const op = await signIn("operator@synthetic.invalid");
  assert.equal((await form(op, "/api/operator/providers", [["name", "Beta Works"], ["summary", "SYNTHETIC test provider"], ["opportunity", secondIdea], ["cluster", CLUSTER]])).status, 303);
  const beta = ((await getJson(op, "/api/operator/providers")) as { providers: { id: string; name: string }[] }).providers.find((p) => p.name === "Beta Works")!.id;
  assert.equal((await form(op, `/api/operator/providers/${beta}/list`)).headers.get("location"), "/operator?listed=1");
  assert.equal((await form(a, `/api/companies/${A}/requirements`, [["assessment", assessmentId], ["opportunity", secondIdea], ["cluster", CLUSTER]])).status, 303);
  const requirements = ((await getJson(a, `/api/companies/${A}/requirements`)) as { requirements: { id: string; opportunityId: string }[] }).requirements;
  const second = requirements.find((r) => r.opportunityId === secondIdea)!.id;
  assert.equal((await form(a, `/api/companies/${A}/requirements/${second}/engagement`, [["provider", beta]])).headers.get("location"), "/deliver?made=1");
  const g = (await engagements(a)).find((e) => e.id !== engagementId)!;
  const path = `/api/companies/${A}/engagements/${g.id}`;
  assert.equal((await form(a, `${path}/milestones`, [["title", "Pilot"], ["test", "Runs a full shift"], ["due", "2027-03-01"], ["amount", "1000"]])).headers.get("location"), "/deliver?saved=milestone");
  assert.equal((await form(a, `${path}/events`, [["kind", "plan_agreed"]])).headers.get("location"), "/deliver?saved=plan_agreed");
  const m = (await engagements(a)).find((e) => e.id === g.id)!.milestones[0].id;
  for (let n = 1; n <= 14; n += 1) {
    assert.equal((await form(a, `${path}/events`, [["kind", "delivered"], ["milestone", m]])).headers.get("location"), "/deliver?saved=delivered", `delivery ${n}`);
    if (n === 14) {
      const waiting = await page(a, "/deliver");
      assert.match(waiting, /Accept milestone 1/, "the last delivery can still be decided");
    }
    assert.equal((await form(a, `${path}/events`, [["kind", "rejected"], ["milestone", m]])).headers.get("location"), "/deliver?saved=rejected", `rejection ${n}`);
  }
  const html = await page(a, "/deliver");
  assert.match(html, /This milestone was rejected after being delivered 14 times, as many as can be recorded/);
  assert.match(html, /data-testid="delivery-cap-1"/);
  assert.ok(!html.includes("Record that milestone 1 was delivered"), "no form the database would refuse");
  assert.match(html, /Close this engagement/, "the way out is there");
  assert.equal((await form(a, `${path}/events`, [["kind", "delivered"], ["milestone", m]])).headers.get("location"), "/deliver?problem=too_many_deliveries");
  assert.match(await page(a, "/deliver?problem=too_many_deliveries"), /as many as can be recorded\. If the last one is still waiting for your decision, decide on it/);
  assert.equal((await form(a, `${path}/events`, [["kind", "closed"]])).headers.get("location"), "/deliver?saved=closed");
});
