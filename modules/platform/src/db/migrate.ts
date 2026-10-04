// Applies the SQL files in drizzle/ and the synthetic seed to a D1 database. For tests and local scripts only.
// The Worker never imports this file (it reads the file system).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

function statements(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The migration files in the order drizzle's journal lists them. Throws when a file is not in the journal or a journal entry has no file. */
export function migrationFiles(): string[] {
  const dir = join(ROOT, "drizzle");
  const journal = JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
  const tags = [...journal.entries].sort((a, b) => a.idx - b.idx).map((e) => e.tag);
  const onDisk = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, ""));
  const missing = tags.filter((t) => !onDisk.includes(t));
  const unlisted = onDisk.filter((f) => !tags.includes(f));
  if (missing.length || unlisted.length) throw new Error(`drizzle/ and its journal disagree. In the journal but not on disk: [${missing}]. On disk but not in the journal: [${unlisted}].`);
  return tags.map((t) => join(dir, `${t}.sql`));
}

export function migrationStatements(): string[] {
  return migrationFiles().flatMap((f) => statements(f));
}

/** Every module's synthetic seed, the platform's first (the others refer to its companies and users). */
export function seedFiles(): string[] {
  const modules = readdirSync(join(ROOT, "modules"))
    .filter((m) => existsSync(join(ROOT, "modules", m, "db", "seed-synthetic.sql")))
    .sort((a, b) => (a === "platform" ? -1 : b === "platform" ? 1 : a.localeCompare(b)));
  return modules.map((m) => join(ROOT, "modules", m, "db", "seed-synthetic.sql"));
}

export function seedStatements(): string[] {
  // A seed file has one statement per INSERT; split on the semicolon that ends one, so no seed text may contain a semicolon followed by a line break.
  return seedFiles().flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .split(/;\s*(?:\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function applyMigrations(db: D1Database, options: { seed?: boolean } = {}): Promise<void> {
  const all = [...migrationStatements(), ...(options.seed ? seedStatements() : [])];
  for (const sql of all) await db.prepare(sql).run();
}
