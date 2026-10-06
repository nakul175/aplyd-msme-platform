// BR-UX-06 over HTTP on the built application: a form post made with no valid session is sent to the sign-in page with a plain message, and a program
// call still gets JSON. Needs `pnpm build` first.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { SESSION_COOKIE, SESSION_SECONDS, signSession } from "../../src/identity/session.ts";
import { startBuiltApp } from "../support/worker.ts";
import type { RunningWorker } from "../support/worker.ts";

const SECRET = `smoke-${crypto.randomUUID()}`;
const A = "company-synthetic-a";
const REVISIONS = `/api/companies/${A}/factory/revisions`;
let app: RunningWorker;

before(async () => {
  app = await startBuiltApp({ APLYD_ENV: "test", SESSION_SECRET: SECRET });
});
after(async () => {
  await app?.stop();
});

const withoutMarkers = (html: string) => html.replace(/<!-- -->/g, "");
async function ownerCookie(): Promise<string> {
  const res = await fetch(`${app.base}/api/session`, { method: "POST", headers: { "content-type": "application/json", origin: app.base }, body: JSON.stringify({ email: "owner-a@synthetic.invalid" }) });
  assert.equal(res.status, 200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
const formPost = (cookie: string | null, type = "application/x-www-form-urlencoded") =>
  fetch(`${app.base}${REVISIONS}`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: app.base, "content-type": type, ...(cookie ? { cookie } : {}) },
    body: type === "application/x-www-form-urlencoded" ? new URLSearchParams([["answers.shifts", "two"]]).toString() : "--b\r\nContent-Disposition: form-data; name=\"answers.shifts\"\r\n\r\ntwo\r\n--b--\r\n",
  });

test("a form post with no valid session goes to the sign-in page, whatever is wrong with the session", async () => {
  const good = await ownerCookie();
  const userId = JSON.parse(atob(good.split("=")[1].split(".")[0].replaceAll("-", "+").replaceAll("_", "/"))).u as string;
  const expired = `${SESSION_COOKIE}=${await signSession(userId, SECRET, Math.floor(Date.now() / 1000) - SESSION_SECONDS - 60)}`;
  const tampered = good.slice(0, -3) + (good.endsWith("AAA") ? "BBB" : "AAA");
  for (const [what, cookie] of [["no cookie", null], ["an empty cookie", `${SESSION_COOKIE}=`], ["a cookie that was altered", tampered], ["a cookie that ran out", expired]] as const) {
    const res = await formPost(cookie);
    assert.equal(res.status, 303, what);
    assert.equal(res.headers.get("location"), "/sign-in?expired=1", what);
    assert.ok(!(res.headers.get("content-type") ?? "").includes("json"), `${what}: no JSON body`);
  }
  const multipart = await formPost(null, "multipart/form-data; boundary=b");
  assert.equal(multipart.status, 303, "a multipart form");
  assert.equal(multipart.headers.get("location"), "/sign-in?expired=1");
  const still = await formPost(good);
  assert.equal(still.status, 303, "a valid session still saves");
  assert.ok(!String(still.headers.get("location")).startsWith("/sign-in"), "and is not sent to sign-in");
});

test("a program call with no session keeps its 401 and JSON body", async () => {
  const res = await fetch(`${app.base}${REVISIONS}`, { method: "POST", redirect: "manual", headers: { origin: app.base, "content-type": "application/json" }, body: JSON.stringify({ basedOn: null, answers: { shifts: "two" } }) });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "not_signed_in" });
  const read = await fetch(`${app.base}/api/companies/${A}`, { redirect: "manual" });
  assert.equal(read.status, 401, "a read is a program call too");
  assert.deepEqual(await read.json(), { error: "not_signed_in" });
});

test("the sign-in page says the session ended, in a live alert, and the message is not shown without the mark", async () => {
  const withMark = withoutMarkers(await (await fetch(`${app.base}/sign-in?expired=1`)).text());
  assert.match(withMark, /role="alert"[^>]*data-testid="expired"|data-testid="expired"[^>]*role="alert"/);
  assert.match(withMark, /Your session has ended\. Sign in again; what you typed was not saved\./);
  assert.match(withMark, /<title>Sign in: APLYD<\/title>/);
  const without = withoutMarkers(await (await fetch(`${app.base}/sign-in`)).text());
  assert.ok(!without.includes("Your session has ended"));
  const other = withoutMarkers(await (await fetch(`${app.base}/sign-in?expired=yes`)).text());
  assert.ok(!other.includes("Your session has ended"), "only expired=1 shows it");
});
