// Real-browser test support. Starts the BUILT application in a local Worker (worker.ts) and drives it with a headless
// Chromium through playwright-core. It never downloads a browser. If no browser can be launched it throws; the browser
// suites then fail. They are never skipped, because the runner counts a skip as a failure.
import { existsSync } from "node:fs";
import { after, before } from "node:test";
import { chromium } from "playwright-core";
import type { Browser, BrowserContext } from "playwright-core";
import { startBuiltApp } from "./worker.ts";
import type { RunningWorker } from "./worker.ts";

/** Names a Chrome or Chromium executable. Wins over everything else. */
export const CHROMIUM_ENV = "APLYD_CHROMIUM_PATH";
/** Where the development container keeps a Playwright Chromium build. */
export const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";

/** Test timeouts for node:test, so a hung page fails the test and the `after` hook still closes everything. */
export const TEST_TIMEOUT_MS = 60_000;
export const SETUP_TIMEOUT_MS = 180_000;
export const TEARDOWN_TIMEOUT_MS = 60_000;
const ACTION_TIMEOUT_MS = 15_000;

export type BrowserChoice = { source: string; executablePath?: string; channel?: "chrome" };

/**
 * Which browser to launch, in this order: APLYD_CHROMIUM_PATH, then the preinstalled Chromium, then Google Chrome
 * through Playwright's `chrome` channel (what GitHub's Ubuntu runners have). An APLYD_CHROMIUM_PATH that names a missing
 * file is an error, not a reason to fall through: the person who set it meant that browser.
 * `env` and `exists` are parameters so the order can be tested without a browser.
 */
export function chooseBrowser(env: Record<string, string | undefined> = process.env, exists: (path: string) => boolean = existsSync): BrowserChoice {
  const named = env[CHROMIUM_ENV];
  if (named) {
    if (!exists(named)) throw new Error(`${CHROMIUM_ENV} is set to "${named}", but nothing exists there. Fix the path or unset the variable.`);
    return { source: CHROMIUM_ENV, executablePath: named };
  }
  if (exists(PREINSTALLED_CHROMIUM)) return { source: "preinstalled Chromium", executablePath: PREINSTALLED_CHROMIUM };
  return { source: "Google Chrome (Playwright channel chrome)", channel: "chrome" };
}

const describeChoice = (c: BrowserChoice) => `${c.source}${c.executablePath ? ` at ${c.executablePath}` : ""}`;

/** Launches the chosen browser, headless. A failure says what was tried and what to do; it never suggests a download. */
export async function launchBrowser(choice: BrowserChoice = chooseBrowser()): Promise<Browser> {
  try {
    return await chromium.launch({
      headless: true,
      ...(choice.executablePath ? { executablePath: choice.executablePath } : { channel: choice.channel }),
      // The application is on loopback. A proxy from the environment must never sit between the browser and it.
      args: ["--no-proxy-server"],
      timeout: 60_000,
    });
  } catch (cause) {
    const detail = String((cause as Error).message ?? cause).split("\n").find((l) => l.trim()) ?? "unknown error";
    throw new Error(
      `The browser layer found no usable Chromium. Tried: ${describeChoice(choice)}. ${detail}\n` +
        `Set ${CHROMIUM_ENV} to a Chrome or Chromium executable, or install Google Chrome. This layer does not download browsers, and it does not skip when none is found.`,
      { cause },
    );
  }
}

/**
 * The local dev proxy in front of the Worker (Wrangler 4.92.0) misbehaves after the application refuses a request before
 * reading its body, which is what a cross-site refusal does: the first request after the refusal is lost (no answer) or is
 * answered with the proxy's own 503, and the application never sees it. See VALIDATION.md, browser-layer finding 1.
 */
const SETTLE_LIMIT_MS = 30_000;
const SETTLE_ATTEMPT_MS = 1_500;

export type BrowserHarness = {
  app: RunningWorker;
  /** The application's origin, for example http://127.0.0.1:41234. */
  base: string;
  browser: Browser;
  /** For example "141.0.7390.37". */
  browserVersion: string;
  /** Which of the three ways of finding a browser was used. */
  browserSource: string;
  /** Every request a page made to somewhere other than the application. They are blocked, not sent. */
  blockedRequests: string[];
  /** A fresh browser context: no cookies, no storage. Requests to anything but the application are blocked and recorded. */
  newContext: () => Promise<BrowserContext>;
  /**
   * For a request the application may refuse before it reads the body: runs `attempt`, then sends health checks until the
   * Worker answers one, so the request that the dev proxy loses after a refusal is a health check and not a real request.
   */
  refusableRequest: <T>(attempt: () => Promise<T>) => Promise<T>;
  /** Over this harness's refusableRequest calls: how many calls there were, and how many health checks the dev proxy lost afterwards. */
  refusalStats: () => { calls: number; healthChecksLost: number };
  /** Closes every context, the browser and the Worker, each even if an earlier one fails. Safe to call more than once. */
  stop: () => Promise<void>;
};

