// Describe your factory, walked through the real page in a real browser. Every test starts its own harness, so tests that save
// do not depend on each other or on order.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright-core";
import { TEST_TIMEOUT_MS, withBrowserHarness } from "../../../platform/tests/support/browser.ts";
import { OTHER_COMPANY, OWN_COMPANY, getFromPage, signInAsOwner, watchPage } from "../../../platform/tests/support/ui.ts";

const SEEDED_PRODUCTS = "SYNTHETIC school uniforms and cotton shirts";

/** Clicks a button and waits for the page the form post redirects to. */
async function submit(page: Page, name: string): Promise<void> {
  await Promise.all([page.waitForURL((url) => url.pathname === "/factory" && url.search !== "" && !url.search.startsWith("?rev=")), page.getByRole("button", { name }).click()]);
}

test("an owner opens Describe from the home page and sees their saved description filled in, with the history", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    const problems = watchPage(page);
    await signInAsOwner(page, 0);
    await page.getByRole("link", { name: "Describe your factory" }).click();
    await page.waitForURL((u) => u.pathname === "/factory");
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Describe your factory");
    assert.match(await page.getByTestId("status").innerText(), /Newest version: 1, confirmed as accurate/);
    assert.equal(await page.getByLabel("What do you make?").inputValue(), SEEDED_PRODUCTS);
    assert.equal(await page.getByLabel("Which year did the unit start?").inputValue(), "2009");
    assert.ok(await page.getByRole("radio", { name: "10 to 49" }).isChecked());
    assert.ok(await page.getByRole("checkbox", { name: "Cutting" }).isChecked());
    assert.ok(!(await page.getByRole("checkbox", { name: "Machining" }).isChecked()));
    assert.equal(await page.getByTestId("history").getByRole("listitem").count(), 1);
    assert.deepEqual(problems, [], "no page errors, console errors or failed requests");
    assert.deepEqual(h.blockedRequests, [], "the page asked nothing of any other website");
  });
});

test("saving a draft adds version 2 and keeps version 1; the old version opens read-only", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 0);
    await page.goto("/factory");
    await page.getByLabel("What do you make?").fill("SYNTHETIC school uniforms, shirts and aprons");
    await page.getByRole("radio", { name: "Two", exact: true }).check();
    await page.getByLabel("What changed since last time? (optional)").fill("second shift started");
    await submit(page, "Save as draft");

    assert.equal(new URL(page.url()).search, "?saved=2");
    assert.match(await page.getByTestId("saved").innerText(), /Version 2 saved as a draft/);
    assert.match(await page.getByTestId("status").innerText(), /Newest version: 2, a draft/);
    assert.equal(await page.getByLabel("What do you make?").inputValue(), "SYNTHETIC school uniforms, shirts and aprons");
    assert.ok(await page.getByRole("radio", { name: "Two", exact: true }).isChecked());
    const history = page.getByTestId("history");
    assert.equal(await history.getByRole("listitem").count(), 2);
    assert.match(await history.innerText(), /second shift started/);

    await history.getByRole("link", { name: "Version 1" }).click();
    await page.waitForURL((u) => u.search === "?rev=1");
    assert.match(await page.getByTestId("viewing").innerText(), /looking at version 1.*cannot be changed/);
    assert.equal(await page.getByLabel("What do you make?").inputValue(), SEEDED_PRODUCTS, "the old text is intact");
    assert.ok(await page.getByRole("radio", { name: "One", exact: true }).isChecked(), "the old answer is intact");
    assert.ok(await page.getByRole("radio", { name: "Two", exact: true }).isDisabled(), "the old version cannot be edited");
    assert.equal(await page.getByRole("button", { name: "Save as draft" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Confirm this is accurate" }).count(), 0);

    await page.getByRole("link", { name: "Go to the newest version" }).click();
    await page.waitForURL((u) => u.pathname === "/factory" && u.search === "");
    assert.equal(await page.getByLabel("What do you make?").inputValue(), "SYNTHETIC school uniforms, shirts and aprons");
  });
});

test("confirming a complete description saves it as confirmed", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 0);
    await page.goto("/factory");
    await page.getByRole("checkbox", { name: "Machining" }).check();
    await submit(page, "Confirm this is accurate");
    assert.equal(new URL(page.url()).search, "?saved=2&confirmed=1");
    assert.match(await page.getByTestId("saved").innerText(), /Version 2 saved and confirmed as accurate/);
    assert.match(await page.getByTestId("status").innerText(), /Newest version: 2, confirmed as accurate/);
    assert.ok(await page.getByRole("checkbox", { name: "Machining" }).isChecked());
  });
});

