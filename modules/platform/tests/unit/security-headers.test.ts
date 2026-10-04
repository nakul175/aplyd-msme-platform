import assert from "node:assert/strict";
import { test } from "node:test";
import { withSecurityHeaders } from "../../src/api/security-headers.ts";

test("every response gets the security headers, and its body, status and own headers are kept", async () => {
  const original = new Response("hello", { status: 201, headers: { "content-type": "text/plain", "set-cookie": "a=b" } });
  const out = withSecurityHeaders(original);
  assert.equal(out.status, 201);
  assert.equal(await out.text(), "hello");
  assert.equal(out.headers.get("content-type"), "text/plain");
  assert.equal(out.headers.get("set-cookie"), "a=b");
  assert.equal(out.headers.get("x-content-type-options"), "nosniff");
  assert.equal(out.headers.get("x-frame-options"), "DENY");
  assert.equal(out.headers.get("referrer-policy"), "same-origin");
  assert.match(out.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
});

test("a response with immutable headers (a fetched one) still gets them, and a redirect stays a redirect", () => {
  const redirect = Response.redirect("https://app.example/x", 303);
  const out = withSecurityHeaders(redirect);
  assert.equal(out.status, 303);
  assert.equal(out.headers.get("location"), "https://app.example/x");
  assert.equal(out.headers.get("x-frame-options"), "DENY");
});
