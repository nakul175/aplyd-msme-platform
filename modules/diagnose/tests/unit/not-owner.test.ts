import assert from "node:assert/strict";
import { test } from "node:test";
import { notOwnerMessage } from "../../src/api/diagnose.ts";

test("a member of a company is told the page is for the owner, not that they have no company; someone with no company is told that", () => {
  assert.match(notOwnerMessage(true), /only the owner can make and sign off/);
  assert.ok(!/not linked/.test(notOwnerMessage(true)));
  assert.match(notOwnerMessage(false), /Your account is not linked to one/);
});
