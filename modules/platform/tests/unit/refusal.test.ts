// How a request with no valid session is refused, decided in one place (modules/platform/src/api/http.ts): a person at a form is sent to
// the sign-in page, a program gets 401 JSON. BR-UX-06.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPIRED_LOCATION, isFormPost, notSignedIn } from "../../src/api/http.ts";

const request = (method: string, type: string | null) => new Request("https://app.example/api/x", { method, ...(type === null ? {} : { headers: { "content-type": type } }), ...(method === "GET" || method === "HEAD" ? {} : { body: "a=1" }) });

test("what a page sends is a form post: a change, with a form body in either of the two encodings a browser uses", () => {
  for (const type of ["application/x-www-form-urlencoded", "application/x-www-form-urlencoded; charset=UTF-8", "Application/X-WWW-Form-Urlencoded", "multipart/form-data; boundary=----abc", "MULTIPART/FORM-DATA"]) {
    for (const method of ["POST", "post", "PUT", "PATCH", "DELETE"]) assert.equal(isFormPost(request(method, type)), true, `${method} ${type}`);
  }
});

test("what a program sends is not a form post: JSON, plain text, any other type, or no type at all", () => {
  for (const type of ["application/json", "application/json; charset=utf-8", "text/plain", "text/html", "application/octet-stream", "multipart/mixed", "multipartx/form-data", "", null]) {
    assert.equal(isFormPost(request("POST", type)), false, String(type));
  }
});

test("a read is never a form post, even with a form content type", () => {
  for (const method of ["GET", "HEAD", "OPTIONS", "get"]) assert.equal(isFormPost(new Request("https://app.example/x", { method, headers: { "content-type": "application/x-www-form-urlencoded" } })), false, method);
});

test("a form with no valid session is sent to the sign-in page with 303 and nothing is cached", () => {
  for (const type of ["application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
    const res = notSignedIn(request("POST", type));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/sign-in?expired=1");
    assert.equal(res.headers.get("location"), EXPIRED_LOCATION);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("set-cookie"), null, "no session is granted or changed");
    assert.ok(!(res.headers.get("content-type") ?? "").includes("json"), "never a page of JSON");
  }
});

test("a program with no valid session still gets 401 JSON exactly as before", async () => {
  for (const [method, type] of [["POST", "application/json"], ["POST", "application/json; charset=utf-8"], ["POST", null], ["POST", "text/plain"], ["GET", null], ["GET", "application/x-www-form-urlencoded"], ["DELETE", "application/json"]] as const) {
    const res = notSignedIn(request(method, type));
    assert.equal(res.status, 401, `${method} ${type}`);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("location"), null);
    assert.deepEqual(await res.json(), { error: "not_signed_in" });
  }
});
