// State-changing posts that another website started are refused. Two ways in: the browser context's request API with a
// foreign Origin header, and a real cross-site form post from a page on a different origin.
//
// Every request goes through `refusableRequest`. The application refuses a cross-site request before it reads the body, and
// the local dev proxy then loses the next request. The helper makes that request a health check. See VALIDATION.md,
// browser-layer finding 1.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { APIResponse, BrowserContext } from "playwright-core";
import { TEST_TIMEOUT_MS, useBrowserHarness } from "../support/browser.ts";
import { OWN_COMPANY, SESSION_COOKIE, getFromPage, signInAsFirstOwner } from "../support/ui.ts";

const harness = useBrowserHarness();
// Evidence for VALIDATION.md, browser-layer finding 1: how often the dev proxy lost a request after such a request in this run.
after(() => {
  const { calls, healthChecksLost } = harness().refusalStats();
  console.log(`requests that may be refused: ${calls}, health checks the dev proxy lost afterwards: ${healthChecksLost}`);
});

const OWNER = "owner-a@synthetic.invalid";
const FOREIGN = "https://evil.example";
const sessionCookie = async (context: BrowserContext) => (await context.cookies()).find((c) => c.name === SESSION_COOKIE);

/** POST /api/session without following the redirect, so the 303 and its Set-Cookie can be read. */
const postSession = (context: BrowserContext, options: { form?: Record<string, string>; data?: unknown; headers: Record<string, string> }): Promise<APIResponse> =>
  harness().refusableRequest(() => context.request.post("/api/session", { maxRedirects: 0, ...options }));

test("a sign-in form post that carries a foreign Origin is refused and sets no cookie", { timeout: TEST_TIMEOUT_MS }, async () => {
  const context = await harness().newContext();
  const response = await postSession(context, { form: { email: OWNER }, headers: { origin: FOREIGN } });
  assert.equal(response.status(), 403);
  assert.deepEqual(await response.json(), { error: "cross_site_refused" });
  assert.equal(response.headers()["set-cookie"], undefined, "no Set-Cookie on a refusal");
  assert.equal(await sessionCookie(context), undefined, "the browser context holds no session");
});

test("the same post from the application's own origin is accepted, so the refusal above is not a broken request", { timeout: TEST_TIMEOUT_MS }, async () => {
  const context = await harness().newContext();
  const response = await postSession(context, { form: { email: OWNER }, headers: { origin: harness().base } });
  assert.equal(response.status(), 303, "a form post is answered with a redirect home");
  assert.match(response.headers()["set-cookie"] ?? "", /^aplyd_session=[^;]+; HttpOnly/);
  assert.ok(await sessionCookie(context), "the context now holds the session");
});

test("an Origin of null and an origin that only starts like ours are refused too", { timeout: TEST_TIMEOUT_MS }, async () => {
  const context = await harness().newContext();
  const nullOrigin = await postSession(context, { form: { email: OWNER }, headers: { origin: "null" } });
  assert.equal(nullOrigin.status(), 403, "an opaque origin (a sandboxed frame) is not ours");
  const lookalike = await postSession(context, { data: { email: OWNER }, headers: { origin: `${harness().base}.evil.example` } });
  assert.equal(lookalike.status(), 403, "an origin that only starts like ours is not ours");
  assert.equal(await sessionCookie(context), undefined);
});

test("a foreign Origin cannot sign a signed-in person out", { timeout: TEST_TIMEOUT_MS }, async () => {
  const context = await harness().newContext();
  const page = await context.newPage();
  await signInAsFirstOwner(page);
  const session = await sessionCookie(context);
  assert.ok(session, "signed in");
  // Playwright's own cookie jar does not send a Secure cookie to http://127.0.0.1, so the credential is attached by hand.
  const headers = { origin: FOREIGN, cookie: `${SESSION_COOKIE}=${session.value}` };

  const refused = await postSession(context, { form: { intent: "sign-out" }, headers });
  assert.equal(refused.status(), 403);
  assert.equal(refused.headers()["set-cookie"], undefined, "the cookie is not cleared");

  assert.equal((await sessionCookie(context))?.value, session.value, "the browser still holds the session");
  assert.equal((await getFromPage(page, `/api/companies/${OWN_COMPANY.id}`)).status, 200, "and it still works");
  const own = await postSession(context, { form: { intent: "sign-out" }, headers: { ...headers, origin: harness().base } });
  assert.equal(own.status(), 303, "the same request from the application's own origin does sign out");
  assert.match(own.headers()["set-cookie"] ?? "", /Max-Age=0/);
});

test("a real cross-site form post from another website is refused by the server and the browser takes no session from it", { timeout: TEST_TIMEOUT_MS }, async () => {
  const context = await harness().newContext();
  const page = await context.newPage();
  const attacker = "http://attacker.example";
  // The other website is served by the test, inside the browser. Nothing leaves the machine: the context blocks every
  // origin but the application's, and this route (more specific than the context's) is the only exception.
  await page.route(`${attacker}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>other site</title>
<form id="f" method="post" action="${harness().base}/api/session"><input name="email" value="${OWNER}"></form>
<script>document.getElementById("f").submit()</script>`,
    }),
  );
  const response = await harness().refusableRequest(async () => {
    const posted = page.waitForResponse((r) => r.url() === `${harness().base}/api/session` && r.request().method() === "POST");
    await page.goto(`${attacker}/`);
    return posted;
  });

  assert.equal(await response.request().headerValue("origin"), attacker, "the browser itself named the foreign origin");
  assert.equal(response.status(), 403);
  assert.deepEqual(await response.json(), { error: "cross_site_refused" });
  assert.equal(await sessionCookie(context), undefined, "no session was created in the browser");
  assert.deepEqual(harness().blockedRequests, [], "nothing was sent anywhere but the application");
});
