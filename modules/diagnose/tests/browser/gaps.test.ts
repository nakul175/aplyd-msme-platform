// Where the factory stands, and what changed since the earlier assessment, walked in a real browser: the empty states, the five parts in
// plain words, a second assessment made by changing an answer and confirming it again, the comparison, and the same page for another
// company's owner. Every test starts its own harness, so none depends on another.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright-core";
import { TEST_TIMEOUT_MS, withBrowserHarness } from "../../../platform/tests/support/browser.ts";
import { LIBRARY } from "../../src/library.ts";
import { OWN_COMPANY, signInAsOwner, watchPage } from "../../../platform/tests/support/ui.ts";

/** Clicks "Make an assessment" for a version and waits for the page it redirects to to load; returns the assessment's id. */
async function makeAssessment(page: Page, version: number): Promise<string> {
  const loaded = page.waitForResponse((r) => r.request().isNavigationRequest() && r.request().method() === "GET" && new URL(r.url()).pathname === "/diagnose" && new URL(r.url()).searchParams.has("a"));
  await page.getByRole("button", { name: `Make an assessment from version ${version}` }).click();
  await loaded;
  await page.waitForLoadState("load");
  return new URL(page.url()).searchParams.get("a")!;
}

/** Changes answers on the Describe page and confirms them as a new version (the version after the newest one). */
async function confirmChange(page: Page, change: () => Promise<void>): Promise<void> {
  await page.goto("/factory");
  await change();
  await Promise.all([page.waitForURL((u) => u.searchParams.get("confirmed") === "1"), page.getByRole("button", { name: "Confirm this is accurate" }).click()]);
}

/** True when the page needs no sideways scroll. */
const fitsTheScreen = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
/** The height in pixels of the smallest thing a finger has to hit among these. */
async function smallestTarget(page: Page, selector: string): Promise<number> {
  const heights = await page.locator(selector).evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));
  return Math.min(...heights);
}

test("before an assessment exists, the page says what the two new sections will show and what makes them appear", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const a = await (await h.newContext()).newPage();
    await signInAsOwner(a, 0);
    await a.goto("/diagnose");
    const stand = a.getByTestId("stand-empty");
    assert.match(await stand.innerText(), /Where your factory stands/);
    assert.match(await stand.innerText(), /This will show where your factory stands on data, people, systems, money and quality, and what stands between it and each idea\. It appears once you have made your first assessment\./);
    assert.match(await stand.innerText(), /After you confirm a changed description and make a second assessment, it will also show what changed/);
    assert.equal(await a.getByTestId("stand").count(), 0);
    assert.equal(await a.getByTestId("compare").count() + (await a.getByTestId("compare-empty").count()), 0, "nothing to compare until an assessment exists");

    const b = await (await h.newContext()).newPage();
    await signInAsOwner(b, 1);
    await b.goto("/diagnose");
    assert.match(await b.getByTestId("stand-empty").innerText(), /It appears once you have made your first assessment, which needs a description of your factory that you have confirmed\./);
    assert.match(await b.getByTestId("no-description").innerText(), /You have not confirmed one yet/, "the page's own first step is still there");
  });
});

