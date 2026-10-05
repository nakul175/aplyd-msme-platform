// The browser layer's own guarantees: which browser it picks, that it fails (never skips) without one, and that it
// closes the browser and the Worker when a test throws, hangs, or the test process is killed.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CHROMIUM_ENV, PREINSTALLED_CHROMIUM, TEST_TIMEOUT_MS, chooseBrowser, launchBrowser, withBrowserHarness } from "../support/browser.ts";
import type { BrowserHarness } from "../support/browser.ts";

const existing = (...paths: string[]) => (path: string) => paths.includes(path);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("the browser is chosen in the stated order: APLYD_CHROMIUM_PATH, the preinstalled Chromium, then Google Chrome", () => {
  const all = existing("/custom/chrome", PREINSTALLED_CHROMIUM);
  assert.deepEqual(chooseBrowser({ [CHROMIUM_ENV]: "/custom/chrome" }, all), { source: CHROMIUM_ENV, executablePath: "/custom/chrome" }, "the variable wins");
  assert.deepEqual(chooseBrowser({}, all), { source: "preinstalled Chromium", executablePath: PREINSTALLED_CHROMIUM }, "then the preinstalled build");
  assert.deepEqual(chooseBrowser({ [CHROMIUM_ENV]: "" }, all), { source: "preinstalled Chromium", executablePath: PREINSTALLED_CHROMIUM }, "an empty variable is not set");
  const none = chooseBrowser({}, existing());
  assert.equal(none.channel, "chrome", "then Playwright's chrome channel");
  assert.equal(none.executablePath, undefined);
});

test("an APLYD_CHROMIUM_PATH that names nothing is an error, not a reason to use another browser", () => {
  assert.throws(() => chooseBrowser({ [CHROMIUM_ENV]: "/nowhere/chrome" }, existing(PREINSTALLED_CHROMIUM)), /APLYD_CHROMIUM_PATH is set to "\/nowhere\/chrome", but nothing exists there/);
});

test("a browser that cannot be launched fails with a clear message that does not send anyone to a download", { timeout: TEST_TIMEOUT_MS }, async () => {
  await assert.rejects(launchBrowser({ source: "a test", executablePath: "/nowhere/chrome" }), (error: Error) => {
    assert.match(error.message, /found no usable Chromium/);
    assert.match(error.message, /Tried: a test at \/nowhere\/chrome/);
    assert.match(error.message, /Set APLYD_CHROMIUM_PATH/);
    assert.match(error.message, /does not download browsers, and it does not skip/);
    assert.doesNotMatch(error.message, /playwright install/i);
    return true;
  });
});

test("with no usable browser a browser suite fails and names the cause. It does not skip and it does not pass", { timeout: TEST_TIMEOUT_MS }, () => {
  const suite = fileURLToPath(new URL("./pages.test.ts", import.meta.url));
  // A nested `node --test` inherits NODE_TEST_CONTEXT from this test process and then reports a pass whatever happened.
  const { NODE_TEST_CONTEXT: _inherited, ...env } = process.env;
  const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", suite], { env: { ...env, [CHROMIUM_ENV]: "/nowhere/chrome" }, encoding: "utf8", timeout: 50_000 });
  const out = `${run.stdout}\n${run.stderr}`;
  assert.notEqual(run.status, 0, "the suite exits non-zero");
  assert.match(out, /APLYD_CHROMIUM_PATH is set to "\/nowhere\/chrome"/, "and says why");
  assert.match(out, /^# pass 0$/m, "no test passed");
  assert.match(out, /^# skipped 0$/m, "and none was skipped");
});

async function assertClosed(harness: BrowserHarness) {
  assert.equal(harness.browser.isConnected(), false, "the browser is closed");
  await assert.rejects(fetch(`${harness.base}/api/health`, { signal: AbortSignal.timeout(3000) }), "the Worker no longer answers");
}

test("the browser and the Worker are closed when the test body throws", { timeout: TEST_TIMEOUT_MS }, async () => {
  let seen: BrowserHarness | undefined;
  await assert.rejects(
    withBrowserHarness(async (h) => {
      seen = h;
      assert.equal((await fetch(`${h.base}/api/health`)).status, 200, "the Worker was up");
      assert.equal(h.browser.isConnected(), true, "the browser was up");
      throw new Error("the test body failed");
    }),
    /the test body failed/,
  );
  assert.ok(seen);
  await assertClosed(seen);
});

test("the browser and the Worker are closed when the test body never finishes", { timeout: TEST_TIMEOUT_MS }, async () => {
  let seen: BrowserHarness | undefined;
  await assert.rejects(
    withBrowserHarness(
      async (h) => {
        seen = h;
        await (await h.newContext()).newPage();
        await new Promise<never>(() => {});
      },
      { timeoutMs: 1500 },
    ),
    /did not finish in 1500ms/,
  );
  assert.ok(seen);
  await assertClosed(seen);
});

test("a page can reach nothing but the application, and an attempt to is recorded", { timeout: TEST_TIMEOUT_MS }, async () => {
  await withBrowserHarness(async (h) => {
    const page = await (await h.newContext()).newPage();
    await page.goto("/");
    const outcome = await page.evaluate(() => fetch("https://third-party.example/script.js").then(() => "reached", () => "blocked"));
    assert.equal(outcome, "blocked");
    assert.deepEqual(h.blockedRequests, ["https://third-party.example/script.js"]);
  });
});

function childrenOf(pid: number): number[] {
  const out = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
  if (out.error) throw new Error(`pgrep is needed to find the child processes: ${out.error.message}`);
  return out.stdout.split("\n").filter(Boolean).map(Number);
}

/** A process that has been killed and not yet collected (a zombie) is gone for this purpose. */
function running(pid: number): boolean {
  const state = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim();
  return state !== "" && !state.startsWith("Z");
}

test("when the test process is killed, as the runner's timeout does, the Worker and the browser go with it", { timeout: TEST_TIMEOUT_MS }, async () => {
  const support = new URL("../support/browser.ts", import.meta.url).href;
  const script = `
    import { startBrowserHarness } from ${JSON.stringify(support)};
    const h = await startBrowserHarness();
    await (await h.newContext()).newPage();
    console.log("READY " + h.base);
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
  let descendants: number[] = [];
  try {
    let base: string | undefined;
    for (const deadline = Date.now() + 50_000; Date.now() < deadline && !(base = output.match(/READY (http:\/\/\S+)/)?.[1]); ) await sleep(100);
    assert.ok(base, `the child test process started a Worker and a browser:\n${output}`);
    descendants = childrenOf(child.pid!);
    assert.ok(descendants.length >= 2, `the child has a Worker process and a browser process (found ${descendants.length})`);
    assert.ok(descendants.every(running));

    process.kill(-child.pid!, "SIGTERM"); // the runner's timeout signals the process group
    for (const deadline = Date.now() + 10_000; Date.now() < deadline && descendants.some(running); ) await sleep(100);
    assert.deepEqual(descendants.filter(running), [], "the Worker and browser processes are gone");
    await assert.rejects(fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) }), "and the Worker no longer answers");
  } finally {
    for (const pid of [child.pid!, ...descendants]) {
      for (const target of [-pid, pid]) {
        try {
          process.kill(target, "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }
  }
});
