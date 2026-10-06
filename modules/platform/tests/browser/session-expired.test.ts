// BR-UX-06 in a real browser: a person fills in a form, the session ends before they press Save, and they are taken to the sign-in page with a plain message
// instead of a page of JSON. Nothing they typed is saved. Two ways a session ends: the cookie is gone, and the cookie is still there but has run out.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrowserContext, Page } from "playwright-core";
import { SESSION_SECONDS, signSession } from "../../src/identity/session.ts";
import { TEST_TIMEOUT_MS, useBrowserHarness } from "../support/browser.ts";
import { SESSION_COOKIE, signInAsFirstOwner, watchPage } from "../support/ui.ts";

const SECRET = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
const harness = useBrowserHarness({ SESSION_SECRET: SECRET });
const TYPED = "SYNTHETIC text typed just before the session ended";
const SEEDED = "SYNTHETIC school uniforms and cotton shirts";

async function ownerWithFormOpen() {
  const h = harness();
  const context = await h.newContext();
  const page = await context.newPage();
  const problems = watchPage(page);
  await signInAsFirstOwner(page);
  await page.goto("/factory");
  assert.equal(await page.getByLabel("What do you make?").inputValue(), SEEDED, "version 1 is what the page starts from");
  await page.getByLabel("What do you make?").fill(TYPED);
  return { h, context, page, problems };
}

/** Presses Save as draft and waits for whichever page the form post sends the person to. */
async function pressSave(page: Page): Promise<void> {
  await Promise.all([page.waitForURL((u) => u.pathname === "/sign-in"), page.getByRole("button", { name: "Save as draft" }).click()]);
}

async function assertToldToSignInAgain(page: Page): Promise<void> {
  assert.equal(new URL(page.url()).search, "?expired=1");
  const notice = page.getByTestId("expired");
  assert.match(await notice.innerText(), /Your session has ended\. Sign in again; what you typed was not saved\./);
  assert.equal(await notice.getAttribute("role"), "alert", "read out at once by a screen reader");
  assert.equal(await page.title(), "Sign in: APLYD");
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Sign in");
  assert.ok(!(await page.locator("body").innerText()).includes('"error"'), "no JSON on the page");
  assert.ok(await page.getByRole("button", { name: "Sign in" }).isVisible(), "the way forward is on the page");
}

/** Signs in again from the sign-in page and shows that the typed text was never written: the newest version is still version 1. */
async function signInAgainAndCheckNothingWasSaved(page: Page): Promise<void> {
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), (async () => {
    const owner = (await page.getByLabel("Synthetic user").locator("option").evaluateAll((nodes) => nodes.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent ?? "" })))).find((o) => /\(owner\)$/.test(o.label));
    assert.ok(owner, "an owner is listed");
    await page.getByLabel("Synthetic user").selectOption(owner.value);
    await page.getByRole("button", { name: "Sign in" }).click();
  })()]);
  await page.goto("/factory");
  assert.match(await page.getByTestId("status").innerText(), /Newest version: 1,/, "still version 1");
  assert.equal(await page.getByLabel("What do you make?").inputValue(), SEEDED, "what was typed was not saved");
}

test("the session cookie is gone when Save is pressed: the person lands on the sign-in page with the message, and nothing is saved", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { context, page, problems } = await ownerWithFormOpen();
  await context.clearCookies();
  await pressSave(page);
  await assertToldToSignInAgain(page);
  await signInAgainAndCheckNothingWasSaved(page);
  assert.deepEqual(problems, [], "no page error, console error or failed request");
});

test("the cookie is still there but ran out eight hours ago: the same message, and nothing is saved", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { h, context, page } = await ownerWithFormOpen();
  const own = (await context.cookies()).find((c) => c.name === SESSION_COOKIE);
  assert.ok(own, "signed in");
  const userId = JSON.parse(atob(own.value.split(".")[0].replaceAll("-", "+").replaceAll("_", "/"))).u as string;
  const ranOut = await signSession(userId, SECRET, Math.floor(Date.now() / 1000) - SESSION_SECONDS - 60);
  await context.clearCookies();
  await expire(context, h.base, ranOut);
  await pressSave(page);
  await assertToldToSignInAgain(page);
  await signInAgainAndCheckNothingWasSaved(page);
});

async function expire(context: BrowserContext, base: string, token: string): Promise<void> {
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: base, httpOnly: true, secure: true, sameSite: "Lax" }]);
}

test("a program call from the same browser, with no session, still gets JSON and a 401", { timeout: TEST_TIMEOUT_MS }, async () => {
  const context = await harness().newContext();
  const page = await context.newPage();
  await page.goto("/sign-in");
  const answer = await page.evaluate(async () => {
    const r = await fetch("/api/companies/company-synthetic-a/factory/revisions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ basedOn: null, answers: { shifts: "two" } }) });
    return { status: r.status, body: await r.text() };
  });
  assert.equal(answer.status, 401);
  assert.deepEqual(JSON.parse(answer.body), { error: "not_signed_in" });
});
