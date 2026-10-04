// Sign-in, the session cookie, the scope rule and sign-out, walked through the real pages in a real browser.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrowserContext, Cookie } from "playwright-core";
import { TEST_TIMEOUT_MS, useBrowserHarness } from "../support/browser.ts";
import { OTHER_COMPANY, OWN_COMPANY, SESSION_COOKIE, getFromPage, signInAsFirstOwner, signInAsOwner, watchPage } from "../support/ui.ts";

const harness = useBrowserHarness();

const sessionCookie = async (context: BrowserContext): Promise<Cookie | undefined> => (await context.cookies()).find((c) => c.name === SESSION_COOKIE);

async function signedInPage() {
  const context = await harness().newContext();
  const page = await context.newPage();
  const problems = watchPage(page);
  const who = await signInAsFirstOwner(page);
  return { context, page, problems, who };
}

test("an owner picks themselves on the sign-in page, submits, and lands signed in on the home page", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { page, who } = await signedInPage();
  assert.equal(who.displayName, "SYNTHETIC Owner A", "the first owner on the page");
  assert.equal(new URL(page.url()).pathname, "/");
  assert.match(await page.locator("main").innerText(), /Signed in as SYNTHETIC Owner A\s+owner/);
  assert.equal(await page.getByText("You are not signed in.").count(), 0);
  assert.ok(await page.getByRole("button", { name: "Sign out" }).isVisible());
});

test("the session cookie the browser holds is HttpOnly, SameSite=Lax, Secure and eight hours long", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { context } = await signedInPage();
  const cookies = await context.cookies();
  assert.deepEqual(cookies.map((c) => c.name), [SESSION_COOKIE], "one cookie, the session");
  const cookie = cookies[0];
  assert.equal(cookie.httpOnly, true, "HttpOnly");
  assert.equal(cookie.sameSite, "Lax", "SameSite=Lax");
  assert.equal(cookie.secure, true, "Secure (a browser accepts it on loopback; real hosting is not tested here)");
  assert.equal(cookie.path, "/");
  assert.match(cookie.value, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "a signed token: payload.mac");
  const hours = (cookie.expires - Date.now() / 1000) / 3600;
  assert.ok(hours > 7.9 && hours <= 8, `expires in about eight hours (${hours.toFixed(3)})`);
});

test("a script on the page cannot read the session cookie or replace it", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { context, page } = await signedInPage();
  const original = await sessionCookie(context);
  assert.ok(original, "signed in");

  const visible = await page.evaluate(async () => ({
    cookieString: document.cookie,
    store: typeof cookieStore === "undefined" ? "no cookieStore" : (await cookieStore.getAll()).map((c) => c.name),
  }));
  assert.equal(visible.cookieString, "", "document.cookie shows nothing");
  assert.ok(!visible.cookieString.includes(original.value) && !visible.cookieString.includes(SESSION_COOKIE));
  assert.deepEqual(visible.store, [], "the Cookie Store API shows nothing either");

  await page.evaluate((name) => {
    document.cookie = `${name}=forged; path=/`;
  }, SESSION_COOKIE);
  assert.equal((await sessionCookie(context))?.value, original.value, "a script cannot overwrite an HttpOnly cookie");
  const home = await page.goto("/");
  assert.match(await page.locator("main").innerText(), /Signed in as SYNTHETIC Owner A/, `still signed in after the attempt (${home?.status()})`);
});

test("the signed-in person's own company record is on the home page and reachable, and shows its SYNTHETIC name", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { page, problems } = await signedInPage();
  const card = page.getByRole("region", { name: "Company record" });
  assert.equal(await card.getByRole("heading", { level: 2 }).innerText(), OWN_COMPANY.name);
  assert.equal(await card.locator(".tag").innerText(), "SYNTHETIC");
  assert.ok(!(await page.locator("body").innerText()).includes(OTHER_COMPANY.name), "the other company is nowhere on the page");

  const response = await page.goto(`/api/companies/${OWN_COMPANY.id}`);
  assert.equal(response?.status(), 200);
  assert.match(response?.headers()["content-type"] ?? "", /^application\/json/);
  assert.deepEqual(JSON.parse(await page.locator("body").innerText()), { id: OWN_COMPANY.id, name: OWN_COMPANY.name, synthetic: true, createdAt: "2026-10-04T00:00:00.000Z" });
  assert.deepEqual(problems, [], "no page errors, console errors or failed requests");
});

