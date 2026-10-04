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
  }
});

test("at and above the floor the number is shown", () => {
  assert.deepEqual(presentPool(5), { shown: true, companies: 5 });
  assert.deepEqual(presentPool(6), { shown: true, companies: 6 });
  assert.deepEqual(presentPool(120), { shown: true, companies: 120 });
});

test("a count that is not a whole number is never shown", () => {
  for (const n of [-1, 4.99, 5.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.deepEqual(presentPool(n), { shown: false, floor: 5 }, String(n));
});