test("one assessment: the five parts are readable in plain words without the ideas, and the comparison says why it is empty", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const problems = watchPage(page);
    await signInAsOwner(page, 0);
    await page.goto("/diagnose");
    await makeAssessment(page, 1);

    // The page keeps its frame: one main, one banner, its h1, the sign-off and a decision form for every idea.
    assert.equal(await page.locator("main").count(), 1);
    assert.equal(await page.getByRole("note").count(), 1);
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "What to do about it");
    assert.equal(await page.getByTestId("signoff").count(), 1);
    assert.equal(await page.getByRole("button", { name: /^Save decision on/ }).count(), 5);

    // The ideas come first on the page; the way to the section is a link under the assessment's heading.
    assert.match(await page.getByTestId("jump").innerText(), /Go to where your factory stands, which comes after the ideas\./);
    assert.ok(!(await page.getByTestId("jump").innerText()).includes("What changed"), "one assessment: no comparison to point at");
    await page.getByRole("link", { name: "Go to where your factory stands" }).click();
    assert.equal(new URL(page.url()).hash, "#stand");
    const stand = page.getByTestId("stand");
    const lastIdea = await page.locator("li[data-testid^='item-']").last().boundingBox();
    assert.ok((await stand.boundingBox())!.y > lastIdea!.y, "the section comes after the ideas");
    assert.equal(await stand.getByRole("heading", { level: 2 }).innerText(), "Where your factory stands");
    const parts = await stand.getByRole("heading", { level: 3 }).allInnerTexts();
    assert.deepEqual(parts.map((p) => p.split("\n")[0]!.trim().replace(/\s+(Not assessed|Nothing in the way|\d+ ideas? held up)$/, "")), ["Data", "People", "Systems", "Money", "Quality"]);

    // What stands between the factory and the ideas, by part, in the library's own plain words.
    assert.match(await page.getByTestId("area-quality").innerText(), /Use a camera and software to spot defects\.\s+Do first\s+Check quality against a written list, so there is a clear standard to teach the software\./);
    assert.match(await page.getByTestId("area-data").innerText(), /Keep quality or rejection records, so there are examples to learn from\./);
    const systems = await page.getByTestId("area-systems").innerText();
    assert.match(systems, /Keep every job on a simple shared log, so the software has current jobs to work from\./);
    assert.match(systems, /Keep a stock register, so there is a current stock figure to plan against\./);
    assert.match(systems, /You answered "In accounting software" to "How do you keep accounts\?", so "Move the accounts into accounting software" was left out\./);
    assert.match(await page.getByTestId("area-money").innerText(), /The first year costs ₹1,90,000 to ₹10,00,000\. Your yearly budget is up to ₹5,00,000, so it could stretch your yearly budget\./);
    assert.match(await page.getByTestId("area-people").innerText(), /skills and staffing are not assessed/);
    assert.match(await page.getByTestId("area-people").innerText(), /Nothing in the way/);

    // On every idea the page says where its figures come from, and whether anything has to come first. It never shows a source the library does not name.
    const figures = page.locator("[data-testid^='figures-']");
    assert.equal(await figures.count(), 5);
    for (const node of await figures.all()) {
      const id = (await node.getAttribute("data-testid"))!.slice("figures-".length);
      const source = LIBRARY.find((o) => o.id === id)!.source;
      const said = (await node.innerText()).replace(/\s+/g, " ").trim();
      assert.equal(said, source === "assumption" ? "Where these figures come from: an assumption (SYNTHETIC placeholder). No study, quotation or measurement stands behind them." : `Where these figures come from: the source register, ${source}.`);
    }
    assert.match(await page.getByTestId("first-digital_job_log").innerText(), /^Nothing the library asks for first is missing\.$/);
    assert.equal(await page.getByTestId("first-camera_inspection_ai").count(), 0, "an idea with something to do first does not say nothing is missing");
    assert.match(await page.getByTestId("item-camera_inspection_ai").innerText(), /Do first:/);

    // The owner's own answers are one tap away, under each part.
    assert.ok(!(await page.getByTestId("area-systems").innerText()).includes("On paper or a register"), "the answers are folded until asked for");
    await page.getByTestId("area-systems-answers").locator("summary").click();
    assert.match(await page.getByTestId("area-systems-answers").innerText(), /How do you keep track of what is being made\?\s+On paper or a register/);

    // Readable without the idea list: the section holds no idea card and no decision control, and states its own limits.
    assert.equal(await stand.locator("li[data-testid^='item-']").count(), 0);
    assert.equal(await stand.getByRole("radio").count(), 0);
    assert.match(await stand.innerText(), /Which part a question belongs to is a choice made for this page, not a finding\./);
    assert.match(await stand.innerText(), /SYNTHETIC placeholders/);
    await stand.getByText("Idea by idea: what stands in the way").click();
    assert.match(await page.getByTestId("stand-by-idea").innerText(), /1\. Keep every job on a simple shared log\.\s+Ready to start\.\s+Nothing that the rules check stands in the way\./);

    // One assessment only: nothing to compare, and the page says what will appear and what causes it.
    assert.equal(await page.getByTestId("compare").count(), 0);
    assert.match(await page.getByTestId("compare-empty").innerText(), /You have one assessment so far, so there is nothing to compare it with\. When you confirm a changed description and make a new assessment, this shows which ideas moved up or down, which came in or dropped out, and which of your answers caused it\./);

    // A phone: no sideways scroll, and what a finger has to hit is at least 44 pixels high.
    assert.ok(await fitsTheScreen(page), "no sideways scroll at 390 pixels");
    assert.ok((await smallestTarget(page, "[data-testid='stand'] summary")) >= 44, "the folds are tall enough to tap");
    assert.deepEqual(problems, [], "no page errors, console errors or failed requests");
    assert.deepEqual(h.blockedRequests, []);
  });
});

