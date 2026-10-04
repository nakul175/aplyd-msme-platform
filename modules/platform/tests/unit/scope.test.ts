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

test("only the exact id matches: case, spacing, prefixes, suffixes, look-alikes and escapes do not", () => {
  const own = "company-a";
  assert.equal(canReadCompany(owner(own), own), true, "control");
  const nearMisses = [
    "Company-A", "COMPANY-A", " company-a", "company-a ", "company-a\n", "company-a\0", "company-", "company", "company-a-extra", "company-ab",
    "xcompany-a", "ｃompany-a", "company\u2011a", "company-a%00", "company%2Da", "company-a/", "/company-a", "company-a/..", "company-a?x=1", "company-a#x", "",
  ];
  for (const id of nearMisses) assert.equal(canReadCompany(owner(own), id), false, JSON.stringify(id));
});

test("a person whose company is an empty string reads nothing, even for an empty id", () => {
  assert.equal(canReadCompany(owner(""), ""), false);
});
