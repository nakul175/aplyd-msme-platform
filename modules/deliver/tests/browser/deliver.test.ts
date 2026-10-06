// Delivery, walked through the real pages in a real browser. Every test starts its own harness. Setup that is not the point of a
// test (the operator listing a provider, an owner signing an assessment off) is done by a script on the page, which sends what
// the forms send; everything the owner does about delivery is done with the page's own fields and buttons.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright-core";
import { TEST_TIMEOUT_MS, withBrowserHarness } from "../../../platform/tests/support/browser.ts";
import type { BrowserHarness } from "../../../platform/tests/support/browser.ts";
import { OTHER_COMPANY, OWN_COMPANY, getFromPage, signInAsOwner, watchPage } from "../../../platform/tests/support/ui.ts";

const FIRST_IDEA = "Keep every job on a simple shared log";

async function signInAsOperator(page: Page) {
  await page.goto("/sign-in");
  const picker = page.getByLabel("Synthetic user");
  const options = await picker.locator("option").evaluateAll((nodes) => nodes.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent ?? "" })));
  const operator = options.find((o) => /\(operator\)$/.test(o.label));
  if (!operator) throw new Error(`the sign-in page lists no operator: ${JSON.stringify(options)}`);
  await picker.selectOption(operator.value);
  await Promise.all([page.waitForURL((url) => url.pathname === "/"), page.getByRole("button", { name: "Sign in" }).click()]);
}

/** The operator sets a fee and lists one provider for the first idea in the first cluster, by sending what the operator's forms send. */
async function listAProvider(h: BrowserHarness): Promise<void> {
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

/** Makes the signed-in owner's assessment, accepts every idea and signs it off, by sending what the forms send. */
async function signOffEverything(page: Page): Promise<void> {
  await page.goto("/");
  const outcome = await page.evaluate(async (company) => {
    const post = async (path: string, body: unknown) => {
      const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      await r.text();
      return r;
    };
    const made = (await (await fetch(`/api/companies/${company}/assessments`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json()) as { id: string };
    const detail = (await (await fetch(`/api/companies/${company}/assessments/${made.id}`)).json()) as { result: { items: { opportunityId: string }[] } };
    for (const item of detail.result.items) await post(`/api/companies/${company}/assessments/${made.id}/decisions`, { opportunityId: item.opportunityId, decision: "accept" });
    return (await post(`/api/companies/${company}/assessments/${made.id}/signoff`, {})).status;
  }, OWN_COMPANY.id);
  assert.equal(outcome, 201);
}

/** The owner makes a requirement for the first idea and, through the page, chooses the listed provider. */
async function chooseProvider(page: Page): Promise<void> {
  await signOffEverything(page);
  await page.goto("/procure");
  const card = page.getByRole("heading", { level: 3, name: FIRST_IDEA, exact: true }).locator("xpath=ancestor::li");
  await card.getByLabel("Which cluster do you ask in?").selectOption({ label: "SYNTHETIC cluster 1" });
  await Promise.all([page.waitForURL((u) => u.searchParams.has("made")), card.getByRole("button", { name: `Make a requirement from ${FIRST_IDEA}` }).click()]);
  const open = page.getByTestId("requirement-digital_job_log");
  await open.getByLabel("Which provider do you want to work with?").selectOption({ label: "Alpha Works" });
  await Promise.all([page.waitForURL((u) => u.pathname === "/deliver"), open.getByRole("button", { name: `Choose a provider for ${FIRST_IDEA}` }).click()]);
}

async function addMilestone(page: Page, what: string, check: string, due: string, price: string): Promise<void> {
  const f = page.getByTestId("add-milestone");
  await f.getByLabel("What is delivered").fill(what);
  await f.getByLabel("How you will check it").fill(check);
  await f.getByLabel("Due date (YYYY-MM-DD)").fill(due);
  await f.getByLabel(/^Price for this milestone/).fill(price);
  await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "milestone"), f.getByRole("button", { name: "Add this milestone" }).click()]);
}

