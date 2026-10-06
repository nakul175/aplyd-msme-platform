// BR-UX-05, the part a machine can measure: every page, for every synthetic person who can open it, on a 390 by 844 phone screen.
//   - the page does not scroll sideways, and no element reaches past the edge of the screen;
//   - every link, button, field and disclosure box has a target of at least 44 by 44 CSS pixels (its own box, a label that wraps it, or a
//     stretched link), links inside a sentence excepted;
//   - every control can be reached: it lies inside the screen sideways, and what is at its centre, once scrolled to, is the control.
// It does not fail on the faults that are there today; it fails on a NEW one, and on a recorded one that has gone (known-offenders/phone.json,
// see support/offenders.ts). It measures one engine, headless Chromium, at one size. It is not a test on a phone and not a test of a slow
// connection (slow-connection.test.ts). Everything it opens is SYNTHETIC.
import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { SETUP_TIMEOUT_MS, TEST_TIMEOUT_MS } from "../../../platform/tests/support/browser.ts";
import { PHONE_CHECKS, phoneFindings, writeReport } from "../support/findings.ts";
import { MIN_TARGET_PX, OFFSCREEN_BY_DESIGN, PAGES, PERSONAS, TOLERANCE_PX, VIEWPORT, startQuality, walk } from "../support/matrix.ts";
import type { Quality } from "../support/matrix.ts";
import { useBaseline } from "../support/offenders.ts";
import type { Finding } from "../support/offenders.ts";
import type { PhoneMeasure } from "../support/probe.ts";

const known = useBaseline(
  join(import.meta.dirname, "..", "support", "known-offenders", "phone.json"),
  `Faults found by browser/phone.test.ts at ${VIEWPORT.width}x${VIEWPORT.height}, minimum target ${MIN_TARGET_PX}px, in demonstration mode. One line per fault: the check, the page, the element, and the people who have it. The test fails on a fault not listed and on a listed fault that is gone.`,
  [...PHONE_CHECKS],
  PERSONAS.map((p) => p.id),
);

let quality: Quality | undefined;
const findings: Finding[] = [];
const measures: { persona: string; page: string; measure: PhoneMeasure }[] = [];
let walked = 0;
let unmeasured = 0;

before(
  async () => {
    quality = await startQuality();
    console.log(`phone: browser ${quality.browser.version()}`);
    const visits = await walk(quality, async (page) => {
      await page.evaluate(() => window.__quality.openDisclosures());
      return page.evaluate((a) => window.__quality.phone(a), { min: MIN_TARGET_PX, tolerance: TOLERANCE_PX, offscreenByDesign: [...OFFSCREEN_BY_DESIGN] });
    });
    walked = visits.length;
    for (const v of visits) {
      const where = { persona: v.persona, page: v.page };
      const landedAtAddress = v.landedOn === v.page;
      if (v.status !== 200 || !landedAtAddress) {
        findings.push({ check: "page-not-served", page: v.page, persona: v.persona, key: v.status !== 200 ? `status ${v.status}` : `lands on ${v.landedOn}`, detail: `the page answered ${v.status} and the browser ended on ${v.landedOn}` });
      }
      if (!v.result) {
        unmeasured++;
        continue;
      }
      measures.push({ ...where, measure: v.result });
      findings.push(...phoneFindings(where, v.result));
    }
    const file = writeReport("phone", { viewport: VIEWPORT, minTargetPx: MIN_TARGET_PX, personas: PERSONAS.map((p) => p.id), pages: PAGES, findings, measures: measures.map((m) => ({ persona: m.persona, page: m.page, controls: m.measure.controls, scrollWidth: m.measure.scrollWidth, scrollHeight: m.measure.scrollHeight, clientWidth: m.measure.clientWidth, inlineLinksExempt: m.measure.inlineLinksExempt })) });
    console.log(`phone: ${walked} page visits, ${findings.length} findings, report ${file}`);
  },
  { timeout: SETUP_TIMEOUT_MS },
);
after(async () => void (await quality?.stop()), { timeout: 60_000 });

test("every person was walked over every page, and the walk found controls to measure on all of them", { timeout: TEST_TIMEOUT_MS }, () => {
  assert.equal(walked, PERSONAS.length * PAGES.length);
  assert.equal(measures.length + unmeasured, walked);
  for (const m of measures) assert.ok(m.measure.controls >= 2, `${m.persona} ${m.page}: only ${m.measure.controls} controls were found, so the measurement did not see the page`);
  assert.ok(measures.some((m) => m.page === "/factory" && m.measure.controls > 50), "the long form on /factory was walked for at least one owner");
});

test("every page answers 200 at its own address for every person (a refusal that stays on the page is a 200; a redirect or an error is recorded)", { timeout: TEST_TIMEOUT_MS }, () => {
  known.expect(findings, ["page-not-served"]);
});

test("no page scrolls sideways on a 390 px screen, and nothing reaches past its edge", { timeout: TEST_TIMEOUT_MS }, () => {
  known.expect(findings, ["page-overflow", "wide-element"]);
});

test(`every link, button, field and disclosure box has a target of at least ${MIN_TARGET_PX} by ${MIN_TARGET_PX} CSS pixels (links inside a sentence are exempt)`, { timeout: TEST_TIMEOUT_MS }, () => {
  known.expect(findings, ["tap-target"]);
});

test("every control lies inside the screen sideways and is not covered by something else at its centre", { timeout: TEST_TIMEOUT_MS }, () => {
  known.expect(findings, ["clipped-control", "covered-control"]);
});
