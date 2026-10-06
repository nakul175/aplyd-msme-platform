// Results on the built application, over HTTP. Needs `pnpm build` first. The tests run in order against one database: the later
// ones use what the earlier ones made. The application stamps events with its own clock, so a review that is due is checked in the
// browser layer, which can add an acceptance dated in the past; here a review is shown to be not yet due.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startBuiltApp } from "../../../platform/tests/support/worker.ts";
import type { RunningWorker } from "../../../platform/tests/support/worker.ts";

const A = "company-synthetic-a";
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
const form = (cookie: string, path: string, fields: [string, string][] = []) =>
  fetch(`${app.base}${path}`, { method: "POST", redirect: "manual", headers: { cookie, origin: app.base, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });
const getJson = async (cookie: string | undefined, path: string) => (await fetch(`${app.base}${path}`, { headers: cookie ? { cookie } : {} })).json();

let engagementId = "";
let milestoneId = "";
let firstAccepted = "";

test("an owner with no engagement is told where one starts; the page says who it is for; the home page links to it for an owner only", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const html = await page(a, "/run");
  assert.match(html, /Results/);
  assert.match(html, /Nothing to look at yet/);
  assert.match(html, /Every number here is one you type: nothing on this page measures anything/);
  assert.match(html, /placeholders written to test the service, not findings/);
  const operator = await signIn("operator@synthetic.invalid");
  assert.match(await page(operator, "/run"), /for the owner of a company/);
  assert.match(await page(undefined, "/run"), /href="\/sign-in"/);
  assert.match(await page(a, "/"), /href="\/run"/);
  assert.ok(!(await page(operator, "/")).includes('href="/run"'));
});

test("set-up: a provider is listed, the owner signs off an assessment, makes a requirement, chooses the provider and agrees a plan of one milestone", async () => {
  const op = await signIn("operator@synthetic.invalid");
  assert.equal((await form(op, "/api/operator/listing-terms", [["feeInr", String(FEE)], ["note", "SYNTHETIC test value, not a proposal"]])).status, 303);
  assert.equal((await form(op, "/api/operator/providers", [["name", "Alpha Works"], ["summary", "SYNTHETIC test provider"], ["opportunity", KIND], ["cluster", CLUSTER]])).status, 303);
  const providerId = ((await getJson(op, "/api/operator/providers")) as { providers: { id: string }[] }).providers[0].id;
  assert.equal((await form(op, `/api/operator/providers/${providerId}/list`)).headers.get("location")?.split("#")[0], "/operator?listed=1");

  const a = await signIn("owner-a@synthetic.invalid");
  const made = await form(a, `/api/companies/${A}/assessments`);
  const assessment = new URL(made.headers.get("location")!, app.base).searchParams.get("a");
  const detail = (await getJson(a, `/api/companies/${A}/assessments/${assessment}`)) as { id: string; result: { items: { opportunityId: string }[] } };
  for (const item of detail.result.items) await form(a, `/api/companies/${A}/assessments/${detail.id}/decisions`, [["opportunity", item.opportunityId], ["decision", "accept"]]);
  assert.equal((await form(a, `/api/companies/${A}/assessments/${detail.id}/signoff`)).status, 303);
  assert.equal((await form(a, `/api/companies/${A}/requirements`, [["assessment", detail.id], ["opportunity", KIND], ["cluster", CLUSTER]])).status, 303);
  const requirementId = ((await getJson(a, `/api/companies/${A}/requirements`)) as { requirements: { id: string }[] }).requirements[0].id;
  assert.equal((await form(a, `/api/companies/${A}/requirements/${requirementId}/engagement`, [["provider", providerId]])).headers.get("location"), "/deliver?made=1");
  engagementId = ((await getJson(a, `/api/companies/${A}/engagements`)) as { engagements: { id: string }[] }).engagements[0].id;
  const add = await form(a, `/api/companies/${A}/engagements/${engagementId}/milestones`, [["title", "Job log running"], ["test", "A full shift is logged and matches the paper sheet."], ["due", "2026-12-15"], ["amount", "40000"]]);
  assert.equal(add.headers.get("location"), "/deliver?saved=milestone");
  milestoneId = ((await getJson(a, `/api/companies/${A}/engagements/${engagementId}`)) as { milestones: { id: string }[] }).milestones[0].id;
  assert.equal((await form(a, `/api/companies/${A}/engagements/${engagementId}/events`, [["kind", "plan_agreed"]])).headers.get("location"), "/deliver?saved=plan_agreed");
});

