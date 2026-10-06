import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { migrationFiles, migrationStatements } from "../../src/db/migrate.ts";

const DIR = fileURLToPath(new URL("../../../../drizzle", import.meta.url));

test("migrations are applied in the order of drizzle's journal and every SQL file is in it", () => {
  const files = migrationFiles().map((f) => basename(f));
  assert.deepEqual(files, readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort());
  assert.deepEqual(files.slice(0, 3), ["0000_init.sql", "0001_audit_append_only.sql", "0002_audit_no_replace.sql"]);
});

test("each migration yields at least one statement and no statement is empty", () => {
  const statements = migrationStatements();
  assert.ok(statements.length >= 6);
  for (const s of statements) assert.ok(s.trim().length > 0);
});

test("migration 0015 only adds: it drops, alters and rebuilds nothing (drizzle-kit wrote a rebuild of outcome_events that would have dropped its triggers)", () => {
  const file = migrationFiles().find((f) => basename(f) === "0015_run_corrections.sql");
  assert.ok(file, "0015 is in the journal");
  const statements = migrationStatements().filter((s) => /outcome_corrections|outcome_events_baseline_/.test(s));
  assert.ok(statements.length >= 8, "the table, its index and the seven triggers are read as statements");
  const sql = readFileSync(file, "utf8").replace(/^--.*$/gm, "");
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|TRIGGER|INDEX)\b/i);
  assert.doesNotMatch(sql, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(sql, /__new_|PRAGMA/i);
  assert.equal([...sql.matchAll(/\bCREATE TABLE\b/g)].length, 1, "one new table, outcome_corrections");
  assert.equal([...sql.matchAll(/^CREATE TRIGGER \w+ BEFORE (INSERT|UPDATE|DELETE) ON (outcome_events|outcome_corrections)$/gm)].length, 7);
});
