// Requirements and providers, walked through the real pages in a real browser. Every test starts its own harness, so tests that
// save do not depend on each other or on order. Setup that is not the point of a test (signing an assessment off) is done by a
// script on the page, which sends what the forms send.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright-core";
import { TEST_TIMEOUT_MS, withBrowserHarness } from "../../../platform/tests/support/browser.ts";
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

/** Makes the signed-in owner's assessment, accepts every idea and signs it off, by sending what the forms send. */
async function signOffEverything(page: Page): Promise<void> {
  await page.goto("/");
  const outcome = await page.evaluate(async (company) => {
    // The whole body is read, so no request is left open when the page navigates (an open one is reported as failed).
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

const idea = (page: Page, title: string) => page.getByRole("heading", { level: 3, name: title, exact: true }).locator("xpath=ancestor::li");

test("an owner follows the link from the home page, makes a requirement in a cluster, sees why no pool number is shown, and withdraws it", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    const problems = watchPage(page);
    await signInAsOwner(page, 0);
    await page.getByRole("link", { name: "What you need" }).click();
    await page.waitForURL((u) => u.pathname === "/procure");
    assert.match(await page.locator("main").innerText(), /No quote, price, contract or payment exists here/);
    assert.match(await page.getByTestId("accepted").innerText(), /You have not signed one off yet/);

    await signOffEverything(page);
    await page.goto("/procure");
    const card = idea(page, FIRST_IDEA);
    assert.ok(await card.getByText("No AI needed").isVisible());
    assert.match(await card.innerText(), /one-time ₹20,000 to ₹80,000/);
    await card.getByLabel("Which cluster do you ask in?").selectOption({ label: "SYNTHETIC cluster 2" });
    await Promise.all([page.waitForURL((u) => u.searchParams.has("made")), card.getByRole("button", { name: `Make a requirement from ${FIRST_IDEA}` }).click()]);
    assert.match(await page.getByTestId("made").innerText(), /Your requirement was recorded/);
    assert.match(await page.getByTestId("accepted-digital_job_log").innerText(), /Requirement recorded for SYNTHETIC cluster 2/);
    assert.equal(await page.getByRole("button", { name: `Make a requirement from ${FIRST_IDEA}` }).count(), 0, "a second form is not offered for the same idea");

    const open = page.getByTestId("requirement-digital_job_log");
    assert.ok(await open.getByText("Open", { exact: true }).isVisible());
    assert.match(await open.getByTestId("pool").innerText(), /Fewer than 5 companies have asked for this in your cluster, so the number is not shown to anyone/);
    assert.match(await open.getByTestId("providers").innerText(), /No provider is listed for this in your cluster yet/);

    await open.getByLabel("A note for yourself (optional)").fill("not this year");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("withdrawn") === "1"), open.getByRole("button", { name: `Withdraw ${FIRST_IDEA}` }).click()]);
    assert.match(await page.getByTestId("withdrawn").innerText(), /It stays on record, marked as withdrawn/);
    const gone = page.getByTestId("requirement-digital_job_log");
    assert.ok(await gone.getByText("Withdrawn", { exact: true }).isVisible());
    assert.equal(await gone.getByRole("button", { name: /^Withdraw/ }).count(), 0);
    assert.deepEqual(problems, [], "no page errors, console errors or failed requests");
    assert.deepEqual(h.blockedRequests, []);
  });
});

