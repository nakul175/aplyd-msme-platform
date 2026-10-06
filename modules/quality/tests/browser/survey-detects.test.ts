// The measurements must be able to FAIL. This suite gives them small pages with faults put in on purpose (and matching pages without the
// fault) and checks that each fault is found, with the right check name and the element named, and that the clean page produces nothing.
// It needs a browser and no application. If this suite fails, the numbers in phone.test.ts and accessibility.test.ts mean nothing.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { BrowserContext, Page } from "playwright-core";
import { SETUP_TIMEOUT_MS, TEST_TIMEOUT_MS, chooseBrowser, launchBrowser } from "../../../platform/tests/support/browser.ts";
import type { Browser } from "playwright-core";
import { keyboardFindings, measureWithoutScripts, noScriptFindings, phoneFindings, pressTab, structureFindings, unnamedInteractive } from "../support/findings.ts";
import { MIN_TARGET_PX, OFFSCREEN_BY_DESIGN, TOLERANCE_PX, VIEWPORT, installProbe } from "../support/matrix.ts";

let browser: Browser;
let context: BrowserContext;
before(
  async () => {
    browser = await launchBrowser(chooseBrowser());
    context = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: "reduce" });
    await installProbe(context);
  },
  { timeout: SETUP_TIMEOUT_MS },
);
after(async () => {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
});

const WHO = { persona: "fixture", page: "/fixture" };
const doc = (body: string, options: { head?: string; html?: string; viewport?: string } = {}) =>
  `<!doctype html><html${options.html ?? ' lang="en"'}><head><meta charset="utf-8"><title>Fixture</title><meta name="viewport" content="${options.viewport ?? "width=device-width, initial-scale=1"}"><style>body{margin:0;font:16px/1.4 sans-serif}button,a,input,select{font:inherit}</style>${options.head ?? ""}</head><body>${body}</body></html>`;

async function open(html: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return page;
}
const phone = (page: Page) => page.evaluate((a) => window.__quality.phone(a), { min: MIN_TARGET_PX, tolerance: TOLERANCE_PX, offscreenByDesign: [...OFFSCREEN_BY_DESIGN] });
const keys = (list: { key: string }[]) => list.map((x) => x.key);
const checks = (list: { check: string }[]) => [...new Set(list.map((x) => x.check))].sort();

test("a page wider than the screen is found, with the widest element named; a wide table inside a box that scrolls is not a fault", { timeout: TEST_TIMEOUT_MS }, async () => {
  const bad = await open(doc(`<main><p>Short</p><div class="too-wide" style="width:600px;height:10px;background:#ccc"></div></main>`));
  const m = await phone(bad);
  assert.equal(m.documentOverflows, true);
  assert.ok(m.scrollWidth >= 600);
  assert.equal(m.wide[0].key, "main > div.too-wide");
  assert.ok(m.wide[0].width >= 599);
  assert.deepEqual(checks(phoneFindings(WHO, m)), ["page-overflow", "wide-element"]);
  assert.match(phoneFindings(WHO, m).find((f) => f.check === "page-overflow")!.detail, /widest element main > div\.too-wide/);

  const good = await open(doc(`<main><div style="overflow-x:auto"><table style="width:900px"><tr><td>wide</td></tr></table></div><p>Words that wrap and wrap and wrap and wrap and wrap and wrap and wrap and wrap and wrap.</p></main>`));
  const g = await phone(good);
  assert.equal(g.documentOverflows, false);
  assert.deepEqual(g.wide, []);
});

