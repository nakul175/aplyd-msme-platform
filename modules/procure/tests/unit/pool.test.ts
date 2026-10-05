// C-04: no aggregate figure is published from fewer than five companies. These tests pin what may be said about a pool.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AGGREGATE_FLOOR, presentPool } from "../../src/pool.ts";

test("the floor is five companies", () => {
  assert.equal(AGGREGATE_FLOOR, 5);
});

test("below the floor the number is withheld, and the answer carries no count at all", () => {
  for (const n of [0, 1, 2, 3, 4]) {
    const view = presentPool(n);
    assert.deepEqual(view, { shown: false, floor: 5 }, `n = ${n}`);
    assert.ok(!JSON.stringify(view).includes(String(n)) || n === 5, "the count is not in the answer");
    assert.equal("companies" in view, false);
    assert.equal("atLeast" in view, false);
  }
});

test("at and above the floor a lower bound in steps of five is shown, never the exact count", () => {
  assert.deepEqual(presentPool(5), { shown: true, atLeast: 5 });
  assert.deepEqual(presentPool(6), { shown: true, atLeast: 5 });
  assert.deepEqual(presentPool(9), { shown: true, atLeast: 5 });
  assert.deepEqual(presentPool(10), { shown: true, atLeast: 10 });
  assert.deepEqual(presentPool(14), { shown: true, atLeast: 10 });
  assert.deepEqual(presentPool(123), { shown: true, atLeast: 120 });
  for (const n of [5, 6, 7, 8, 9, 11, 123]) assert.equal("companies" in presentPool(n), false, `n = ${n}`);
});

test("a pool of five and a pool of nine look the same, so a company that takes a pool from four to five is not told it held exactly four", () => {
  assert.deepEqual(presentPool(5), presentPool(9));
  assert.notDeepEqual(presentPool(4), presentPool(5));
});

test("a count that is not a whole number is never shown", () => {
  for (const n of [-1, 4.99, 5.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.deepEqual(presentPool(n), { shown: false, floor: 5 }, String(n));
});
