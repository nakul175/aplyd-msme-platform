import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_SECRET_BYTES, getSessionSecret, isSyntheticEnvironment } from "../../src/env.ts";

test("a session secret of at least 32 bytes is accepted", () => {
  const ok = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
  assert.equal(ok.length, MIN_SECRET_BYTES);
  assert.equal(getSessionSecret({ SESSION_SECRET: ok }), ok);
});

test("a missing, empty, short or single-character secret is refused", () => {
  for (const bad of [undefined, "", " ", "x", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d", "a".repeat(64), "\0".repeat(40)]) {
    assert.equal(getSessionSecret({ SESSION_SECRET: bad }), null, JSON.stringify(bad));
  }
  assert.equal(getSessionSecret({ SESSION_SECRET: 12345678901234567890123456789012 as unknown as string }), null, "not a string");
});

test("length is counted in bytes, not characters", () => {
  assert.equal(getSessionSecret({ SESSION_SECRET: "é".repeat(15) + "a" }), null, "16 characters but 31 bytes");
  assert.ok(getSessionSecret({ SESSION_SECRET: "é".repeat(16) + "a" }), "17 characters, 33 bytes");
});

test("only local, synthetic and test count as synthetic environments, exactly", () => {
  for (const ok of ["local", "synthetic", "test"]) assert.equal(isSyntheticEnvironment({ APLYD_ENV: ok }), true, ok);
  for (const bad of [undefined, "", "Local", "LOCAL", " local", "local ", "local\n", "localhost", "production", "staging", "test,production"]) {
    assert.equal(isSyntheticEnvironment({ APLYD_ENV: bad }), false, JSON.stringify(bad));
  }
});
