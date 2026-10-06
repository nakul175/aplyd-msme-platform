// One owner's whole journey, walked through the real pages in a real browser: describe the factory, read the ideas and decide on
// every one, sign off, ask for what the owner needs, choose a provider, agree a plan, record the starting number, accept a
// delivery, and read the days to each review. Each stage has its own browser test; none of them starts at the previous stage's
// real output (they set it up by sending what the forms send). This test does, so it fails when one page's output is not what the
// next page reads: a field renamed on one side, a link that goes nowhere, a stage that cannot be reached from the home page.
//
// The operator's part (one fee, one provider) is done on the operator's own page in a second browser context. Nothing in this
// test measures a result or moves money; the numbers are typed the way an owner would type them, and all of it is SYNTHETIC.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright-core";
import { withBrowserHarness } from "../../../platform/tests/support/browser.ts";
import type { BrowserHarness } from "../../../platform/tests/support/browser.ts";
import { signInAsOwner, watchPage } from "../../../platform/tests/support/ui.ts";

const FIRST_IDEA = "Keep every job on a simple shared log";
const PROVIDER = "Alpha Works";
const CLUSTER = "SYNTHETIC cluster 1";
const DAY = 86_400_000;
const JOURNEY_TIMEOUT_MS = 170_000;

async function signInAsOperator(page: Page) {
  await page.goto("/sign-in");
  const picker = page.getByLabel("Synthetic user");
  const options = await picker.locator("option").evaluateAll((nodes) => nodes.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent ?? "" })));
  const operator = options.find((o) => /\(operator\)$/.test(o.label));
  if (!operator) throw new Error(`the sign-in page lists no operator: ${JSON.stringify(options)}`);
  await picker.selectOption(operator.value);
  await Promise.all([page.waitForURL((url) => url.pathname === "/"), page.getByRole("button", { name: "Sign in" }).click()]);
}

/** The operator, on the operator's own page: one fee, one provider that serves the first idea in the first cluster, listed. */
async function listOneProvider(h: BrowserHarness): Promise<void> {
  const op = await (await h.newContext()).newPage();
  const problems = watchPage(op);
  await signInAsOperator(op);
  await op.getByRole("link", { name: "Providers and the listing fee" }).click();
  await op.waitForURL((u) => u.pathname === "/operator");
  await op.getByLabel("Set the fee, in rupees").fill("1500");
  await Promise.all([op.waitForURL((u) => u.searchParams.get("fee") === "1"), op.getByRole("button", { name: "Save as a new version" }).click()]);
  await op.getByLabel("Name", { exact: true }).fill(PROVIDER);
  await op.getByLabel("What it does (optional)").fill("SYNTHETIC test provider");
  await op.getByLabel(FIRST_IDEA).check();
  await op.getByLabel(CLUSTER).check();
  await Promise.all([op.waitForURL((u) => u.searchParams.has("made")), op.getByRole("button", { name: "Add provider" }).click()]);
  await Promise.all([op.waitForURL((u) => u.searchParams.get("listed") === "1"), op.getByTestId(`provider-${PROVIDER}`).getByRole("button", { name: `List ${PROVIDER}` }).click()]);
  assert.deepEqual(problems, [], "the operator's pages raised no errors");
  await op.context().close();
}

/** Clicks "Make an assessment" and waits for the page it redirects to. Returns the assessment's id. */
async function makeAssessment(page: Page, version: number): Promise<string> {
  const loaded = page.waitForResponse((r) => r.request().isNavigationRequest() && r.request().method() === "GET" && new URL(r.url()).pathname === "/diagnose" && new URL(r.url()).searchParams.has("a"));
  await page.getByRole("button", { name: `Make an assessment from version ${version}` }).click();
  await loaded;
  await page.waitForLoadState("load");
  return new URL(page.url()).searchParams.get("a")!;
}

