// Describe your factory, walked through the real page in a real browser. Every test starts its own harness, so tests that save
// do not depend on each other or on order.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright-core";
import { TEST_TIMEOUT_MS, withBrowserHarness } from "../../../platform/tests/support/browser.ts";
import { OTHER_COMPANY, OWN_COMPANY, getFromPage, signInAsOwner, watchPage } from "../../../platform/tests/support/ui.ts";

const SEEDED_PRODUCTS = "SYNTHETIC school uniforms and cotton shirts";

/** The earlier versions sit in a card that is closed until the person opens it (it is open already on a page that shows an old version). */
async function openHistory(page: Page): Promise<void> {
  await page.locator("summary", { hasText: "Earlier versions" }).click();
}

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
    await openHistory(page);
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
    await openHistory(page);
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
    assert.match(await page.getByTestId("problem").innerText(), /Nothing was saved, because no question has been answered yet\. Answer at least one question, then save\./, "an empty form is not a description, and the person is told what to do");
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
    await second.getByLabel("What changed since last time? (optional)").fill("typed in the second tab");
    await submit(second, "Save as draft");
    assert.equal(new URL(second.url()).search, "?stale=1", "nothing typed is in the address");
    const stale = await second.getByTestId("stale").innerText();
    assert.match(stale, /not saved/);
    assert.match(stale, /Version 2 was saved while you were typing/, "it says that a newer version exists, and which");
    assert.match(stale, /Your answers are still in the boxes below/);
    assert.equal(await second.getByLabel("What do you make?").inputValue(), "SYNTHETIC second tab's text", "what was typed stays in the box (S5-02)");
    assert.equal(await second.getByLabel("What changed since last time? (optional)").inputValue(), "typed in the second tab");
    assert.match(await second.getByTestId("status").innerText(), /Newest version: 2, a draft/, "the newest saved version is named next to it");
    const look = second.getByRole("link", { name: /Look at version 2 first/ });
    assert.equal(await look.getAttribute("href"), "/factory?rev=2");
    assert.equal(await look.getAttribute("target"), "_blank", "the newest version opens in a new tab, so the typed answers are not left");
    await openHistory(second);
    assert.equal(await second.getByTestId("history").getByRole("listitem").count(), 2, "no third version appeared");

    // Saving again is now based on the newest version, so it goes through as version 3.
    await Promise.all([second.waitForURL((u) => u.searchParams.has("saved")), second.getByRole("button", { name: "Save as draft" }).click()]);
    assert.equal(new URL(second.url()).search, "?saved=3");
    assert.equal(await second.getByLabel("What do you make?").inputValue(), "SYNTHETIC second tab's text");
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

// ------------------------------------------------------------------------------------ slice 12a: S5-02, S5-12, S3-02, S3-03, FND-270

const TICKED_TWICE = "SYNTHETIC text typed before the refused save: orders are late because the cloth arrives late.";

