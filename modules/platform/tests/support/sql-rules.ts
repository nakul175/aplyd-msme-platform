// Rules about how an append-only company table may be queried, read from the syntax tree of every source file that mentions
// it. A tripwire, like the header rule: it reads SQL written as string or template literals and cannot see SQL built at run time.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** The application's own source files: pages and routes, the Worker, and each module's src. Tests are not included. */
export const applicationFiles = (): string[] =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "app", "worker", "modules"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => /^(app|worker)\/.*\.tsx?$/.test(f) || /^modules\/[^/]+\/src\/.*\.tsx?$/.test(f));

/** Every string or template literal in the file that names factory_revisions, with its line. */
export function sqlMentioning(file: string, text: string, table: string): { line: number; sql: string }[] {
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
