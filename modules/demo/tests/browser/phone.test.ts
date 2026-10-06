// A phone, 390 px wide, on the pages the polish slice owns, for every person of the demonstration cast and for a visitor (BR-UX-03): the page never
// scrolls sideways, and the operator's providers table scrolls inside its own named box and stays a table. Also each page's title (BR-UX-01) for each
// person. The launcher starts the built application in demonstration mode behind its access gate. All of it is SYNTHETIC.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { AUTH_PARTS, launchServe, stopAllLaunched } from "../../../hosting/tests/support/launcher.ts";
import type { Launched } from "../../../hosting/tests/support/launcher.ts";
import { chooseBrowser, launchBrowser } from "../../../platform/tests/support/browser.ts";
import { watchPage } from "../../../platform/tests/support/ui.ts";
import { DEMO_COMPANIES, OPERATOR, WALKED_COMPANY, WITNESS_COMPANY } from "../../src/cast.ts";

const WIDTH = 390;
let app: Launched;
let browser: Browser;
const contexts: BrowserContext[] = [];

before(
  async () => {
    browser = await launchBrowser(chooseBrowser());
    app = await launchServe({ DEMO_USER: AUTH_PARTS.user, DEMO_PASSWORD: AUTH_PARTS.password, APLYD_DEMO: "true" });
  },
  { timeout: 180_000 },
);
after(async () => {
  for (const c of contexts) await c.close().catch(() => {});
  await browser?.close().catch(() => {});
  await stopAllLaunched();
});

async function onAPhone(): Promise<Page> {
  const context = await browser.newContext({ baseURL: app.base, viewport: { width: WIDTH, height: 800 }, httpCredentials: { username: AUTH_PARTS.user, password: AUTH_PARTS.password } });
  contexts.push(context);
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(15_000);
  await context.route((url) => url.origin !== app.base, (route) => route.abort("blockedbyclient"));
  return context.newPage();
}

async function signInAs(page: Page, name: string): Promise<void> {
  await page.goto("/sign-in");
  const picker = page.getByLabel("Synthetic user");
  const options = await picker.locator("option").evaluateAll((nodes) => nodes.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent ?? "" })));
  const chosen = options.find((o) => o.label.startsWith(`${name} (`));
  assert.ok(chosen, `the sign-in page lists ${name}`);
  await picker.selectOption(chosen.value);
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), page.getByRole("button", { name: "Sign in" }).click()]);
}

const PAGES: [string, string][] = [
  ["/", "APLYD MSME platform"],
  ["/sign-in", "Sign in: APLYD"],
  ["/factory", "Describe: APLYD"],
  ["/procure", "Choose: APLYD"],
  ["/operator", "Providers: APLYD"],
  ["/demo", "Demonstration: APLYD"],
];
const PEOPLE = [OPERATOR.name, WALKED_COMPANY.owner, WITNESS_COMPANY.owner, ...DEMO_COMPANIES.map((c) => c.ownerName), null] as const;

test("on a phone no page of the slice scrolls sideways for any person of the cast or a visitor, and every page has its own title", { timeout: 175_000 }, async () => {
  const wide: string[] = [];
  for (const person of PEOPLE) {
    const page = await onAPhone();
    const problems = watchPage(page);
    if (person) await signInAs(page, person);
    for (const [path, title] of PAGES) {
      await page.goto(path);
      assert.equal(await page.title(), title, `${person ?? "a visitor"} on ${path}`);
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      if (scroll > inner) wide.push(`${person ?? "a visitor"} on ${path}: the page is ${scroll} px wide on a ${inner} px screen`);
    }
    assert.deepEqual(problems, [], `${person ?? "a visitor"}: no page error, console error or failed request`);
  }
  assert.deepEqual(wide, [], "no page scrolls sideways");
});

test("the operator's providers table keeps its table markup on a phone and scrolls inside its own named, focusable box", { timeout: 60_000 }, async () => {
  const page = await onAPhone();
  await signInAs(page, OPERATOR.name);
  await page.goto("/operator");
  const box = page.getByTestId("providers");
  assert.equal(await box.getAttribute("role"), "region");
  assert.match((await box.getAttribute("aria-label")) ?? "", /Providers table/);
  assert.equal(await box.getAttribute("tabindex"), "0", "a keyboard can reach the box and scroll it");
  const table = box.getByRole("table");
  assert.ok((await table.getByRole("columnheader").count()) >= 4, "the column names are still column headers");
  assert.ok((await table.getByRole("row").count()) >= 4, "a heading row and the three providers of the cast");
  const shape = await page.evaluate(() => {
    const wrap = document.querySelector('[data-testid="providers"]') as HTMLElement;
    const display = (sel: string) => getComputedStyle(wrap.querySelector(sel) as Element).display;
    return { clientWidth: wrap.clientWidth, scrollWidth: wrap.scrollWidth, overflowX: getComputedStyle(wrap).overflowX, table: display("table"), thead: display("thead"), tr: display("tbody tr"), td: display("tbody td") };
  });
  assert.ok(shape.scrollWidth > shape.clientWidth, "the table is wider than the phone and scrolls in the box");
  assert.equal(shape.overflowX, "auto");
  assert.deepEqual([shape.table, shape.thead, shape.tr, shape.td], ["table", "table-header-group", "table-row", "table-cell"], "no layout turns the table into stacked blocks");
  assert.ok(await page.getByText(/Scroll it sideways to see every column/).isVisible(), "a line above says so on a phone");
  const before = await page.evaluate(() => document.documentElement.scrollWidth);
  await box.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), before, "scrolling the box does not move the page");
});