/** Accepts one idea, by its heading, with the page's own radio and button, and waits for the page the post redirects to. */
async function accept(page: Page, heading: string): Promise<void> {
  const idea = page.getByRole("heading", { level: 3, name: heading, exact: true }).locator("xpath=ancestor::li");
  await idea.getByRole("radio", { name: /Accept/ }).check();
  const loaded = page.waitForResponse((r) => r.request().isNavigationRequest() && r.request().method() === "GET" && new URL(r.url()).searchParams.has("saved"));
  await idea.getByRole("button", { name: /^Save decision on/ }).click();
  await loaded;
  await page.waitForLoadState("load");
}

async function addMilestone(page: Page, what: string, check: string, due: string, price: string): Promise<void> {
  const f = page.getByTestId("add-milestone");
  await f.getByLabel("What is delivered").fill(what);
  await f.getByLabel("How you will check it").fill(check);
  await f.getByLabel("Due date (YYYY-MM-DD)").fill(due);
  await f.getByLabel(/^Price for this milestone/).fill(price);
  await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "milestone"), f.getByRole("button", { name: "Add this milestone" }).click()]);
}

const dayText = (iso: string, plusDays: number) => new Date(new Date(iso).getTime() + plusDays * DAY).toISOString().slice(0, 10);

test("an owner goes from describing the factory to the days before the first review, using only the pages, and no stage's page is a dead end", { timeout: JOURNEY_TIMEOUT_MS + 10_000 }, async () => {
  await withBrowserHarness(
    async (h) => {
      await listOneProvider(h);

      const page = await (await h.newContext()).newPage();
      const problems = watchPage(page);
      const seen: string[] = [];
      const read = async () => seen.push(await page.locator("main").innerText());
      await signInAsOwner(page, 0);

      // 1. Describe: a new version, confirmed as accurate.
      await page.getByRole("link", { name: "Describe your factory" }).click();
      await page.waitForURL((u) => u.pathname === "/factory");
      await page.getByLabel("What do you make?").fill("SYNTHETIC school uniforms, cotton shirts and aprons");
      await Promise.all([page.waitForURL((u) => u.pathname === "/factory" && u.search !== "" && !u.search.startsWith("?rev=")), page.getByRole("button", { name: "Confirm this is accurate" }).click()]);
      assert.match(await page.getByTestId("saved").innerText(), /Version 2 saved and confirmed as accurate/);
      await read();

      // 2. Diagnose: the assessment is made from that version; every idea is decided; the owner signs off.
      await page.goto("/");
      await page.getByRole("link", { name: "What to do about it" }).click();
      await page.waitForURL((u) => u.pathname === "/diagnose");
      await makeAssessment(page, 2);
      const titles = (await page.locator("li[data-testid^='item-'] h3").allInnerTexts()).map((t) => t.replace(/^\d+\.\s*/, ""));
      assert.equal(titles.length, 5);
      assert.ok(titles.includes(FIRST_IDEA), `the first idea is among the five: ${titles.join(" | ")}`);
      for (const title of titles) await accept(page, `${titles.indexOf(title) + 1}. ${title}`);
      assert.match(await page.getByTestId("progress").innerText(), /5 of 5 ideas decided/);
      await Promise.all([page.waitForURL((u) => u.searchParams.get("signed") === "1"), page.getByRole("button", { name: "Sign off this assessment" }).click()]);
      assert.match(await page.getByTestId("signoff").innerText(), /Signed off on \d{1,2} [A-Z][a-z]+ \d{4}/);
      await read();

      // 3. Procure: a requirement for the first idea in the first cluster, and the provider the operator listed is offered for it.
      await page.goto("/");
      await page.getByRole("link", { name: "What you need" }).click();
      await page.waitForURL((u) => u.pathname === "/procure");
      const card = page.getByRole("heading", { level: 3, name: FIRST_IDEA, exact: true }).locator("xpath=ancestor::li");
      await card.getByLabel("Which cluster do you ask in?").selectOption({ label: CLUSTER });
      await Promise.all([page.waitForURL((u) => u.searchParams.has("made")), card.getByRole("button", { name: `Make a requirement from ${FIRST_IDEA}` }).click()]);
      await read();

      // 4. Deploy: choose the provider, write a plan with one milestone, agree it.
      const open = page.getByTestId("requirement-digital_job_log");
      assert.match(await open.getByTestId("providers").innerText(), new RegExp(PROVIDER));
      await open.getByLabel("Which provider do you want to work with?").selectOption({ label: PROVIDER });
      await Promise.all([page.waitForURL((u) => u.pathname === "/deliver"), open.getByRole("button", { name: `Choose a provider for ${FIRST_IDEA}` }).click()]);
      assert.match(await page.locator("main").innerText(), new RegExp(`Provider: ${PROVIDER}`));
      await addMilestone(page, "Job log set up on the shop floor", "Ten real jobs entered and found again by a supervisor", "2026-12-15", "125000");
      await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "plan_agreed"), page.getByRole("button", { name: "Agree this plan" }).click()]);
      await read();

      // 5. Run: the starting number is recorded before anything is accepted; then a delivery is recorded and accepted on the Delivery page.
      await page.goto("/");
      await page.getByRole("link", { name: "Results" }).click();
      await page.waitForURL((u) => u.pathname === "/run");
      assert.match(await page.getByTestId("waiting").innerText(), /Nothing has been accepted yet/);
      await page.getByLabel(/^The number today, before the work/).fill("42");
      await page.getByLabel("How you worked it out (optional)").fill("Counted from the September paper sheets");
      await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "baseline"), page.getByRole("button", { name: "Record the starting number" }).click()]);
      assert.match(await page.getByTestId("baseline").innerText(), /Starting number: 42/);
      await read();

      await page.goto("/");
      await page.getByRole("link", { name: "Delivery" }).click();
      await page.waitForURL((u) => u.pathname === "/deliver");
      await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "delivered"), page.getByRole("button", { name: "Record that milestone 1 was delivered" }).click()]);
      await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "accepted"), page.getByRole("button", { name: "Accept milestone 1" }).click()]);
      await read();

      await page.goto("/");
      await page.getByRole("link", { name: "Results" }).click();
      await page.waitForURL((u) => u.pathname === "/run");
      const today = new Date().toISOString().slice(0, 10);
      assert.match(await page.locator("main").innerText(), new RegExp(`You first accepted a milestone on ${today}`));
      for (const [no, n] of [[1, 30], [2, 90], [3, 180]] as const) assert.match(await page.getByTestId(`review-${no}-due`).innerText(), new RegExp(`Opens on ${dayText(new Date().toISOString(), n)}\\.`));
      assert.equal(await page.getByRole("button", { name: /^Record review/ }).count(), 0, "no review is offered before its day");
      await read();

      // The fee the operator set is not on any page the owner saw (D-03: nothing the owner chooses changes what the platform earns).
      for (const text of seen) assert.ok(!/₹1,500|\b1500\b/.test(text), "the listing fee is shown to the owner on no page");
      assert.deepEqual(problems, [], "no page errors, console errors or failed requests along the way");

      // Another company's owner sees none of it.
      const other = await (await h.newContext()).newPage();
      await signInAsOwner(other, 1);
      for (const path of ["/diagnose", "/procure", "/deliver", "/run"]) {
        await other.goto(path);
        const text = await other.locator("main").innerText();
        for (const mine of [PROVIDER, "Job log set up on the shop floor", "Counted from the September paper sheets", "Starting number: 42"]) assert.ok(!text.includes(mine), `${path} shows another company's ${mine}`);
      }
      assert.deepEqual(h.blockedRequests, []);
    },
    { timeoutMs: JOURNEY_TIMEOUT_MS },
  );
});