test("before the work: the page shows what the assessment expected, offers the starting number, and says the reviews wait for an acceptance", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const html = await page(a, "/run");
  assert.match(html, /Keep every job on a simple shared log/);
  assert.match(html, /What the assessment expected:<\/strong> [^<]+, \d[\d,]* to \d[\d,]* (percent|days|rupees a year)\./);
  const { expected } = (await getJson(a, `/api/companies/${A}/engagements/${engagementId}/outcomes`)) as { expected: { measure: string; unit: string; low: number; high: number; synthetic: boolean } };
  assert.equal(expected.synthetic, true, "the data says the range is synthetic");
  const expectedLine = /<p data-testid="expected">([\s\S]*?)<\/p>/.exec(html.replace(/<script[\s\S]*?<\/script>/g, ""))?.[1] ?? "";
  assert.match(expectedLine, /SYNTHETIC/, "and so does the line that shows it");
  assert.match(html, /dates are shown in UTC/, "dates are said to be UTC");
  const unit = { percent: "percent", days: "days", rupees_per_year: "rupees a year" }[expected.unit];
  assert.ok(html.includes(`What the assessment expected:</strong> ${expected.measure}, ${expected.low.toLocaleString("en-IN")} to ${expected.high.toLocaleString("en-IN")} ${unit}.`), "the page shows the assessment's own measure and range, low first");
  assert.match(html, /Provider: <strong>Alpha Works<\/strong>/);
  assert.match(html, /The number today, before the work/);
  assert.match(html, /It is recorded once and cannot be changed/);
  assert.match(html, /Nothing has been accepted yet\. The reviews start counting from the day you accept your first milestone/);
  // The framework repeats the page's text inside script tags; what a person sees is the rest.
  const seen = html.replace(/<script[\s\S]*?<\/script>/g, "");
  assert.equal((seen.match(/Starts when you accept your first milestone/g) ?? []).length, 3, "all three reviews wait");
  assert.ok(!html.includes("Record review"), "no review form before anything is accepted");
  assert.ok(!/1,?234/.test(html), "the listing fee is nowhere on the page");
});

test("the starting number: a bad one is sent back with a message, a good one is recorded once and shown, a second is refused with a message", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const path = `/api/companies/${A}/engagements/${engagementId}/outcomes`;
  const bad = await form(a, path, [["kind", "baseline"], ["value", "lots"]]);
  assert.equal(bad.status, 303);
  assert.equal(bad.headers.get("location"), "/run?problem=baseline_invalid", "a starting number gets its own refusal");
  const refused = await page(a, "/run?problem=baseline_invalid");
  assert.match(refused, /The starting number box takes a number only, in (percent|days|rupees a year): for example 42, not “42 late orders”\. Give a whole number from 0 to 1,00,00,00,000\./, "the unit of the measure, and no word about reviews");
  assert.ok(!/review/i.test(refused.slice(refused.indexOf('data-testid="problem"'), refused.indexOf("</div>", refused.indexOf('data-testid="problem"')))), "the refusal does not talk about reviews");
  assert.equal((await form(a, path, [["kind", "baseline"], ["value", "42 late orders"]])).headers.get("location"), "/run?problem=baseline_invalid");
  const good = await form(a, path, [["kind", "baseline"], ["value", "42"], ["note", "From the sheets of September"]]);
  assert.equal(good.headers.get("location"), "/run?saved=baseline");
  const html = await page(a, "/run?saved=baseline");
  assert.match(html, /The starting number is recorded\./);
  assert.match(html, /Starting number: <strong>42<\/strong>/);
  assert.match(html, /From the sheets of September/);
  assert.ok(!html.includes("Record the starting number"), "the form is gone once it is recorded");
  const again = await form(a, path, [["kind", "baseline"], ["value", "43"]]);
  assert.equal(again.headers.get("location"), "/run?problem=baseline_exists");
  assert.match(await page(a, "/run?problem=baseline_exists"), /recorded once/);
  assert.match(await page(a, "/run"), /Starting number: <strong>42<\/strong>/);
});

