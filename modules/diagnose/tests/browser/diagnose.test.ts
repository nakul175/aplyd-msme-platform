// Diagnose, walked through the real pages in a real browser. Every test starts its own harness, so tests that save do not
// depend on each other or on order.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "playwright-core";
import { TEST_TIMEOUT_MS, withBrowserHarness } from "../../../platform/tests/support/browser.ts";
import { OTHER_COMPANY, OWN_COMPANY, getFromPage, signInAsOwner, watchPage } from "../../../platform/tests/support/ui.ts";

const FIRST_IDEA = "Keep every job on a simple shared log";

/** Clicks "Make an assessment" and waits for the page it redirects to to load (it may be the page already shown). */
async function makeAssessment(page: Page, version = 1): Promise<string> {
  const loaded = page.waitForResponse((r) => r.request().isNavigationRequest() && r.request().method() === "GET" && new URL(r.url()).pathname === "/diagnose" && new URL(r.url()).searchParams.has("a"));
  await page.getByRole("button", { name: `Make an assessment from version ${version}` }).click();
  await loaded;
  await page.waitForLoadState("load");
  return new URL(page.url()).searchParams.get("a")!;
}
const ideas = (page: Page) => page.locator("li[data-testid^='item-']");

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The idea whose heading is exactly this title (a title can also appear inside another idea's text). */
const ideaTitled = (page: Page, title: string) => page.getByRole("heading", { level: 3, name: new RegExp(`^\\d+\\. ${escapeRegExp(title)}$`) }).locator("xpath=ancestor::li");

/** Picks a decision on one idea and saves it; waits for the page the post redirects to. */
async function decideOn(page: Page, title: string, decision: RegExp, note = "") {
  const idea = ideaTitled(page, title);
  await idea.getByRole("radio", { name: decision }).check();
  if (note) await idea.getByLabel("A note for yourself (optional)").fill(note);
  const loaded = page.waitForResponse((r) => r.request().isNavigationRequest() && r.request().method() === "GET" && new URL(r.url()).searchParams.has("saved"));
  await idea.getByRole("button", { name: /^Save decision on/ }).click();
  await loaded;
  await page.waitForLoadState("load");
}

test("an owner follows the link from the home page, makes an assessment, and reads the ranked ideas with their costs, risks and what to do first", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    const problems = watchPage(page);
    await signInAsOwner(page, 0);
    await page.getByRole("link", { name: "What to do about it" }).click();
    await page.waitForURL((u) => u.pathname === "/diagnose");
    assert.match(await page.locator("main").innerText(), /SYNTHETIC .*placeholders/s);
    assert.equal(await page.getByTestId("assessments").count(), 0, "nothing is made until the owner asks");
    await makeAssessment(page);

    assert.equal(await ideas(page).count(), 5);
    const first = ideas(page).first();
    assert.match(await first.innerText(), new RegExp(`^1\\. ${FIRST_IDEA}`));
    assert.ok(await first.getByText("No AI needed").isVisible());
    assert.match(await first.innerText(), /₹20,000 to ₹80,000/);
    assert.match(await first.innerText(), /Hidden costs to expect: Someone has to enter the data every shift/);
    assert.match(await first.innerText(), /Why it is here: You named these problems: late deliveries; rejections and rework\./);

    const camera = page.getByTestId("item-camera_inspection_ai");
    assert.ok(await camera.getByText("Uses AI").isVisible());
    assert.match(await camera.innerText(), /₹2,00,000 to ₹10,00,000/, "Indian digit grouping in the browser too");
    assert.match(await camera.innerText(), /Do first: First check quality against a written list/);
    assert.ok(await camera.getByText("Needs something else first").isVisible());
    assert.ok(await camera.getByText("Medium risk").isVisible());

    assert.match(await page.getByTestId("drafted-by").innerText(), /Drafted by a set of rules .* not by an AI model/);
    await page.getByText("How the ideas were ranked").click();
    const ranking = await page.locator("details", { hasText: "How the ideas were ranked" }).innerText();
    assert.match(ranking, /Whether an idea uses AI plays no part in the ranking/);
    // The weights on the page are the engine's own, so a reader can check the order by hand.
    assert.match(ranking, /Each idea starts with 10 points for every problem you named that it addresses/);
    assert.match(ranking, /ready to start \(4\), needing a check \(2\) or needing something else first \(0\)/);
    assert.match(ranking, /fitting your yearly budget \(2\), stretching it \(0\) or going over \(-2\)/);
    assert.match(ranking, /for risk \(low 0, medium -1, high -2\)/);
    await page.getByText(/Ideas left out/).click();
    assert.match(await page.getByTestId("left-out").innerText(), /Your answer to "How do you keep accounts\?" is "In accounting software"/);

    assert.equal(await page.getByTestId("assessments").getByRole("listitem").count(), 1);
    assert.match(await page.getByTestId("assessments").innerText(), /From version 1 .* 0 of 5 decided/);
    assert.deepEqual(problems, [], "no page errors, console errors or failed requests");
    assert.deepEqual(h.blockedRequests, []);
  });
});

