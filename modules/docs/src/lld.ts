// Reads the low-level design (docs/design/LLD.md) and holds what can be held to the code: the "files tables" (every row names one file that exists
// and lists exactly the names it exports), every repository path in a code span, every identifier-like code span (it must appear somewhere in the
// code), the document's own anchors, its structure (the headings of the plan, a "Found while writing" list under each module) and its diagrams.
// Pure functions: they take text and, where they need to know what exists, a function that says so. They never read a file themselves.

/** The headings the plan promises, by number. A heading whose title differs from the plan is a problem. */
export const REQUIRED_HEADINGS: readonly [string, string][] = [
  ["1", "Introduction"],
  ["1.1", "Purpose and audience"],
  ["1.2", "Conventions"],
  ["1.3", "How this relates to the other documents"],
  ["1.4", "Reading order"],
  ["2", "Repository layout and module ownership"],
  ["2.1", "Directories"],
  ["2.2", "The ownership rule"],
  ["2.3", "Imports between modules"],
  ["3", "Cross-cutting design"],
  ["3.1", "The request pipeline in code"],
  ["3.2", "Handlers, responses and errors"],
  ["3.3", "Identity, session and the scope rule"],
  ["3.4", "Audit"],
  ["3.5", "Identifiers, clocks, money, time and JSON"],
  ["3.6", "Environment and bindings"],
  ["3.7", "Database access: reads, batches, the guards that refuse writes"],
  ["4", "Modules"],
  ["4.1", "The platform module"],
  ["4.2", "The factory module"],
  ["4.3", "The diagnose module"],
  ["4.4", "The procure module"],
  ["4.5", "The deliver module"],
  ["4.6", "The run module"],
  ["4.7", "The journey module"],
  ["4.8", "The demo module"],
  ["4.9", "Hosting, scripts and the documentation readers"],
  ["5", "The pages layer"],
  ["5.1", "How a page is built"],
  ["5.2", "The shared frame and parts in `app/_ui/`"],
  ["5.3", "Forms, redirects and the `?saved=` and `?problem=` contract"],
  ["5.4", "The pages one by one"],
  ["5.5", "Design tokens and CSS"],
  ["5.6", "What the pages must keep for the tests"],
  ["6", "Build, bundling and runtime"],
  ["6.1", "Build"],
  ["6.2", "The worker and bindings"],
  ["6.3", "Migrations"],
  ["6.4", "The demo host"],
  ["6.5", "Configuration names"],
  ["7", "Test design"],
  ["7.1", "Layers"],
  ["7.2", "The runner and the baselines"],
  ["7.3", "The local database helper and fixtures"],
  ["7.4", "The contracts the pages must keep and which test enforces each"],
  ["7.5", "How a test is added"],
  ["8", "How to change things"],
  ["8.1", "Add a questionnaire question"],
  ["8.2", "Add an idea to the library"],
  ["8.3", "Add an endpoint"],
  ["8.4", "Add a table and a migration"],
  ["8.5", "Add a page and a stage"],
  ["8.6", "Add an audit event"],
  ["9", "Discrepancies and technical debt"],
];

/** The module sections, each of which must end with a "Found while writing" subsection. */
export const MODULE_SECTIONS = ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9"] as const;

/** Where a fenced diagram must stay under, in lines. */
export const MAX_DIAGRAM_LINES = 25;