// Process-level safety net. The `after` hook and `withBrowserHarness` close everything on a failure or a timeout inside the
// test process. This covers the process itself being killed (the runner's timeout sends SIGTERM to the process group, but
// the Worker is in a group of its own) or exiting early.
const live = new Set<BrowserHarness>();
let safetyNetInstalled = false;
function installSafetyNet(): void {
  if (safetyNetInstalled) return;
  safetyNetInstalled = true;
  const killWorkers = () => {
    for (const h of live) h.app.killNow();
  };
  process.on("exit", killWorkers);
  for (const [signal, code] of [["SIGTERM", 143], ["SIGINT", 130], ["SIGHUP", 129]] as const) {
    process.on(signal, () => {
      killWorkers();
      process.exit(code);
    });
  }
}

/**
 * Sends health checks, each with a short timeout, until one is answered, and returns how many were lost first. The dev proxy
 * loses at most one request after a refusal and serves everything after it at once, so the first check is the one given up.
 */
async function settle(origin: string): Promise<number> {
  const deadline = Date.now() + SETTLE_LIMIT_MS;
  let lost = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(SETTLE_ATTEMPT_MS) });
      if (res.status === 200) return lost;
    } catch {
      /* no answer in time */
    }
    lost++;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`the Worker did not answer a health check within ${SETTLE_LIMIT_MS / 1000} seconds after a refused request`);
}

export async function startBrowserHarness(vars: Record<string, string> = {}): Promise<BrowserHarness> {
  installSafetyNet();
  const choice = chooseBrowser();
  // Fail on a missing browser before spending time on the Worker.
  const browser = await launchBrowser(choice);
  let app: RunningWorker;
  try {
    app = await startBuiltApp({ APLYD_ENV: "test", SESSION_SECRET: `browser-${crypto.randomUUID()}`, ...vars });
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }

  const origin = new URL(app.base).origin;
  const contexts: BrowserContext[] = [];
  const blockedRequests: string[] = [];
  const stats = { calls: 0, healthChecksLost: 0 };
  let stopping: Promise<void> | undefined;

  async function refusableRequest<T>(attempt: () => Promise<T>): Promise<T> {
    const answer = await attempt();
    stats.calls++;
    stats.healthChecksLost += await settle(origin);
    return answer;
  }

  const harness: BrowserHarness = {
    app,
    base: origin,
    browser,
    browserVersion: browser.version(),
    browserSource: describeChoice(choice),
    blockedRequests,
    async newContext() {
      const context = await browser.newContext({ baseURL: origin });
      contexts.push(context);
      context.setDefaultTimeout(ACTION_TIMEOUT_MS);
      context.setDefaultNavigationTimeout(ACTION_TIMEOUT_MS);
      await context.route(
        (url) => url.origin !== origin,
        (route) => {
          blockedRequests.push(route.request().url());
          return route.abort("blockedbyclient");
        },
      );
      return context;
    },
    refusableRequest,
    refusalStats: () => ({ ...stats }),
    stop() {
      stopping ??= (async () => {
        for (const context of contexts) await context.close().catch(() => {});
        await browser.close().catch(() => {});
        // For diagnosing a failure: APLYD_BROWSER_DEBUG=1 prints what the Worker process said (add WRANGLER_LOG=debug for more).
        if (process.env.APLYD_BROWSER_DEBUG) console.error(`--- Worker output ---\n${app.output()}\n--- end of Worker output ---`);
        await app.stop().catch(() => {});
        live.delete(harness);
      })();
      return stopping;
    },
  };
  live.add(harness);
  return harness;
}

/**
 * For a suite file: starts one harness before the first test and closes it after the last, also when a test fails or times
 * out (node:test runs `after` hooks in every case). Call it once at the top of the file; the returned function gives the harness.
 */
export function useBrowserHarness(vars: Record<string, string> = {}): () => BrowserHarness {
  let harness: BrowserHarness | undefined;
  before(
    async () => {
      harness = await startBrowserHarness(vars);
    },
    { timeout: SETUP_TIMEOUT_MS },
  );
  after(async () => void (await harness?.stop()), { timeout: TEARDOWN_TIMEOUT_MS });
  return () => {
    if (!harness) throw new Error("the browser harness did not start");
    return harness;
  };
}

/** Runs `body` with a harness and always closes it, whether `body` returns, throws or never finishes before `timeoutMs`. */
export async function withBrowserHarness<T>(body: (harness: BrowserHarness) => Promise<T>, options: { vars?: Record<string, string>; timeoutMs?: number } = {}): Promise<T> {
  const harness = await startBrowserHarness(options.vars);
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`the browser test did not finish in ${options.timeoutMs ?? TEST_TIMEOUT_MS}ms`)), options.timeoutMs ?? TEST_TIMEOUT_MS);
    });
    return await Promise.race([body(harness), timeout]);
  } finally {
    clearTimeout(timer);
    await harness.stop();
  }
}