test("making it again shows the same assessment, not a second one", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 0);
    await page.goto("/diagnose");
    const first = await makeAssessment(page);
    const second = await makeAssessment(page);
    assert.equal(second, first);
    assert.equal(await page.getByTestId("assessments").getByRole("listitem").count(), 1);
  });
});

test("a decision is saved with its note, can be changed, and the progress and the list follow; the sign-off waits until every idea is decided", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 0);
    await page.goto("/diagnose");
    await makeAssessment(page);
    const signOff = page.getByRole("button", { name: "Sign off this assessment" });
    assert.ok(await signOff.isDisabled(), "disabled with nothing decided");
    assert.match(await page.getByTestId("progress").innerText(), /0 of 5 ideas decided/);

    await decideOn(page, FIRST_IDEA, /Later/, "after the festival season");
    assert.match(await page.getByTestId("saved").innerText(), /Your decision was saved/);
    assert.match(await page.getByTestId("progress").innerText(), /1 of 5 ideas decided/);
    const first = page.getByTestId("item-digital_job_log");
    assert.ok(await first.getByRole("radio", { name: /Later/ }).isChecked(), "the saved choice is shown");
    assert.equal(await first.getByLabel("A note for yourself (optional)").inputValue(), "after the festival season");

    await decideOn(page, FIRST_IDEA, /Accept/, "changed my mind");
    assert.match(await page.getByTestId("progress").innerText(), /1 of 5 ideas decided/, "changing a decision does not count it twice");
    assert.ok(await page.getByTestId("item-digital_job_log").getByRole("radio", { name: /Accept/ }).isChecked());
    assert.match(await page.getByTestId("assessments").innerText(), /1 of 5 decided/);
    assert.ok(await signOff.isDisabled(), "still disabled with four ideas undecided");

    // The server refuses an early sign-off even when the button is bypassed.
    const early = await page.evaluate(async (a) => {
      const r = await fetch(`/api/companies/company-synthetic-a/assessments/${a}/signoff`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      return { status: r.status, body: await r.text() };
    }, new URL(page.url()).searchParams.get("a"));
    assert.equal(early.status, 409);
    assert.equal(early.body, JSON.stringify({ error: "undecided" }));
  });
});

