// A BEFORE INSERT trigger that refuses to replace a row must look at every key a row can conflict on, because INSERT OR
// REPLACE resolves a conflict on ANY unique key by deleting the other row without running DELETE triggers. Review of slice 1
// found it for audit_events, review of slice 3 for the sign-off key of assessment_events. This reads every unique key of every
// append-only table from the migrated database and requires a BEFORE INSERT trigger that names each of its columns as NEW.<column>
// (and, for a partial index, its condition), so a key added in a later migration without a matching trigger fails here.
// It checks that the trigger looks at the key, not that its logic is right: each module also proves the refusal with a real
// INSERT OR REPLACE (see the tests named in KEY_TESTS).
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { APPEND_ONLY_TABLES } from "../../src/db/guards.ts";
import { createTestEnvironment } from "../support/d1.ts";

let db: D1Database;
let dispose: () => Promise<void>;
beforeEach(async () => {
  ({ db, dispose } = await createTestEnvironment());
});
afterEach(async () => {
  await dispose();
});

type Key = { table: string; columns: string[]; where: { column: string; literal: string }[]; label: string };

async function uniqueKeys(table: string): Promise<Key[]> {
  const keys: Key[] = [];
  const info = (await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string; pk: number }>()).results;
  const pk = info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
  if (pk.length) keys.push({ table, columns: pk, where: [], label: `${table} primary key (${pk.join(", ")})` });
  const indexes = (await db.prepare(`PRAGMA index_list(${table})`).all<{ name: string; unique: number; origin: string; partial: number }>()).results;
  for (const index of indexes.filter((i) => i.unique === 1)) {
    const columns = (await db.prepare(`PRAGMA index_info(${index.name})`).all<{ seqno: number; name: string }>()).results.sort((a, b) => a.seqno - b.seqno).map((c) => c.name);
    const where: Key["where"] = [];
    if (index.partial === 1) {
      const sql = (await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").bind(index.name).first<{ sql: string }>())!.sql;
      const condition = /\bWHERE\b([\s\S]*)$/i.exec(sql)?.[1] ?? "";
      const parts = condition.split(/\bAND\b/i).map((p) => p.trim());
      for (const part of parts) {
        const m = /(?:"?\w+"?\.)?"?(\w+)"?\s*=\s*'([^']*)'$/.exec(part);
        assert.ok(m, `${index.name}: the condition "${part}" is not of the form column = 'literal'; extend this test to understand it`);
        where.push({ column: m[1], literal: m[2] });
      }
    }
    keys.push({ table, columns, where, label: `${table} unique index ${index.name} (${columns.join(", ")})${where.length ? ` where ${where.map((w) => `${w.column} = '${w.literal}'`).join(" and ")}` : ""}` });
  }
  return keys;
}

async function insertTriggers(table: string): Promise<{ name: string; sql: string }[]> {
  const rows = (await db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?").bind(table).all<{ name: string; sql: string }>()).results;
  return rows.filter((r) => /\bBEFORE\s+INSERT\b/i.test(r.sql));
}

const looksAt = (sql: string, key: Key): boolean =>
  key.columns.every((c) => new RegExp(`\\bNEW\\.${c}\\b`, "i").test(sql)) && key.where.every((w) => new RegExp(`\\bNEW\\.${w.column}\\s*=\\s*'${w.literal}'`, "i").test(sql));

test("every unique key of every append-only table is looked at by a BEFORE INSERT trigger, so INSERT OR REPLACE cannot delete a row through it", async () => {
  let checked = 0;
  for (const table of Object.keys(APPEND_ONLY_TABLES)) {
    const triggers = await insertTriggers(table);
    for (const key of await uniqueKeys(table)) {
      checked += 1;
      assert.ok(triggers.some((t) => looksAt(t.sql, key)), `no BEFORE INSERT trigger on ${table} refuses a second row for ${key.label}`);
    }
  }
  assert.ok(checked >= 9, `the scan found only ${checked} unique keys: it is not reading the database`);
});

test("the check can fail: a key no trigger looks at is reported (a plain primary key, a composite key and a partial index)", () => {
  const trigger = "CREATE TRIGGER t BEFORE INSERT ON x WHEN EXISTS (SELECT 1 FROM x WHERE id = NEW.id) BEGIN SELECT RAISE(ABORT, 'x'); END";
  assert.equal(looksAt(trigger, { table: "x", columns: ["id"], where: [], label: "" }), true);
  assert.equal(looksAt(trigger, { table: "x", columns: ["a", "b"], where: [], label: "" }), false);
  assert.equal(looksAt(trigger, { table: "x", columns: ["id"], where: [{ column: "kind", literal: "signoff" }], label: "" }), false);
  const other = "CREATE TRIGGER t BEFORE INSERT ON x WHEN NEW.kind = 'decision' AND EXISTS (SELECT 1 FROM x WHERE a = NEW.a AND kind = 'signoff') BEGIN SELECT 1; END";
  assert.equal(looksAt(other, { table: "x", columns: ["a"], where: [{ column: "kind", literal: "signoff" }], label: "" }), false, "a trigger about decisions that mentions a sign-off in a subquery does not count");
});
