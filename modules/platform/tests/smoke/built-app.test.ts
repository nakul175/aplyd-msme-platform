// Runs the built application in a local Worker and walks the whole path over HTTP. Needs `pnpm build` first.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { startBuiltApp } from "../support/worker.ts";
import type { RunningWorker } from "../support/worker.ts";

const SECRET = `smoke-${crypto.randomUUID()}`;
let app: RunningWorker;
let locked: RunningWorker;
let unnamed: RunningWorker;

before(async () => {
  app = await startBuiltApp({ APLYD_ENV: "test", SESSION_SECRET: SECRET });
  locked = await startBuiltApp({ APLYD_ENV: "production", SESSION_SECRET: SECRET });
  // The build itself names no environment. A secret alone must not turn synthetic sign-in on.
  unnamed = await startBuiltApp({ SESSION_SECRET: SECRET });
});
after(async () => {
  await app?.stop();
  await locked?.stop();
  await unnamed?.stop();
});

const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
const signIn = (base: string, email: string) =>
  fetch(`${base}/api/session`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email }) });

test("the built application is healthy and its database answers", async () => {
  const res = await fetch(`${app.base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok", database: "ok", auditGuard: "ok" });
});

test("the home page offers sign-in and the sign-in page lists the synthetic users", async () => {
  const home = await (await fetch(`${app.base}/`)).text();
  assert.match(home, /SYNTHETIC environment/);
  assert.match(home, /href="\/sign-in"/);
  const page = await (await fetch(`${app.base}/sign-in`)).text();
  for (const who of ["SYNTHETIC Owner A", "SYNTHETIC Owner B", "SYNTHETIC Operator"]) assert.ok(page.includes(who), who);
});

test("an owner signs in, sees their company on the home page and reads it through the API", async () => {
  const res = await signIn(app.base, "owner-a@synthetic.invalid");
  assert.equal(res.status, 200);
  const cookie = cookieOf(res);
  assert.match(res.headers.get("set-cookie") ?? "", /HttpOnly/);
  const home = await (await fetch(`${app.base}/`, { headers: { cookie } })).text();
  assert.ok(home.includes("SYNTHETIC Company A"));
  assert.ok(!home.includes("SYNTHETIC Company B"));
  const own = await fetch(`${app.base}/api/companies/company-synthetic-a`, { headers: { cookie } });
  assert.equal(own.status, 200);
  assert.equal(((await own.json()) as { name: string }).name, "SYNTHETIC Company A");
});

test("an owner cannot read another company through the built application", async () => {
  const cookie = cookieOf(await signIn(app.base, "owner-a@synthetic.invalid"));
  const other = await fetch(`${app.base}/api/companies/company-synthetic-b`, { headers: { cookie } });
  assert.equal(other.status, 404);
  assert.ok(!(await other.text()).includes("SYNTHETIC Company B"));
  const none = await fetch(`${app.base}/api/companies/company-synthetic-a`);
  assert.equal(none.status, 401);
});

test("a request another website started is refused", async () => {
  const res = await fetch(`${app.base}/api/session`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ email: "owner-a@synthetic.invalid" }) });
  assert.equal(res.status, 403);
});

test("outside a synthetic environment sign-in is refused and the page says so", async () => {
  const res = await signIn(locked.base, "owner-a@synthetic.invalid");
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("set-cookie"), null);
  const page = await (await fetch(`${locked.base}/sign-in`)).text();
  assert.match(page, /Sign-in is not available in this environment/);
  assert.ok(!page.includes("SYNTHETIC Owner A"));
  const home = await (await fetch(`${locked.base}/`)).text();
  assert.ok(!home.includes("SYNTHETIC environment"));
});

test("the built application with no environment name has no synthetic sign-in, even with a good secret", async () => {
  const res = await signIn(unnamed.base, "owner-a@synthetic.invalid");
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("the build output does not carry an environment name", () => {
  const config = JSON.parse(readFileSync(new URL("../../../../dist/server/wrangler.json", import.meta.url), "utf8")) as { vars?: Record<string, string> };
  assert.equal(config.vars?.APLYD_ENV, undefined);
});

test("pages, API answers and refusals all carry the security headers", async () => {
  const cookie = cookieOf(await signIn(app.base, "owner-a@synthetic.invalid"));
  const responses = [
    await fetch(`${app.base}/`),
    await fetch(`${app.base}/sign-in`),
    await fetch(`${app.base}/api/health`),
    await fetch(`${app.base}/api/companies/company-synthetic-b`, { headers: { cookie } }),
    await fetch(`${app.base}/api/session`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" }),
  ];
  for (const res of responses) {
    assert.equal(res.headers.get("x-frame-options"), "DENY", res.url);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff", res.url);
    assert.equal(res.headers.get("referrer-policy"), "same-origin", res.url);
    assert.match(res.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/, res.url);
  }
});

test("a sign-in with a content type the interface never sends is refused with 415 and a crafted multipart type does not crash it", async () => {
  const plain = await fetch(`${app.base}/api/session`, { method: "POST", headers: { "content-type": "text/plain", origin: app.base }, body: JSON.stringify({ email: "owner-a@synthetic.invalid" }) });
  assert.equal(plain.status, 415);
  const crafted = await fetch(`${app.base}/api/session`, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=application/x-www-form-urlencoded", origin: app.base }, body: "garbage" });
  assert.equal(crafted.status, 415);
});

test("the health check reports the audit guard", async () => {
  assert.deepEqual(await (await fetch(`${app.base}/api/health`)).json(), { status: "ok", database: "ok", auditGuard: "ok" });
});
