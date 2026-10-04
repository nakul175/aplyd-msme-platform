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

test("every method that is not a plain read counts as changing, in any letter case", () => {
  for (const method of ["post", "put", "patch", "delete", "PATCH", "Delete", "PROPFIND"]) {
    assert.equal(isCrossSite(req(method, { origin: "https://evil.example" })), true, method);
    assert.equal(isCrossSite(req(method, { origin: "https://app.example" })), false, `${method} from the same origin`);
  }
  for (const method of ["GET", "HEAD", "OPTIONS", "get"]) assert.equal(isCrossSite(req(method, { origin: "https://evil.example" })), false, method);
});

test("documented limit: a changing request with neither Origin nor Sec-Fetch-Site is allowed, and so is same-site without Origin", () => {
  // Browsers always send Origin on a POST, so this is a non-browser client, which does not carry a victim's cookie.
  // The test pins the behaviour so a change is a decision, not an accident (modules/platform/STATUS.md, limit 7).
  assert.equal(isCrossSite(req("POST")), false);
  assert.equal(isCrossSite(req("POST", { "sec-fetch-site": "same-site" })), false);
  assert.equal(isCrossSite(req("POST", { "sec-fetch-site": "same-origin" })), false);
});

test("an Origin of null is refused", () => {
  assert.equal(isCrossSite(req("POST", { origin: "null" })), true);
});
