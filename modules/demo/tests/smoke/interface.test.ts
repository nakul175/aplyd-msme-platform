// The shared interface of the pages the polish slice owns, on the built application over HTTP: every page has its own title (BR-UX-01), and every page
// that can have nothing on it says what will appear and what causes it (BR-UX-07). A fresh database: owner B has done nothing and the operator has set
// no fee, added no provider and has no pool. Needs `pnpm build` first.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startBuiltApp } from "../../../platform/tests/support/worker.ts";
import type { RunningWorker } from "../../../platform/tests/support/worker.ts";

let app: RunningWorker;
let demo: RunningWorker;
before(async () => {
  app = await startBuiltApp({ APLYD_ENV: "test", SESSION_SECRET: `smoke-${crypto.randomUUID()}` });
  demo = await startBuiltApp({ APLYD_ENV: "test", APLYD_DEMO: "true", SESSION_SECRET: `smoke-${crypto.randomUUID()}` });
});
after(async () => {
  await app?.stop();
  await demo?.stop();
});

/** Server-rendered React puts <!-- --> between a sentence's text and its values; a person never sees them. */
const withoutMarkers = (html: string) => html.replace(/<!-- -->/g, "");
async function cookieFor(base: string, email: string): Promise<string> {
  const res = await fetch(`${base}/api/session`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email }) });
  assert.equal(res.status, 200, email);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
const page = async (base: string, cookie: string | undefined, path: string) => withoutMarkers(await (await fetch(`${base}${path}`, { headers: cookie ? { cookie } : {} })).text());
const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1];

test("every page of the polish slice has its own title that names the page and the application", async () => {
  const owner = await cookieFor(app.base, "owner-a@synthetic.invalid");
  const operator = await cookieFor(app.base, "operator@synthetic.invalid");
  const titles: [string | undefined, string | undefined][] = [
    [titleOf(await page(app.base, undefined, "/sign-in")), "Sign in: APLYD"],
    [titleOf(await page(app.base, owner, "/factory")), "Describe: APLYD"],
    [titleOf(await page(app.base, owner, "/procure")), "Choose: APLYD"],
    [titleOf(await page(app.base, operator, "/operator")), "Providers: APLYD"],
    [titleOf(await page(demo.base, undefined, "/demo")), "Demonstration: APLYD"],
    [titleOf(await page(app.base, owner, "/")), "APLYD MSME platform"],
  ];
  for (const [got, want] of titles) assert.equal(got, want);
  // A signed-out visitor to a page gets the same title as a signed-in person, so the tab never tells a stranger less or more.
  assert.equal(titleOf(await page(app.base, undefined, "/factory")), "Describe: APLYD");
  assert.equal(new Set(titles.map(([, want]) => want)).size, titles.length, "no two titles are the same");
});

test("an owner who has done nothing is told, on Describe and on Choose, what will appear and what causes it", async () => {
  // Owner B: in a fresh database owner A has a description saved already, owner B has nothing.
  const owner = await cookieFor(app.base, "owner-b@synthetic.invalid");
  const describe = await page(app.base, owner, "/factory");
  assert.match(describe, /Nothing saved yet\./);
  assert.match(describe, /A draft can be saved after answering just one question\./, "what causes a saved version");
  assert.match(describe, /No earlier versions yet\. Your first save will be version 1\./, "what the list will show, and when");
  const choose = await page(app.base, owner, "/procure");
  assert.match(choose, /You have not signed one off yet\./);
  assert.match(choose, /href="\/diagnose"/, "a way to the step that comes first");
  assert.match(choose, /decide on each idea \(yes, not yet or no\), sign off, then come back here to say what you need\./, "what causes the list to fill");
  assert.match(choose, /data-testid="no-requirements">None yet\. A requirement starts from an idea you accepted\./, "what a requirement starts from");
});

test("the operator who has set no fee and added no provider is told what will appear and what causes it", async () => {
  const operator = await cookieFor(app.base, "operator@synthetic.invalid");
  const html = await page(app.base, operator, "/operator");
  assert.match(html, /The fee has not been decided, so no provider can be listed\. Set it below, and listing opens\./);
  assert.match(html, /None yet\. Add one in the form below, then list it so owners can choose it\./, "the providers table");
  assert.match(html, /No pool has reached five companies yet\. A pool shows here once five or more companies ask for the same idea in the same cluster\./, "the pools");
  assert.match(html, /No provider has been added yet\./, "the count under Providers");
  assert.match(html, /No provider can be listed yet\./, "the count under the fee");
  assert.ok(!html.includes('data-testid="providers"'), "with no provider there is no table, so no scrolling box is announced");
});

test("a signed-out visitor to an owner page or the operator page is told to sign in, with a link", async () => {
  for (const [path, words] of [["/factory", /<a href="\/sign-in">Sign in<\/a> to describe your factory\./], ["/procure", /<a href="\/sign-in">Sign in<\/a> to see your requirements\./]] as const) {
    const html = await page(app.base, undefined, path);
    assert.match(html, words, `${path}: the words "Sign in" are the link, and the sentence says what for`);
  }
  assert.match(await page(app.base, undefined, "/operator"), /href="\/sign-in"/);
});

test("the operator's home says what the account is for, and that there is no company record because there is no company", async () => {
  const operator = await cookieFor(app.base, "operator@synthetic.invalid");
  const html = await page(app.base, operator, "/");
  assert.match(html, /Keep the list of providers/);
  assert.match(html, /You see providers and counts, never a company(&#x27;|’|&rsquo;)s record\./);
  assert.match(html, /No company is linked to this account, so there is no company record to show\./);
});

test("the script page has one banner and no link or button on it is a small target to hit (FND-271, FND-270)", async () => {
  const html = await page(demo.base, undefined, "/demo");
  assert.equal((html.match(/role="note"/g) ?? []).length, 1, "the shared SYNTHETIC banner is the only note on the page");
  assert.match(html, /class="notice" data-tone="warn"/, "the page's own note is still there, without a second banner role");
  assert.match(html, /Everything in this demonstration is SYNTHETIC/);
  assert.match(html, /<a href="\/sign-in">Go to the sign-in page<\/a>/);
});
