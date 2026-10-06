// Results, walked through the real pages in a real browser. Setup that is not the point of a test (the operator listing a provider,
// an owner signing an assessment off, an engagement with an agreed plan) is done by scripts on the page that send what the forms
// send. The application stamps each event with its own clock, so to have a review that is due the test adds the delivery and the
// acceptance to the Worker's throwaway database dated 35 days ago, the way the application would have added them on that day; the
// database's own triggers still apply to them. Everything the owner does about results is done with the page's fields and buttons.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright-core";
import { TEST_TIMEOUT_MS, withBrowserHarness } from "../../../platform/tests/support/browser.ts";
import type { BrowserHarness } from "../../../platform/tests/support/browser.ts";
import { OTHER_COMPANY, OWN_COMPANY, getFromPage, signInAsOwner, watchPage } from "../../../platform/tests/support/ui.ts";

const FIRST_IDEA = "Keep every job on a simple shared log";
const DAY = 86_400_000;

async function signInAsOperator(page: Page) {
  await page.goto("/sign-in");
  const picker = page.getByLabel("Synthetic user");
  const options = await picker.locator("option").evaluateAll((nodes) => nodes.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent ?? "" })));
  const operator = options.find((o) => /\(operator\)$/.test(o.label));
  if (!operator) throw new Error(`the sign-in page lists no operator: ${JSON.stringify(options)}`);
  await picker.selectOption(operator.value);
  await Promise.all([page.waitForURL((url) => url.pathname === "/"), page.getByRole("button", { name: "Sign in" }).click()]);
}

/** The operator sets a fee and lists one provider for each of the first three ideas in the first cluster, by sending what the operator's forms send. */
async function listProviders(h: BrowserHarness): Promise<void> {
  const op = await (await h.newContext()).newPage();
  await signInAsOperator(op);
  const status = await op.evaluate(async () => {
    const post = async (path: string, fields: [string, string][]) => {
      const r = await fetch(path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });
      await r.text();
      return r.status;
    };
    await post("/api/operator/listing-terms", [["feeInr", "1500"], ["note", "SYNTHETIC"]]);
    await post("/api/operator/providers", [["name", "Alpha Works"], ["summary", "SYNTHETIC test provider"], ["opportunity", "digital_job_log"], ["cluster", "synthetic-cluster-1"]]);
    const providers = (await (await fetch("/api/operator/providers")).json()) as { providers: { id: string }[] };
    return post(`/api/operator/providers/${providers.providers[0].id}/list`, []);
  });
  assert.equal(status, 200);
  await op.context().close();
}

/** Signs off an assessment accepting every idea, makes a requirement for the first idea, chooses the provider, adds one milestone and agrees the plan. Returns the ids. */
async function agreedPlan(page: Page): Promise<{ engagementId: string; milestoneId: string }> {
  await page.goto("/");
  return page.evaluate(async (company) => {
    const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    // Every response is read to its end: a body left unread is reported by the browser as an aborted request.
    const ok = async (r: Response, what: string) => {
      const text = await r.text();
      if (r.status >= 300) throw new Error(`${what}: ${r.status} ${text}`);
      return { json: async () => JSON.parse(text) as unknown };
    };
    const made = (await (await ok(await fetch(`/api/companies/${company}/assessments`, json({})), "assessment")).json()) as { id: string };
    const detail = (await (await fetch(`/api/companies/${company}/assessments/${made.id}`)).json()) as { result: { items: { opportunityId: string }[] } };
    for (const item of detail.result.items) await ok(await fetch(`/api/companies/${company}/assessments/${made.id}/decisions`, json({ opportunityId: item.opportunityId, decision: "accept" })), "decision");
    await ok(await fetch(`/api/companies/${company}/assessments/${made.id}/signoff`, json({})), "signoff");
    const requirement = (await (await ok(await fetch(`/api/companies/${company}/requirements`, json({ assessmentId: made.id, opportunityId: "digital_job_log", cluster: "synthetic-cluster-1" })), "requirement")).json()) as { id: string };
    const providers = (await (await fetch("/api/providers")).json()) as { providers: { id: string }[] };
    const engagement = (await (await ok(await fetch(`/api/companies/${company}/requirements/${requirement.id}/engagement`, json({ providerId: providers.providers[0].id })), "engagement")).json()) as { id: string };
    const milestone = (await (await ok(await fetch(`/api/companies/${company}/engagements/${engagement.id}/milestones`, json({ title: "Job log running", acceptanceTest: "A full shift is logged and matches the paper sheet.", dueOn: "2026-12-15", agreedInr: 40000 })), "milestone")).json()) as { id: string };
    await ok(await fetch(`/api/companies/${company}/engagements/${engagement.id}/events`, json({ kind: "plan_agreed" })), "plan");
    return { engagementId: engagement.id, milestoneId: milestone.id };
  }, OWN_COMPANY.id);
}

