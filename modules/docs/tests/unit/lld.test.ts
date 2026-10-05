// The low-level design reader: files tables, exported names, path spans, named things, anchors, structure, diagrams and the pointers to section 9,
// each with a seeded fault that it must find, and a clean case that it must pass.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REQUIRED_HEADINGS,
  checkDiagrams,
  checkFilesTables,
  checkFoundPointers,
  checkNamedThings,
  checkOwnAnchors,
  checkPathSpans,
  checkStructure,
  codeSpans,
  exportedNames,
  parseFilesTables,
} from "../../src/lld.ts";

const HEAD = "| File | Holds | Exports |\n| --- | --- | --- |";
const table = (...rows: string[]) => `${HEAD}\n${rows.join("\n")}`;
const files: Record<string, string> = {
  "modules/a/src/x.ts": "export function one() {}\nexport const TWO = 2;\nexport type Three = string;\nexport async function four() {}\n",
  "modules/a/src/y.ts": "export { alpha, beta as gamma };\nexport type { Delta } from './z.ts';\n",
  "app/page.tsx": "export const dynamic = 'force-dynamic';\nexport default async function Page() {}\n",
  "modules/a/src/none.ts": "const hidden = 1;\n",
  "modules/a/STATUS.md": "# Status\n",
};
const read = (p: string) => files[p] ?? null;

test("exported names: functions, consts, types, re-exports with an alias, and the default export", () => {
  assert.deepEqual(exportedNames(files["modules/a/src/x.ts"]!).sort(), ["Three", "TWO", "four", "one"].sort());
  assert.deepEqual(exportedNames(files["modules/a/src/y.ts"]!).sort(), ["Delta", "alpha", "gamma"].sort());
  assert.deepEqual(exportedNames(files["app/page.tsx"]!).sort(), ["default", "dynamic"]);
  assert.deepEqual(exportedNames(files["modules/a/src/none.ts"]!), []);
  assert.deepEqual(exportedNames("  export const indented = 1;"), [], "an export must start its line");
});

test("a files table row names one file in one code span and lists the exports in code spans, or says none", () => {
  const ok = table("| `modules/a/src/x.ts` | holds | `one`, `TWO`, `Three`, `four` |", "| `modules/a/src/none.ts` | holds | none |");
  const parsed = parseFilesTables(ok);
  assert.equal(parsed.tables, 1);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.problems, []);
  assert.equal(parseFilesTables("| File | Holds |\n| --- | --- |\n| `a` | b |").tables, 0, "another table is not a files table");
  assert.match(parseFilesTables(table("| modules/a/src/x.ts | holds | none |")).problems[0]!, /not one code span/);
  assert.match(parseFilesTables(table("| `a` | holds |")).problems[0]!, /2 cells/);
  assert.match(parseFilesTables(table("| `a` | holds | one, two |")).problems.join(" "), /text outside code spans/);
});

test("a files table is held to the file: exists, every export listed, none listed that is not exported", () => {
  const ok = table("| `modules/a/src/x.ts` | h | `one`, `TWO`, `Three`, `four` |", "| `modules/a/src/y.ts` | h | `alpha`, `gamma`, `Delta` |", "| `app/page.tsx` | h | `default`, `dynamic` |", "| `modules/a/src/none.ts` | h | none |", "| `modules/a/STATUS.md` | h | none |");
  assert.deepEqual(checkFilesTables(ok, read), []);
  assert.match(checkFilesTables(table("| `modules/a/src/missing.ts` | h | none |"), read).join(" "), /does not exist/);
  assert.match(checkFilesTables(table("| `modules/a/src/x.ts` | h | `one`, `TWO`, `Three` |"), read).join(" "), /exports four, which is not listed/);
  assert.match(checkFilesTables(table("| `modules/a/src/x.ts` | h | `one`, `TWO`, `Three`, `four`, `five` |"), read).join(" "), /does not export five/);
  assert.match(checkFilesTables(table("| `modules/a/src/none.ts` | h | `hidden` |"), read).join(" "), /does not export hidden/);
  assert.match(checkFilesTables(table("| `modules/a/STATUS.md` | h | `x` |"), read).join(" "), /not a TypeScript file but lists exports/);
  assert.match(checkFilesTables(table("| `modules/a/src/x.ts` | h | `one`, `one`, `TWO`, `Three`, `four` |"), read).join(" "), /lists one twice/);
});

test("path spans: must exist, directories end in a slash, files do not, no patterns, fenced blocks are ignored", () => {
  const kind = (p: string) => (p === "modules/a/src" ? "directory" : p === "modules/a/src/x.ts" ? "file" : null);
  assert.deepEqual(checkPathSpans("See `modules/a/src/` and `modules/a/src/x.ts`.", kind), []);
  assert.match(checkPathSpans("See `modules/a/src`.", kind).join(" "), /no trailing slash/);
  assert.match(checkPathSpans("See `modules/a/src/x.ts/`.", kind).join(" "), /trailing slash/);
  assert.match(checkPathSpans("See `modules/a/nothing.ts`.", kind).join(" "), /does not exist/);
  assert.match(checkPathSpans("See `modules/a/src/*.ts`.", kind).join(" "), /pattern/);
  assert.match(checkPathSpans("See `modules/a/src/x.ts and more`.", kind).join(" "), /pattern or holds a space/);
  assert.deepEqual(checkPathSpans("```ts\nconst p = `modules/a/gone.ts`;\n```", kind), []);
  assert.deepEqual(checkPathSpans("A code span that is not a path: `x.ts`, `import`, `a/b`.", kind), []);
});

