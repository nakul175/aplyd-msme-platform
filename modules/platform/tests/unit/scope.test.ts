import assert from "node:assert/strict";
import { test } from "node:test";
import { canReadCompany } from "../../src/identity/scope.ts";
import type { Identity } from "../../src/identity/scope.ts";

const owner = (companyId: string | null, role = "owner"): Identity => ({ userId: "u", companyId, role, displayName: "x" });

test("a person reads their own company", () => {
  assert.equal(canReadCompany(owner("company-a"), "company-a"), true);
});

test("a person does not read another company", () => {
  assert.equal(canReadCompany(owner("company-a"), "company-b"), false);
});

test("the operator role does not override the scope", () => {
  assert.equal(canReadCompany(owner(null, "operator"), "company-a"), false);
  assert.equal(canReadCompany(owner("company-a", "operator"), "company-b"), false);
});

test("nobody signed in reads nothing", () => {
  assert.equal(canReadCompany(null, "company-a"), false);
});

test("an empty or null-like id is never a match for a person without a company", () => {
  assert.equal(canReadCompany(owner(null), ""), false);
  assert.equal(canReadCompany(owner(null), "null"), false);
});