test("an owner chooses a provider, writes and agrees a plan, records a delivery, accepts it against their own test, records the payment they made, and closes the engagement", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    await listAProvider(h);
    const page = await (await h.newContext()).newPage();
    const problems = watchPage(page);
    await signInAsOwner(page, 0);
    await page.getByRole("link", { name: "What you need" }).click();
    await page.waitForURL((u) => u.pathname === "/procure");
    await chooseProvider(page);

    assert.match(await page.getByTestId("made").innerText(), /You chose a provider\. Write the plan below\./);
    const main = page.locator("main");
    assert.match(await main.innerText(), /does not contact the provider, hold money or move any/);
    assert.match(await main.innerText(), /Provider: Alpha Works/);
    assert.equal(await page.getByRole("button", { name: "Agree this plan" }).count(), 0, "nothing to agree before a milestone exists");

    await addMilestone(page, "Job log set up on the shop floor", "Ten real jobs entered and found again by a supervisor", "2026-12-15", "125000");
    await addMilestone(page, "Supervisors trained", "Every supervisor enters a job unaided", "2027-01-31", "80000");
    assert.match(await page.getByTestId("totals").innerText(), /Plan total ₹2,05,000\. Payments you have recorded: ₹0\./);
    assert.match(await page.getByTestId("milestone-1").innerText(), /Price ₹1,25,000/);
    assert.equal(await page.getByRole("button", { name: /^Record that milestone/ }).count(), 0, "no delivery can be recorded before the plan is agreed");

    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "plan_agreed"), page.getByRole("button", { name: "Agree this plan" }).click()]);
    assert.match(await page.getByTestId("saved").innerText(), /You agreed the plan/);
    assert.equal(await page.getByTestId("add-milestone").count(), 0, "the plan is locked");

    const m1 = page.getByTestId("milestone-1");
    await m1.getByLabel("What the provider told you (optional)").fill("Provider says it is live");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "delivered"), m1.getByRole("button", { name: "Record that milestone 1 was delivered" }).click()]);
    assert.match(await page.getByTestId("milestone-1").innerText(), /Delivered, waiting for you/);
    assert.match(await page.getByTestId("milestone-1").getByTestId("history").innerText(), /Delivered: Provider says it is live/);
    assert.equal(await page.getByRole("button", { name: "Record a payment for milestone 1" }).count(), 0, "nothing is paid before it is accepted");
    // No starting number is recorded, so the page says, beside Accept, that accepting ends the chance to record one (FND-183).
    const warning = page.getByTestId("baseline-warning-1");
    assert.match(await warning.innerText(), /You have not recorded your starting number\. Once you accept a milestone, it can no longer be recorded\./);
    assert.match((await warning.getByRole("link", { name: "Record the starting number first" }).getAttribute("href")) ?? "", /^\/run#bl-/);

    await page.getByTestId("milestone-1").getByLabel("Your note, against your test (optional)").fill("All ten jobs found");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "accepted"), page.getByTestId("milestone-1").getByRole("button", { name: "Accept milestone 1" }).click()]);
    const pay = page.getByTestId("milestone-1");
    assert.equal(await pay.getByLabel("Amount you paid, in rupees").inputValue(), "125000", "the amount starts as the agreed price, and can be changed");
    await pay.getByLabel("Amount you paid, in rupees").fill("120000");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "payment_recorded"), pay.getByRole("button", { name: "Record a payment for milestone 1" }).click()]);
    assert.match(await page.getByTestId("totals").innerText(), /Payments you have recorded: ₹1,20,000/, "what the owner typed, not the agreed price");
    assert.match(await page.getByTestId("milestone-1").innerText(), /Paid/);

    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "closed"), page.getByTestId("close").getByRole("button", { name: "Close this engagement" }).click()]);
    const after = await page.locator("main").innerText();
    assert.match(after, /Ended early/, "milestone 2 was never delivered, so this is not complete");
    assert.match(after, /Closed on /);
    assert.equal(await page.getByRole("button", { name: /^(Record|Accept|Reject|Close|Agree)/ }).count(), 0, "nothing more can be recorded once it is closed");
    assert.ok(!/1,500|1500|Fee/.test(after), "no fee is shown to the owner");
    assert.deepEqual(problems, [], "no page errors, console errors or failed requests");
    assert.deepEqual(h.blockedRequests, []);
  });
});

