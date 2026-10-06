// The companies and owners of the demonstration, as rows, added the way the platform's own seed adds its users: there is no sign-up
// (OQ-13), so this is the one thing the seeder does not do through a request. Nothing else is written outside the application's own requests.
import { DEMO_COMPANIES } from "./cast.ts";

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;
const CREATED_AT = "2026-10-05T00:00:00.000Z";

/** INSERT OR IGNORE statements, so adding them twice changes nothing. Names, ids and addresses come from cast.ts, which is checked, never from a request. */
export function identityStatements(): string[] {
  return [
    ...DEMO_COMPANIES.map((c) => `INSERT OR IGNORE INTO companies (id, name, is_synthetic, created_at) VALUES (${sql(c.id)}, ${sql(c.name)}, 1, ${sql(CREATED_AT)})`),
    ...DEMO_COMPANIES.map((c) => `INSERT OR IGNORE INTO users (id, company_id, email, display_name, role, is_synthetic) VALUES (${sql(c.ownerId)}, ${sql(c.id)}, ${sql(c.ownerEmail)}, ${sql(c.ownerName)}, 'owner', 1)`),
  ];
}
