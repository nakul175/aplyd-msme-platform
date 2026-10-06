// BR-UX-09 and the keyboard half of BR-UX-05, as far as a machine without a screen reader can go: for every page and every synthetic person,
//   - one <main>, one h1, one role="note" banner, headings that do not skip a level, <html lang>, a title, no block on zooming;
//   - every form control named by a label, aria-label or aria-labelledby; every picture with alt or hidden from assistive tools;
//   - every link and button (and other control) given a non-empty name by the BROWSER's accessibility tree;
//   - the keyboard: the skip link is the first Tab stop and is on screen when focused, the first form control is reached within 10 Tab
//     presses, a ring or shadow appears on every Tab stop, and nothing (a bar fixed to the screen) covers the stop once the browser has
//     scrolled it into view.
// Like phone.test.ts it fails on a NEW fault and on a recorded fault that has gone (known-offenders/accessibility.json). It is NOT a WCAG
// audit and NOT a screen-reader test; colour contrast is measured by modules/journey/tests/unit/contrast.test.ts. Nothing here says the
// pages meet WCAG 2.1 level AA. Everything it opens is SYNTHETIC.
import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { SETUP_TIMEOUT_MS, TEST_TIMEOUT_MS } from "../../../platform/tests/support/browser.ts";
import { ACCESSIBILITY_CHECKS, MAX_TABS_TO_FIRST_FIELD, axFindings, keyboardFindings, pressTab, structureFindings, unnamedInteractive, writeReport } from "../support/findings.ts";
import type { KeyboardMeasure } from "../support/findings.ts";
import { PAGES, PERSONAS, startQuality, walk } from "../support/matrix.ts";
import type { Quality } from "../support/matrix.ts";
import { useBaseline } from "../support/offenders.ts";
import type { Finding } from "../support/offenders.ts";
import type { StructureMeasure } from "../support/probe.ts";

const known = useBaseline(
  join(import.meta.dirname, "..", "support", "known-offenders", "accessibility.json"),
  "Faults found by browser/accessibility.test.ts on a 390x844 screen in demonstration mode. One line per fault: the check, the page, the element, and the people who have it. The test fails on a fault not listed and on a listed fault that is gone. Not a WCAG audit.",
  [...ACCESSIBILITY_CHECKS],
  PERSONAS.map((p) => p.id),
);

let quality: Quality | undefined;
const findings: Finding[] = [];
const seen: { persona: string; page: string; structure: StructureMeasure; keyboard: KeyboardMeasure; unnamed: number }[] = [];
let walked = 0;

before(
  async () => {
    quality = await startQuality();
    const visits = await walk(quality, async (page, { cdp }) => {
      await page.evaluate(() => window.__quality.openDisclosures());
      const structure = await page.evaluate(() => window.__quality.structure());
      const unnamed = await unnamedInteractive(await cdp());
      const keyboard = await pressTab(page);
      return { structure, unnamed, keyboard };
    });
    walked = visits.length;
    for (const v of visits) {
      if (!v.result) continue;
      const where = { persona: v.persona, page: v.page };
      const { structure, unnamed, keyboard } = v.result;
      seen.push({ ...where, structure, keyboard, unnamed: unnamed.length });
      findings.push(...structureFindings(where, structure), ...axFindings(where, unnamed), ...keyboardFindings(where, keyboard, structure.fields > 0));
    }
    const file = writeReport("accessibility", {
      findings,
      tabPressesToFirstField: seen.filter((s) => s.keyboard.firstFieldAfter !== null).map((s) => ({ persona: s.persona, page: s.page, presses: s.keyboard.firstFieldAfter, tabStops: s.keyboard.stops.length })),
    });
    console.log(`accessibility: ${walked} page visits, ${findings.length} findings, report ${file}`);
  },
  { timeout: SETUP_TIMEOUT_MS },
);
after(async () => void (await quality?.stop()), { timeout: 60_000 });

test("every person was walked over every page, and the measurement saw fields and Tab stops where there are some", { timeout: TEST_TIMEOUT_MS }, () => {
  assert.equal(walked, PERSONAS.length * PAGES.length);
  assert.equal(seen.length, walked, "every page answered 200 and was measured (a page that did not is a finding of phone.test.ts)");
  assert.ok(seen.find((s) => s.page === "/sign-in")!.structure.fields >= 1, "the sign-in page has a field");
  assert.ok(seen.some((s) => s.persona.startsWith("owner-") && s.page === "/factory" && s.structure.fields > 20), "the questionnaire has its many fields in at least one owner's view");
  for (const s of seen) assert.ok(s.keyboard.stops.length >= 2, `${s.persona} ${s.page}: Tab reached only ${s.keyboard.stops.length} stops`);
  assert.ok(seen.some((s) => s.keyboard.firstFieldAfter !== null), "a form control was reached by Tab somewhere");
});

test("one <main>, one h1, one role=note banner, and headings that do not skip a level", { timeout: TEST_TIMEOUT_MS }, () => {
  known.expect(findings, ["main-count", "h1-count", "heading-skip", "note-banner-count"]);
});

test("the page states its language and has a title, and does not stop the person from zooming", { timeout: TEST_TIMEOUT_MS }, () => {
  known.expect(findings, ["html-lang", "page-title", "zoom-blocked"]);
});

test("every form control has a label, aria-label or aria-labelledby; every picture has alt or is hidden; the browser names every link and button", { timeout: TEST_TIMEOUT_MS }, () => {
  known.expect(findings, ["field-label", "image-alt", "ax-name-empty"]);
});

test(`Tab: the skip link comes first and shows on screen, the first form control is reached within ${MAX_TABS_TO_FIRST_FIELD} presses, and a ring or shadow shows on every stop, and nothing covers it`, { timeout: TEST_TIMEOUT_MS }, () => {
  known.expect(findings, ["tab-to-first-field", "focus-indicator", "focus-obscured", "skip-link"]);
});
