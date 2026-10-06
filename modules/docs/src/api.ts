// Reads the API reference (docs/design/API-REFERENCE.md) as data and compares it with the routes of the application. Pure functions over text
// and small plain objects: no file is opened here. The tests list the route files, the pages and the sources, and give their text in.
//
// The document is written so that it can be read this way: a summary table of operations at the top; one section for each operation headed
// "API-NN METHOD /path" with a table of properties, a table of request fields and a table of responses; and an index of error codes.

import { parseSections, parseTables, codeSpans } from "./dictionary.ts";
import type { MdTable, Section } from "./dictionary.ts";

export const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

/** The path a route file serves, with its parameters in braces: app/api/companies/[id]/route.ts is /api/companies/{id}. */
export function routePath(file: string): string {
  const m = /^app\/(.+)\/route\.ts$/.exec(file);
  if (!m) throw new Error(`not a route file: ${file}`);
  return `/${m[1]!.split("/").map((s) => s.replace(/^\[([^\]/]+)\]$/, "{$1}")).join("/")}`;
}

/** A path with every parameter, whatever its name, as {}: two spellings of one route compare equal. */
export const normalisePath = (path: string): string => path.replace(/\{[^}/]*\}|\[[^\]/]*\]/g, "{}").replace(/\/+$/, "") || "/";

/**
 * The HTTP methods a route file exports. Reads `export const GET`, `export async function POST` and `export { x as PUT }`. Refuses a
 * file whose exports it cannot read (`export *`, or a destructured export), so a method cannot be hidden from the check.
 */
export function exportedMethods(text: string): string[] {
  if (/^\s*export\s*\*/m.test(text)) throw new Error("a route file uses `export *`, which hides its methods");
  if (/^\s*export\s+(?:const|let|var)\s*[{[]/m.test(text)) throw new Error("a route file exports a destructured value, which hides its methods");
  const names = new Set<string>();
  for (const m of text.matchAll(/^\s*export\s+(?:const|let|var)\s+(\w+)/gm)) names.add(m[1]!);
  for (const m of text.matchAll(/^\s*export\s+(?:async\s+)?function\s*\*?\s*(\w+)/gm)) names.add(m[1]!);
  for (const m of text.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1]!.split(",")) {
      const p = part.trim();
      if (p) names.add(p.split(/\s+as\s+/).pop()!.trim());
    }
  }
  return METHODS.filter((x) => names.has(x));
}

/** The page addresses of the page files: app/page.tsx is "/", app/diagnose/page.tsx is "/diagnose". */
export const pagePaths = (files: string[]): string[] =>
  files.flatMap((f) => {
    const m = /^app\/(?:(.+)\/)?page\.tsx$/.exec(f);
    return m ? [m[1] ? `/${m[1]}` : "/"] : [];
  });

/**
 * The address each `<form method="post">` of a page sends to, with every parameter as {}. A form's action may be a string, a template
 * string, or a call to a local `const name = (...) => \`...\`` helper; one that cannot be resolved is an error, not a skip.
 */
export function formActions(file: string, text: string): string[] {
  const helpers = new Map<string, string>();
  for (const m of text.matchAll(/const (\w+) = \([^)]*\) =>\s*`([^`]+)`/g)) helpers.set(m[1]!, m[2]!);
  const resolve = (template: string): string => template.replace(/\$\{(\w+)\([^)]*\)\}/g, (all, name: string) => helpers.get(name) ?? all).replace(/\$\{[^}]*\}/g, "{}");
  const out: string[] = [];
  for (const m of text.matchAll(/<form\b/g)) {
    const at = m.index ?? 0;
    const tag = text.slice(at, at + 700);
    const head = tag.slice(0, /\sdata-testid=|>\s*(?:\r?\n|<)/.exec(tag)?.index ?? 700);
    if (!/\bmethod="post"/i.test(head)) continue;
    const line = text.slice(0, at).split("\n").length;
    const a = /\baction=(?:"([^"]+)"|\{`([^`]+)`\}|\{(\w+)\(([^)]*)\)\})/.exec(head);
    if (!a) throw new Error(`${file}:${line}: a form posts to an address this reader cannot resolve`);
    const template = a[1] ?? a[2] ?? (helpers.has(a[3]!) ? helpers.get(a[3]!)! : null);
    if (template === null) throw new Error(`${file}:${line}: the form's action calls ${a[3]}, which is not a local template helper`);
    out.push(normalisePath(resolve(template)));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The document

export const SUMMARY_HEADER = ["ID", "Method", "Path", "Area", "Actor"];
export const PROPERTIES = ["Purpose", "Serves", "Caller", "Everyone else", "Content types", "Body limit", "Side effects", "Idempotency", "Form post"] as const;
export const REQUEST_HEADER = ["Field", "Form field", "Type", "Required", "Limits and meaning"];
export const RESPONSE_HEADER = ["Status", "Code or body", "When", "Form post"];
export const ACTORS = ["visitor", "signed-in person", "owner", "member", "operator"];

