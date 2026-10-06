// The one helper that writes a date for an owner (app/_ui/dates.ts): "30 October 2026", never "2026-10-30".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { formatDate } from "../../../../app/_ui/dates.ts";

test("an ISO date reads as day, month name and year, with no leading zero on the day", () => {
  assert.equal(formatDate("2026-10-30"), "30 October 2026");
  assert.equal(formatDate("2026-10-04"), "4 October 2026");
  assert.equal(formatDate("2027-01-01"), "1 January 2027");
  assert.equal(formatDate("2026-12-15"), "15 December 2026");
});

test("a timestamp reads as its UTC date: the time of day is not shown and does not move the date", () => {
  assert.equal(formatDate("2026-10-04T00:00:00.000Z"), "4 October 2026");
  assert.equal(formatDate("2026-10-04T23:59:59.999Z"), "4 October 2026");
  assert.equal(formatDate("2026-10-04 18:30:00"), "4 October 2026");
});

test("all twelve months have their own name", () => {
  const names = Array.from({ length: 12 }, (_, i) => formatDate(`2026-${String(i + 1).padStart(2, "0")}-10`));
  assert.deepEqual(names, ["10 January 2026", "10 February 2026", "10 March 2026", "10 April 2026", "10 May 2026", "10 June 2026", "10 July 2026", "10 August 2026", "10 September 2026", "10 October 2026", "10 November 2026", "10 December 2026"]);
});

test("a leap day is accepted in a leap year and not in another", () => {
  assert.equal(formatDate("2028-02-29"), "29 February 2028");
  assert.equal(formatDate("2026-02-29"), "2026-02-29");
});

test("text that is not a real date is returned as it came, so a page never shows a wrong date", () => {
  for (const text of ["", "soon", "2026-13-01", "2026-00-10", "2026-04-31", "2026-10-00", "26-10-30", "2026/10/30", "2026-10-3", "30 October 2026", "2026-10-30x", "x2026-10-30"]) assert.equal(formatDate(text), text, JSON.stringify(text));
});

test("the pages this agent owns use the helper and no longer cut a timestamp to its first ten characters", () => {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  for (const page of ["app/page.tsx", "app/factory/page.tsx", "app/procure/page.tsx", "app/operator/page.tsx"]) {
    const text = readFileSync(`${root}${page}`, "utf8");
    assert.match(text, /formatDate\(/, `${page} uses formatDate`);
    assert.ok(!/slice\(0, 10\)/.test(text), `${page} shows no raw ISO date`);
  }
});
