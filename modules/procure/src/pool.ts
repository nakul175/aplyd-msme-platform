// How many companies are in a pool, and when that number may be shown. C-04: no aggregate figure is published from fewer
// than five companies, so below the floor the number is not shown to anyone, the owner of a requirement in the pool included.
// Whether the floor should apply to the pool's own members is an open question (OQ-14); this is the cautious reading.
// From the floor up, a member is told a lower bound in steps of the floor ("at least 5", "at least 10"), not the exact count. The
// independent review of slice 4 showed that the exact count told a fifth company that the pool it joined had held exactly four.
// A bound still tells a joiner who takes a pool across the floor that it held at least four others; that is stated in STATUS.
export const AGGREGATE_FLOOR = 5;

export type PoolView = { shown: false; floor: number } | { shown: true; atLeast: number };

/** What may be said about a pool of `companies` companies: nothing below the floor, and above it a multiple of the floor that the pool has reached. */
export function presentPool(companies: number): PoolView {
  return Number.isInteger(companies) && companies >= AGGREGATE_FLOOR
    ? { shown: true, atLeast: Math.floor(companies / AGGREGATE_FLOOR) * AGGREGATE_FLOOR }
    : { shown: false, floor: AGGREGATE_FLOOR };
}
