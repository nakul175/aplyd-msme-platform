import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_BODY_CHARACTERS, bodyField, readBody, readTextWithin, takeBody } from "../../src/api/body.ts";

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

// --- readTextWithin: the bound is on what is held, not only on what is said about the length
const streamed = (chunks: () => Iterable<Uint8Array>, headers: Record<string, string> = {}, onCancel: () => void = () => {}) => {
  const iterator = chunks()[Symbol.iterator]();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel: onCancel,
  });
  return new Request("https://app.example/x", { method: "POST", body, headers, duplex: "half" } as RequestInit);
};

test("a body whose declared length is over the bound is refused without being read", async () => {
  const request = post("x".repeat(100), "text/plain");
  request.headers.set("content-length", String(10 * 4 + 1));
  const read = await readTextWithin(request, 10);
  assert.deepEqual(read, { ok: false, problem: "too_large" });
  assert.equal(request.bodyUsed, false, "not one byte was taken from it");
});

test("a body that declares no length, or a false one, is abandoned once it passes the bound, not buffered to the end", async () => {
  const max = 1000; // characters, so 4000 bytes
  let produced = 0;
  let cancelled = false;
  const endless = function* () {
    for (;;) {
      produced += 1;
      yield new Uint8Array(1024);
    }
  };
  const read = await readTextWithin(streamed(endless, {}, () => (cancelled = true)), max);
  assert.deepEqual(read, { ok: false, problem: "too_large" });
  assert.equal(cancelled, true, "the stream was cancelled");
  assert.ok(produced <= 8, `only a few chunks were taken from a body with no end (${produced})`);

  // a declared length that is small and false
  produced = 0;
  cancelled = false;
  const lying = streamed(endless, { "content-length": "10" }, () => (cancelled = true));
  assert.deepEqual(await readTextWithin(lying, max), { ok: false, problem: "too_large" });
  assert.equal(cancelled, true);
  assert.ok(produced <= 8);
});

test("a body that breaks off while it is being read is a body that cannot be read, not a thrown error", async () => {
  const broken = function* () {
    yield new TextEncoder().encode("a=1");
    throw new Error("connection reset");
  };
  assert.deepEqual(await readTextWithin(streamed(broken), 100), { ok: false, problem: "bad" });
  assert.equal(await readBody(streamed(broken, { "content-type": "application/x-www-form-urlencoded" })), "bad");
});

test("the bound is four bytes for each character, and the characters are counted after decoding: 11 two-byte characters pass the first and fail the second", async () => {
  const max = 10;
  const text = "é".repeat(11);
  const read = await readTextWithin(post(text, "text/plain"), max);
  assert.ok(read.ok && read.text === text, "22 bytes are within 40");
  assert.equal(await readBody(post(`a=${text}`.slice(2), "application/x-www-form-urlencoded"), max), "too_large", "but 11 characters are more than 10");
  assert.equal((await readTextWithin(post("😀".repeat(10), "text/plain"), max)).ok, true, "ten four-byte characters are exactly the bound");
  assert.deepEqual(await readTextWithin(post("😀".repeat(11), "text/plain"), max), { ok: false, problem: "too_large" });
  assert.deepEqual(await readTextWithin(new Request("https://app.example/x", { method: "POST" }), max), { ok: true, text: "" }, "no body is the empty text");
  const chunked = await readTextWithin(streamed(() => [new TextEncoder().encode("ab"), new TextEncoder().encode("é"), new TextEncoder().encode("cd")]), max);
  assert.ok(chunked.ok && chunked.text === "abécd", "chunks are joined in order");
});