const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** Adds a delivery and an acceptance dated `daysAgo` days before now, as the application would have on that day. */
function acceptedLongAgo(h: BrowserHarness, ids: { engagementId: string; milestoneId: string }, daysAgo: number): string {
  const delivered = new Date(Date.now() - daysAgo * DAY - 3_600_000).toISOString();
  const accepted = new Date(Date.now() - daysAgo * DAY).toISOString();
  const row = (kind: string, at: string) => `INSERT INTO engagement_events (engagement_id, company_id, at, user_id, kind, milestone_id, note) VALUES (${sqlText(ids.engagementId)}, ${sqlText(OWN_COMPANY.id)}, ${sqlText(at)}, 'user-synthetic-owner-a', ${sqlText(kind)}, ${sqlText(ids.milestoneId)}, '');`;
  h.app.exec(row("delivered", delivered) + row("accepted", accepted));
  return accepted;
}
const dayText = (iso: string, plusDays: number) => new Date(new Date(iso).getTime() + plusDays * DAY).toISOString().slice(0, 10);

test("an owner records the starting number before the work, and once a milestone is accepted the page counts the days to each review", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    await listProviders(h);
    const page = await (await h.newContext()).newPage();
    const problems = watchPage(page);
    await signInAsOwner(page, 0);
    await agreedPlan(page);

    await page.getByRole("link", { name: "Results" }).click();
    await page.waitForURL((u) => u.pathname === "/run");
    const main = page.locator("main");
    assert.match(await main.innerText(), /Every number here is one you type: nothing on this page measures anything/);
    assert.match(await page.getByTestId("expected").innerText(), /What the assessment expected: .+, \d[\d,]* to \d[\d,]* (percent|days|rupees a year)\./);
    assert.match(await page.getByTestId("waiting").innerText(), /Nothing has been accepted yet/);
    assert.equal(await page.getByRole("button", { name: /^Record review/ }).count(), 0, "no review before an acceptance");

    await page.getByLabel(/^The number today, before the work/).fill("lots");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("problem") === "baseline_invalid"), page.getByRole("button", { name: "Record the starting number" }).click()]);
    const refused = await page.getByTestId("problem").innerText();
    assert.match(refused, /The starting number box takes a number only, in (percent|days|rupees a year): for example 42, not “42 late orders”\. Give a whole number/);
    assert.doesNotMatch(refused, /review/i, "a starting number's refusal does not talk about reviews (S5-16)");
    assert.equal(await page.getByTestId("baseline").count(), 0, "nothing was recorded");

    await page.getByLabel(/^The number today, before the work/).fill("42");
    await page.getByLabel("How you worked it out (optional)").fill("Counted from the September paper sheets");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "baseline"), page.getByRole("button", { name: "Record the starting number" }).click()]);
    assert.match(await page.getByTestId("saved").innerText(), /The starting number is recorded/);
    assert.match(await page.getByTestId("baseline").innerText(), /Starting number: 42 .*Counted from the September paper sheets/);
    assert.equal(await page.getByRole("button", { name: "Record the starting number" }).count(), 0, "recorded once; the form is gone");

    // A wrong number is corrected from the page (BR-RUN-09): a new record with its reason; the first number stays, struck through.
    await page.getByTestId("form-correct-baseline").locator("xpath=..").locator("summary").click();
    await page.getByLabel(/^The right number/).fill("45");
    await page.getByLabel("Why the first number was wrong").fill("Counted the wrong week of sheets");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "correction"), page.getByRole("button", { name: "Record the correction" }).click()]);
    assert.match(await page.getByTestId("saved").innerText(), /The correction is recorded\. The number it corrects stays on record, marked as corrected\./);
    assert.match(await page.getByTestId("baseline").innerText(), /Starting number: 45 /);
    const fixes = await page.getByTestId("baseline-corrections").innerText();
    assert.match(fixes, /First recorded: 42/);
    assert.match(fixes, /Corrected on \d{4}-\d{2}-\d{2} to 45 .*Why: Counted the wrong week of sheets/);
    assert.equal(await page.getByTestId("baseline-corrections").locator("s").first().innerText(), "42", "the first number is struck through, not removed");

    // The owner goes to Delivery and accepts the milestone, with the page's own buttons.
    await page.goto("/deliver");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "delivered"), page.getByRole("button", { name: "Record that milestone 1 was delivered" }).click()]);
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "accepted"), page.getByRole("button", { name: "Accept milestone 1" }).click()]);

    await page.goto("/run");
    const today = new Date().toISOString().slice(0, 10);
    assert.match(await main.innerText(), new RegExp(`You first accepted a milestone on ${today}`));
    for (const [no, n] of [[1, 30], [2, 90], [3, 180]] as const) assert.match(await page.getByTestId(`review-${no}-due`).innerText(), new RegExp(`Opens on ${dayText(new Date().toISOString(), n)}\\.`));
    assert.equal(await page.getByRole("button", { name: /^Record review/ }).count(), 0, "no review is offered before its day");
    assert.equal(await page.getByRole("button", { name: "Record the starting number" }).count(), 0);
    assert.ok(!/1,500|1500|Fee/.test(await main.innerText()), "no fee is shown to the owner");
    assert.deepEqual(problems, [], "no page errors, console errors or failed requests");
    assert.deepEqual(h.blockedRequests, []);
  });
});

