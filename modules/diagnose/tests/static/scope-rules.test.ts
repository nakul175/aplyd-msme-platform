// Rules about how assessments and their events may be queried (the shared rule is in platform/tests/support/sql-rules.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ROOT, applicationFiles, problemsWith, sqlMentioning } from "../../../platform/tests/support/sql-rules.ts";

const TABLES = ["assessments", "assessment_events"];
// A string that names a table and is not SQL (an import path such as "../db/assessments.ts") does not count.
const queries = (file: string, table: string) => sqlMentioning(file, readFileSync(`${ROOT}${file}`, "utf8"), table).filter((m) => /\b(SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(m.sql));

test("every query on the assessment tables is bound to a company, and none changes or replaces a row", () => {
  const all = applicationFiles();
  assert.ok(all.includes("modules/diagnose/src/db/assessments.ts"), "the data layer is among the scanned files");
  for (const table of TABLES) {
    const mentions = all.flatMap((f) => queries(f, table));
    assert.ok(mentions.length >= 4, `the scan finds the queries on ${table} (it found ${mentions.length})`);
    assert.deepEqual(all.flatMap((f) => problemsWith(f, readFileSync(`${ROOT}${f}`, "utf8"), table)), [], table);
  }
});

test("pages and routes do not query the assessment tables themselves: they go through the data layer", () => {
  for (const f of applicationFiles().filter((x) => x.startsWith("app/") || x.startsWith("worker/"))) {
    for (const table of TABLES) assert.deepEqual(queries(f, table), [], `${f} ${table}`);
  }
});

test("only the diagnose data layer touches the assessment tables", () => {
  for (const f of applicationFiles().filter((x) => !x.startsWith("modules/diagnose/src/db/"))) {
    for (const table of TABLES) assert.deepEqual(queries(f, table), [], `${f} ${table}`);
  }
});

test("the rule catches a read of assessment events that is not bound to a company", () => {
  assert.notDeepEqual(problemsWith("x.ts", 'db.prepare("SELECT * FROM assessment_events WHERE assessment_id = ?")', "assessment_events"), []);
  assert.deepEqual(problemsWith("x.ts", 'db.prepare("SELECT * FROM assessment_events WHERE assessment_id = ? AND company_id = ?")', "assessment_events"), []);
  assert.notDeepEqual(problemsWith("x.ts", 'db.prepare("DELETE FROM assessments WHERE company_id = ?")', "assessments"), []);
});