test("small targets are found, and a label, a stretched link or a sentence makes a small box acceptable", { timeout: TEST_TIMEOUT_MS }, async () => {
  const page = await open(
    doc(`<main>
      <button id="tiny" style="width:30px;height:30px">x</button>
      <button id="fine" style="width:44px;height:44px">Fine</button>
      <label style="display:flex;height:24px"><input type="radio" name="g1"> Small row</label>
      <label style="display:flex;height:44px;width:200px"><input type="radio" name="g2"> Large row</label>
      <div style="position:relative;width:300px;height:80px"><a class="stretch" href="/y">Open</a></div>
      <p>Read <a href="/x">this</a> and go on.</p>
      <a id="alone" href="/z" style="display:inline-block;height:20px">Alone</a>
    </main>`, { head: `<style>.stretch::after{content:"";position:absolute;inset:0}</style>` }),
  );
  const m = await phone(page);
  const small = keys(m.small).join(" | ");
  assert.match(small, /button#tiny "x"/);
  assert.match(small, /input\[radio\]\[name=g1\]/);
  assert.match(small, /a#alone "Alone"/);
  assert.doesNotMatch(small, /button#fine/);
  assert.doesNotMatch(small, /name=g2/);
  assert.doesNotMatch(small, /"Open"/, "a link stretched over its card by a pseudo-element has the card's size");
  assert.doesNotMatch(small, /"this"/, "a link inside a sentence is exempt");
  assert.equal(m.inlineLinksExempt, 1);
  const tiny = m.small.find((s) => s.key.includes("#tiny"))!;
  assert.ok(tiny.hit.w >= 29 && tiny.hit.w <= 31 && tiny.hit.h >= 29 && tiny.hit.h <= 31);
  assert.equal(m.small.find((s) => s.key.includes("name=g1"))!.via, "its label");
  assert.ok(phoneFindings(WHO, m).every((f) => f.check === "tap-target"));
});

test("a control that is covered, and one that reaches past the screen edge, are found", { timeout: TEST_TIMEOUT_MS }, async () => {
  const page = await open(
    doc(`<main>
      <div style="position:relative;width:200px;height:50px"><button id="under" style="width:200px;height:50px">Under</button><div class="lid" style="position:absolute;inset:0;z-index:3"></div></div>
      <button id="off" style="position:absolute;left:340px;top:200px;width:100px;height:44px">Off</button>
      <button id="free" style="width:100px;height:44px">Free</button>
      <p style="width:120px">A sentence with <a id="wrapped" href="#w">a link that wraps over several lines</a> in it.</p>
    </main>`),
  );
  const m = await phone(page);
  assert.match(keys(m.covered).join(" | "), /button#under/);
  assert.match(m.covered[0].by, /div\.lid/);
  assert.match(keys(m.clipped).join(" | "), /button#off/);
  assert.doesNotMatch([...keys(m.covered), ...keys(m.clipped)].join(" | "), /button#free/);
  assert.doesNotMatch([...keys(m.covered), ...keys(m.clipped)].join(" | "), /wraps over/, "a link that wraps is reached at the centre of one of its lines, not at the centre of the box around all of them");
});

test("a page with the structure faults is found fault by fault, and a clean page gives none", { timeout: TEST_TIMEOUT_MS }, async () => {
  const bad = await open(
    doc(
      `<div role="note">One</div><div role="note">Two</div>
       <main><h2>Starts at two</h2><h4>Jumps to four</h4>
         <input type="text" id="bare" name="bare"><input type="text" placeholder="Search">
         <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
         <svg width="10" height="10"><rect width="10" height="10"/></svg></main><main>A second main</main>`,
      { html: "", viewport: "width=device-width, initial-scale=1, maximum-scale=1" },
    ).replace("<title>Fixture</title>", "<title></title>"),
  );
  const s = await bad.evaluate(() => window.__quality.structure());
  const found = structureFindings(WHO, s);
  assert.deepEqual(checks(found), ["field-label", "h1-count", "heading-skip", "html-lang", "image-alt", "main-count", "note-banner-count", "page-title", "zoom-blocked"]);
  assert.equal(found.filter((f) => f.check === "field-label").length, 2, "a field with no label and a field with only a placeholder");
  assert.equal(found.filter((f) => f.check === "heading-skip").length, 2, "h2 first, then h4 after h2");
  assert.equal(found.filter((f) => f.check === "image-alt").length, 2, "an img without alt, and an svg without a name");

  const clean = await open(
    doc(`<div role="note">Banner</div><main><h1>Title</h1><h2>Part</h2><h3>Detail</h3>
      <label for="a">Name</label><input id="a" type="text"> <input type="text" aria-label="Year"> <span id="lbl">Phone</span><input type="text" aria-labelledby="lbl">
      <label>Choose <select name="c"><option>One</option></select></label>
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""> <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="A dot"> <svg aria-hidden="true" width="5" height="5"></svg></main>`),
  );
  assert.deepEqual(structureFindings(WHO, await clean.evaluate(() => window.__quality.structure())), []);
});

test("scripts-off faults are found: no h1, a main with no text, a form with no action, a form that gets, a form with nothing to press; a plain post form is not a fault", { timeout: TEST_TIMEOUT_MS }, async () => {
  const bad = await open(
    doc(`<main><form><input name="a" aria-label="a"></form><form action="javascript:void(0)" method="get"><input name="b" aria-label="b"><button type="button">Not a submit</button></form></main>`),
  );
  const found = noScriptFindings(WHO, await bad.evaluate(measureWithoutScripts));
  assert.deepEqual(
    keys(found).sort(),
    ["0 h1 elements", "form (no action) (get)", "form (no action) (no submit button)", "form (no action)", "form javascript:void(0) (get)", "form javascript:void(0) (no submit button)", "form javascript:void(0)", "main has almost no text"].sort(),
  );
  assert.deepEqual(checks(found), ["no-script-form", "no-script-page"]);

  const good = await open(doc(`<main><h1>A page</h1><p>Words enough to be a page that a person can read without any script at all, as a plain form should be.</p><form action="/api/things/0f8fad5b-d9cb-469f-a165-70867728950e/save" method="post"><label>Name <input name="n"></label><button>Save</button></form></main>`));
  const clean = await good.evaluate(measureWithoutScripts);
  assert.deepEqual(noScriptFindings(WHO, clean), []);
  assert.equal(clean.forms.length, 1);
});

test("a link or a button with no name is found by the browser's accessibility tree, with the element located", { timeout: TEST_TIMEOUT_MS }, async () => {
  const page = await open(doc(`<main><a id="icon" href="/z"><svg width="10" height="10" aria-hidden="true"></svg></a><button id="blank"></button><a href="/ok">Named</a><button aria-label="Close">x</button></main>`));
  const session = await context.newCDPSession(page);
  const unnamed = await unnamedInteractive(session);
  assert.deepEqual(unnamed.map((u) => u.role).sort(), ["button", "link"]);
  assert.match(unnamed.map((u) => u.key).join(" | "), /a#icon/);
  assert.match(unnamed.map((u) => u.key).join(" | "), /button#blank/);
});

test("Tab: a missing focus ring is found, a ring on a parent or a pseudo-element counts, and a field too far down the Tab order is found", { timeout: TEST_TIMEOUT_MS }, async () => {
  const links = Array.from({ length: 12 }, (_, i) => `<a href="#l${i}">Link ${i}</a>`).join(" ");
  const stripped = await open(doc(`<main>${links}<input type="text" aria-label="Late field"></main>`, { head: "<style>*:focus-visible{outline:none !important;box-shadow:none !important}</style>" }));
  const k = await pressTab(stripped);
  assert.equal(k.stops.length, 13);
  assert.equal(k.firstFieldAfter, 13);
  const found = keyboardFindings(WHO, k, true);
  assert.equal(found.filter((f) => f.check === "focus-indicator").length, 13, "no ring anywhere");
  assert.deepEqual(found.filter((f) => f.check !== "focus-indicator").map((f) => f.check), ["tab-to-first-field", "skip-link"], "the field is 13 presses away; there is no skip link");

  const ringed = await open(
    doc(
      `<a class="skip" href="#m">Skip to the page</a><main id="m"><label class="row"><input type="checkbox" name="c1"> In a label</label> <a class="over" href="#o" style="position:relative;display:inline-block">Over</a> <a href="#d">Default ring</a> <input type="text" aria-label="Field"></main>`,
      { head: "<style>.skip{position:absolute;left:8px;top:-4rem}.skip:focus{top:8px}.row input:focus-visible{outline:none}.row:has(input:focus-visible){box-shadow:0 0 0 3px #00f}.over:focus-visible{outline:none}.over:focus-visible::after{content:'';position:absolute;inset:0;outline:3px solid #f00}</style>" },
    ),
  );
  const r = await pressTab(ringed);
  assert.equal(r.stops.length, 5);
  assert.deepEqual(r.stops.map((s) => s.indicator), ["itself", "its parent", "its ::after", "itself", "itself"], "the label lights up for the checkbox, the pseudo-element for the link, the browser's ring for the rest");
  assert.deepEqual(keyboardFindings(WHO, r, true), []);
});

test("a skip link that stays off the screen when it takes focus is found", { timeout: TEST_TIMEOUT_MS }, async () => {
  const page = await open(doc(`<a class="skip" href="#m">Skip to the page</a><main id="m"><a href="#x">Other</a></main>`, { head: "<style>.skip{position:absolute;left:8px;top:-4rem}</style>" }));
  const k = await pressTab(page);
  assert.deepEqual(keyboardFindings(WHO, k, false).filter((f) => f.check === "skip-link").map((f) => f.key), ["not on screen when focused"]);
});

test("a focused control that a bar fixed to the bottom of the screen covers is found, and one it does not cover is not", { timeout: TEST_TIMEOUT_MS }, async () => {
  const filler = '<p style="height:1500px">Space</p>';
  const page = await open(
    doc(`<main>${filler}<input type="text" aria-label="Near the bottom"><a href="#end" id="end" style="display:block;height:44px">Last</a></main><div class="bar" style="position:fixed;left:0;right:0;bottom:0;height:120px;background:#eee">Fixed bar</div>`, {
      head: "<style>html{scroll-padding-block-end:0}</style>",
    }),
  );
  const k = await pressTab(page);
  const found = keyboardFindings(WHO, k, true);
  const covered = found.filter((f) => f.check === "focus-obscured").map((f) => f.key);
  assert.ok(covered.length >= 1, `a stop is covered by the bar: ${JSON.stringify(k.stops)}`);
  assert.match(found.find((f) => f.check === "focus-obscured")!.detail, /div\.bar/);

  const clear = await open(
    doc(`<main>${filler}<input type="text" aria-label="Near the bottom"><p style="width:120px">A sentence with <a href="#w">a link that wraps over several lines</a> in it.</p><a href="#end" id="end" style="display:block;height:44px">Last</a></main><div class="bar" style="position:fixed;left:0;right:0;bottom:0;height:120px;background:#eee">Fixed bar</div>`, {
      head: "<style>html{scroll-padding-block-end:8rem}main{padding-bottom:140px}</style>",
    }),
  );
  assert.deepEqual(keyboardFindings(WHO, await pressTab(clear), true).filter((f) => f.check === "focus-obscured"), [], "with room kept above the bar, the browser scrolls the stop clear of it");
});
