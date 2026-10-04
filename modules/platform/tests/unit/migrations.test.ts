import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
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
