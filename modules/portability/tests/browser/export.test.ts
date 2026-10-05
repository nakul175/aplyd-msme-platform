// Take your data with you, in a real browser against the built application: the owner opens /export, sees what the file holds and
// downloads it with the link, and the file parses as the documented JSON; a visitor sees the one "Sign in" link; the operator is told the
// operator cannot export a company's records and the API refuses them; another company's owner cannot fetch the file. One Worker for the
// file; every test has its own browser context and so its own session.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { Page } from "playwright-core";
import { TEST_TIMEOUT_MS, useBrowserHarness } from "../../../platform/tests/support/browser.ts";
import { OTHER_COMPANY, OWN_COMPANY, getFromPage, signInAsOwner, watchPage } from "../../../platform/tests/support/ui.ts";

const harness = useBrowserHarness();
const TITLE = "Take your data with you";
const EXPORT_API = `/api/companies/${OWN_COMPANY.id}/export`;

async function openPage() {
  const page = await (await harness().newContext()).newPage();
  return { page, problems: watchPage(page) };
}

async function signInAsOperator(page: Page) {
  await page.goto("/sign-in");
  const picker = page.getByLabel("Synthetic user");
  const options = await picker.locator("option").evaluateAll((nodes) => nodes.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent ?? "" })));
  const operator = options.find((o) => /\(operator\)$/.test(o.label));
  if (!operator) throw new Error(`the sign-in page lists no operator: ${JSON.stringify(options)}`);
  await picker.selectOption(operator.value);
  await Promise.all([page.waitForURL((url) => url.pathname === "/"), page.getByRole("button", { name: "Sign in" }).click()]);
}

/** The frame every page keeps: one main, one h1 with the page's title, one SYNTHETIC banner. */
async function assertFrame(page: Page) {
  assert.equal(await page.locator("main").count(), 1, "one main");
  assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1, "one h1");
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), TITLE);
  assert.equal(await page.getByRole("note").count(), 1, "one SYNTHETIC banner");
}

test("an owner opens the page, sees what the file holds, and the download link gives the company's records as JSON that parses", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { page, problems } = await openPage();
  const blockedBefore = harness().blockedRequests.length;
  await signInAsOwner(page, 0);
  const response = await page.goto("/export");
  assert.equal(response?.status(), 200);
  await assertFrame(page);
  assert.match(await page.getByTestId("count-company").innerText(), /^1 record$/);
  assert.match(await page.getByTestId("count-factoryDescriptions").innerText(), /^1 version$/, "the seeded description");
  assert.match(await page.getByTestId("count-requirements").innerText(), /^0 requests$/);
  assert.match(await page.getByTestId("not-closed").innerText(), /does not close your account/);
  assert.match(await page.locator("main").innerText(), /The file is yours/);
  assert.match(await page.locator("main").innerText(), /SYNTHETIC/);
  assert.doesNotMatch(await page.locator("main").innerText(), /₹|1,500|\bfee\b/i, "no fee and no amount on the page");

  const link = page.getByRole("link", { name: "Download your records" });
  assert.equal(await link.count(), 1);
  assert.equal(await link.getAttribute("href"), EXPORT_API);
  assert.notEqual(await link.getAttribute("download"), null, "the link asks the browser to save the file");

  // What is left out is said on the page, behind its summary.
  await page.locator("summary", { hasText: "What is not in the file, and why" }).click();
  assert.match(await page.getByTestId("not-included").innerText(), /Other companies' records\./);

  // The person's own click saves the file; it parses as the documented format.
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  assert.match(download.suggestedFilename(), /^aplyd-records-company-synthetic-a-\d{4}-\d{2}-\d{2}\.json$/);
  const saved = JSON.parse(await readFile((await download.path())!, "utf8")) as { format: string; version: number; synthetic: boolean; companyId: string; company: { name: string }; counts: { factoryDescriptions: number }; factoryDescriptions: unknown[] };
  assert.equal(saved.format, "aplyd-msme-company-records");
  assert.equal(saved.version, 1);
  assert.equal(saved.synthetic, true);
  assert.equal(saved.companyId, OWN_COMPANY.id);
  assert.equal(saved.company.name, OWN_COMPANY.name);
  assert.equal(saved.counts.factoryDescriptions, 1);
  assert.equal(saved.factoryDescriptions.length, 1);
  assert.ok(!JSON.stringify(saved).includes(OTHER_COMPANY.id), "nothing of the other company");

  // The same address fetched by the page answers the same way, and another company's address is refused.
  const fetched = await getFromPage(page, EXPORT_API);
  assert.equal(fetched.status, 200);
  assert.equal((JSON.parse(fetched.body) as { companyId: string }).companyId, OWN_COMPANY.id);
  const other = await getFromPage(page, `/api/companies/${OTHER_COMPANY.id}/export`);
  assert.equal(other.status, 404);
  assert.deepEqual(JSON.parse(other.body), { error: "not_found" });

  // The one console line expected is the browser's own note of the 404 just asked for.
  assert.deepEqual(problems.filter((p) => !/status of 404/.test(p)), [], "no page errors, console errors or failed requests");
  assert.equal(problems.length, 1, "exactly the one refusal");
  assert.equal(harness().blockedRequests.length, blockedBefore, "the page asked for nothing outside the application");
});

test("a visitor sees the page's title and one link named Sign in, no download, and the file is refused without a session", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { page, problems } = await openPage();
  const response = await page.goto("/export");
  assert.equal(response?.status(), 200);
  await assertFrame(page);
  const signIn = page.getByRole("link", { name: "Sign in" });
  assert.equal(await signIn.count(), 1, "exactly one Sign in link");
  assert.equal(await signIn.getAttribute("href"), "/sign-in");
  assert.equal(await page.getByRole("link", { name: "Download your records" }).count(), 0);
  const refused = await getFromPage(page, EXPORT_API);
  assert.equal(refused.status, 401);
  assert.deepEqual(JSON.parse(refused.body), { error: "not_signed_in" });
  assert.deepEqual(problems.filter((p) => !/401/.test(p)), [], "no page errors");
});

test("the operator is told the operator cannot export a company's records, and the file is refused", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { page, problems } = await openPage();
  await signInAsOperator(page);
  const response = await page.goto("/export");
  assert.equal(response?.status(), 200);
  await assertFrame(page);
  assert.match(await page.getByTestId("operator-cannot-export").innerText(), /The operator cannot download a company's records\. Only a person of that company can\./);
  assert.equal(await page.getByRole("link", { name: "Download your records" }).count(), 0);
  const refused = await getFromPage(page, EXPORT_API);
  assert.equal(refused.status, 404);
  assert.deepEqual(JSON.parse(refused.body), { error: "not_found" });
  assert.deepEqual(problems.filter((p) => !/404/.test(p)), [], "no page errors");
});
