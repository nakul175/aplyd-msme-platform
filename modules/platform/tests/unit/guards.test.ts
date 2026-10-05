import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { APPEND_ONLY_TABLES, ALL_APPEND_ONLY_TRIGGERS } from "../../src/db/guards.ts";
import { migrationFiles } from "../../src/db/migrate.ts";

// The list the health check uses must match the triggers the migrations create, in both directions.
test("the append-only guard list matches the triggers the migrations create", () => {
  const found: Record<string, string[]> = {};
  for (const file of migrationFiles()) {
    for (const m of readFileSync(file, "utf8").matchAll(/CREATE TRIGGER\s+(\w+)\s+BEFORE\s+(UPDATE|DELETE|INSERT)\s+ON\s+(\w+)/gi)) {
      (found[m[3]] ??= []).push(m[1]);
    }
  }
  for (const triggers of Object.values(found)) triggers.sort();
  const listed = Object.fromEntries(Object.entries(APPEND_ONLY_TABLES).map(([table, triggers]) => [table, [...triggers].sort()]));
  assert.deepEqual(found, listed);
});

test("every append-only table has a trigger for update, delete and replace, and the flat list has no duplicates", () => {
  for (const [table, triggers] of Object.entries(APPEND_ONLY_TABLES)) {
    assert.deepEqual(triggers.map((t) => t.replace(`${table}_`, "")).sort(), ["no_delete", "no_replace", "no_update"], table);
  }
  assert.equal(new Set(ALL_APPEND_ONLY_TRIGGERS).size, ALL_APPEND_ONLY_TRIGGERS.length);
});
