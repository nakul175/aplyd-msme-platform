// The only place a query reads requirements across companies, and it returns counts of companies, never a row, an id or a
// name. A pool is the requirements of one kind (an opportunity) in one cluster that have not been withdrawn. What may be said
// about a count is decided in ../pool.ts (C-04); a static test keeps these two queries to counts, and keeps everything else
// that reads requirements bound to one company.
import { AGGREGATE_FLOOR } from "../pool.ts";

/** How many companies have an open requirement of this kind in this cluster. The exact number stays in memory; presentPool decides what is shown. */
export async function poolCompanies(db: D1Database, cluster: string, opportunityId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT r.company_id) AS companies FROM requirements r
        WHERE r.cluster = ? AND r.opportunity_id = ?
          AND NOT EXISTS (SELECT 1 FROM requirement_events e WHERE e.requirement_id = r.id AND e.kind = 'withdraw')`,
    )
    .bind(cluster, opportunityId)
    .first<{ companies: number }>();
  return row?.companies ?? 0;
}

export type PoolRow = { cluster: string; opportunityId: string; companies: number };

/** Every pool of at least the floor, for the operator. A pool below the floor is not listed, so its size is not published to anyone (C-04). */
export async function listPoolsAtFloor(db: D1Database): Promise<PoolRow[]> {
  const { results } = await db
    .prepare(
      `SELECT r.cluster AS cluster, r.opportunity_id AS opportunity_id, COUNT(DISTINCT r.company_id) AS companies FROM requirements r
        WHERE NOT EXISTS (SELECT 1 FROM requirement_events e WHERE e.requirement_id = r.id AND e.kind = 'withdraw')
        GROUP BY r.cluster, r.opportunity_id
       HAVING COUNT(DISTINCT r.company_id) >= ?
        ORDER BY r.cluster, r.opportunity_id`,
    )
    .bind(AGGREGATE_FLOOR)
    .all<{ cluster: string; opportunity_id: string; companies: number }>();
  return results.map((r) => ({ cluster: r.cluster, opportunityId: r.opportunity_id, companies: r.companies }));
}
