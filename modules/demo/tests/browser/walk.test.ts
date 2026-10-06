// The presenter's script, followed as written, in a real browser: the launcher starts the built application in demonstration mode behind its
// access gate, and a Chromium given the gate's password does what the eight steps say, on the pages the steps name. It fails when a step
// cannot be done as the script says, when the seeded state is not what the script describes, or when a page raises an error on the way.
// All of it is SYNTHETIC. It is the demonstration's own check, not the ten-owner test.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { AUTH_PARTS, launchServe, stopAllLaunched } from "../../../hosting/tests/support/launcher.ts";
import type { Launched } from "../../../hosting/tests/support/launcher.ts";
import { chooseBrowser, launchBrowser } from "../../../platform/tests/support/browser.ts";
import { watchPage } from "../../../platform/tests/support/ui.ts";
import { DEMO_COMPANIES, OPERATOR, PLACEHOLDER_FEE_INR, WALKED_COMPANY, WITNESS_COMPANY } from "../../src/cast.ts";
import { STEPS } from "../../src/script.ts";

const TIMEOUT_MS = 170_000;
const FIRST_IDEA_TITLE = "Keep every job on a simple shared log";
const SECOND_IDEA_TITLE = "Check quality against a written list, with gauges";
let app: Launched;
let browser: Browser;
const contexts: BrowserContext[] = [];

before(
  async () => {
    browser = await launchBrowser(chooseBrowser());
    app = await launchServe({ DEMO_USER: AUTH_PARTS.user, DEMO_PASSWORD: AUTH_PARTS.password, APLYD_DEMO: "true" });
  },
  { timeout: 180_000 },
);
after(async () => {
  for (const c of contexts) await c.close().catch(() => {});
  await browser?.close().catch(() => {});
  await stopAllLaunched();
});

async function person(): Promise<Page> {
  const context = await browser.newContext({ baseURL: app.base, httpCredentials: { username: AUTH_PARTS.user, password: AUTH_PARTS.password } });
  contexts.push(context);
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(15_000);
  // Nothing may leave the application's own address.
  await context.route((url) => url.origin !== app.base, (route) => route.abort("blockedbyclient"));
  return context.newPage();
}

/** Signs in as the person the script names, by the name on the sign-in page. */
async function signInAs(page: Page, name: string): Promise<void> {
  await page.goto("/sign-in");
  const picker = page.getByLabel("Synthetic user");
  const options = await picker.locator("option").evaluateAll((nodes) => nodes.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent ?? "" })));
  const chosen = options.find((o) => o.label.startsWith(`${name} (`));
  if (!chosen) throw new Error(`the sign-in page lists no "${name}": ${JSON.stringify(options.map((o) => o.label))}`);
  await picker.selectOption(chosen.value);
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), page.getByRole("button", { name: "Sign in" }).click()]);
}

const main = (page: Page) => page.locator("main").innerText();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("the script page lists the cast and the eight steps, and the sign-in page lists everyone it names", async () => {
  const page = await person();
  const problems = watchPage(page);
  await page.goto("/demo");
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Demonstration");
  for (const s of STEPS) assert.match(await page.getByTestId(`step-${s.n}`).innerText(), new RegExp(`${s.n}\\. ${escape(s.title)}`));
  for (const c of DEMO_COMPANIES) assert.match(await page.getByTestId(`cast-${c.id}`).innerText(), new RegExp(escape(c.ownerName)));
  await page.goto("/sign-in");
  const labels = await page.getByLabel("Synthetic user").locator("option").allInnerTexts();
  for (const name of new Set(STEPS.map((s) => s.signInAs))) assert.ok(labels.some((l) => l.startsWith(`${name} (`)), `${name} is on the sign-in page`);
  assert.deepEqual(problems, []);
});

