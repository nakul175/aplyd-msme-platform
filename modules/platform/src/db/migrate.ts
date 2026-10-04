// Applies the SQL files in drizzle/ and the synthetic seed to a D1 database. For tests and local scripts only.
// The Worker never imports this file (it reads the file system).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

function statements(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function migrationStatements(): string[] {
  const dir = join(ROOT, "drizzle");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => statements(join(dir, f)));
}

export function seedStatements(): string[] {
  // The seed file has one statement per INSERT; split on the semicolon that ends one.
  return readFileSync(join(ROOT, "modules/platform/db/seed-synthetic.sql"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function applyMigrations(db: D1Database, options: { seed?: boolean } = {}): Promise<void> {
  const all = [...migrationStatements(), ...(options.seed ? seedStatements() : [])];
  for (const sql of all) await db.prepare(sql).run();
}