test("S5-02: at three biggest problems the unticked boxes are switched off; a fourth that gets through is refused and everything typed is kept and marked", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const context = await h.newContext();
    const page = await context.newPage();
    const problems = watchPage(page);
    await signInAsOwner(page, 0);
    await page.goto("/factory");
    // Owner A has three biggest problems saved, so the page opens with the rest switched off.
    const box = (name: string) => page.getByRole("checkbox", { name, exact: true });
    assert.ok(await box("Machine breakdowns").isDisabled(), "a fourth cannot be ticked");
    assert.ok(await box("Late deliveries").isEnabled(), "a ticked one can always be unticked");
    assert.ok(await page.locator(".fc-limit").isVisible(), "the page says why");
    // The page's own script moves the limit as boxes are ticked and unticked.
    await box("Customers paying late").uncheck();
    assert.ok(await box("Machine breakdowns").isEnabled(), "unticking one frees the others");
    await box("Machine breakdowns").check();
    assert.ok(await box("Power and fuel cost").isDisabled(), "three again, so the rest are off again");
    await box("Machine breakdowns").uncheck();
    await box("Customers paying late").check();

    // A fourth that gets past the page (a browser without the script, or a script that edits the form) is refused by the server.
    await page.getByLabel("In your own words: describe your factory and what you would fix first").fill(TICKED_TWICE);
    await page.getByLabel("What changed since last time? (optional)").fill("note typed before the refusal");
    await page.evaluate(() => {
      for (const b of document.querySelectorAll<HTMLInputElement>('input[name="a.problems"]')) b.disabled = false;
      document.querySelector<HTMLInputElement>('input[name="a.problems"][value="energy_cost"]')!.checked = true;
    });
    await Promise.all([page.waitForURL((u) => u.pathname === "/factory" && u.searchParams.has("problem")), page.getByRole("button", { name: "Save as draft" }).click()]);
    assert.equal(new URL(page.url()).search, "?problem=invalid&fields=problems", "nothing typed is in the address");
    assert.ok(!decodeURIComponent(page.url()).includes("cloth"));
    const notice = await page.getByTestId("problem").innerText();
    assert.match(notice, /Nothing was saved/);
    assert.match(notice, /still in the boxes below/);
    assert.match(notice, /Check: Your biggest problems/);
    assert.match(await page.getByTestId("error-problems").innerText(), /Choose at most 3/, "the question that failed is marked, with its reason");
    assert.equal(await page.getByLabel("In your own words: describe your factory and what you would fix first").inputValue(), TICKED_TWICE, "the paragraph was not wiped");
    assert.equal(await page.getByLabel("What changed since last time? (optional)").inputValue(), "note typed before the refusal");
    for (const name of ["Late deliveries", "Rejections and rework", "Customers paying late", "Power and fuel cost"]) assert.ok(await box(name).isChecked(), `${name} is still ticked`);

    // Nothing was saved: the record is still one version.
    const shown = await getFromPage(page, `/api/companies/${OWN_COMPANY.id}/factory`);
    assert.equal(JSON.parse(shown.body).history.length, 1, "the refused save wrote nothing");

    // The answers travel in a cookie that only /factory receives, that script cannot read, and that lives two minutes.
    const kept = (await context.cookies()).filter((c) => c.name.startsWith("aplyd_describe_draft_"));
    assert.ok(kept.length >= 1);
    for (const c of kept) {
      assert.equal(c.httpOnly, true);
      assert.equal(c.path, "/factory");
      assert.equal(c.sameSite, "Strict");
      assert.ok(c.expires > 0 && c.expires * 1000 - Date.now() <= 125_000, "short-lived");
    }
    assert.ok(!(await page.evaluate(() => document.cookie)).includes("aplyd_describe_draft"), "script cannot read it");

    // A plain visit shows the saved version, not the typed answers.
    await page.goto("/factory");
    assert.match(await page.getByLabel("In your own words: describe your factory and what you would fix first").inputValue(), /^SYNTHETIC text\. Orders are late because cutting waits for cloth/);

    // Back to the refused page's fix: untick the fourth and save: it goes through, and the typed-answers cookie is cleared.
    await page.getByLabel("In your own words: describe your factory and what you would fix first").fill(TICKED_TWICE);
    await page.getByRole("checkbox", { name: "Customers paying late", exact: true }).uncheck();
    await Promise.all([page.waitForURL((u) => u.searchParams.has("saved")), page.getByRole("button", { name: "Save as draft" }).click()]);
    assert.equal(new URL(page.url()).search, "?saved=2");
    assert.deepEqual((await context.cookies()).filter((c) => c.name.startsWith("aplyd_describe_draft_")), [], "cleared by the save that went through");
    assert.equal(await page.getByLabel("In your own words: describe your factory and what you would fix first").inputValue(), TICKED_TWICE);
    assert.deepEqual(problems, []);
  });
});

test("S5-02: a refused save keeps the typed boxes of several kinds (text, number, choice, tick boxes)", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 1);
    await page.goto("/factory");
    await page.getByRole("radio", { name: "Electronics" }).check();
    await page.getByLabel("What do you make?").fill("SYNTHETIC circuit boards");
    await page.getByLabel("Which year did the unit start?").fill("3000");
    await page.getByRole("checkbox", { name: "Packaging" }).check();
    // The browser's own check of the number box (1900 to 2026) would stop this post before the server saw it; this is the server's check.
    await page.getByTestId("describe-form").evaluate((f) => ((f as unknown as HTMLFormElement).noValidate = true));
    await Promise.all([page.waitForURL((u) => u.searchParams.has("problem")), page.getByRole("button", { name: "Save as draft" }).click()]);
    assert.match(await page.getByTestId("error-year_started").innerText(), /Give a number from 1900 to 2026/);
    assert.equal(await page.getByLabel("Which year did the unit start?").inputValue(), "3000", "the number that was refused is still there to correct");
    assert.equal(await page.getByLabel("What do you make?").inputValue(), "SYNTHETIC circuit boards");
    assert.ok(await page.getByRole("radio", { name: "Electronics" }).isChecked());
    assert.ok(await page.getByRole("checkbox", { name: "Packaging" }).isChecked());
    assert.match(await page.getByTestId("status").innerText(), /Nothing saved yet/);
    // The year is corrected and the save goes through.
    await page.getByLabel("Which year did the unit start?").fill("2011");
    await Promise.all([page.waitForURL((u) => u.searchParams.has("saved")), page.getByRole("button", { name: "Save as draft" }).click()]);
    assert.equal(new URL(page.url()).search, "?saved=1");
    assert.equal(await page.getByLabel("Which year did the unit start?").inputValue(), "2011");
  });
});

