import assert from "node:assert/strict";
import { test } from "node:test";
import { SESSION_SECONDS, readCookie, signSession, verifySession } from "../../src/identity/session.ts";
import { signRaw } from "../support/token.ts";

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

test("a valid payload with an empty signature is refused because of the signature, not the payload", async () => {
  const good = await signRaw(JSON.stringify({ u: "user-1", exp: NOW + 100 }), SECRET);
  assert.deepEqual(await verifySession(good, SECRET, NOW), { u: "user-1", exp: NOW + 100 }, "control: the helper builds a token that verifies");
  const [payload] = good.split(".");
  assert.equal(await verifySession(`${payload}.`, SECRET, NOW), null);
});

test("claims are checked even when the signature is genuine", async () => {
  const claims: [string, unknown][] = [
    ["exp missing", { u: "user-1" }],
    ["exp a string", { u: "user-1", exp: String(NOW + 100) }],
    ["exp negative", { u: "user-1", exp: -1 }],
    ["exp already passed", { u: "user-1", exp: NOW }],
    ["exp not a number", { u: "user-1", exp: null }],
    ["u missing", { exp: NOW + 100 }],
    ["u a number", { u: 7, exp: NOW + 100 }],
    ["u null", { u: null, exp: NOW + 100 }],
    ["payload null", null],
    ["payload an array", [1, 2]],
    ["payload a string", "user-1"],
    ["payload a number", 7],
  ];
  for (const [what, payload] of claims) {
    assert.equal(await verifySession(await signRaw(JSON.stringify(payload), SECRET), SECRET, NOW), null, what);
  }
  assert.equal(await verifySession(await signRaw("not json", SECRET), SECRET, NOW), null, "payload not JSON");
});

test("one token has one valid spelling: a changed trailing base64 character is refused", async () => {
  const token = await signSession("user-1", SECRET, NOW);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const last = token.at(-1)!;
  const base = alphabet.indexOf(last) & ~3;
  const variants = [0, 1, 2, 3].map((k) => alphabet[base + k]).filter((c) => c !== last);
  assert.equal(variants.length, 3);
  assert.ok(await verifySession(token, SECRET, NOW), "control: the original verifies");
  for (const c of variants) assert.equal(await verifySession(token.slice(0, -1) + c, SECRET, NOW), null, `variant ${c}`);
});

test("a cookie name that appears twice is refused, so a sibling site cannot shadow the session", () => {
  assert.equal(readCookie("aplyd_session=; aplyd_session=tok", "aplyd_session"), null);
  assert.equal(readCookie("aplyd_session=bogus; aplyd_session=tok", "aplyd_session"), null);
  assert.equal(readCookie("aplyd_session=tok; other=1", "aplyd_session"), "tok");
});
