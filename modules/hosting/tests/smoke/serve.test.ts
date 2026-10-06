// Starts the launcher itself (scripts/serve.mjs) against the BUILT application, as a host would, and talks to it over HTTP the way a
// browser behind a platform's ingress does. Needs `pnpm build` first. Ports are chosen free; the database is the launcher's own, in memory.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { AUTH, PASSWORD, SECRET, SERVE, exited, launchServe, stopAllLaunched } from "../support/launcher.ts";

const launch = launchServe;
after(stopAllLaunched);

test("the launcher refuses to start for a real environment, a weak secret or no gate, says why, and does not echo the secret", () => {
  const run = (env: Record<string, string>) => spawnSync(process.execPath, [SERVE], { env: { NODE_ENV: "production", PATH: process.env.PATH ?? "", ...env }, encoding: "utf8", timeout: 30_000 });
  const production = run({ SESSION_SECRET: SECRET, DEMO_USER: "demo", DEMO_PASSWORD: PASSWORD, APLYD_ENV: "production" });
  assert.equal(production.status, 2);
  assert.match(production.stderr, /synthetic environments only/);
  const weak = run({ SESSION_SECRET: "tooshort", DEMO_USER: "demo", DEMO_PASSWORD: PASSWORD });
  assert.equal(weak.status, 2);
  assert.ok(!weak.stderr.includes("tooshort") && !weak.stdout.includes("tooshort"));
  const ungated = run({ SESSION_SECRET: SECRET });
  assert.equal(ungated.status, 2);
  assert.match(ungated.stderr, /DEMO_USER and DEMO_PASSWORD/);
  assert.ok(!ungated.stderr.includes(SECRET), "the secret is never printed");
});

test("behind the gate: 401 without the password, an open health route, and the application's own pages with it", async () => {
  const app = await launch({ DEMO_USER: "demo", DEMO_PASSWORD: PASSWORD });
  assert.equal((await fetch(`${app.base}/sign-in`)).status, 401);
  assert.equal((await fetch(`${app.base}/api/health`)).status, 401, "the application's own health route is behind the gate");
  assert.equal((await fetch(`${app.base}/healthz`)).status, 200);
  const page = await fetch(`${app.base}/sign-in`, { headers: { authorization: AUTH } });
  assert.equal(page.status, 200);
  const html = await page.text();
  for (const who of ["SYNTHETIC Owner A", "SYNTHETIC Operator"]) assert.ok(html.includes(who), who);
  const health = await fetch(`${app.base}/api/health`, { headers: { authorization: AUTH } });
  assert.deepEqual(await health.json(), { status: "ok", database: "ok", auditGuard: "ok" });
  assert.ok(!app.output().includes(PASSWORD) && !app.output().includes(SECRET), "neither the password nor the secret is in the log");
});

test("the health route names the commit the launcher was given, or says unknown, and ignores a value that is not a commit id", async () => {
  const sha = "034320ce8a21db0818b9b4a39315d0d4b2f976c4";
  const withCommit = await launch({ DEMO_USER: "demo", DEMO_PASSWORD: PASSWORD, APLYD_COMMIT: sha });
  assert.equal(await (await fetch(`${withCommit.base}/healthz`)).text(), `ok\ncommit ${sha}\n`);
  assert.match(withCommit.output(), new RegExp(`Commit: ${sha}\\.`));
  const without = await launch({ DEMO_USER: "demo", DEMO_PASSWORD: PASSWORD });
  assert.equal(await (await fetch(`${without.base}/healthz`)).text(), "ok\ncommit unknown\n");
  const bad = await launch({ DEMO_USER: "demo", DEMO_PASSWORD: PASSWORD, APLYD_COMMIT: "${_self.COMMIT_HASH}" });
  assert.equal(bad.output().includes("is not a commit id"), true, "the launcher says the value was ignored");
  assert.equal(await (await fetch(`${bad.base}/healthz`)).text(), "ok\ncommit unknown\n");
});

test("a person signs in through the gate as a browser behind a TLS-terminating ingress does, and stays signed in", async () => {
  const app = await launch({ DEMO_USER: "demo", DEMO_PASSWORD: PASSWORD });
  const host = new URL(app.base).host;
  const res = await fetch(`${app.base}/api/session`, {
    method: "POST",
    redirect: "manual",
    headers: { authorization: AUTH, origin: `https://${host}`, "x-forwarded-proto": "https", "content-type": "application/x-www-form-urlencoded" },
    body: "email=owner-a%40synthetic.invalid",
  });
  assert.equal(res.status, 303);
  const setCookie = res.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /^aplyd_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  const home = await (await fetch(`${app.base}/`, { headers: { authorization: AUTH, cookie: setCookie.split(";")[0] } })).text();
  assert.ok(home.includes("SYNTHETIC Company A"), "signed in as company A's owner");
  assert.ok(!home.includes("SYNTHETIC Company B"));
});

test("a request from another site is refused by the application, and the very next request still works", async () => {
  const app = await launch({ DEMO_USER: "demo", DEMO_PASSWORD: PASSWORD });
  const cross = await fetch(`${app.base}/api/session`, { method: "POST", redirect: "manual", headers: { authorization: AUTH, origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: "email=operator%40synthetic.invalid" });
  assert.equal(cross.status, 403);
  assert.equal(cross.headers.get("set-cookie"), null);
  const after = await fetch(`${app.base}/sign-in`, { headers: { authorization: AUTH } });
  assert.equal(after.status, 200, "the Wrangler dev proxy loses the request after a refusal (VALIDATION.md, browser-layer finding 1); this launcher does not run it");
});

test("a body over the limit is refused with 413 before the application reads it", async () => {
  const app = await launch({ DEMO_USER: "demo", DEMO_PASSWORD: PASSWORD });
  const big = await fetch(`${app.base}/api/session`, { method: "POST", headers: { authorization: AUTH, origin: app.base, "content-type": "application/x-www-form-urlencoded" }, body: "x".repeat(300_000) });
  assert.equal(big.status, 413);
});

test("open access works only when asked for, and the launcher stops cleanly on SIGTERM", async () => {
  const app = await launch({ DEMO_ACCESS: "open" });
  assert.equal((await fetch(`${app.base}/sign-in`)).status, 200);
  assert.match(app.output(), /access: OPEN/, "the log says the address is open");
  app.child.kill("SIGTERM");
  assert.equal(await exited(app.child, 15_000), 0, "a clean exit within 15 seconds");
});
