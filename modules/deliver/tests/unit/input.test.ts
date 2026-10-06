import assert from "node:assert/strict";
import { test } from "node:test";
import { DRAFT_COOKIE, boxesToFix, clearedDraftCookie, draftCookie, parseDueDate, parseRupees, readDraft } from "../../src/input.ts";
import { MAX_AMOUNT_INR } from "../../src/state.ts";

test("a price is read the way an owner in India writes it: commas anywhere, a leading ₹, Rs, Rs. or INR, and a closing /-", () => {
  for (const [typed, n] of [
    ["50000", 50_000],
    ["50,000", 50_000],
    ["5,00,000", 500_000],
    ["₹1,25,000", 125_000],
    ["₹ 1,25,000", 125_000],
    ["Rs 50,000", 50_000],
    ["Rs. 50000", 50_000],
    ["rs50000", 50_000],
    ["INR 2,000", 2_000],
    ["50,000/-", 50_000],
    ["  7  ", 7],
  ] as const)
    assert.equal(parseRupees(typed), n, typed);
  assert.equal(parseRupees(125_000), 125_000, "a number from JSON is checked the same way");
});

test("a price that is not a whole number of rupees from 1 to the limit is refused, so the page can name the box", () => {
  for (const typed of ["", "0", "-5", "12.50", "50 thousand", "fifty", "₹", ",", "1e5", "₹-5", "$500", String(MAX_AMOUNT_INR + 1), "1234567890"]) assert.equal(parseRupees(typed), null, typed);
  assert.equal(parseRupees(1.5), null);
  assert.equal(parseRupees(undefined), null);
  assert.equal(parseRupees(String(MAX_AMOUNT_INR)), MAX_AMOUNT_INR);
});

test("a due date comes from the date box as YYYY-MM-DD, or typed day first; a day that does not exist is refused", () => {
  assert.equal(parseDueDate("2026-12-15"), "2026-12-15");
  assert.equal(parseDueDate(" 2026-12-15 "), "2026-12-15");
  assert.equal(parseDueDate("15/12/2026"), "2026-12-15");
  assert.equal(parseDueDate("5-1-2027"), "2027-01-05");
  assert.equal(parseDueDate("15.12.2026"), "2026-12-15");
  for (const typed of ["2026-02-30", "30/02/2026", "12/15/2026", "15 December 2026", "", "2026-12-15T00:00:00Z", "15/12/26"]) assert.equal(parseDueDate(typed), null, typed);
  assert.equal(parseDueDate(20261215), null);
});

test("the refusal names the boxes to fix, in the form's order", () => {
  assert.equal(boxesToFix(["amount"]), "Check the box “Price”.");
  assert.equal(boxesToFix(["amount", "due"]), "Check these boxes: “Due date” and “Price”.");
  assert.equal(boxesToFix(["amount", "title", "test"]), "Check these boxes: “What is delivered”, “How you will check it” and “Price”.");
  assert.equal(boxesToFix([]), "");
});

test("what was typed is kept in a short-lived cookie only the Delivery page receives, read back as it was, and cleared on the next save", () => {
  const set = draftCookie({ engagementId: "e1", values: { title: "Job log; set up", test: "Ten jobs = found", due: "15/12/2026", amount: "50 thousand" }, failed: ["amount"] });
  assert.match(set, new RegExp(`^${DRAFT_COOKIE}=`));
  for (const part of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/deliver", "Max-Age=300"]) assert.ok(set.includes(`; ${part}`), part);
  const header = `other=1; ${set.split(";")[0]}; aplyd_session=x`;
  assert.deepEqual(readDraft(header), { engagementId: "e1", values: { title: "Job log; set up", test: "Ten jobs = found", due: "15/12/2026", amount: "50 thousand" }, failed: ["amount"] });
  assert.match(clearedDraftCookie(), /Path=\/deliver; Max-Age=0$/);
  assert.equal(readDraft(null), null);
  assert.equal(readDraft("other=1"), null);
  assert.equal(readDraft(`${DRAFT_COOKIE}=not-json`), null, "a cookie this module did not write is ignored");
  assert.equal(readDraft(`${DRAFT_COOKIE}=${encodeURIComponent(JSON.stringify({ e: 1, v: {}, f: [] }))}`), null);
  const long = readDraft(draftCookie({ engagementId: "e1", values: { title: "x".repeat(500), test: "", due: "", amount: "" }, failed: ["title", "nonsense" as "title"] }).split(";")[0]!);
  assert.equal(long?.values.title.length, 120, "cut to the box's own limit");
  assert.deepEqual(long?.failed, ["title"], "only the form's own boxes");
});
