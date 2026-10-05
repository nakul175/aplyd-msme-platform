// What a person does in the browser, written against the pages that exist (role and label locators, no test ids).
import type { Page } from "playwright-core";

export const SESSION_COOKIE = "aplyd_session";
export const OWN_COMPANY = { id: "company-synthetic-a", name: "SYNTHETIC Company A" };
export const OTHER_COMPANY = { id: "company-synthetic-b", name: "SYNTHETIC Company B" };

/** Collects what a person would never see but a browser reports: uncaught page errors, console errors and failed requests. */
export function watchPage(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console error: ${m.text()}`));
  page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
  return problems;
}

/**
 * A same-origin GET made by script on the page, so the browser attaches whatever cookies it holds. Use this, not
 * `page.request`: Playwright's own cookie jar does not send a Secure cookie to http://127.0.0.1, a real browser does.
 */
export async function getFromPage(page: Page, path: string): Promise<{ status: number; body: string }> {
  return page.evaluate(async (p) => {
    const r = await fetch(p);
    return { status: r.status, body: await r.text() };
  }, path);
}

export type SignedInAs = { displayName: string; email: string };

/** Opens the sign-in page, picks the n-th synthetic user whose role is owner (0 is the first), submits the form and waits for the home page. */
export async function signInAsOwner(page: Page, n = 0): Promise<SignedInAs> {
  await page.goto("/sign-in");
  const picker = page.getByLabel("Synthetic user");
  const options = await picker.locator("option").evaluateAll((nodes) => nodes.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent ?? "" })));
  const owner = options.filter((o) => /\(owner\)$/.test(o.label))[n];
  if (!owner) throw new Error(`the sign-in page lists no owner number ${n + 1}: ${JSON.stringify(options)}`);
  await picker.selectOption(owner.value);
  await Promise.all([page.waitForURL((url) => url.pathname === "/"), page.getByRole("button", { name: "Sign in" }).click()]);
  return { displayName: owner.label.replace(/\s*\(owner\)$/, ""), email: owner.value };
}

export const signInAsFirstOwner = (page: Page) => signInAsOwner(page, 0);
