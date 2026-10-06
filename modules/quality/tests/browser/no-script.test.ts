// BR-UX-05, the connection half again: what a person gets when the browser has not (or not yet) run the page's scripts. About 116 kB of the
// 127 to 135 kB a page costs is framework script (VALIDATION.md), and on a slow phone it arrives last. The pages are server-rendered forms,
// so they should be readable and usable without it. This suite turns scripts off and shows that, for every person on every page.
//
// This is the extreme case (never, not "late"), and it is the only one a test can state without a timing: if the page is complete with
// no script at all, it is complete at every moment before the script arrives. It does not measure a page whose script has half arrived.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { SETUP_TIMEOUT_MS, TEST_TIMEOUT_MS } from "../../../platform/tests/support/browser.ts";
import { measureWithoutScripts, noScriptFindings, NO_SCRIPT_CHECKS, writeReport } from "../support/findings.ts";
import type { NoScriptMeasure } from "../support/findings.ts";
import { newPhoneContext, PAGES, PERSONAS, startQuality, signInAs, walk } from "../support/matrix.ts";
import type { Quality } from "../support/matrix.ts";
import type { Finding } from "../support/offenders.ts";

let quality: Quality | undefined;
before(async () => void (quality = await startQuality()), { timeout: SETUP_TIMEOUT_MS });
after(async () => void (await quality?.stop()), { timeout: 60_000 });

const summary: Record<string, unknown> = {};

test(`with scripts off, every person on every page (${PERSONAS.length} by ${PAGES.length}) gets one h1 and one main with text, and every form is a real post with a submit button`, { timeout: TEST_TIMEOUT_MS * 4 }, async () => {
  // Signing in is part of the walk, and it is itself a form: it has to work without a script, or no person past the first page is measured.
  const visits = await walk<NoScriptMeasure>(quality!, (page) => page.evaluate(measureWithoutScripts), { context: { javaScript: false } });
  assert.equal(visits.length, PERSONAS.length * PAGES.length, "every person was walked over every page");
  const unserved = visits.filter((v) => v.status !== 200);
  assert.deepEqual(unserved.map((v) => `${v.page} ${v.persona} ${v.status}`), [], "pages that did not answer 200");
  const found: Finding[] = [];
  for (const v of visits) found.push(...noScriptFindings({ persona: v.persona, page: v.page }, v.result!));
  const forms = visits.reduce((n, v) => n + v.result!.forms.length, 0);
  summary.walk = { visits: visits.length, forms, findings: found.length, checks: NO_SCRIPT_CHECKS };
  assert.deepEqual(found.map((f) => `${f.page} ${f.persona} ${f.check} ${f.key}: ${f.detail}`), [], "faults found with scripts off");
  assert.ok(forms >= visits.length, `the walk found ${forms} forms on ${visits.length} visits: at least the sign-out form is on each, so the measurement did not look at the forms`);
});

test("with scripts off, a person can still use a form: SYNTHETIC Owner A saves a draft of the factory description and lands on the page that says so", { timeout: TEST_TIMEOUT_MS * 2 }, async () => {
  const context = await newPhoneContext(quality!, { javaScript: false });
  const page = await context.newPage();
  await signInAs(page, "owner-a@synthetic.invalid");
  await page.goto("/factory");
  await Promise.all([page.waitForURL((u) => u.pathname === "/factory" && u.searchParams.has("saved")), page.getByRole("button", { name: "Save as draft" }).click()]);
  const status = await page.locator('[role="status"]').allInnerTexts();
  summary.saveDraft = { url: new URL(page.url()).pathname + new URL(page.url()).search, status };
  assert.ok(status.some((t) => /saved as a draft/.test(t)), `the page after the save did not say that a draft was saved; role=status said ${JSON.stringify(status)}`);
  await context.close();
});

after(() => writeReport("no-script", summary));
