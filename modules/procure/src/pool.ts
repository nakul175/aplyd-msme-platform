// How many companies are in a pool, and when that number may be shown. C-04: no aggregate figure is published from fewer
// than five companies, so below the floor the number is not shown to anyone, the owner of a requirement in the pool included.
// Whether the floor should apply to the pool's own members is an open question (OQ-14); this is the cautious reading.
export const AGGREGATE_FLOOR = 5;

export type PoolView = { shown: false; floor: number } | { shown: true; companies: number };

/** What may be said about a pool of `companies` companies. The count itself is withheld below the floor. */
export function presentPool(companies: number): PoolView {
  return Number.isInteger(companies) && companies >= AGGREGATE_FLOOR ? { shown: true, companies } : { shown: false, floor: AGGREGATE_FLOOR };
}
