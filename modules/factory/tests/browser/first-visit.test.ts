// The first three screens a person meets: the visitor's home page, the sign-in page, and the owner's home page (S5-20, S5-21, S5-22).
// Each test starts its own harness, as in describe.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { TEST_TIMEOUT_MS, withBrowserHarness } from "../../../platform/tests/support/browser.ts";
import { signInAsOwner, watchPage } from "../../../platform/tests/support/ui.ts";

test("S5-20: the visitor's home page says in two plain sentences what the owner gives and what they get, names no price, and keeps the word MSME to the app name", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    const problems = watchPage(page);
    await page.goto("/");
    const hero = page.locator("section.hero");
    const text = await hero.innerText();
    assert.match(text, /You give us a description of your factory/);
    assert.match(text, /You get back a short ranked list of ideas, a plan written with a provider you choose, and a before-and-after number measured with your own figures/);
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "APLYD MSME platform", "the h1 is as it was: the app name");
    assert.ok(await page.getByRole("link", { name: "Sign in" }).first().isVisible());
    const body = await page.locator("main").innerText();
    assert.equal(body.replace("APLYD MSME platform", "").match(/MSME/g), null, "the word MSME is only in the app name");
    assert.ok(!/\b(price|priced|costs?|fees?|free|rupees?|₹|Rs\.?)\b/i.test(text), "no price or cost is stated: none is decided");
    assert.deepEqual(problems, []);
  });
});

test("S5-21: sign-in starts on Choose a person, not on the operator; pressing Sign in with it gives the refusal message and signs nobody in", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    const problems = watchPage(page);
    await page.goto("/sign-in");
    const picker = page.getByLabel("Synthetic user");
    assert.equal(await picker.evaluate((s) => (s as unknown as HTMLSelectElement).selectedOptions[0]!.textContent), "Choose a person");
    const labels = await picker.locator("option").allInnerTexts();
    assert.equal(labels[0], "Choose a person", "the placeholder is first");
    assert.ok(labels.some((l) => /\(operator\)$/.test(l)) && labels.some((l) => /\(owner\)$/.test(l)), "the people are still listed");
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Sign in");
    await Promise.all([page.waitForURL((u) => u.pathname === "/sign-in" && u.searchParams.get("refused") === "1"), page.getByRole("button", { name: "Sign in" }).click()]);
    assert.match(await page.getByRole("alert").innerText(), /That user was not found\./);
    assert.ok(await page.getByRole("button", { name: "Sign in" }).isVisible(), "still on the sign-in form");
    await page.goto("/");
    assert.ok(await page.getByRole("link", { name: "Sign in" }).first().isVisible(), "nobody is signed in");
    assert.equal(await page.getByRole("button", { name: "Sign out" }).count(), 0);
    assert.deepEqual(problems, []);
  });
});

test("S5-22: the owner's home page does not repeat 'Signed in as' under the card; the header still says who is signed in", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    const who = await signInAsOwner(page, 0);
    assert.ok(!(await page.locator("main").innerText()).includes("Signed in as"), "no 'Signed in as' line on the page");
    assert.ok((await page.locator("header").first().innerText()).includes(who.displayName), "the header names the person");
    assert.ok(await page.getByRole("button", { name: "Sign out" }).isVisible());
    assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
  });
});