test("steps 1 to 8 can be followed as written, with no page error", { timeout: TIMEOUT_MS + 10_000 }, async () => {
  const seen: string[] = [];

  // Step 1: the operator.
  const op = await person();
  const opProblems = watchPage(op);
  await signInAs(op, OPERATOR.name);
  await op.getByRole("link", { name: "Providers and the listing fee" }).click();
  await op.waitForURL((u) => u.pathname === "/operator");
  const operatorText = await main(op);
  assert.match(operatorText, new RegExp(`₹${PLACEHOLDER_FEE_INR.toLocaleString("en-IN")}`));
  for (const n of [1, 2, 3]) assert.match(operatorText, new RegExp(`SYNTHETIC Provider ${n}`));
  const pools = await op.getByTestId("pools").innerText();
  assert.match(pools, new RegExp(`${escape(FIRST_IDEA_TITLE)}, SYNTHETIC cluster 1: 5 companies`));
  assert.ok(!pools.includes(SECOND_IDEA_TITLE), "the pool of three is not listed");
  assert.deepEqual(opProblems, []);

  // Steps 2 to 6: Company A's owner, on every stage.
  const page = await person();
  const problems = watchPage(page);
  const read = async () => seen.push(await main(page));
  await signInAs(page, WALKED_COMPANY.owner);

  // Step 2: describe.
  await page.getByRole("link", { name: "Describe your factory" }).click();
  await page.waitForURL((u) => u.pathname === "/factory");
  await page.getByLabel("What do you make?").fill("SYNTHETIC school uniforms, cotton shirts and aprons");
  await Promise.all([page.waitForURL((u) => u.pathname === "/factory" && u.search !== "" && !u.search.startsWith("?rev=")), page.getByRole("button", { name: "Confirm this is accurate" }).click()]);
  assert.match(await page.getByTestId("saved").innerText(), /Version 2 saved and confirmed as accurate/);
  await read();

  // Step 3: diagnose.
  await page.goto("/");
  await page.getByRole("link", { name: "What to do about it" }).click();
  await page.waitForURL((u) => u.pathname === "/diagnose");
  const loaded = page.waitForResponse((r) => r.request().isNavigationRequest() && r.request().method() === "GET" && new URL(r.url()).pathname === "/diagnose" && new URL(r.url()).searchParams.has("a"));
  await page.getByRole("button", { name: "Make an assessment from version 2" }).click();
  await loaded;
  await page.waitForLoadState("load");
  const titles = (await page.locator("li[data-testid^='item-'] h3").allInnerTexts()).map((t) => t.replace(/^\d+\.\s*/, ""));
  assert.equal(titles.length, 5);
  assert.deepEqual(titles.slice(0, 2), [FIRST_IDEA_TITLE, SECOND_IDEA_TITLE]);
  assert.ok((await page.locator("li[data-testid^='item-']").filter({ hasText: /\bAI\b/ }).count()) >= 3, "the AI ideas are marked");
  for (const [i, title] of titles.entries()) {
    const idea = page.getByRole("heading", { level: 3, name: `${i + 1}. ${title}`, exact: true }).locator("xpath=ancestor::li");
    await idea.getByRole("radio", { name: /Accept/ }).check();
    const saved = page.waitForResponse((r) => r.request().isNavigationRequest() && r.request().method() === "GET" && new URL(r.url()).searchParams.has("saved"));
    await idea.getByRole("button", { name: /^Save decision on/ }).click();
    await saved;
    await page.waitForLoadState("load");
  }
  assert.match(await page.getByTestId("progress").innerText(), /5 of 5 ideas decided/);
  await Promise.all([page.waitForURL((u) => u.searchParams.get("signed") === "1"), page.getByRole("button", { name: "Sign off this assessment" }).click()]);
  await read();

  // Step 4: what you need, and the floor of five.
  await page.goto("/");
  await page.getByRole("link", { name: "What you need" }).click();
  await page.waitForURL((u) => u.pathname === "/procure");
  const first = page.getByRole("heading", { level: 3, name: FIRST_IDEA_TITLE, exact: true }).locator("xpath=ancestor::li");
  await first.getByLabel("Which cluster do you ask in?").selectOption({ label: "SYNTHETIC cluster 1" });
  await Promise.all([page.waitForURL((u) => u.searchParams.has("made")), first.getByRole("button", { name: `Make a requirement from ${FIRST_IDEA_TITLE}` }).click()]);
  const firstOpen = page.getByTestId("requirement-digital_job_log");
  assert.match(await firstOpen.getByTestId("pool").innerText(), /At least 5 companies in this cluster have asked for the same thing\./);
  const offered = await firstOpen.getByTestId("providers").innerText();
  assert.match(offered, /SYNTHETIC Provider 1/);
  assert.match(offered, /SYNTHETIC Provider 2/);
  assert.ok(!/SYNTHETIC Provider 3/.test(offered), "Provider 3 does not serve the first idea in the first cluster");
  const second = page.getByRole("heading", { level: 3, name: SECOND_IDEA_TITLE, exact: true }).locator("xpath=ancestor::li");
  await second.getByLabel("Which cluster do you ask in?").selectOption({ label: "SYNTHETIC cluster 2" });
  await Promise.all([page.waitForURL((u) => u.searchParams.has("made")), second.getByRole("button", { name: `Make a requirement from ${SECOND_IDEA_TITLE}` }).click()]);
  const secondPool = await page.getByTestId("requirement-inspection_checklist_and_gauges").getByTestId("pool").innerText();
  assert.match(secondPool, /Fewer than 5 companies have asked for this in your cluster, so the number is not shown to anyone/);
  assert.ok(!/\b[0-9]+ companies/.test(secondPool.replace("Fewer than 5 companies", "")), "no count is shown for the pool under the floor (the 5 is the floor, not the count)");
  await read();

  // Step 5: choose a provider, write a plan with one milestone, agree it.
  await firstOpen.getByLabel("Which provider do you want to work with?").selectOption({ label: "SYNTHETIC Provider 1" });
  await Promise.all([page.waitForURL((u) => u.pathname === "/deliver"), firstOpen.getByRole("button", { name: `Choose a provider for ${FIRST_IDEA_TITLE}` }).click()]);
  assert.match(await main(page), /Provider: SYNTHETIC Provider 1/);
  const f = page.getByTestId("add-milestone");
  await f.getByLabel("What is delivered").fill("Job log set up on the shop floor");
  await f.getByLabel("How you will check it").fill("Ten real jobs entered and found again by a supervisor");
  await f.getByLabel("Due date (YYYY-MM-DD)").fill(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  await f.getByLabel(/^Price for this milestone/).fill("125000");
  await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "milestone"), f.getByRole("button", { name: "Add this milestone" }).click()]);
  await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "plan_agreed"), page.getByRole("button", { name: "Agree this plan" }).click()]);
  await read();

  // Step 6: the starting number, then a delivery and its acceptance; the review dates.
  await page.goto("/");
  await page.getByRole("link", { name: "Results" }).click();
  await page.waitForURL((u) => u.pathname === "/run");
  await page.getByLabel(/^The number today, before the work/).fill("42");
  await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "baseline"), page.getByRole("button", { name: "Record the starting number" }).click()]);
  await page.goto("/");
  await page.getByRole("link", { name: "Delivery" }).click();
  await page.waitForURL((u) => u.pathname === "/deliver");
  await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "delivered"), page.getByRole("button", { name: "Record that milestone 1 was delivered" }).click()]);
  await Promise.all([page.waitForURL((u) => u.searchParams.get("saved") === "accepted"), page.getByRole("button", { name: "Accept milestone 1" }).click()]);
  await page.goto("/");
  await page.getByRole("link", { name: "Results" }).click();
  await page.waitForURL((u) => u.pathname === "/run");
  for (const no of [1, 2, 3]) assert.match(await page.getByTestId(`review-${no}-due`).innerText(), /Opens on \d{4}-\d{2}-\d{2}\./);
  await read();
  assert.deepEqual(problems, [], "no page error, console error or failed request on the way");

  // Step 7: the finished example.
  const finished = DEMO_COMPANIES.find((c) => c.stage === "running")!;
  const far = await person();
  const farProblems = watchPage(far);
  await signInAs(far, finished.ownerName);
  await far.getByRole("link", { name: "Delivery" }).click();
  await far.waitForURL((u) => u.pathname === "/deliver");
  const farText = await main(far);
  assert.match(farText, /Provider: SYNTHETIC Provider 1/);
  assert.match(farText, /Payments you have recorded: ₹1,25,000/);
  assert.match(await far.getByTestId("milestone-1").innerText(), /you recorded a payment of ₹1,25,000/);
  assert.match(await far.getByTestId("milestone-2").innerText(), /Accept milestone 2/);
  await far.goto("/run");
  assert.match(await far.getByTestId("baseline").innerText(), /Starting number: 42/);
  for (const no of [1, 2, 3]) assert.match(await far.getByTestId(`review-${no}-due`).innerText(), /Opens on \d{4}-\d{2}-\d{2}\./);
  assert.deepEqual(farProblems, []);

  // Step 8: another company sees none of it.
  const witness = await person();
  await signInAs(witness, WITNESS_COMPANY.owner);
  const theirs = ["Job log set up on the shop floor", "SYNTHETIC Provider 1", "Starting number", "SYNTHETIC school uniforms, cotton shirts and aprons", ...DEMO_COMPANIES.map((c) => String(c.answers.products))];
  for (const path of ["/factory", "/diagnose", "/procure", "/deliver", "/run"]) {
    await witness.goto(path);
    const text = await main(witness);
    for (const mine of theirs) assert.ok(!text.includes(mine), `${path} shows another company's "${mine}"`);
  }

  // D-03: the fee the operator set is on none of the pages the owner read.
  for (const text of seen) assert.ok(!/₹1,500|\b1500\b/.test(text), "the listing fee is on no owner page");
});