test("confirming with required questions unanswered saves a draft, says what is missing, and keeps what was typed", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 1);
    await page.goto("/factory");
    assert.match(await page.getByTestId("status").innerText(), /Nothing saved yet/);
    await page.getByRole("radio", { name: "Electronics" }).check();
    await page.getByLabel("What do you make?").fill("SYNTHETIC circuit boards");
    await submit(page, "Confirm this is accurate");

    assert.match(await page.getByTestId("saved").innerText(), /Version 1 saved as a draft/);
    const missing = await page.getByTestId("missing").innerText();
    assert.match(missing, /not confirmed/);
    for (const q of ["How many people work in the unit?", "Which of these steps happen in your unit?", "Your biggest problems"]) assert.ok(missing.includes(q), q);
    assert.ok(!missing.includes("What do you make?"), "an answered question is not listed as missing");
    assert.match(await page.getByTestId("status").innerText(), /Newest version: 1, a draft/);
    assert.equal(await page.getByLabel("What do you make?").inputValue(), "SYNTHETIC circuit boards", "the typed text was kept");
    assert.ok(await page.getByRole("radio", { name: "Electronics" }).isChecked());
  });
});

test("a draft with nothing filled in is refused and nothing is saved", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 1);
    await page.goto("/factory");
    // The form post is sent back to the page with a message (the review-fixes branch); it used to be answered with a 400 and a page of JSON.
    await Promise.all([page.waitForURL((u) => u.pathname === "/factory" && u.searchParams.has("problem")), page.getByRole("button", { name: "Save as draft" }).click()]);
    assert.match(await page.getByTestId("problem").innerText(), /Nothing was saved/, "an empty form is not a description, and the person is told");
    const shown = await getFromPage(page, `/api/companies/${OTHER_COMPANY.id}/factory`);
    assert.equal(JSON.parse(shown.body).latest, null, "nothing was written");
  });
});

test("a save from a page that is out of date is not written, and the person is told", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const context = await h.newContext();
    const first = await context.newPage();
    await signInAsOwner(first, 0);
    await first.goto("/factory");
    const second = await context.newPage();
    await second.goto("/factory");

    await first.getByLabel("What do you make?").fill("SYNTHETIC first tab's text");
    await submit(first, "Save as draft");
    assert.match(await first.getByTestId("saved").innerText(), /Version 2/);

    await second.getByLabel("What do you make?").fill("SYNTHETIC second tab's text");
    await submit(second, "Save as draft");
    assert.equal(new URL(second.url()).search, "?stale=1");
    assert.match(await second.getByTestId("stale").innerText(), /not saved/);
    assert.equal(await second.getByLabel("What do you make?").inputValue(), "SYNTHETIC first tab's text", "the newest saved version is shown");
    assert.equal(await second.getByTestId("history").getByRole("listitem").count(), 2, "no third version appeared");
  });
});

test("one owner cannot see or change the other owner's description, from the page or from script", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 1);
    await page.goto("/factory");
    const shown = await page.locator("body").innerText();
    assert.ok(!shown.includes("uniforms") && !shown.includes(OWN_COMPANY.name), "nothing of company A on the page");
    for (const name of ["c", "company", "companyId", "company_id", "id"]) {
      await page.goto(`/factory?${name}=${OWN_COMPANY.id}`);
      const named = await page.locator("body").innerText();
      assert.ok(!named.includes("uniforms") && !named.includes(OWN_COMPANY.name), `naming the other company in ?${name}= shows nothing of it`);
      assert.match(await page.getByTestId("status").innerText(), /Nothing saved yet/);
    }
    const read = await getFromPage(page, `/api/companies/${OWN_COMPANY.id}/factory`);
    assert.equal(read.status, 404);
    assert.ok(!read.body.includes("uniforms"));
    const write = await page.evaluate(async (id) => {
      const r = await fetch(`/api/companies/${id}/factory/revisions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ basedOn: 1, answers: { sector: "pharma" } }) });
      return { status: r.status, body: await r.text() };
    }, OWN_COMPANY.id);
    assert.equal(write.status, 404);
    assert.ok(!write.body.includes("uniforms"));

    const owner = await (await h.newContext()).newPage();
    await signInAsOwner(owner, 0);
    const own = await getFromPage(owner, `/api/companies/${OWN_COMPANY.id}/factory`);
    assert.equal(own.status, 200);
    assert.equal(JSON.parse(own.body).history.length, 1, "company A still has exactly its one version");
  });
});

test("the text boxes stop the person at the length the server allows", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 0);
    await page.goto("/factory");
    const box = page.getByLabel("What do you make?");
    assert.equal(await box.getAttribute("maxlength"), "500");
    await box.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText("x".repeat(600));
    assert.ok((await box.inputValue()).length <= 500, "the browser stops at 500 characters");
  });
});

test("a person who is not signed in is asked to sign in and sees no form", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await page.goto("/factory");
    assert.ok(await page.getByRole("link", { name: "Sign in" }).isVisible());
    assert.equal(await page.getByRole("button", { name: "Save as draft" }).count(), 0);
    assert.ok(!(await page.locator("body").innerText()).includes("uniforms"));
  });
});
