// BR-UX-05, the connection half: the home page and the Decide page (/diagnose) on a throttled connection, loaded cold (no cache), on a phone
// screen. The test passes when the page's h1 is visible within BUDGET_MS, which means the page can be read, and records how long the page
// took to finish loading and how many bytes it cost.
//
// THE NUMBERS BELOW ARE AN ASSUMPTION, not a measurement of any owner's connection (AS-02 in the BRD is still a guess). They stand for a
// slow 3G-like link and are the values this test sends to Chromium's network emulation:
//   latency            400 ms added to every request (a round trip of 400 ms; the older DevTools "Slow 3G" value)
//   download           400 kbit/s (50,000 bytes a second)
//   upload             400 kbit/s
// The budget is 10 seconds for a readable page. It is an assumption too: it is about twice the 5 seconds a page is commonly asked to be
// usable in on a mid-range phone on 3G, because this test runs on a shared two-core machine where timings are noisy. It catches a page that
// has become heavy (a megabyte of script, a request chain), not a page that is a little slower than it should be. See VALIDATION.md for
// the times measured when it was written. Emulation is Chromium's, not a real radio: it shapes bytes and delay but not packet loss.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Page } from "playwright-core";
import { SETUP_TIMEOUT_MS, TEST_TIMEOUT_MS } from "../../../platform/tests/support/browser.ts";
import { writeReport } from "../support/findings.ts";
import { newPhoneContext, signInAs, startQuality } from "../support/matrix.ts";
import type { Quality } from "../support/matrix.ts";

/** The connection the test pretends to have. The network emulation takes bytes a second and milliseconds. */
export const SLOW_3G = { latencyMs: 400, downloadKbit: 400, uploadKbit: 400 } as const;
/** The page must show its h1 within this long of the request being sent. */
export const BUDGET_MS = 10_000;
/** What a page may cost to read, in bytes sent over the wire (headers excluded). Generous: it is a tripwire. */
export const BYTES_BUDGET = 400_000;

let quality: Quality | undefined;
before(async () => void (quality = await startQuality()), { timeout: SETUP_TIMEOUT_MS });
after(async () => void (await quality?.stop()), { timeout: 60_000 });

type Timing = { path: string; persona: string; h1VisibleMs: number; loadMs: number; bodyBytes: number; requests: number; resources: { name: string; bytes: number }[] };
const timings: Timing[] = [];

async function bodyBytes(page: Page): Promise<{ bytes: number; requests: number; resources: { name: string; bytes: number }[] }> {
  return page.evaluate(() => {
    const entries = [...performance.getEntriesByType("navigation"), ...performance.getEntriesByType("resource")] as PerformanceResourceTiming[];
    return { bytes: entries.reduce((n, e) => n + (e.encodedBodySize || 0), 0), requests: entries.length, resources: entries.map((e) => ({ name: new URL(e.name).pathname, bytes: e.encodedBodySize || 0 })) };
  });
}

/** Signs in without any throttle (signing in is not what is measured), then loads `path` cold on the slow connection. */
async function loadSlowly(q: Quality, who: { id: string; email: string | null }, path: string, throttled = true): Promise<Timing> {
  const context = await newPhoneContext(q);
  const page = await context.newPage();
  if (who.email) await signInAs(page, who.email);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.clearBrowserCache");
  if (throttled) {
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: SLOW_3G.latencyMs, downloadThroughput: (SLOW_3G.downloadKbit * 1000) / 8, uploadThroughput: (SLOW_3G.uploadKbit * 1000) / 8 });
  }
  const started = Date.now();
  await page.goto(path, { waitUntil: "commit", timeout: 60_000 });
  await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible", timeout: 60_000 });
  const h1VisibleMs = Date.now() - started;
  await page.waitForLoadState("load", { timeout: 60_000 });
  const loadMs = Date.now() - started;
  const { bytes, requests, resources } = await bodyBytes(page);
  await context.close();
  return { path, persona: who.id, h1VisibleMs, loadMs, bodyBytes: bytes, requests, resources };
}

const VISITOR = { id: "visitor", email: null };
const OWNER_C = { id: "owner-c", email: "owner-c@synthetic.invalid" };
const OWNER_A = { id: "owner-a", email: "owner-a@synthetic.invalid" };

for (const [name, who, path] of [
  ["the home page, for a visitor", VISITOR, "/"],
  ["the Decide page, for the owner whose assessment has five ideas (SYNTHETIC Owner C)", OWNER_C, "/diagnose"],
  ["the Describe page, the longest form, for a new owner (SYNTHETIC Owner A)", OWNER_A, "/factory"],
] as const) {
  test(`${name}: the h1 is visible within ${BUDGET_MS / 1000} s on a ${SLOW_3G.downloadKbit} kbit/s, ${SLOW_3G.latencyMs} ms connection, and the page costs under ${BYTES_BUDGET / 1000} kB`, { timeout: TEST_TIMEOUT_MS * 2 }, async () => {
    const slow = await loadSlowly(quality!, who, path);
    const fast = await loadSlowly(quality!, who, path, false);
    timings.push(slow, { ...fast, persona: `${fast.persona} (no throttle)` });
    // The emulation was on: nothing can be read before one round trip has passed, and an unthrottled load is far quicker.
    assert.ok(slow.h1VisibleMs >= SLOW_3G.latencyMs, `h1 visible after ${slow.h1VisibleMs} ms, which is under one ${SLOW_3G.latencyMs} ms round trip: the throttle was not applied`);
    assert.ok(slow.loadMs > fast.loadMs, `the throttled load (${slow.loadMs} ms) was not slower than the unthrottled one (${fast.loadMs} ms)`);
    assert.ok(slow.h1VisibleMs <= BUDGET_MS, `${path}: the h1 was visible after ${slow.h1VisibleMs} ms; the budget is ${BUDGET_MS} ms (load ${slow.loadMs} ms, ${slow.bodyBytes} bytes, ${slow.requests} requests)`);
    assert.ok(slow.bodyBytes <= BYTES_BUDGET, `${path}: ${slow.bodyBytes} bytes over the wire; the budget is ${BYTES_BUDGET}`);
  });
}

after(() => {
  writeReport("slow-connection", { assumption: SLOW_3G, budgetMs: BUDGET_MS, bytesBudget: BYTES_BUDGET, timings });
  for (const t of timings) console.log(`slow-connection: ${t.persona.padEnd(26)} ${t.path.padEnd(10)} h1 ${String(t.h1VisibleMs).padStart(6)} ms  load ${String(t.loadMs).padStart(6)} ms  ${t.bodyBytes} bytes  ${t.requests} requests`);
});
