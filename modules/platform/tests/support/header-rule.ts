// The rule behind the "identity never comes from a header" test, as a function over source text so it can be tested itself.
// A request header may be read only as `<something>.headers.get("<name on the allow-list>")`. Writing a header (set, append,
// delete) is not reading. Every other use of a `.headers` value is reported: an alias, a spread, a loop, Array.from,
// destructuring, a computed name, an optional-chain form that is not a plain get. The rule works on the syntax tree, so
// spacing, line breaks and optional chaining do not hide anything. It cannot see a header reached through reflection or a
// string built at run time; that limit is stated in modules/platform/STATUS.md.
import ts from "typescript";

// content-length is read only to refuse an oversized body without reading it (modules/platform/src/api/body.ts); a length is not an identity.
export const ALLOWED_HEADERS = new Set(["cookie", "origin", "sec-fetch-site", "content-type", "content-length"]);

const WRAPPERS = (n: ts.Node) =>
  ts.isParenthesizedExpression(n) || ts.isAwaitExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isTypeAssertionExpression(n);

export function headerReadProblems(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const problems: string[] = [];
  const at = (n: ts.Node) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const nextHeaders = new Set<string>();

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== "next/headers") continue;
    const clause = stmt.importClause;
    if (!clause) continue;
    if (clause.name || (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))) problems.push(`${at(stmt)} imports next/headers as a default or namespace; import { headers } by name`);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) if ((el.propertyName ?? el.name).text === "headers") nextHeaders.add(el.name.text);
    }
  }

  const check = (node: ts.Node, label: string) => {
    let top = node;
    while (top.parent && WRAPPERS(top.parent)) top = top.parent;
    const access = top.parent;
    if (access && ts.isPropertyAccessExpression(access) && access.expression === top) {
      const name = access.name.text;
      if (name === "set" || name === "append" || name === "delete") return; // writing, not reading
      const call = access.parent;
      if (name === "get" && call && ts.isCallExpression(call) && call.expression === access && call.arguments.length === 1) {
        const arg = call.arguments[0];
        if (ts.isStringLiteralLike(arg) && ALLOWED_HEADERS.has(arg.text.toLowerCase())) return;
        problems.push(`${at(node)} reads a header that is not on the allow-list, or by a computed name (${label})`);
        return;
      }
    }
    problems.push(`${at(node)} uses ${label} other than as .get("<allowed header>")`);
  };

  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) && n.name.text === "headers") check(n, ".headers");
    else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === "headers") check(n, '["headers"]');
    else if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && nextHeaders.has(n.expression.text)) check(n, "headers()");
    else if (ts.isBindingElement(n) && ((n.propertyName ?? n.name) as ts.Node).getText(sf) === "headers" && !(ts.isArrayBindingPattern(n.parent) )) {
      problems.push(`${at(n)} destructures a headers value`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return problems;
}