test("a bad date comes back with a message and keeps nothing; a rejected milestone can be delivered again; a stale form for a decision already made is refused with a message and changes nothing", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    await listAProvider(h);
    const page = await (await h.newContext()).newPage();
    const problems = watchPage(page);
    await signInAsOwner(page, 0);
    await chooseProvider(page);

    const f = page.getByTestId("add-milestone");
    await f.getByLabel("What is delivered").fill("First part");
    await f.getByLabel("How you will check it").fill("Look at it");
    await f.getByLabel("Due date (YYYY-MM-DD)").fill("2026-02-30");
    await f.getByLabel(/^Price for this milestone/).fill("1000");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("problem") === "invalid"), f.getByRole("button", { name: "Add this milestone" }).click()]);
    assert.match(await page.getByTestId("problem").innerText(), /a date written YYYY-MM-DD/);
    assert.equal(await page.getByTestId("milestones").count(), 0, "the bad milestone was not saved");

    await addMilestone(page, "First part", "Look at it", "2026-12-15", "1000");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "plan_agreed"), page.getByRole("button", { name: "Agree this plan" }).click()]);
    const m1 = () => page.getByTestId("milestone-1");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "delivered"), m1().getByRole("button", { name: "Record that milestone 1 was delivered" }).click()]);
    await m1().getByLabel("Your note, against your test (optional)").fill("It does not match the test");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "rejected"), m1().getByRole("button", { name: "Reject milestone 1" }).click()]);
    assert.match(await page.getByTestId("saved").innerText(), /It can be delivered again/);
    assert.match(await m1().innerText(), /Rejected/);
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "delivered"), m1().getByRole("button", { name: "Record that milestone 1 was delivered" }).click()]);

    // A second tab opened while the milestone waits for a decision. The decision is made in the first tab; the second tab's form is now stale.
    const stale = await page.context().newPage();
    const staleProblems = watchPage(stale);
    await stale.goto("/deliver");
    assert.ok(await stale.getByRole("button", { name: "Accept milestone 1" }).isVisible());
    await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "accepted"), m1().getByRole("button", { name: "Accept milestone 1" }).click()]);
    assert.match(await m1().getByTestId("history").innerText(), /Delivered[\s\S]*Rejected: It does not match the test[\s\S]*Delivered[\s\S]*Accepted/, "the whole history stays, in order");
    await Promise.all([stale.waitForURL((u) => u.searchParams.get("problem") === "wrong_state"), stale.getByRole("button", { name: "Reject milestone 1" }).click()]);
    assert.match(await stale.getByTestId("problem").innerText(), /cannot be recorded for this milestone in its present state/, "a message on the page, not a page of JSON");
    assert.match(await stale.getByTestId("milestone-1").innerText(), /Accepted/, "the acceptance stands: the stale rejection changed nothing");
    assert.deepEqual(staleProblems.filter((p) => !/409/.test(p)), []);
    assert.deepEqual(problems, []);
    assert.deepEqual(h.blockedRequests, []);
  });
});

test("another owner's delivery page shows none of it, and an engagement id from another company is a 404 whatever is asked", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    await listAProvider(h);
    const a = await (await h.newContext()).newPage();
    await signInAsOwner(a, 0);
    await chooseProvider(a);
    const mine = await getFromPage(a, `/api/companies/${OWN_COMPANY.id}/engagements`);
    const engagementId = (JSON.parse(mine.body) as { engagements: { id: string }[] }).engagements[0].id;

    const b = await (await h.newContext()).newPage();
    const problems = watchPage(b);
    await signInAsOwner(b, 1);
    await b.getByRole("link", { name: "Delivery" }).click();
    await b.waitForURL((u) => u.pathname === "/deliver");
    assert.match(await b.getByTestId("no-engagements").innerText(), /No engagement yet/);
    assert.ok(!/Alpha Works/.test(await b.locator("main").innerText()));
    const own = await getFromPage(b, `/api/companies/${OTHER_COMPANY.id}/engagements`);
    assert.equal(own.status, 200);
    assert.deepEqual(JSON.parse(own.body), { engagements: [] });
    const missing = await getFromPage(b, `/api/companies/${OTHER_COMPANY.id}/engagements/none`);
    const theirs = await getFromPage(b, `/api/companies/${OWN_COMPANY.id}/engagements/${engagementId}`);
    const theirsByMyCompany = await getFromPage(b, `/api/companies/${OTHER_COMPANY.id}/engagements/${engagementId}`);
    assert.equal(missing.status, 404);
    for (const r of [theirs, theirsByMyCompany]) {
      assert.equal(r.status, 404);
      assert.equal(r.body, missing.body, "the same answer as for an engagement that does not exist");
    }
    assert.deepEqual(problems.filter((p) => !/404/.test(p)), [], "no page errors; a 404 console line is the browser reporting what the test asked for");
  });
});
