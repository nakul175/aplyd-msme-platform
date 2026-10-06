// The people and the pages, and one way to walk all of them on a phone. A suite file starts the built application once (in
// demonstration mode, so seven owners at different stages exist), then walks every person over every page with a function the file
// supplies. Everything here is SYNTHETIC.
import type { Browser, BrowserContext, CDPSession, Page } from "playwright-core";
import { launchServe, stopAllLaunched } from "../../../hosting/tests/support/launcher.ts";
import type { Launched } from "../../../hosting/tests/support/launcher.ts";
import { chooseBrowser, launchBrowser } from "../../../platform/tests/support/browser.ts";
import { qualityProbe } from "./probe.ts";

/** A phone-sized screen. */
export const VIEWPORT = { width: 390, height: 844 } as const;
/** The least width and height, in CSS pixels, of anything a finger must hit. BR-UX-05 and the wireframes' rule 10 say 44. */
export const MIN_TARGET_PX = 44;
/** Half a pixel: layout rounds, and a control at exactly 44 must not fail for it. */
export const TOLERANCE_PX = 0.5;
/** Elements that are off the screen on purpose until they take focus. The skip link is the only one today. */
export const OFFSCREEN_BY_DESIGN = ["a.skip"] as const;

export type Persona = { id: string; email: string | null; label: string };
/** A visitor, the seven owners the demonstration seeds (A and B from the platform's own seed, C to G from the demonstration), and the operator. */
export const PERSONAS: readonly Persona[] = [
  { id: "visitor", email: null, label: "A visitor who has not signed in" },
  ...["a", "b", "c", "d", "e", "f", "g"].map((l) => ({ id: `owner-${l}`, email: `owner-${l}@synthetic.invalid`, label: `SYNTHETIC Owner ${l.toUpperCase()}` })),
  { id: "operator", email: "operator@synthetic.invalid", label: "SYNTHETIC Operator" },
];

/** Every page of the application that a person can open (the API is not a page). */
export const PAGES = ["/", "/sign-in", "/factory", "/diagnose", "/procure", "/deliver", "/run", "/operator", "/demo"] as const;
export type PagePath = (typeof PAGES)[number];

export type Quality = { app: Launched; browser: Browser; contexts: Set<BrowserContext>; stop: () => Promise<void> };

/** Starts the launcher in demonstration mode with the address open (as the brief for this layer says) and one headless Chromium. */
export async function startQuality(): Promise<Quality> {
  const browser = await launchBrowser(chooseBrowser());
  let app: Launched;
  try {
    app = await launchServe({ DEMO_ACCESS: "open", APLYD_DEMO: "true" });
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
  const contexts = new Set<BrowserContext>();
  return {
    app,
    browser,
    contexts,
    stop: async () => {
      for (const c of contexts) await c.close().catch(() => {});
      await browser.close().catch(() => {});
      await stopAllLaunched();
    },
  };
}

export type PhoneOptions = { viewport?: { width: number; height: number }; mobile?: boolean; /** false turns the browser's scripts off (the context is then the page before the framework arrives, or without it). The probe does not run. */ javaScript?: boolean };

/** A fresh context shaped like a phone: 390 by 844, touch, a mobile layout viewport, and the person's wish for no motion (so a focus ring is read at rest, not mid-transition). Only the application's own address is reachable. */
export async function newPhoneContext(q: Quality, options: PhoneOptions = {}): Promise<BrowserContext> {
  const context = await q.browser.newContext({
    baseURL: q.app.base,
    viewport: options.viewport ?? VIEWPORT,
    isMobile: options.mobile ?? true,
    hasTouch: true,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    javaScriptEnabled: options.javaScript ?? true,
  });
  q.contexts.add(context);
  context.setDefaultTimeout(20_000);
  context.setDefaultNavigationTimeout(30_000);
  await context.route(
    (url) => url.origin !== q.app.base,
    (route) => route.abort("blockedbyclient"),
  );
  await installProbe(context);
  return context;
}

/** Puts the probe into every page the context opens, before the page's own scripts run. */
export async function installProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: `window.__quality = (${qualityProbe.toString()})();` });
}

/** What the page offers on the sign-in page, then the same steps a person takes: pick the name, press the button, land on the home page. */
export async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Synthetic user").selectOption(email);
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), page.getByRole("button", { name: "Sign in" }).click()]);
}

export type Visit<T> = { persona: string; page: string; status: number; landedOn: string; result: T };

/**
 * Walks every persona over every page, one browser context per persona, one page object reused. `measure` runs after each page has
 * loaded. A page that does not answer 200 is recorded and not measured (its `result` is null): that is a finding of its own.
 */
export async function walk<T>(
  q: Quality,
  measure: (page: Page, ctx: { persona: Persona; path: string; cdp: () => Promise<CDPSession> }) => Promise<T>,
  options: { personas?: readonly Persona[]; pages?: readonly string[]; context?: PhoneOptions } = {},
): Promise<Visit<T | null>[]> {
  const visits: Visit<T | null>[] = [];
  for (const persona of options.personas ?? PERSONAS) {
    const context = await newPhoneContext(q, options.context);
    const page = await context.newPage();
    let session: CDPSession | undefined;
    const cdp = async () => (session ??= await context.newCDPSession(page));
    if (persona.email) await signInAs(page, persona.email);
    for (const path of options.pages ?? PAGES) {
      const response = await page.goto(path);
      const status = response?.status() ?? 0;
      const landedOn = new URL(page.url()).pathname;
      visits.push({ persona: persona.id, page: path, status, landedOn, result: status === 200 ? await measure(page, { persona, path, cdp }) : null });
    }
    await context.close();
  }
  return visits;
}