test("a request for the other company's record from the signed-in browser is a 404 that shows nothing of it", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { page } = await signedInPage();

  // Navigating to it, as a person would by typing the address.
  const navigated = await page.goto(`/api/companies/${OTHER_COMPANY.id}`);
  assert.equal(navigated?.status(), 404);
  const shown = await page.locator("body").innerText();
  assert.equal(shown, JSON.stringify({ error: "not_found" }));
  assert.ok(!shown.includes(OTHER_COMPANY.name) && !shown.includes(OTHER_COMPANY.id), "no data from the other company");

  // From script on the signed-in page: the browser sends the cookie, and the answer is the same.
  await page.goto("/");
  const fetched = await getFromPage(page, `/api/companies/${OTHER_COMPANY.id}`);
  assert.equal(fetched.status, 404);
  assert.ok(!fetched.body.includes(OTHER_COMPANY.name) && !fetched.body.includes(OTHER_COMPANY.id));

  // A refusal looks exactly like a record that does not exist, so the answer does not reveal which companies exist.
  assert.deepEqual(await getFromPage(page, "/api/companies/company-that-does-not-exist"), fetched);

  // Sanity: the same fetch for their own company is allowed, so the 404 above is the scope rule and not a broken cookie.
  assert.equal((await getFromPage(page, `/api/companies/${OWN_COMPANY.id}`)).status, 200);
});

test("the second owner sees only their own company and is refused the first owner's", { timeout: TEST_TIMEOUT_MS }, async () => {
  const context = await harness().newContext();
  const page = await context.newPage();
  const who = await signInAsOwner(page, 1);
  assert.equal(who.displayName, "SYNTHETIC Owner B");
  const card = page.getByRole("region", { name: "Company record" });
  assert.equal(await card.getByRole("heading", { level: 2 }).innerText(), OTHER_COMPANY.name);
  assert.ok(!(await page.locator("body").innerText()).includes(OWN_COMPANY.name));
  assert.equal((await page.goto(`/api/companies/${OTHER_COMPANY.id}`))?.status(), 200);
  const refused = await page.goto(`/api/companies/${OWN_COMPANY.id}`);
  assert.equal(refused?.status(), 404);
  assert.ok(!(await page.locator("body").innerText()).includes("Company A"));
});

test("a browser that never signed in is refused the company record", { timeout: TEST_TIMEOUT_MS }, async () => {
  const page = await (await harness().newContext()).newPage();
  const response = await page.goto(`/api/companies/${OWN_COMPANY.id}`);
  assert.equal(response?.status(), 401);
  assert.equal(await page.locator("body").innerText(), JSON.stringify({ error: "not_signed_in" }));
});

test("signing out clears the cookie, shows the signed-out page, and the company record is refused afterwards", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { context, page } = await signedInPage();
  assert.ok(await sessionCookie(context), "signed in first");
  assert.equal((await getFromPage(page, `/api/companies/${OWN_COMPANY.id}`)).status, 200, "the company is readable while signed in");

  const signOutPost = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/session" && r.request().method() === "POST");
  await page.getByRole("button", { name: "Sign out" }).click();
  const response = await signOutPost;
  // The page is already at "/", so a wait on the address would return at once. Wait for the signed-out page itself.
  await page.getByText("You are not signed in.").waitFor();
  assert.equal(response.status(), 303, "the form post is answered with a redirect home");
  assert.match((await response.headerValue("set-cookie")) ?? "", /^aplyd_session=;.*Max-Age=0/, "the server clears the cookie");

  assert.equal(await sessionCookie(context), undefined, "the browser no longer holds the cookie");
  assert.ok(await page.getByText("You are not signed in.").isVisible());
  assert.equal(await page.getByRole("region", { name: "Company record" }).count(), 0);

  // The Back button must not bring the signed-in page back from the browser's cache once the person has signed out.
  for (let step = 1; step <= 2; step++) {
    await page.goBack();
    const shown = await page.locator("body").innerText();
    assert.ok(!shown.includes(OWN_COMPANY.name) && !shown.includes("Signed in as"), `Back (step ${step}) shows nothing from the signed-in session`);
  }

  const afterFetch = await getFromPage(page, `/api/companies/${OWN_COMPANY.id}`);
  assert.equal(afterFetch.status, 401, "a following read from script on the page is refused");
  assert.ok(!afterFetch.body.includes(OWN_COMPANY.name));
  const afterNav = await page.goto(`/api/companies/${OWN_COMPANY.id}`);
  assert.equal(afterNav?.status(), 401, "so is a following navigation");
  assert.ok(!(await page.locator("body").innerText()).includes(OWN_COMPANY.name));
});