test("named things: a snake_case, camelCase or ALL_CAPS span that appears nowhere in the code is found; examples and plain words are not", () => {
  const present = new Set(["users_email_unique", "loadFacts", "SESSION_SECRET"]);
  const has = (n: string) => present.has(n);
  assert.deepEqual(checkNamedThings("`users_email_unique`, `loadFacts`, `SESSION_SECRET`, `plain`, `GET`, `a_b`", has), []);
  const found = checkNamedThings("a table `users_invented_ix` and a function `loadFactz` and a variable `SESSION_SECRETS`", has);
  assert.equal(found.length, 3);
  assert.match(found.join(" "), /users_invented_ix is named but appears nowhere/);
  assert.deepEqual(checkNamedThings("`users_invented_ix`", has, new Set(["users_invented_ix"])), []);
  assert.equal(checkNamedThings("`loadFactz` and again `loadFactz`", has).length, 1, "a name is reported once");
  assert.deepEqual(checkNamedThings("```\nloadFactz_x\n```", has), [], "fenced code is not read");
});

test("code spans carry their line", () => {
  assert.deepEqual(codeSpans("a `b` c\n\n`d` and `e`"), [{ line: 1, text: "b" }, { line: 3, text: "d" }, { line: 3, text: "e" }]);
});

test("anchors: a link to a heading resolves; one to a heading with a code span or an underscore is refused, because the two rules disagree", () => {
  const doc = "# T\n\n## 1. Intro\n\n[a](#1-intro)\n\n### 2.1 Pages in `app/_ui/`\n\n[b](#21-pages-in-app_ui)\n\n### 2.2 the_name\n\n[c](#22-the_name)\n\n[d](#nowhere)\n";
  const problems = checkOwnAnchors(doc);
  assert.equal(problems.length, 3);
  assert.match(problems.join("\n"), /#21-pages-in-app_ui is a heading on GitHub but not under scripts\/check-documentation\.mjs/);
  assert.match(problems.join("\n"), /#22-the_name is a heading on GitHub but not under/);
  assert.match(problems.join("\n"), /#nowhere is not a heading on GitHub/);
  assert.deepEqual(checkOwnAnchors("## One\n\n[x](#one)\n\n## One\n\n[y](#one-1)\n"), [], "a second heading of the same name gets -1");
});

const skeleton = (omit: string[] = [], rename: Record<string, string> = {}): string => {
  const lines = ["# Low-level design: APLYD MSME platform", "", "Version 0.1. Date: 5 October 2026. Status: draft, not reviewed by a person.", ""];
  for (const [n, title] of REQUIRED_HEADINGS) {
    if (omit.includes(n)) continue;
    lines.push(`${n.includes(".") ? "###" : "##"} ${n}${n.includes(".") ? "" : "."} ${rename[n] ?? title}`, "");
    if (/^4\.[1-9]$/.test(n)) lines.push("#### Found while writing", "", "None found.", "");
  }
  return lines.join("\n");
};

test("structure: the plan's headings in order, the status line, and a Found while writing list under each module", () => {
  assert.deepEqual(checkStructure(skeleton()), []);
  assert.match(checkStructure(skeleton(["3.4"])).join(" "), /heading 3\.4 Audit is missing/);
  assert.match(checkStructure(skeleton([], { "2.2": "Who owns what" })).join(" "), /heading 2\.2 reads "Who owns what"/);
  assert.match(checkStructure(skeleton().replace("Status: draft, not reviewed by a person.", "Status: reviewed.")).join(" "), /status of a draft/);
  assert.match(checkStructure(skeleton().replace("# Low-level design: APLYD MSME platform", "# LLD")).join(" "), /not the title/);
  const noFound = skeleton().replace("#### Found while writing\n\nNone found.\n\n### 4.2", "### 4.2");
  assert.match(checkStructure(noFound).join(" "), /section 4\.1 has no "Found while writing"/);
  const swapped = skeleton().replace("### 3.1 The request pipeline in code", "### 3.1 X").replace("### 5.1 How a page is built", "### 3.1 The request pipeline in code\n\n### 5.1 How a page is built");
  assert.ok(checkStructure(swapped).length > 0);
});

test("diagrams: a fence needs a language, a Mermaid block stays under 25 lines and is a known kind, and no emoji", () => {
  assert.deepEqual(checkDiagrams("```mermaid\nflowchart LR\n  a --> b\n```\n"), []);
  assert.match(checkDiagrams("```\nplain\n```\n").join(" "), /no language/);
  const long = `\`\`\`mermaid\nflowchart LR\n${"  a --> b\n".repeat(30)}\`\`\`\n`;
  assert.match(checkDiagrams(long).join(" "), /Mermaid block of 31 lines/);
  assert.match(checkDiagrams("```mermaid\npie title x\n```\n").join(" "), /not a sequence diagram/);
  assert.match(checkDiagrams("text \u{1F600}").join(" "), /emoji/);
});

test("pointers to section 9: each names a subsection that exists and counts the items it holds", () => {
  const doc = "#### Found while writing\n\n2 items, listed in [section 9.1](#91-from-x).\n\n## 9. Discrepancies\n\n### 9.1 From x\n\n- one\n- two\n\n### 9.2 From y\n\n- three\n";
  assert.deepEqual(checkFoundPointers(doc), []);
  assert.match(checkFoundPointers(doc.replace("2 items", "3 items")).join(" "), /says 3 items, the section holds 2/);
  assert.match(checkFoundPointers(doc.replace("9.1", "9.7")).join(" "), /section 9\.7, which does not exist/);
});
