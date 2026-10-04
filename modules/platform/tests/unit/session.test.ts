import assert from "node:assert/strict";
import { test } from "node:test";
import { SESSION_SECONDS, readCookie, signSession, verifySession } from "../../src/identity/session.ts";

const SECRET = "unit-test-secret-not-real";
const NOW = 1_800_000_000;

test("a signed session verifies and carries the user id", async () => {
  const token = await signSession("user-1", SECRET, NOW);
  const claims = await verifySession(token, SECRET, NOW + 10);
  assert.deepEqual(claims, { u: "user-1", exp: NOW + SESSION_SECONDS });
});

test("a session signed with another secret is refused", async () => {
  const token = await signSession("user-1", SECRET, NOW);
  assert.equal(await verifySession(token, "a-different-secret", NOW + 10), null);
});

test("a session whose payload was changed is refused", async () => {
  const token = await signSession("user-1", SECRET, NOW);
  const [, mac] = token.split(".");
  const forged = btoa(JSON.stringify({ u: "user-2", exp: NOW + SESSION_SECONDS })).replaceAll("=", "");
  assert.equal(await verifySession(`${forged}.${mac}`, SECRET, NOW + 10), null);
});

test("an expired session is refused", async () => {
  const token = await signSession("user-1", SECRET, NOW);
  assert.equal(await verifySession(token, SECRET, NOW + SESSION_SECONDS), null);
});

test("malformed tokens are refused without throwing", async () => {
  for (const bad of ["", "abc", "a.b.c", ".", "!!!.???", "eyJ1IjoieCJ9."]) {
    assert.equal(await verifySession(bad, SECRET, NOW), null, `token ${JSON.stringify(bad)}`);
  }
});

test("a cookie is found by name and an absent cookie is null", () => {
  assert.equal(readCookie("a=1; aplyd_session=tok; b=2", "aplyd_session"), "tok");
  assert.equal(readCookie("a=1", "aplyd_session"), null);
  assert.equal(readCookie(null, "aplyd_session"), null);
});
