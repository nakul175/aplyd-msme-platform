// Rules about how the factory record may be queried (the shared rule is in platform/tests/support/sql-rules.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ROOT, applicationFiles as files, problemsWith, sqlMentioning } from "../../../platform/tests/support/sql-rules.ts";

test("every query on factory_revisions in the application is bound to a company and none changes a row", () => {
  const all = files();
  assert.ok(all.includes("modules/factory/src/db/revisions.ts"), "the data layer is among the scanned files");
  const mentions = all.flatMap((f) => sqlMentioning(f, readFileSync(`${ROOT}${f}`, "utf8"), "factory_revisions"));
  assert.ok(mentions.length >= 6, "the scan finds the queries (it found " + mentions.length + ")");
  assert.deepEqual(all.flatMap((f) => problemsWith(f, readFileSync(`${ROOT}${f}`, "utf8"), "factory_revisions")), []);
});

test("pages and routes do not query the factory table themselves: they go through the data layer", () => {
  for (const f of files().filter((x) => x.startsWith("app/") || x.startsWith("worker/"))) {
    assert.deepEqual(sqlMentioning(f, readFileSync(`${ROOT}${f}`, "utf8"), "factory_revisions"), [], f);
  }
});

test("the rule itself: it flags unbound reads, updates, deletes and replaces, and accepts bound reads and plain inserts", () => {
  const T = "factory_revisions";
  const bad = [
    'db.prepare("SELECT * FROM factory_revisions WHERE revision_no = ?")',
    'db.prepare("SELECT * FROM factory_revisions")',
    'db.prepare("UPDATE factory_revisions SET note = \'\'")',
    'db.prepare("DELETE FROM factory_revisions WHERE company_id = ?")',
    'db.prepare("INSERT OR REPLACE INTO factory_revisions (id) VALUES (1)")',
    'db.prepare("REPLACE INTO factory_revisions (id) VALUES (1)")',
    "db.prepare(`SELECT * FROM factory_revisions WHERE id = ${x}`)",
    'db.prepare("select * from factory_revisions where revision_no = ?")',
  ];
  for (const code of bad) assert.notDeepEqual(problemsWith("x.ts", code, T), [], code);
  const good = [
    'db.prepare("SELECT * FROM factory_revisions WHERE company_id = ? ORDER BY revision_no")',
    'db.prepare(`SELECT a FROM factory_revisions WHERE company_id = ?${x}`)',
    'db.prepare("INSERT INTO factory_revisions (company_id) SELECT ?")',
  ];
  for (const code of good) assert.deepEqual(problemsWith("x.ts", code, T), [], code);
});