const withoutFences = (markdown: string): { lines: string[]; fences: { start: number; lang: string; length: number }[] } => {
  const lines: string[] = [];
  const fences: { start: number; lang: string; length: number }[] = [];
  let open: { start: number; lang: string; length: number } | null = null;
  markdown.split("\n").forEach((line, i) => {
    if (/^```/.test(line)) {
      if (open === null) open = { start: i + 1, lang: line.slice(3).trim(), length: 0 };
      else {
        fences.push(open);
        open = null;
      }
      lines.push("");
      return;
    }
    if (open !== null) {
      open.length++;
      lines.push("");
      return;
    }
    lines.push(line);
  });
  return { lines, fences };
};

/** Names a TypeScript or TSX file exports, as the plan defines them: `export function|async function|const|let|var|class|type|interface|enum NAME`, `export { NAME }` and `export default` (written `default`). */
export function exportedNames(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]!);
  for (const m of source.matchAll(/^export\s*(?:type\s*)?\{([^}]*)\}/gm)) {
    for (const part of m[1]!.split(",")) {
      const p = part.trim();
      if (!p) continue;
      const pieces = p.split(/\s+as\s+/);
      names.add((pieces[1] ?? pieces[0]!).replace(/^type\s+/, ""));
    }
  }
  if (/^export\s+default\b/m.test(source)) names.add("default");
  return [...names];
}

export type FilesTableRow = { line: number; path: string; exports: string[] | "none"; extra: string };

/** Every row of every files table (a table whose header is `| File | Holds | Exports |`). Problems with the form of a row are returned with its line. */
export function parseFilesTables(markdown: string): { tables: number; rows: FilesTableRow[]; problems: string[] } {
  const lines = markdown.split("\n");
  const rows: FilesTableRow[] = [];
  const problems: string[] = [];
  let tables = 0;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i]!)) inFence = !inFence;
    if (inFence || !/^\| File \| Holds \| Exports \|\s*$/.test(lines[i]!)) continue;
    tables++;
    let j = i + 2; // the line after the header is the rule
    for (; j < lines.length && lines[j]!.startsWith("|"); j++) {
      const cells = lines[j]!.replace(/^\|/, "").replace(/\|\s*$/, "").split(/(?<!\\)\|/).map((c) => c.trim());
      if (cells.length !== 3) {
        problems.push(`line ${j + 1}: a files-table row has ${cells.length} cells, not 3`);
        continue;
      }
      const file = /^`([^`]+)`$/.exec(cells[0]!);
      if (!file) {
        problems.push(`line ${j + 1}: the File cell is not one code span: ${cells[0]!.slice(0, 60)}`);
        continue;
      }
      const exp = cells[2]!;
      if (exp === "none" || exp === "`none`") {
        rows.push({ line: j + 1, path: file[1]!, exports: "none", extra: "" });
        continue;
      }
      const listed = [...exp.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
      const extra = exp.replace(/`[^`]+`/g, "").replace(/[,\s]/g, "");
      if (extra) problems.push(`line ${j + 1}: the Exports cell of ${file[1]} has text outside code spans`);
      if (listed.length === 0) problems.push(`line ${j + 1}: the Exports cell of ${file[1]} lists nothing and does not say none`);
      rows.push({ line: j + 1, path: file[1]!, exports: listed, extra });
    }
    i = j - 1;
  }
  return { tables, rows, problems };
}

/** For each files-table row: the file exists, and the names listed are exactly the names it exports. `read` returns the text of a repository file, or null if there is none. */
export function checkFilesTables(markdown: string, read: (path: string) => string | null): string[] {
  const { rows, problems } = parseFilesTables(markdown);
  const out = [...problems];
  for (const r of rows) {
    const source = read(r.path);
    if (source === null) {
      out.push(`line ${r.line}: ${r.path} does not exist`);
      continue;
    }
    const isCode = /\.(ts|tsx|mts)$/.test(r.path);
    const listed = r.exports === "none" ? [] : r.exports;
    if (!isCode) {
      if (listed.length) out.push(`line ${r.line}: ${r.path} is not a TypeScript file but lists exports`);
      continue;
    }
    const real = exportedNames(source);
    for (const n of listed) if (!real.includes(n)) out.push(`line ${r.line}: ${r.path} does not export ${n}`);
    for (const n of real) if (!listed.includes(n)) out.push(`line ${r.line}: ${r.path} exports ${n}, which is not listed`);
    const seen = new Set<string>();
    for (const n of listed) {
      if (seen.has(n)) out.push(`line ${r.line}: ${r.path} lists ${n} twice`);
      seen.add(n);
    }
  }
  return out;
}

const PATH_START = /^(?:app|modules|docs|drizzle|scripts|worker)\//;
/** Root files the document may name without a directory. */
const ROOT_FILES = new Set(["package.json", "AGENTS.md", "HANDOVER.md", "README.md", "CLAUDE.md", "drizzle.config.ts", "wrangler.jsonc", "tsconfig.json", "vite.config.ts", "next.config.ts", "Dockerfile", ".env.example"]);

/** The code spans of the document outside fenced blocks, with their lines. */
export function codeSpans(markdown: string): { line: number; text: string }[] {
  const { lines } = withoutFences(markdown);
  const out: { line: number; text: string }[] = [];
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/`([^`\n]+)`/g)) out.push({ line: i + 1, text: m[1]!.trim() });
  });
  return out;
}

/**
 * Every code span that looks like a repository path must name something that exists; a directory ends in a slash and a file does not; and a
 * span may not be a pattern (a wildcard, braces) or hold a space. `kind` says what `exists` found.
 */
export function checkPathSpans(markdown: string, kind: (path: string) => "file" | "directory" | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { line, text } of codeSpans(markdown)) {
    const looksLikePath = PATH_START.test(text) || ROOT_FILES.has(text);
    if (!looksLikePath) continue;
    if (/[*?{}<>\s]/.test(text)) {
      out.push(`line ${line}: a path span is a pattern or holds a space: ${text}`);
      continue;
    }
    const key = text;
    if (seen.has(key)) continue;
    seen.add(key);
    const found = kind(text.replace(/\/$/, ""));
    if (found === null) out.push(`line ${line}: ${text} does not exist`);
    else if (found === "directory" && !text.endsWith("/")) out.push(`line ${line}: the directory ${text} has no trailing slash`);
    else if (found === "file" && text.endsWith("/")) out.push(`line ${line}: the file ${text} has a trailing slash`);
  }
  return out;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const looksNamed = (s: string): boolean => IDENTIFIER.test(s) && s.length >= 4 && (/_/.test(s) || /[a-z][A-Z]/.test(s) || /^[A-Z][A-Z0-9]{2,}$/.test(s));
/** Words that are not names in the code even though they look like one: HTTP verbs and the like. */
const NOT_NAMES = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "SYNTHETIC", "NULL", "TRUE", "FALSE", "JSON", "HTML", "HTTP", "HTTPS", "SQLite", "TypeScript", "JavaScript", "GitHub", "Cloudflare", "DigitalOcean", "PostgreSQL", "AS_BUILT"]);

/**
 * Identifier-like code spans (snake_case, camelCase, ALL_CAPS) that appear nowhere in the code. `appearsInCode` says whether a name is a word in
 * any file of `app/`, `modules/`, `scripts/`, `worker/` or `drizzle/`, or a root file. This holds every table, trigger, index, function, binding and
 * variable name the document uses against the code, and finds a name the document invented or got wrong. A name in `allowed` is an example the
 * document says is an example, and is not looked for.
 */
export function checkNamedThings(markdown: string, appearsInCode: (name: string) => boolean, allowed: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { line, text } of codeSpans(markdown)) {
    if (!looksNamed(text) || NOT_NAMES.has(text) || allowed.has(text) || seen.has(text)) continue;
    seen.add(text);
    if (!appearsInCode(text)) out.push(`line ${line}: ${text} is named but appears nowhere in the code`);
  }
  return out;
}

const githubSlug = (heading: string): string => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
// scripts/check-documentation.mjs removes code spans and then every character that is not a letter, digit, space or hyphen, so a heading with a
// code span or an underscore gets another anchor there than it gets on GitHub.
const checkerSlug = (heading: string): string => heading.replace(/`[^`\n]*`/g, "").trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");

export function headings(markdown: string): { level: number; text: string; line: number }[] {
  const { lines } = withoutFences(markdown);
  const out: { level: number; text: string; line: number }[] = [];
  lines.forEach((l, i) => {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
    if (m) out.push({ level: m[1]!.length, text: m[2]!, line: i + 1 });
  });
  return out;
}

function anchorSet(markdown: string, slug: (h: string) => string): Set<string> {
  const seen = new Map<string, number>();
  const set = new Set<string>();
  for (const h of headings(markdown)) {
    const base = slug(h.text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    set.add(n === 0 ? base : `${base}-${n}`);
  }
  return set;
}

/** Every `](#anchor)` link of the document must resolve to a heading under both the GitHub rule and the rule of `scripts/check-documentation.mjs`. */
export function checkOwnAnchors(markdown: string): string[] {
  const github = anchorSet(markdown, githubSlug);
  const checker = anchorSet(markdown, checkerSlug);
  const out: string[] = [];
  const { lines } = withoutFences(markdown);
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/\]\(#([^)\s]+)\)/g)) {
      const a = m[1]!;
      if (!github.has(a)) out.push(`line ${i + 1}: #${a} is not a heading on GitHub`);
      else if (!checker.has(a)) out.push(`line ${i + 1}: #${a} is a heading on GitHub but not under scripts/check-documentation.mjs`);
    }
  });
  return out;
}

