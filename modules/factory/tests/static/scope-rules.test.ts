// Rules about how the factory record may be queried, checked on the syntax tree of every source file that mentions it.
// A tripwire, like the header rule: it reads SQL written as string or template literals and cannot see SQL built at run time.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const files = () =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "app", "worker", "modules"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => /^(app|worker)\/.*\.tsx?$/.test(f) || /^modules\/[^/]+\/src\/.*\.tsx?$/.test(f));

/** Every string or template literal in the file that names factory_revisions, with its line. */
function sqlMentioning(file: string, text: string, table: string): { line: number; sql: string }[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: { line: number; sql: string }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) {
      const sql = ts.isTemplateExpression(n) ? n.getText(sf).slice(1, -1) : n.text; // without the backticks
      if (sql.includes(table)) found.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, sql });
      if (ts.isTemplateExpression(n)) return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

export function problemsWith(file: string, text: string, table: string): string[] {
  const problems: string[] = [];
  for (const { line, sql } of sqlMentioning(file, text, table)) {
    const where = `${file}:${line}`;
    const body = sql.replace(/\s+/g, " ");
    if (/\b(UPDATE|DELETE|REPLACE)\b/i.test(body) || /\bINSERT OR\b/i.test(body)) problems.push(`${where} changes or replaces a row of ${table} (it is append-only)`);
    else if (/^\s*SELECT/i.test(body) && !/\bcompany_id = \?/.test(body)) problems.push(`${where} reads ${table} without "company_id = ?"`);
  }
  return problems;
}

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
