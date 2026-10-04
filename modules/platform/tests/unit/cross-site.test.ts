import assert from "node:assert/strict";
import { test } from "node:test";
import { isCrossSite } from "../../src/identity/cross-site.ts";

const req = (method: string, headers: Record<string, string> = {}) => new Request("https://app.example/api/session", { method, headers });

test("a reading request is never refused on origin", () => {
  assert.equal(isCrossSite(req("GET", { origin: "https://evil.example" })), false);
});

test("a changing request from the same origin is allowed", () => {
  assert.equal(isCrossSite(req("POST", { origin: "https://app.example" })), false);
});

test("a changing request from another origin is refused", () => {
  assert.equal(isCrossSite(req("POST", { origin: "https://evil.example" })), true);
  assert.equal(isCrossSite(req("DELETE", { origin: "https://app.example.evil.example" })), true);
});

test("a changing request with no origin is refused only when the browser says it is cross-site", () => {
  assert.equal(isCrossSite(req("POST")), false);
  assert.equal(isCrossSite(req("POST", { "sec-fetch-site": "cross-site" })), true);
});

test("an unreadable origin is refused", () => {
  assert.equal(isCrossSite(req("POST", { origin: "not a url" })), true);
});