export type Operation = { id: string; method: string; path: string; area: string; actor: string; line: number };
export type Entry = {
  id: string;
  method: string;
  path: string;
  line: number;
  properties: Map<string, string>;
  fields: { cells: string[]; line: number }[];
  responses: { status: number; code: string | null; when: string; form: string; line: number }[];
  hasExample: boolean;
};

const HEADING = /^(API-\d{2}) ([A-Z]+) (\/\S*)$/;

/** The summary table at the top: one row for each operation. */
export function parseSummary(markdown: string): Operation[] {
  const { tables, problems } = parseTables(markdown.split("\n"));
  const t = tables.find((x) => x.header[0] === "ID" && x.header[1] === "Method");
  const out: Operation[] = [];
  const bad = [...problems];
  if (!t) throw new Error("the document has no summary table (ID, Method, Path, Area, Actor)");
  if (t.header.join(" | ") !== SUMMARY_HEADER.join(" | ")) bad.push(`the summary table's headings must be: ${SUMMARY_HEADER.join(", ")}`);
  for (const { cells, line } of t.rows) {
    const [id, method, path, area, actor] = cells as [string, string, string, string, string];
    const p = /^`(\/[^`\s]*)`$/.exec(path)?.[1];
    if (!/^API-\d{2}$/.test(id)) bad.push(`line ${line}: "${id}" is not an operation ID`);
    else if (!(METHODS as readonly string[]).includes(method)) bad.push(`line ${line}: ${id}: "${method}" is not an HTTP method`);
    else if (!p) bad.push(`line ${line}: ${id}: the path must be one code span that starts with /`);
    else if (area === "" || !ACTORS.includes(actor)) bad.push(`line ${line}: ${id}: the area must not be empty and the actor must be one of ${ACTORS.join(", ")}, not "${actor}"`);
    else out.push({ id, method, path: p, area, actor, line });
  }
  if (bad.length) throw new Error(`the summary table has ${bad.length} problem(s):\n  - ${bad.join("\n  - ")}`);
  return out;
}

const tableByFirst = (tables: MdTable[], first: string) => tables.find((t) => t.header[0] === first) ?? null;

function parseEntry(s: Section, h: RegExpExecArray, problems: string[]): Entry {
  const at = (m: string) => problems.push(`${h[1]}: ${m}`);
  const { tables, problems: tp } = parseTables(s.body, s.bodyLine);
  for (const p of tp) at(p);
  const props = tableByFirst(tables, "Item");
  const properties = new Map<string, string>();
  if (!props) at("no table of properties (Item, Detail)");
  else for (const r of props.rows) properties.set(r.cells[0]!, r.cells[1]!);
  for (const k of PROPERTIES) if (!properties.get(k)) at(`the properties table has no "${k}" row, or it is empty`);
  const serves = properties.get("Serves") ?? "";
  if (!/\bBR-[A-Z]+-\d{2}\b/.test(serves)) at(`"Serves" names no requirement (BR-<AREA>-<NN>)`);
  const req = tableByFirst(tables, "Field");
  if (!req) at("no table of request fields (Field, Form field, Type, Required, Limits and meaning)");
  else if (req.header.join(" | ") !== REQUEST_HEADER.join(" | ")) at(`the request table's headings must be: ${REQUEST_HEADER.join(", ")}`);
  const res = tableByFirst(tables, "Status");
  const responses: Entry["responses"] = [];
  if (!res) at("no table of responses (Status, Code or body, When, Form post)");
  else {
    if (res.header.join(" | ") !== RESPONSE_HEADER.join(" | ")) at(`the response table's headings must be: ${RESPONSE_HEADER.join(", ")}`);
    for (const { cells, line } of res.rows) {
      const [status, code, when, form] = cells as [string, string, string, string];
      if (!/^[1-5]\d\d$/.test(status)) {
        at(`line ${line}: "${status}" is not an HTTP status`);
        continue;
      }
      const n = Number(status);
      const spans = codeSpans(code);
      if (n >= 400 && !(spans.length === 1 && /^[a-z_]+$/.test(spans[0]!))) at(`line ${line}: an error response names its code as one code span like \`not_found\`, not "${code}"`);
      if (when === "" || form === "") at(`line ${line}: "When" and "Form post" must not be empty`);
      responses.push({ status: n, code: n >= 400 ? (spans[0] ?? null) : null, when, form, line });
    }
    if (!responses.some((r) => r.status >= 200 && r.status < 300)) at("no success response (2xx)");
  }
  return { id: h[1]!, method: h[2]!, path: h[3]!, line: s.line, properties, fields: req?.rows ?? [], responses, hasExample: /^```json\s*$/m.test(s.body.join("\n")) };
}

/** Every "### API-NN METHOD /path" section, read. Throws one error naming every malformed part. */
export function parseEntries(markdown: string): Entry[] {
  const problems: string[] = [];
  const out: Entry[] = [];
  for (const s of parseSections(markdown)) {
    if (!/^API-\d{2}\b/.test(s.title)) continue;
    const h = HEADING.exec(s.title);
    if (!h || s.level !== 3) {
      problems.push(`line ${s.line}: a heading that starts with an operation ID reads "### API-NN METHOD /path", not "${s.title}"`);
      continue;
    }
    out.push(parseEntry(s, h, problems));
  }
  if (problems.length) throw new Error(`the operation sections have ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
  return out;
}

