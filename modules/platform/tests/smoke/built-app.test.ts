// Runs the built application in a local Worker and walks the whole path over HTTP. Needs `pnpm build` first.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startBuiltApp } from "../support/worker.ts";
import type { RunningWorker } from "../support/worker.ts";

const SECRET = `smoke-${crypto.randomUUID()}`;
let app: RunningWorker;
let locked: RunningWorker;

before(async () => {
  app = await startBuiltApp({ APLYD_ENV: "test", SESSION_SECRET: SECRET });
  locked = await startBuiltApp({ APLYD_ENV: "production", SESSION_SECRET: SECRET });
});
after(async () => {
  await app?.stop();
  await locked?.stop();
});

const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
const signIn = (base: string, email: string) =>
  fetch(`${base}/api/session`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email }) });

test("the built application is healthy and its database answers", async () => {
  const res = await fetch(`${app.base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok", database: "ok" });
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