test("deciding on every idea and signing off fixes the assessment: the forms go, the choices stay, and the fingerprint matches", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    const problems = watchPage(page);
    await signInAsOwner(page, 0);
    await page.goto("/diagnose");
    const id = await makeAssessment(page);
    const titles = await page.locator("li[data-testid^='item-'] h3").allInnerTexts();
    assert.equal(titles.length, 5);
    for (const [n, full] of titles.entries()) await decideOn(page, full.replace(/^\d+\.\s*/, ""), n % 2 === 0 ? /Accept/ : /No: not for me/);
    assert.match(await page.getByTestId("progress").innerText(), /5 of 5 ideas decided/);

    await page.getByLabel("A note (optional)").fill("Read with my brother.");
    await Promise.all([page.waitForURL((u) => u.searchParams.get("signed") === "1"), page.getByRole("button", { name: "Sign off this assessment" }).click()]);
    assert.match(await page.getByTestId("signed").innerText(), /Signed off/);
    const box = page.getByTestId("signoff");
    // Dates read "6 October 2026" since 6 October 2026 (formatDate); the fingerprint is behind a closed "How this is checked" (S5-13).
    assert.match(await box.innerText(), /Signed off on \d{1,2} [A-Z][a-z]+ \d{4}\. Your note: Read with my brother\./);
    assert.match(await box.getByTestId("unchanged").innerText(), /^Nothing in this list has changed since you signed it\.$/);
    await box.getByText("How this is checked").click();
    assert.match(await box.innerText(), /checked just now: it matches/);
    assert.doesNotMatch(await page.getByTestId("drafted-by").innerText(), /decide on each idea below/, "after sign-off the page does not ask for decisions");
    assert.equal(await page.getByRole("button", { name: /^Save decision on/ }).count(), 0, "no decision forms");
    assert.equal(await page.getByRole("radio").count(), 0);
    assert.match(await page.getByTestId("decision-digital_job_log").innerText(), /Your decision: Accept: I want to do this/);
    assert.match(await page.getByTestId("assessments").innerText(), /signed off/);

    // A late decision from script is refused and changes nothing.
    const late = await page.evaluate(async (a) => {
      const r = await fetch(`/api/companies/company-synthetic-a/assessments/${a}/decisions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opportunityId: "digital_job_log", decision: "reject" }) });
      return { status: r.status, body: await r.text() };
    }, id);
    assert.equal(late.status, 409);
    await page.reload();
    assert.match(await page.getByTestId("decision-digital_job_log").innerText(), /Accept/);
    assert.deepEqual(problems, ["console error: Failed to load resource: the server responded with a status of 409 (Conflict)"], "only the refusal of the late decision sent from script");
  });
});

test("an owner with no confirmed description is sent to describe the factory, does that in the browser, and then gets an assessment of their own problems", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 1);
    await page.goto("/diagnose");
    assert.match(await page.getByTestId("no-description").innerText(), /You have not confirmed one yet/);
    assert.equal(await page.getByRole("button", { name: /Make an assessment/ }).count(), 0);
    await page.getByRole("link", { name: "Describe your factory" }).click();
    await page.waitForURL((u) => u.pathname === "/factory");

    await page.getByRole("radio", { name: "Electronics" }).check();
    await page.getByLabel("What do you make?").fill("SYNTHETIC circuit boards");
    await page.getByRole("radio", { name: "10 to 49" }).check();
    await page.getByRole("checkbox", { name: "Electronics assembly" }).check();
    await page.getByRole("checkbox", { name: "Machine breakdowns" }).check();
    await page.getByRole("radio", { name: "When they break" }).check();
    await Promise.all([page.waitForURL((u) => u.searchParams.get("confirmed") === "1"), page.getByRole("button", { name: "Confirm this is accurate" }).click()]);

    await page.goto("/diagnose");
    await makeAssessment(page);
    const titles = await page.locator("li[data-testid^='item-'] h3").allInnerTexts();
    assert.ok(titles.some((t) => /Service the main machines on a calendar/.test(t)), "an idea for the breakdowns the owner named");
    assert.ok(!titles.some((t) => /shared log/.test(t)), "nothing for problems they did not name");
    assert.match(await page.locator("main").innerText(), /Problems you named: Machine breakdowns\./);
  });
});

test("an owner who names a problem the library cannot match is told so, not shown an empty list", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 1);
    await page.goto("/factory");
    await page.getByRole("radio", { name: "Electronics" }).check();
    await page.getByLabel("What do you make?").fill("SYNTHETIC circuit boards");
    await page.getByRole("radio", { name: "10 to 49" }).check();
    await page.getByRole("checkbox", { name: "Electronics assembly" }).check();
    await page.getByRole("checkbox", { name: "Something else", exact: true }).nth(1).check();
    await Promise.all([page.waitForURL((u) => u.searchParams.get("confirmed") === "1"), page.getByRole("button", { name: "Confirm this is accurate" }).click()]);
    await page.goto("/diagnose");
    await makeAssessment(page);
    assert.match(await page.getByTestId("no-items").innerText(), /Nothing in the library matches the problems you named/);
    assert.equal(await ideas(page).count(), 0);
  });
});

test("one owner cannot see or touch the other owner's assessment, by address, by script or by naming it in their own company", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const owner = await (await h.newContext()).newPage();
    await signInAsOwner(owner, 0);
    await owner.goto("/diagnose");
    const id = await makeAssessment(owner);

    const page = await (await h.newContext()).newPage();
    await signInAsOwner(page, 1);
    await page.goto(`/diagnose?a=${id}`);
    const shown = await page.locator("body").innerText();
    assert.ok(!shown.includes(FIRST_IDEA) && !shown.includes(OWN_COMPANY.name), "nothing of the other company's assessment on the page");
    assert.equal(await ideas(page).count(), 0);
    for (const name of ["c", "company", "companyId", "company_id", "id"]) {
      await page.goto(`/diagnose?${name}=${OWN_COMPANY.id}`);
      const named = await page.locator("body").innerText();
      assert.ok(!named.includes(FIRST_IDEA) && !named.includes("From version 1"), `naming the other company in ?${name}= shows nothing of it`);
    }
    for (const path of [`/api/companies/${OWN_COMPANY.id}/assessments`, `/api/companies/${OWN_COMPANY.id}/assessments/${id}`, `/api/companies/${OTHER_COMPANY.id}/assessments/${id}`]) {
      const r = await getFromPage(page, path);
      assert.equal(r.status, 404, path);
      assert.equal(r.body, JSON.stringify({ error: "not_found" }));
    }
    const write = await page.evaluate(
      async ({ company, a }) => {
        const r = await fetch(`/api/companies/${company}/assessments/${a}/decisions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opportunityId: "digital_job_log", decision: "reject" }) });
        return r.status;
      },
      { company: OWN_COMPANY.id, a: id },
    );
    assert.equal(write, 404);
    const ownersView = await getFromPage(owner, `/api/companies/${OWN_COMPANY.id}/assessments/${id}`);
    assert.equal(JSON.parse(ownersView.body).standing.length, 0, "the owner's assessment has no decision from outside");
  });
});

test("a person who is not signed in is asked to sign in and sees no assessment", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await page.goto("/diagnose");
    assert.ok(await page.getByRole("link", { name: "Sign in" }).isVisible());
    assert.equal(await page.getByRole("button", { name: /Make an assessment/ }).count(), 0);
  });
});