test("a second assessment, made after an answer is changed and confirmed, shows what moved and which answers caused it; the first is still there", { timeout: TEST_TIMEOUT_MS * 2 }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const problems = watchPage(page);
    await signInAsOwner(page, 0);
    await page.goto("/diagnose");
    const first = await makeAssessment(page, 1);

    await confirmChange(page, async () => {
      await page.getByRole("group", { name: "How do you keep track of what is being made?" }).getByRole("radio", { name: "In software" }).check();
      await page.getByRole("checkbox", { name: "Quality or rejection records" }).check();
    });
    await page.goto("/diagnose");
    // Until the owner makes it, the page still shows the first assessment, marked as an older one, and says nothing false about a comparison.
    assert.match(await page.getByTestId("assessment").innerText(), /Older version/);
    assert.equal(await page.getByTestId("compare").count(), 0);
    const second = await makeAssessment(page, 2);
    assert.notEqual(second, first);

    const compare = page.getByTestId("compare");
    assert.equal(await compare.getByRole("heading", { level: 2 }).innerText(), "What changed since the earlier assessment");
    assert.match(await page.getByTestId("jump").innerText(), /What changed since the earlier assessment is just below\./);
    // The comparison is above the ideas, where the owner who has just changed an answer looks first.
    assert.ok((await compare.boundingBox())!.y < (await page.locator("li[data-testid^='item-']").first().boundingBox())!.y, "the comparison comes before the ideas");
    assert.match(await page.getByTestId("compare-which").innerText(), /This assessment is from version 2 of your description .*The one before it is from version 1 .*Both are kept as they were\./s);
    const answers = await page.getByTestId("compare-answers").innerText();
    assert.match(answers, /How do you keep track of what is being made\?\s+Was: On paper or a register\. Now: In software\./);
    assert.match(answers, /Which records do you keep in written or digital form\?\s+Was: Customer orders; Power bills\. Now: Quality or rejection records; Power bills; Customer orders\./);
    const dropped = await page.getByTestId("compare-dropped").innerText();
    assert.match(dropped, /Keep every job on a simple shared log\.\s+Was in place 1\.\s+Now it is left out\. Your answer to "How do you keep track of what is being made\?" is "In software"/);
    assert.match(dropped, /Let software propose the order of jobs on the machines\.\s+Was in place 3\./);
    const up = await page.getByTestId("compare-up").innerText();
    assert.match(up, /Check quality against a written list, with gauges\.\s+From place 2 to place 1\./);
    assert.match(up, /Use a camera and software to spot defects\.\s+From place 4 to place 2\..*No longer in the way: Keep quality or rejection records, so there are examples to learn from\. Your answer to "Which records do you keep in written or digital form\?" changed\./s);
    assert.equal(await page.getByTestId("compare-down").count(), 0);
    assert.equal(await page.getByTestId("compare-entered").count(), 0);

    // The part view follows the new answers: the job log is now left out because of the answer that changed.
    assert.match(await page.getByTestId("area-systems").innerText(), /You answered "In software" to "How do you keep track of what is being made\?", so "Keep every job on a simple shared log" was left out\./);
    assert.match(await page.getByTestId("area-data").innerText(), /Nothing in the way/);

    // The page still does its own work: three ideas, a decision form on each, the sign-off waiting.
    assert.equal(await page.locator("li[data-testid^='item-']").count(), 3);
    assert.equal(await page.getByRole("button", { name: /^Save decision on/ }).count(), 3);
    assert.ok(await page.getByRole("button", { name: "Sign off this assessment" }).isDisabled());
    assert.equal(await page.locator("main").count(), 1);
    assert.equal(await page.getByRole("note").count(), 1);
    assert.ok(await fitsTheScreen(page), "no sideways scroll at 390 pixels with the comparison open");

    // The first assessment is untouched, and from it there is nothing earlier to compare with: the page says so and offers the way to the newer one.
    await page.getByTestId("assessments").getByRole("link", { name: "From version 1" }).click();
    await page.waitForURL((u) => u.searchParams.get("a") === first);
    assert.match(await page.getByTestId("assessment").innerText(), /Assessment from version 1 of your description/);
    assert.match(await page.getByTestId("compare-empty").innerText(), /This is your earliest assessment, so there is nothing before it to compare with\./);
    const toNewest = page.getByRole("link", { name: "Open your newest assessment" });
    assert.ok((await toNewest.boundingBox())!.height >= 44, "the link is tall enough to tap");
    await toNewest.click();
    await page.waitForURL((u) => u.searchParams.get("a") === second);
    assert.equal(await page.getByTestId("compare").count(), 1);

    // Another company's owner, naming the second assessment's address, is shown nothing of it: no comparison, no answers, no ideas.
    const other = await (await h.newContext()).newPage();
    await signInAsOwner(other, 1);
    await other.goto(`/diagnose?a=${second}`);
    const shown = await other.locator("body").innerText();
    for (const text of ["What changed since the earlier assessment", "Was: On paper or a register", "Keep every job on a simple shared log", "Check quality against a written list", OWN_COMPANY.name]) assert.ok(!shown.includes(text), `owner B sees none of: ${text}`);
    assert.equal(await other.getByTestId("compare").count() + (await other.getByTestId("compare-empty").count()) + (await other.getByTestId("stand").count()), 0);
    assert.deepEqual(problems, [], "no page errors, console errors or failed requests");
  });
});

