import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ALL_APPEND_ONLY_TRIGGERS, ALL_REQUIRED_TRIGGERS, APPEND_ONLY_TABLES, RULE_TRIGGERS } from "../../src/db/guards.ts";
import { migrationFiles } from "../../src/db/migrate.ts";

// The list the health check uses must match the triggers the migrations create, in both directions.
test("the guard lists match the triggers the migrations create", () => {
  const found: Record<string, string[]> = {};
  // In the order the migrations run: a trigger that a later migration drops (to create it again, changed) is counted once.
  for (const file of migrationFiles()) {
    for (const m of readFileSync(file, "utf8").matchAll(/CREATE TRIGGER\s+(\w+)\s+BEFORE\s+(UPDATE|DELETE|INSERT)\s+ON\s+(\w+)|DROP TRIGGER\s+(?:IF EXISTS\s+)?(\w+)/gi)) {
      if (m[4]) {
        const table = Object.keys(found).find((t) => found[t].includes(m[4]));
        assert.ok(table, `${m[4]} is dropped before it was created`);
        found[table].splice(found[table].indexOf(m[4]), 1);
      } else (found[m[3]] ??= []).push(m[1]);
    }
  }
  for (const triggers of Object.values(found)) triggers.sort();
  const listed: Record<string, string[]> = {};
  for (const source of [APPEND_ONLY_TABLES, RULE_TRIGGERS]) for (const [table, triggers] of Object.entries(source)) (listed[table] ??= []).push(...triggers);
  for (const triggers of Object.values(listed)) triggers.sort();
  assert.deepEqual(found, listed);
});

test("every append-only table has a trigger for update, delete and replace, and the flat list has no duplicates", () => {
  for (const [table, triggers] of Object.entries(APPEND_ONLY_TABLES)) {
    assert.deepEqual(triggers.map((t) => t.replace(`${table}_`, "")).sort(), ["no_delete", "no_replace", "no_update"], table);
  }
  assert.equal(new Set(ALL_APPEND_ONLY_TRIGGERS).size, ALL_APPEND_ONLY_TRIGGERS.length);
  assert.equal(new Set(ALL_REQUIRED_TRIGGERS).size, ALL_REQUIRED_TRIGGERS.length);
  assert.equal(ALL_REQUIRED_TRIGGERS.length, ALL_APPEND_ONLY_TRIGGERS.length + Object.values(RULE_TRIGGERS).flat().length);
});

test("a trigger that a migration drops is created again by the same migration, or the guard lists would lose it", () => {
  const dropped: string[] = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(file, "utf8");
    for (const m of sql.matchAll(/DROP TRIGGER\s+(?:IF EXISTS\s+)?(\w+)/gi)) {
      dropped.push(m[1]);
      assert.match(sql, new RegExp(`CREATE TRIGGER\\s+${m[1]}\\s`), `${m[1]} is dropped in ${file} and not created there again`);
    }
  }
  assert.ok(dropped.includes("engagement_events_delivery_limit") && dropped.includes("engagements_needs_a_listed_provider"), "migration 0014 changes these two");
});
