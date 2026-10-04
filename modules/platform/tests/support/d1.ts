// A real D1 database (workerd's SQLite) for integration tests, with the migrations and the synthetic seed applied.
import { Miniflare } from "miniflare";
import { applyMigrations } from "../../src/db/migrate.ts";
import type { AppEnv } from "../../src/env.ts";

/** 44 characters: long enough for getSessionSecret. Not a real secret. */
export const TEST_SECRET = "integration-test-secret-not-real-0123456789";

export async function createTestEnvironment(overrides: Partial<AppEnv> = {}): Promise<{ env: AppEnv; db: D1Database; dispose: () => Promise<void> }> {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    compatibilityDate: "2026-05-15",
    d1Databases: { DB: "00000000-0000-4000-8000-000000000001" },
  });
  const db = (await mf.getD1Database("DB")) as unknown as D1Database;
  await applyMigrations(db, { seed: true });
  const env: AppEnv = { DB: db, APLYD_ENV: "test", SESSION_SECRET: TEST_SECRET, ...overrides };
  return { env, db, dispose: () => mf.dispose() };
}

export const ORIGIN = "https://app.example";

export function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

export function get(path: string, cookie?: string): Request {
  return new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} });
}

/** The name=value part of the Set-Cookie header. */
export function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("no Set-Cookie header");
  return header.split(";")[0];
}