export type RouteFact = { file: string; methods: string[] };

/**
 * The routes against the document. Every exported method of every route has an operation (matched by method and path with parameters
 * as {}), every operation has a route, the summary table and the sections agree, parameter names match the route's, and no ID or
 * (method, path) is used twice.
 */
export function compareApi(routes: RouteFact[], summary: Operation[], entries: Entry[]): string[] {
  const out: string[] = [];
  const wanted = routes.flatMap((r) => r.methods.map((method) => ({ method, path: routePath(r.file), file: r.file })));
  const key = (method: string, path: string) => `${method} ${normalisePath(path)}`;
  const byKey = new Map<string, Entry[]>();
  for (const e of entries) byKey.set(key(e.method, e.path), [...(byKey.get(key(e.method, e.path)) ?? []), e]);
  for (const w of wanted) {
    const found = byKey.get(key(w.method, w.path));
    if (!found) out.push(`${w.method} ${w.path} (${w.file}) has no operation in the reference`);
    else if (found[0]!.path !== w.path) out.push(`${found[0]!.id}: the path is ${found[0]!.path}, the route's parameters are named ${w.path}`);
  }
  for (const e of entries) if (!wanted.some((w) => key(w.method, w.path) === key(e.method, e.path))) out.push(`${e.id} documents ${e.method} ${e.path}, which no route exports`);
  for (const [k, list] of byKey) if (list.length > 1) out.push(`${k} is documented ${list.length} times (${list.map((e) => e.id).join(", ")})`);
  const ids = new Set<string>();
  for (const e of entries) (ids.has(e.id) ? out.push(`${e.id} is used by two operations`) : ids.add(e.id));

  for (const s of summary) {
    const e = entries.find((x) => x.id === s.id);
    if (!e) out.push(`${s.id} is in the summary table and has no section`);
    else if (e.method !== s.method || e.path !== s.path) out.push(`${s.id}: the summary says ${s.method} ${s.path}, the section says ${e.method} ${e.path}`);
  }
  for (const e of entries) if (!summary.some((s) => s.id === e.id)) out.push(`${e.id} has a section and is not in the summary table`);
  if (summary.map((s) => s.id).join(",") !== [...summary.map((s) => s.id)].sort().join(",")) out.push("the summary table is not in order of ID");
  return out;
}

/** The error codes the document gives, from the "Error codes" index: the first code span of each row. */
export function errorIndex(markdown: string): { code: string; status: string }[] {
  const s = parseSections(markdown).find((x) => /^\d+\.\s+Error codes\b/.test(x.title));
  if (!s) throw new Error('the document has no section "N. Error codes"');
  const t = parseTables(s.body, s.bodyLine).tables.find((x) => x.header[0] === "Code");
  if (!t) throw new Error("the error-code section has no table headed Code");
  return t.rows.map((r) => ({ code: /^`([a-z_]+)`$/.exec(r.cells[0]!)?.[1] ?? "", status: r.cells[1]! }));
}

/** The error codes the source writes: `error: "name"` in the handlers, and the `reason: "name"` results of the data layers that handlers pass on. */
export function errorLiterals(files: { path: string; text: string }[]): { direct: string[]; reasons: string[] } {
  const direct = new Set<string>();
  const reasons = new Set<string>();
  for (const f of files) {
    for (const m of f.text.matchAll(/\berror:\s*"([a-z_]+)"/g)) direct.add(m[1]!);
    for (const m of f.text.matchAll(/\breason:\s*"([a-z_]+)"/g)) reasons.add(m[1]!);
    // A union of reasons in a type: `reason: "a" | "b" | "c"`.
    for (const m of f.text.matchAll(/\breason:\s*("[a-z_]+"(?:\s*\|\s*"[a-z_]+")+)/g)) for (const x of m[1]!.matchAll(/"([a-z_]+)"/g)) reasons.add(x[1]!);
  }
  return { direct: [...direct].sort(), reasons: [...reasons].sort() };
}