test("after the first acceptance the page says when each review opens, offers none yet, and a review posted early is sent back as not due", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const events = `/api/companies/${A}/engagements/${engagementId}/events`;
  assert.equal((await form(a, events, [["kind", "delivered"], ["milestone", milestoneId]])).headers.get("location"), "/deliver?saved=delivered");
  const deliver = await page(a, "/deliver?saved=delivered");
  assert.match(deliver, /Accept milestone 1/);
  assert.ok(!deliver.includes("You have not recorded your starting number"), "the starting number is recorded, so Delivery does not warn beside Accept");
  assert.equal((await form(a, events, [["kind", "accepted"], ["milestone", milestoneId]])).headers.get("location"), "/deliver?saved=accepted");
  firstAccepted = ((await getJson(a, `/api/companies/${A}/engagements/${engagementId}/outcomes`)) as { firstAcceptedAt: string }).firstAcceptedAt;
  assert.match(firstAccepted, /^\d{4}-\d\d-\d\dT/);

  const days = (n: number) => new Date(new Date(firstAccepted).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const html = await page(a, "/run");
  assert.match(html, new RegExp(`You first accepted a milestone on ${firstAccepted.slice(0, 10)}`));
  for (const [no, n] of [[1, 30], [2, 90], [3, 180]] as const) {
    assert.match(html, new RegExp(`Review ${no}: ${n} days after`));
    assert.match(html, new RegExp(`Opens on ${days(n)}\\.`));
  }
  assert.ok(!html.includes("Record review"), "no review is offered before its day");
  assert.ok(!html.includes("Record the starting number"));
  assert.ok(!html.includes("No starting number was recorded"), "a baseline was recorded, so there is nothing to apologise for");

  const early = await form(a, `/api/companies/${A}/engagements/${engagementId}/outcomes`, [["kind", "review"], ["review", "1"], ["value", "60"], ["verdict", "met"], ["in_use", "yes"]]);
  assert.equal(early.headers.get("location"), "/run?problem=not_due");
  assert.match(await page(a, "/run?problem=not_due"), /That review is not due yet\. It opens on the date shown\./);
  const late = await form(a, `/api/companies/${A}/engagements/${engagementId}/outcomes`, [["kind", "baseline"], ["value", "50"]]);
  assert.equal(late.headers.get("location"), "/run?problem=baseline_exists");
});

test("the next idea in the plan is offered with a way to make a requirement for it", async () => {
  const a = await signIn("owner-a@synthetic.invalid");
  const html = await page(a, "/run");
  assert.match(html, /Next in your plan:<\/strong> [^<]+\. <a href="\/procure">Make a requirement for it<\/a>/);
});

test("another company sees nothing of it: its Results page is empty and the JSON is a 404 identical to a missing engagement", async () => {
  const b = await signIn("owner-b@synthetic.invalid");
  const html = await page(b, "/run");
  assert.match(html, /Nothing to look at yet/);
  assert.ok(!html.includes("Keep every job on a simple shared log"));
  const missing = await fetch(`${app.base}/api/companies/company-synthetic-b/engagements/no-such/outcomes`, { headers: { cookie: b } });
  const other = await fetch(`${app.base}/api/companies/company-synthetic-b/engagements/${engagementId}/outcomes`, { headers: { cookie: b } });
  const foreign = await fetch(`${app.base}/api/companies/${A}/engagements/${engagementId}/outcomes`, { headers: { cookie: b } });
  assert.equal(missing.status, 404);
  assert.equal(other.status, 404);
  assert.equal(foreign.status, 404);
  assert.equal(await other.text(), await missing.text());
  assert.equal(await foreign.text(), await (await fetch(`${app.base}/api/companies/${A}/engagements/no-such/outcomes`, { headers: { cookie: await signIn("owner-a@synthetic.invalid") } })).text(), "another company's engagement looks like a missing one");
});