test("the operator sets one fee, adds a provider and lists it; the owner then sees the provider for the idea and cluster it serves, and never the fee", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const op = await (await h.newContext()).newPage();
    const opProblems = watchPage(op);
    await signInAsOperator(op);
    await op.getByRole("link", { name: "Providers and the listing fee" }).click();
    await op.waitForURL((u) => u.pathname === "/operator");
    assert.match(await op.getByTestId("fee-now").innerText(), /The fee has not been decided \(OQ-11\)/);

    await op.getByLabel("Set the fee, in rupees").fill("1500");
    await Promise.all([op.waitForURL((u) => u.searchParams.get("fee") === "1"), op.getByRole("button", { name: "Save as a new version" }).click()]);
    assert.match(await op.getByTestId("fee-now").innerText(), /In force: ₹1,500 \(version 1/);

    await op.getByLabel("Name", { exact: true }).fill("Alpha Works");
    await op.getByLabel("What it does (optional)").fill("SYNTHETIC test provider");
    await op.getByLabel(FIRST_IDEA).check();
    await op.getByLabel("SYNTHETIC cluster 2").check();
    await Promise.all([op.waitForURL((u) => u.searchParams.has("made")), op.getByRole("button", { name: "Add provider" }).click()]);
    const card = op.getByTestId("provider-Alpha Works");
    assert.ok(await card.getByText("Not listed").isVisible());
    assert.match(await card.innerText(), new RegExp(`Serves: ${FIRST_IDEA} \\(SYNTHETIC cluster 2\\)`));
    await Promise.all([op.waitForURL((u) => u.searchParams.get("listed") === "1"), card.getByRole("button", { name: "List Alpha Works" }).click()]);
    const listed = op.getByTestId("provider-Alpha Works");
    assert.ok(await listed.getByText("Listed", { exact: true }).isVisible());
    assert.ok(await listed.getByText("Fee ₹1,500").isVisible());
    assert.match(await op.getByTestId("pools").innerText(), /No pool has reached five companies/);
    assert.equal(await op.getByTestId("fee-differs").count(), 0, "one listed provider pays one fee");

    // A fee change after a listing leaves the first provider at its fee; when a second is listed at the new one, the page says they differ.
    await op.getByLabel("Set the fee, in rupees").fill("2500");
    await Promise.all([op.waitForURL((u) => u.searchParams.get("fee") === "1"), op.getByRole("button", { name: "Save as a new version" }).click()]);
    await op.getByLabel("Name", { exact: true }).fill("Beta Works");
    await op.getByLabel(FIRST_IDEA).check();
    await op.getByLabel("SYNTHETIC cluster 1").check();
    await Promise.all([op.waitForURL((u) => u.searchParams.has("made")), op.getByRole("button", { name: "Add provider" }).click()]);
    await Promise.all([op.waitForURL((u) => u.searchParams.get("listed") === "1"), op.getByTestId("provider-Beta Works").getByRole("button", { name: "List Beta Works" }).click()]);
    assert.ok(await op.getByTestId("provider-Beta Works").getByText("Fee ₹2,500").isVisible());
    assert.ok(await op.getByTestId("provider-Alpha Works").getByText("Fee ₹1,500").isVisible(), "the first provider keeps its fee");
    assert.match(await op.getByTestId("fee-differs").innerText(), /paying 2 different fees/);

    const owner = await (await h.newContext()).newPage();
    const ownerProblems = watchPage(owner);
    await signInAsOwner(owner, 0);
    await signOffEverything(owner);
    await owner.goto("/procure");
    const card2 = idea(owner, FIRST_IDEA);
    await card2.getByLabel("Which cluster do you ask in?").selectOption({ label: "SYNTHETIC cluster 2" });
    await Promise.all([owner.waitForURL((u) => u.searchParams.has("made")), card2.getByRole("button", { name: `Make a requirement from ${FIRST_IDEA}` }).click()]);
    const providers = await owner.getByTestId("requirement-digital_job_log").getByTestId("providers").innerText();
    assert.match(providers, /Alpha Works — SYNTHETIC test provider/);
    assert.match(providers, /APLYD's earnings do not depend on which one you choose/);
    assert.ok(!/1,500|1500|Fee/.test(await owner.locator("main").innerText()), "the owner is not shown what a provider pays");
    assert.deepEqual(opProblems, []);
    assert.deepEqual(ownerProblems, []);
    assert.deepEqual(h.blockedRequests, []);

    // The operator can unlist: the owner's view no longer shows the provider.
    await Promise.all([op.waitForURL((u) => u.searchParams.get("unlisted") === "1"), op.getByRole("button", { name: "Unlist Alpha Works" }).click()]);
    await owner.reload();
    assert.match(await owner.getByTestId("requirement-digital_job_log").getByTestId("providers").innerText(), /No provider is listed for this in your cluster yet/);
  });
});

test("another owner sees nothing of the first owner's requirements, whatever the address says, and the operator's page is not theirs", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const first = await (await h.newContext()).newPage();
    await signInAsOwner(first, 0);
    await signOffEverything(first);
    await first.goto("/procure");
    const card = idea(first, FIRST_IDEA);
    await card.getByLabel("Which cluster do you ask in?").selectOption({ label: "SYNTHETIC cluster 1" });
    await Promise.all([first.waitForURL((u) => u.searchParams.has("made")), card.getByRole("button", { name: `Make a requirement from ${FIRST_IDEA}` }).click()]);

    const second = await (await h.newContext()).newPage();
    await signInAsOwner(second, 1);
    for (const query of ["", `?c=${OWN_COMPANY.id}`, `?company=${OWN_COMPANY.id}`, `?companyId=${OWN_COMPANY.id}`, `?a=anything&made=1`]) {
      await second.goto(`/procure${query}`);
      const text = await second.locator("main").innerText();
      assert.match(text, /None yet\./, `the other owner's page, ${query || "plain"}`);
      assert.ok(!text.includes(FIRST_IDEA) || /You have not signed one off yet/.test(text), "no idea of the first owner's is shown");
      assert.ok(!text.includes(OWN_COMPANY.name));
    }
    const refused = await getFromPage(second, `/api/companies/${OWN_COMPANY.id}/requirements`);
    const missing = await getFromPage(second, `/api/companies/${OTHER_COMPANY.id}/requirements/none`);
    assert.equal(refused.status, 404);
    assert.equal(refused.body, JSON.stringify({ error: "not_found" }));
    assert.equal(missing.status, 404);
    await second.goto("/operator");
    assert.match(await second.locator("main").innerText(), /This page is for a platform operator/);
    assert.equal((await getFromPage(second, "/api/operator/pools")).status, 403);
  });
});