test("a review that is due is recorded from the page; the others wait; the change since the starting number and the next idea in the plan are shown", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    await listProviders(h);
    const page = await (await h.newContext()).newPage();
    const problems = watchPage(page);
    await signInAsOwner(page, 0);
    const ids = await agreedPlan(page);

    await page.goto("/run");
    await page.getByLabel(/^The number today, before the work/).fill("42");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "baseline"), page.getByRole("button", { name: "Record the starting number" }).click()]);

    const accepted = acceptedLongAgo(h, ids, 35);
    await page.goto("/run");
    assert.match(await page.locator("main").innerText(), new RegExp(`You first accepted a milestone on ${accepted.slice(0, 10)}`));
    assert.equal(await page.getByTestId("form-review-1").count(), 1, "review 1 (30 days) is due after 35");
    assert.equal(await page.getByTestId("form-review-2").count(), 0);
    assert.equal(await page.getByTestId("form-review-3").count(), 0);
    assert.match(await page.getByTestId("review-2-due").innerText(), new RegExp(`Opens on ${dayText(accepted, 90)}\\.`));
    assert.match(await page.getByTestId("review-3-due").innerText(), new RegExp(`Opens on ${dayText(accepted, 180)}\\.`));

    const f = page.getByTestId("form-review-1");
    await f.getByLabel(/^The number now/).fill("55");
    await f.getByLabel("Did it do what the assessment expected?").selectOption({ label: "Did part of it" });
    await f.getByLabel("Is it still in use?").selectOption({ label: "Yes, still in use" });
    await f.getByLabel("Anything to add (optional)").fill("Night shift still on paper");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "review"), f.getByRole("button", { name: "Record review 1" }).click()]);

    assert.match(await page.getByTestId("saved").innerText(), /The review is recorded/);
    const record = await page.getByTestId("review-1-record").innerText();
    assert.match(record, /Did part of it/);
    assert.match(record, /Yes, still in use/);
    assert.match(record, /Number: 55/);
    assert.match(record, /Night shift still on paper/);
    assert.equal(await page.getByTestId("form-review-1").count(), 0, "recorded once; the form is gone");
    assert.match(await page.getByTestId("change").innerText(), /Change since the starting number: \+13 .*Whether that is better or worse depends on what is measured/);
    assert.match(await page.getByTestId("next").innerText(), /Next in your plan: .+\. Make a requirement for it/);
    await Promise.all([page.waitForURL((u) => u.pathname === "/procure"), page.getByTestId("next").getByRole("link", { name: "Make a requirement for it" }).click()]);

    assert.deepEqual(problems, []);
    assert.deepEqual(h.blockedRequests, []);
  });
});