test("when every idea that matches the problems is left out, the page says so in both places and nothing can be signed", { timeout: TEST_TIMEOUT_MS * 2 }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 0);
    await page.goto("/diagnose");
    await makeAssessment(page, 1);
    await confirmChange(page, async () => {
      await page.getByRole("checkbox", { name: "Late deliveries" }).uncheck();
      await page.getByRole("checkbox", { name: "Rejections and rework" }).uncheck();
    });
    await page.goto("/diagnose");
    await makeAssessment(page, 2);
    assert.equal(await page.locator("li[data-testid^='item-']").count(), 0);
    assert.match(await page.getByTestId("no-items").innerText(), /Every idea that matches the problems you named was left out, because your answers say the problem it solves does not seem to be there\./);
    assert.match(await page.getByTestId("stand-all-left-out").innerText(), /So there are no ideas to rank\. What was left out, and the answer behind it, is under each part\./);
    const systems = await page.getByTestId("area-systems").innerText();
    assert.match(systems, /so "Follow up unpaid invoices on a fixed weekly routine" was left out\./);
    assert.match(systems, /so "Move the accounts into accounting software" was left out\./);
    assert.match(await page.getByTestId("area-money").innerText(), /Nothing in the way/);
    assert.ok(await page.getByRole("button", { name: "Sign off this assessment" }).isDisabled(), "there is nothing to sign");
    assert.match(await page.getByTestId("signoff").innerText(), /There is nothing in this assessment to decide on\./);
    assert.match(await page.getByTestId("compare").innerText(), /Both are kept as they were/, "the second assessment is compared with the first");
    assert.match(await page.getByTestId("compare-dropped").innerText(), /Keep every job on a simple shared log\.\s+Was in place 1\.\s+Now it does not match a problem you named\./);
  });
});