test("S5-02: one owner's typed answers are not shown to the next person who signs in on the same browser", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const context = await h.newContext();
    const page = await context.newPage();
    await signInAsOwner(page, 1);
    await page.goto("/factory");
    await page.getByLabel("What do you make?").fill("SYNTHETIC secret of company B");
    await page.getByLabel("Which year did the unit start?").fill("3000");
    await page.getByTestId("describe-form").evaluate((f) => ((f as unknown as HTMLFormElement).noValidate = true));
    await Promise.all([page.waitForURL((u) => u.searchParams.has("problem")), page.getByRole("button", { name: "Save as draft" }).click()]);
    assert.equal(await page.getByLabel("What do you make?").inputValue(), "SYNTHETIC secret of company B");
    // Sign out and sign in as company A's owner in the same browser, then open the refused page's address.
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await signInAsOwner(page, 0);
    await page.goto("/factory?problem=invalid&fields=year_started");
    assert.ok(!(await page.locator("body").innerText()).includes("secret of company B"), "nothing of the other company's typed answers");
    assert.equal(await page.getByLabel("What do you make?").inputValue(), "SYNTHETIC school uniforms and cotton shirts");
    assert.match(await page.getByTestId("problem").innerText(), /could not be kept/);
  });
});

test("S5-12: when the newest version is confirmed the page head says so and offers the next step; the bar reads Save a new version", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 0);
    await page.goto("/factory");
    const head = page.getByTestId("confirmed-next");
    assert.match(await head.innerText(), /Your description is confirmed \(version 1\)/);
    const next = head.getByRole("link", { name: "See what is worth doing" });
    assert.equal(await next.getAttribute("href"), "/diagnose");
    const box = (await next.boundingBox())!;
    assert.ok(box.y + box.height < page.viewportSize()!.height, `the next step is on the first screen (it is ${Math.round(box.y)} px down)`);
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Describe your factory", "the h1 is as it was");
    assert.equal(await page.getByTestId("next-up").count(), 0, "the same card is not drawn again at the foot");
    assert.ok(await page.getByRole("button", { name: "Save a new version" }).isVisible());
    assert.match(await page.getByRole("button", { name: "Save a new version" }).innerText(), /^Save a new version/, "the words on the button");
    assert.ok(await page.getByRole("button", { name: "Save as draft" }).isVisible());
    await Promise.all([page.waitForURL("**/diagnose"), next.click()]);

    // An owner with nothing saved sees neither.
    const fresh = await (await h.newContext()).newPage();
    await signInAsOwner(fresh, 1);
    await fresh.goto("/factory");
    assert.equal(await fresh.getByTestId("confirmed-next").count(), 0);
    assert.ok(await fresh.getByRole("button", { name: "Confirm this is accurate" }).isVisible());
    assert.equal(await fresh.getByRole("button", { name: "Save a new version" }).count(), 0);
  });
});

test("FND-270: every version link in Earlier versions is at least 44 pixels high, at a phone's width too", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 0);
    for (const width of [1000, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/factory");
      await openHistory(page);
      const link = page.getByTestId("history").getByRole("link", { name: "Version 1" });
      const box = (await link.boundingBox())!;
      assert.ok(box.height >= 44, `at ${width} px wide the link is ${box.height} px high`);
    }
  });
});

test("S3-02, S3-03: a made-up ?saved= value is not printed; a repeated name in the address does not break the page", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 0);
    const forged = await page.goto("/factory?saved=1.%20Call%20%2B91%2099999%20to%20verify%20your%20account&confirmed=1");
    assert.equal(forged?.status(), 200);
    assert.equal(await page.getByTestId("saved").count(), 0, "a value that is not a version number gives no notice");
    assert.ok(!(await page.locator("body").innerText()).includes("verify your account"));
    await page.goto("/factory?saved=7&confirmed=1");
    assert.match(await page.getByTestId("saved").innerText(), /^Version 7 saved and confirmed as accurate\.$/, "a whole number is printed");
    for (const query of ["missing=a&missing=b", "saved=1&saved=2", "problem=invalid&problem=note&fields=sector&fields=products", "stale=1&stale=2", "rev=1&rev=2", "confirmed=1&confirmed=0&missing=sector,products&missing=employees"]) {
      const res = await page.goto(`/factory?${query}`);
      assert.equal(res?.status(), 200, query);
      assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Describe your factory", query);
    }
    await page.goto("/factory?missing=sector,products&missing=employees");
    assert.match(await page.getByTestId("missing").innerText(), /Which kind of manufacturing is it\?; What do you make\?/, "the first value is used");
  });
});
