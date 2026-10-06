// The pages as a person sees them in a real browser: the home page and the sign-in page, with the SYNTHETIC banner.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright-core";
import { TEST_TIMEOUT_MS, useBrowserHarness } from "../support/browser.ts";
import { watchPage } from "../support/ui.ts";

const harness = useBrowserHarness();

async function openPage() {
  const context = await harness().newContext();
  const page = await context.newPage();
  return { page, problems: watchPage(page) };
}

/** The banner must be on screen at the top of the page, above the content, not only present in the markup. */
async function assertSyntheticBannerOnScreen(page: Page) {
  const banner = page.getByRole("note");
  assert.equal(await banner.count(), 1, "exactly one banner");
  assert.match(await banner.innerText(), /SYNTHETIC environment/);
  assert.match(await banner.innerText(), /Do not enter real company or personal data/);
  assert.ok(await banner.isVisible(), "the banner is visible");
  const box = await banner.boundingBox();
  const main = await page.locator("main").boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box && main && viewport, "the banner and the content have a layout");
  assert.ok(box.width > 200 && box.height > 10, `the banner has a real size (${box.width}x${box.height})`);
  assert.ok(box.y >= 0 && box.y + box.height <= viewport.height, "the banner is inside the first screen");
  assert.ok(box.y + box.height <= main.y + 1, "the banner sits above the content");
}

test("the home page renders for a visitor who is not signed in, with the SYNTHETIC banner and a way to sign in", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { page, problems } = await openPage();
  const blockedBefore = harness().blockedRequests.length;
  const response = await page.goto("/");
  assert.equal(response?.status(), 200);
  assert.equal(await page.title(), "APLYD MSME platform");
  await assertSyntheticBannerOnScreen(page);
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "APLYD MSME platform");
  assert.ok(await page.getByText("You are not signed in.").isVisible());
  const link = page.getByRole("link", { name: "Sign in" });
  assert.equal(await link.getAttribute("href"), "/sign-in");
  assert.equal(await page.getByRole("region", { name: "Company record" }).count(), 0, "no company record for a visitor");
  assert.deepEqual(problems, [], "no page errors, console errors or failed requests");
  assert.equal(harness().blockedRequests.length, blockedBefore, "the page asked for nothing outside the application");

  await Promise.all([page.waitForURL((url) => url.pathname === "/sign-in"), link.click()]);
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Sign in");
});

test("the sign-in page renders with the SYNTHETIC banner and offers only the synthetic users", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { page, problems } = await openPage();
  const blockedBefore = harness().blockedRequests.length;
  const response = await page.goto("/sign-in");
  assert.equal(response?.status(), 200);
  await assertSyntheticBannerOnScreen(page);
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Sign in");
  assert.ok(await page.getByText("There is no password.").isVisible());

  const picker = page.getByLabel("Synthetic user");
  assert.ok(await picker.isVisible(), "the picker is reachable through its label");
  const options = await picker.locator("option").evaluateAll((nodes) => nodes.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent ?? "" })));
  // The list starts on "Choose a person" (S5-21), which stands for nobody; the people follow.
  assert.deepEqual(
    options.map((o) => o.label),
    ["Choose a person", "SYNTHETIC Operator (operator)", "SYNTHETIC Owner A (owner)", "SYNTHETIC Owner B (owner)"],
  );
  assert.equal(options[0]!.value, "", "the placeholder has no address");
  for (const o of options.slice(1)) assert.match(o.value, /@synthetic\.invalid$/, `${o.value} is a reserved synthetic address`);
  assert.ok(await page.getByRole("button", { name: "Sign in" }).isEnabled());
  assert.equal(await page.getByRole("alert").count(), 0, "no refusal message before anyone has been refused");
  assert.deepEqual(problems, []);
  assert.equal(harness().blockedRequests.length, blockedBefore);
});

test("the sign-in page tells a refused person so", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { page, problems } = await openPage();
  await page.goto("/sign-in?refused=1");
  assert.equal(await page.getByRole("alert").innerText(), "That user was not found.");
  await assertSyntheticBannerOnScreen(page);
  assert.deepEqual(problems, []);
});
