// The flag on a milestone's acceptance test (BR-DEPL-08): it names what someone else would need and does not have. It never blocks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { testFlagSentence, testQuality } from "../../src/test-quality.ts";

test("an empty test is flagged as empty, and only as empty", () => {
  assert.deepEqual(testQuality(""), ["empty"]);
  assert.deepEqual(testQuality("   \n "), ["empty"]);
  assert.match(testFlagSentence(["empty"])!, /has no test yet/);
});

test("a vague test is flagged for what it lacks: a number, a unit, or both", () => {
  assert.deepEqual(testQuality("It works"), ["no_number", "no_unit"]);
  assert.deepEqual(testQuality("Looks good to me"), ["no_number", "no_unit"]);
  assert.deepEqual(testQuality("A full shift is logged and matches the paper sheet."), ["no_number"], "a unit (a shift) but no number");
  assert.deepEqual(testQuality("The reading must be 40"), ["no_unit"], "a number but no unit");
});

test("a test with a number and a unit is not flagged, whether the number is in digits or words and the unit a word or a symbol", () => {
  for (const t of [
    "Dispatch time under 3 days for 18 of 20 orders",
    "Rejects below 2% over 500 pieces",
    "Machine runs 8 hours without a stop",
    "Ten real jobs are entered and a supervisor finds each of them again",
    "Seven days of entries from all shifts, with no day missing",
    "Every job of one shift is logged on the tablet and matches the paper sheet.",
    "Bore within 5mm of the drawing",
    "Saves at least ₹5,000 in a month",
    "Power use falls by 10 per cent",
  ])
    assert.deepEqual(testQuality(t), [], t);
});

test("the sentence names what is missing in plain words and says what the owner can do; nothing is said for an unflagged test", () => {
  assert.equal(testFlagSentence([]), null);
  assert.match(testFlagSentence(["no_number", "no_unit"])!, /^This test has no number and no unit, so someone else could not tell whether it was met\./);
  assert.match(testFlagSentence(["no_number"])!, /^This test has no number, so/);
  assert.match(testFlagSentence(["no_unit"])!, /^This test has no unit, so/);
  for (const f of [["no_number"], ["no_unit"]] as const) assert.match(testFlagSentence(f)!, /write in your note what you counted or measured/);
});