/** The status line, the headings of the plan in their order and by their titles, and a "Found while writing" subsection at the end of each module section. */
export function checkStructure(markdown: string): string[] {
  const out: string[] = [];
  const lines = markdown.split("\n");
  if (lines[0] !== "# Low-level design: APLYD MSME platform") out.push("the first line is not the title");
  if (!lines.slice(0, 12).some((l) => /^Version \d+\.\d+\. Date: 5 October 2026\. Status: draft, not reviewed by a person\.$/.test(l))) out.push("the opening lines do not give the version, the date and the status of a draft that no person has reviewed");
  const hs = headings(markdown);
  const byNumber = new Map<string, { text: string; level: number; line: number }>();
  for (const h of hs) {
    const m = /^(\d+(?:\.\d+)?)\.?\s+(.*)$/.exec(h.text);
    if (m && (h.level === 2 || h.level === 3)) byNumber.set(m[1]!, { text: m[2]!, level: h.level, line: h.line });
  }
  let lastLine = 0;
  for (const [n, title] of REQUIRED_HEADINGS) {
    const h = byNumber.get(n);
    if (!h) {
      out.push(`heading ${n} ${title} is missing`);
      continue;
    }
    if (h.text !== title) out.push(`heading ${n} reads "${h.text}", the plan says "${title}"`);
    if (h.level !== (n.includes(".") ? 3 : 2)) out.push(`heading ${n} is at level ${h.level}`);
    if (h.line < lastLine) out.push(`heading ${n} is out of order`);
    lastLine = h.line;
  }
  const numbered = hs.filter((h) => h.level <= 3).map((h) => ({ ...h, n: /^(\d+(?:\.\d+)?)/.exec(h.text)?.[1] ?? "" }));
  for (const mod of MODULE_SECTIONS) {
    const start = numbered.findIndex((h) => h.n === mod);
    if (start < 0) continue;
    const next = numbered.slice(start + 1).find((h) => h.level <= 3);
    const stop = next ? next.line : Number.POSITIVE_INFINITY;
    const has = hs.some((h) => h.level === 4 && h.text === "Found while writing" && h.line > numbered[start]!.line && h.line < stop);
    if (!has) out.push(`section ${mod} has no "Found while writing" subsection`);
  }
  return out;
}

