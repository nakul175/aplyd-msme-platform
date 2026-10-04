import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_BODY_CHARACTERS, bodyField, readBody, takeBody } from "../../src/api/body.ts";

const post = (body: string | undefined, type?: string) => new Request("https://app.example/x", { method: "POST", body, headers: type ? { "content-type": type } : {} });

test("a form and a JSON object are read, and a field is found in either", async () => {
  const form = await readBody(post("a=1&b=two", "application/x-www-form-urlencoded"));
  assert.ok(typeof form === "object" && form.kind === "form");
  assert.equal(bodyField(form, "b"), "two");
  assert.equal(bodyField(form, "missing"), undefined);
  const value = await readBody(post('{"a":1,"b":"two"}', "application/json; charset=utf-8"));
  assert.ok(typeof value === "object" && value.kind === "json");
  assert.equal(bodyField(value, "b"), "two");
  assert.equal(bodyField({ kind: "empty" }, "b"), undefined);
});

test("a body of another type, an oversized body, a JSON array and broken JSON are problems; no body at all is empty", async () => {
  assert.equal(await readBody(post("x", "text/plain")), "unsupported");
  assert.equal(await readBody(post("x")), "unsupported", "a body with no content type is not accepted");
  assert.deepEqual(await readBody(new Request("https://app.example/x", { method: "POST" })), { kind: "empty" });
  assert.equal(await readBody(post("a=" + "x".repeat(MAX_BODY_CHARACTERS), "application/x-www-form-urlencoded")), "too_large");
  assert.equal(await readBody(post("[1]", "application/json")), "bad");
  assert.equal(await readBody(post("{broken", "application/json")), "bad");
});

test("takeBody answers a problem with the matching status, and reads and discards a body of a type it refuses", async () => {
  const unsupported = post("not for us", "text/plain");
  const refused = await takeBody(unsupported);
  assert.ok(refused instanceof Response);
  assert.equal(refused.status, 415);
  assert.equal(unsupported.bodyUsed, true, "the refused body was read, so the connection is left clean");
  const big = await takeBody(post("a=" + "x".repeat(MAX_BODY_CHARACTERS), "application/x-www-form-urlencoded"));
  assert.ok(big instanceof Response && big.status === 413);
  const bad = await takeBody(post("{broken", "application/json"));
  assert.ok(bad instanceof Response && bad.status === 400);
  const fine = await takeBody(post('{"a":1}', "application/json"));
  assert.ok(!(fine instanceof Response) && fine.kind === "json");
});