test("a stale review form is sent back with a message and changes nothing; with no starting number the page says so and still takes the reviews", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    await listProviders(h);
    const page = await (await h.newContext()).newPage();
    const problems = watchPage(page);
    await signInAsOwner(page, 0);
    const ids = await agreedPlan(page);
    acceptedLongAgo(h, ids, 100);

    await page.goto("/run");
    assert.match(await page.getByTestId("no-baseline").innerText(), /No starting number was recorded before the first milestone was accepted, and it cannot be added now/);
    assert.equal(await page.getByTestId("form-review-1").count(), 1);
    assert.equal(await page.getByTestId("form-review-2").count(), 1, "100 days: reviews 1 and 2 are due");
    assert.equal(await page.getByTestId("form-review-3").count(), 0);

    const stale = await page.context().newPage();
    const staleProblems = watchPage(stale);
    await stale.goto("/run");
    const fill = async (p: Page) => {
      const f = p.getByTestId("form-review-1");
      await f.getByLabel(/^The number now/).fill("60");
      await f.getByLabel("Did it do what the assessment expected?").selectOption({ label: "Did what the assessment expected" });
      await f.getByLabel("Is it still in use?").selectOption({ label: "Yes, still in use" });
      return f;
    };
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "review"), (await fill(page)).getByRole("button", { name: "Record review 1" }).click()]);
    await Promise.all([stale.waitForURL((u) => u.searchParams.get("problem") === "review_exists"), (await fill(stale)).getByRole("button", { name: "Record review 1" }).click()]);
    assert.match(await stale.getByTestId("problem").innerText(), /That review is already recorded/);
    assert.match(await stale.getByTestId("review-1-record").innerText(), /Number: 60/, "the first number stands");
    assert.equal(await stale.getByTestId("change").count(), 0, "no starting number, so no change to show");

    // Review 2 is its own form with its own number: it is recorded as review 2, and review 1 is left as it was.
    const second = stale.getByTestId("form-review-2");
    await second.getByLabel(/^The number now/).fill("71");
    await second.getByLabel("Did it do what the assessment expected?").selectOption({ label: "Did not do what was expected" });
    await second.getByLabel("Is it still in use?").selectOption({ label: "No, no longer in use" });
    await Promise.all([stale.waitForURL((u) => u.searchParams.get("saved") === "review"), second.getByRole("button", { name: "Record review 2" }).click()]);
    assert.match(await stale.getByTestId("review-2-record").innerText(), /Did not do what was expected[\s\S]*No, no longer in use[\s\S]*Number: 71/);
    assert.match(await stale.getByTestId("review-1-record").innerText(), /Number: 60/);
    assert.equal(await stale.getByTestId("form-review-1").count() + (await stale.getByTestId("form-review-2").count()), 0, "both are recorded once");
    assert.deepEqual(staleProblems.filter((p) => !/409/.test(p)), []);
    assert.deepEqual(problems, []);
    assert.deepEqual(h.blockedRequests, []);
  });
});

test("another owner's Results page shows none of it, and an engagement from another company is a 404 whatever is asked", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    await listProviders(h);
    const a = await (await h.newContext()).newPage();
    await signInAsOwner(a, 0);
    const ids = await agreedPlan(a);

    const b = await (await h.newContext()).newPage();
    const problems = watchPage(b);
    await signInAsOwner(b, 1);
    await b.getByRole("link", { name: "Results" }).click();
    await b.waitForURL((u) => u.pathname === "/run");
    assert.match(await b.getByTestId("no-engagements").innerText(), /Nothing to look at yet/);
    assert.ok(!/Alpha Works/.test(await b.locator("main").innerText()));
    const missing = await getFromPage(b, `/api/companies/${OTHER_COMPANY.id}/engagements/none/outcomes`);
    const theirs = await getFromPage(b, `/api/companies/${OWN_COMPANY.id}/engagements/${ids.engagementId}/outcomes`);
    const theirsByMyCompany = await getFromPage(b, `/api/companies/${OTHER_COMPANY.id}/engagements/${ids.engagementId}/outcomes`);
    assert.equal(missing.status, 404);
    for (const r of [theirs, theirsByMyCompany]) {
      assert.equal(r.status, 404);
      assert.equal(r.body, missing.body, "another company's engagement looks the same as one that does not exist");
    }
    assert.deepEqual(problems.filter((p) => !/404/.test(p)), []);
  });
});