/** Diagrams: Mermaid blocks under the line limit, every fence with a language, no emoji. */
export function checkDiagrams(markdown: string): string[] {
  const out: string[] = [];
  for (const f of withoutFences(markdown).fences) {
    if (f.lang === "") out.push(`line ${f.start}: a fenced block has no language`);
    if (f.lang === "mermaid" && f.length >= MAX_DIAGRAM_LINES) out.push(`line ${f.start}: a Mermaid block of ${f.length} lines (the limit is under ${MAX_DIAGRAM_LINES})`);
    if (f.lang === "mermaid" && !/^\s*(sequenceDiagram|flowchart|graph|stateDiagram)/.test(markdown.split("\n")[f.start]!)) out.push(`line ${f.start}: a Mermaid block that is not a sequence diagram, a flowchart, a graph or a state diagram`);
  }
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(markdown)) out.push("the document holds an emoji");
  return out;
}

/** Section 9 holds every item that the sections' "Found while writing" lists point to: each pointer names a subsection of 9 that exists. */
export function checkFoundPointers(markdown: string): string[] {
  const out: string[] = [];
  const pointers = [...markdown.matchAll(/^(\d+) items?, listed in \[section (9\.\d+)\]\(#([^)]+)\)\.$/gm)];
  const nine = headings(markdown).filter((h) => /^9\.\d+ /.test(h.text));
  for (const p of pointers) {
    const h = nine.find((x) => x.text.startsWith(`${p[2]} `));
    if (!h) {
      out.push(`a pointer names section ${p[2]}, which does not exist`);
      continue;
    }
    const start = markdown.split("\n").slice(h.line).join("\n");
    const end = start.search(/^#{2,3} /m);
    const block = end < 0 ? start : start.slice(0, end);
    const items = (block.match(/^- /gm) ?? []).length;
    if (items !== Number(p[1])) out.push(`the pointer to section ${p[2]} says ${p[1]} items, the section holds ${items}`);
  }
  return out;
}
