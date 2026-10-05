// The API reference against the real repository. The test lists every route file under app/, reads the methods each exports, and compares them
// with docs/design/API-REFERENCE.md: every exported method has an entry, every entry has a route, the form posts of the pages agree with the
// entries, the error codes agree with the codes written in the source, and the requirement identifiers exist. The last tests change a copy of
// the document in memory to show that each comparison fails when it should.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrationFiles, migrationStatements } from "../../../platform/src/db/migrate.ts";
import { compareApi, errorIndex, errorLiterals, exportedMethods, formActions, normalisePath, pagePaths, parseEntries, parseSummary, routePath } from "../../src/api.ts";
import type { Entry } from "../../src/api.ts";
import { parseRequirements } from "../../src/brd.ts";
import { codeSpans, parseSections, parseTables, tableUnder, unknownReferences, withoutFences } from "../../src/dictionary.ts";
import type { SchemaFacts } from "../../src/dictionary.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const DOCUMENT = "docs/design/API-REFERENCE.md";
const git = (...a: string[]) => execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...a], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

// ---------------------------------------------------------------------------------------------------------------------------------
// What the repository says

const appFiles = git("--", "app");
const routeFiles = appFiles.filter((f) => /(^|\/)route\.[a-z]+$/.test(f));
const pageFiles = appFiles.filter((f) => /\/page\.tsx$/.test(f) || f === "app/page.tsx");
const routes = routeFiles.filter((f) => f.endsWith("/route.ts")).map((file) => ({ file, methods: exportedMethods(read(file)) }));
const pages = pagePaths(pageFiles);

/** The names of the database objects, for the check that the text names none that is gone. */
function databaseFacts(): SchemaFacts {
  const db = new DatabaseSync(":memory:");
  for (const s of migrationStatements()) db.exec(s);
  const files = migrationFiles().map((f) => ({ name: basename(f), text: readFileSync(f, "utf8") }));
  assert.ok(files.length > 0);
  const rows = db.prepare("select name, sql from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as { name: string; sql: string }[];
  const tables = rows.map((t) => ({
    name: t.name,
    columns: (db.prepare(`pragma table_info(${t.name})`).all() as { name: string; type: string }[]).map((c) => ({ name: c.name, type: c.type, notNull: false, default: null, primaryKey: false })),
    foreignKeys: [],
    indexes: (db.prepare(`pragma index_list(${t.name})`).all() as { name: string; unique: number; origin: string }[]).filter((i) => i.origin === "c").map((i) => ({ name: i.name, unique: i.unique === 1, columns: [], condition: null })),
    checks: [...t.sql.matchAll(/CONSTRAINT "([^"]+)" CHECK/g)].map((m) => m[1]!),
    ownerModule: null,
    createdIn: null,
  }));
  const triggers = (db.prepare("select name, tbl_name from sqlite_master where type='trigger'").all() as { name: string; tbl_name: string }[]).map((t) => ({ name: t.name, table: t.tbl_name, timing: "BEFORE", event: "INSERT", message: "", createdIn: null }));
  return { tables, triggers };
}
const facts = databaseFacts();

/** The source files that answer with an error code: the handlers and the data layers of the six modules that have operations. */
const answeringSources = git("--", "modules")
  .filter((p) => /^modules\/(platform|factory|diagnose|procure|deliver|run)\/src\/(api|db)\/.*\.ts$/.test(p))
  .map((path) => ({ path, text: read(path) }));
const literals = errorLiterals(answeringSources);

/**
 * Reasons that the data layers return and the handlers answer with another code, and codes that are not an `error:` literal. Each is checked
 * where it is used so that this list cannot hide a code that has no entry.
 */
const REASONS_ANSWERED_AS_INVALID = ["unknown_item", "duplicate_service"];
const NOT_ERROR_LITERALS = ["degraded"];

const brd = parseRequirements(read("docs/brd/BRD.md"));
const knownBr = new Set(brd.map((r) => r.id));

// ---------------------------------------------------------------------------------------------------------------------------------
// The checks. Each takes the text of the document and returns problems, so the same checks run on the real text and on changed copies.

const attempt = <T>(f: () => T, problems: string[]): T | null => {
  try {
    return f();
  } catch (e) {
    problems.push((e as Error).message);
    return null;
  }
};
const parsed = (md: string, problems: string[]) => {
  const summary = attempt(() => parseSummary(md), problems);
  const entries = attempt(() => parseEntries(md), problems);
  return summary && entries ? { summary, entries } : null;
};

function routesAgree(md: string): string[] {
  const out: string[] = [];
  const p = parsed(md, out);
  if (!p) return out;
  out.push(...compareApi(routes, p.summary, p.entries));
  const count = /(\d+) operations in (\d+) route files/.exec(md);
  const methods = routes.reduce((n, r) => n + r.methods.length, 0);
  if (!count || Number(count[1]) !== methods || Number(count[2]) !== routes.length) out.push(`the opening paragraph should say ${methods} operations in ${routes.length} route files`);
  return out;
}

function routeFilesAreReadable(): string[] {
  const out: string[] = [];
  for (const f of routeFiles) if (!f.endsWith("/route.ts")) out.push(`${f} is a route file this test does not read; name it route.ts or extend the test`);
  for (const f of appFiles.filter((x) => /\.tsx?$/.test(x))) if (/^\s*["']use server["']/m.test(read(f))) out.push(`${f} uses server actions, which this reference does not describe`);
  for (const f of pageFiles) {
    try {
      const m = exportedMethods(read(f));
      if (m.length) out.push(`${f} exports ${m.join(", ")}: a page that takes a request is an operation and needs an entry`);
    } catch (e) {
      out.push(`${f}: ${(e as Error).message}`);
    }
  }
  return out;
}

function formsAgree(md: string): string[] {
  const out: string[] = [];
  const p = parsed(md, out);
  if (!p) return out;
  const idOf = (path: string, method: string) => p.summary.find((o) => o.method === method && normalisePath(o.path) === path)?.id;
  const posted = new Map<string, string[]>();
  for (const f of pageFiles) {
    const page = pagePaths([f])[0]!;
    for (const action of formActions(f, read(f))) {
      const id = idOf(action, "POST");
      if (!id) out.push(`${f}: a form posts to ${action}, which has no POST operation in the reference`);
      else posted.set(page, [...new Set([...(posted.get(page) ?? []), id])].sort());
    }
  }
  const postedTo = new Set([...posted.values()].flat());
  for (const e of p.entries) {
    const says = (e.properties.get("Form post") ?? "").split(/[.\s]/)[0]!.toLowerCase();
    if (!["yes", "no"].includes(says)) out.push(`${e.id}: the Form post row must begin with yes or no`);
    else if ((says === "yes") !== postedTo.has(e.id)) out.push(`${e.id}: the Form post row says ${says}, and ${postedTo.has(e.id) ? "a page posts to it" : "no page posts to it"}`);
    if (e.method === "GET" && says === "yes") out.push(`${e.id}: a GET cannot take a form post`);
  }
  const t = tableUnder(md, /^5\. /);
  if (!t) return [...out, "no table under section 5"];
  const documented = new Map(t.rows.map((r) => [codeSpans(r.cells[0] ?? "")[0] ?? "", (r.cells[1]!.match(/API-\d{2}/g) ?? []).sort()]));
  for (const [page, ids] of posted) if (documented.get(page)?.join(",") !== ids.join(",")) out.push(`page ${page} posts to ${ids.join(", ")}, section 5 says ${documented.get(page)?.join(", ") ?? "nothing"}`);
  for (const page of documented.keys()) if (!posted.has(page)) out.push(`section 5 lists page ${page}, which posts no form`);
  return out;
}

function locations(md: string): string[] {
  const out: string[] = [];
  const p = parsed(md, out);
  if (!p) return out;
  for (const e of p.entries) {
    const res = parseTables(parseSections(md).find((s) => s.title.startsWith(e.id))!.body).tables.find((t) => t.header[0] === "Status");
    for (const r of res?.rows ?? []) {
      const form = r.cells[3] ?? "";
      const at = `${e.id} line ${r.line}`;
      if (e.method === "GET") {
        if (form !== "none") out.push(`${at}: a GET has no form answer, the cell should say none, not "${form}"`);
        continue;
      }
      if (form === "JSON") continue;
      const m = /^303 to `(\/[^`?]*)(?:\?[^`]*)?`/.exec(form);
      if (!m) out.push(`${at}: the Form post cell is JSON or "303 to" and a page address, not "${form}"`);
      else if (!pages.includes(m[1]!)) out.push(`${at}: ${m[1]} is not a page of the application`);
    }
  }
  return out;
}

function requirements(md: string): string[] {
  const out: string[] = [];
  for (const id of new Set(withoutFences(md).match(/\bBR-[A-Z]+-\d{2}\b/g) ?? [])) if (!knownBr.has(id)) out.push(`${id} is not a requirement of the BRD`);
  const p = parsed(md, out);
  if (p) for (const e of p.entries) if (!(e.properties.get("Serves") ?? "").match(/\bBR-[A-Z]+-\d{2}\b/)) out.push(`${e.id} serves no requirement`);
  return out;
}

function errors(md: string): string[] {
  const out: string[] = [];
  const p = parsed(md, out);
  const index = attempt(() => errorIndex(md), out);
  if (!p || !index) return out;
  const codes = index.map((c) => c.code);
  for (const c of index) if (!c.code) out.push("a row of the error-code index has no code in one code span");
  const seen = new Set<string>();
  for (const c of codes) (seen.has(c) ? out.push(`${c} is listed twice in the error-code index`) : seen.add(c));
  const real = new Set([...literals.direct, ...literals.reasons.filter((r) => !REASONS_ANSWERED_AS_INVALID.includes(r))]);
  for (const c of real) if (!seen.has(c)) out.push(`${c} is answered by the source and is not in the error-code index`);
  for (const c of codes) if (!real.has(c) && !NOT_ERROR_LITERALS.includes(c)) out.push(`${c} is in the error-code index and no source answers with it`);
  for (const r of REASONS_ANSWERED_AS_INVALID) if (!literals.reasons.includes(r)) out.push(`the test lists ${r} as an internal reason that the source no longer has`);
  if (!read("modules/platform/src/api/health.ts").includes('"degraded"')) out.push("the health check no longer answers degraded");
  // Each code an entry gives is in the index with the same status, and the index says which entries use it.
  const byCode = new Map<string, { statuses: Set<number>; ids: Set<string> }>();
  for (const e of p.entries) for (const r of e.responses) if (r.code) {
    const x = byCode.get(r.code) ?? { statuses: new Set<number>(), ids: new Set<string>() };
    x.statuses.add(r.status);
    x.ids.add(e.id);
    byCode.set(r.code, x);
    if (!seen.has(r.code)) out.push(`${e.id} answers ${r.code}, which is not in the error-code index`);
  }
  const section = parseSections(md).find((s) => /^\d+\.\s+Error codes\b/.test(s.title))!;
  const table = parseTables(section.body, section.bodyLine).tables.find((t) => t.header[0] === "Code")!;
  for (const r of table.rows) {
    const code = /^`([a-z_]+)`$/.exec(r.cells[0]!)?.[1] ?? "";
    const x = byCode.get(code);
    if (!x) {
      out.push(`${code} is in the error-code index and no entry answers with it`);
      continue;
    }
    if ([...x.statuses].sort().join(", ") !== r.cells[1]) out.push(`${code}: the entries give status ${[...x.statuses].sort().join(", ")}, the index says ${r.cells[1]}`);
    const ids = (r.cells[3]!.match(/API-\d{2}/g) ?? []).join(",");
    if (ids !== [...x.ids].sort().join(",")) out.push(`${code}: the index says it is used by ${ids}, the entries using it are ${[...x.ids].sort().join(", ")}`);
  }
  // A success status is the one the handlers use: 201 for a thing made, 200 for a read or a repeat.
  for (const e of p.entries) {
    const ok = e.responses.filter((r) => r.status < 300).map((r) => r.status);
    if (e.method === "GET" && ok.some((s) => s !== 200)) out.push(`${e.id}: a GET answers 200 on success, not ${ok.join(", ")}`);
    if (e.method === "POST" && ok.some((s) => s !== 200 && s !== 201)) out.push(`${e.id}: a POST answers 200 or 201 on success, not ${ok.join(", ")}`);
  }
  return out;
}

function examplesAndShape(md: string): string[] {
  const out: string[] = [];
  const p = parsed(md, out);
  if (!p) return out;
  for (const e of p.entries as Entry[]) {
    if (!e.hasExample) out.push(`${e.id} has no example`);
    if (e.fields.length === 0) out.push(`${e.id} has an empty table of request fields; write none`);
    if (!e.responses.some((r) => r.status >= 400)) out.push(`${e.id} gives no error response`);
  }
  // Every fenced json block is valid JSON.
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "```json") continue;
    let j = i + 1;
    while (j < lines.length && lines[j] !== "```") j++;
    try {
      JSON.parse(lines.slice(i + 1, j).join("\n"));
    } catch (e) {
      out.push(`the example at line ${i + 1} is not valid JSON: ${(e as Error).message}`);
    }
    i = j;
  }
  // Mutating operations name the audit event they write, and the event names the code can write are the dictionary's list (section 5.8 of the dictionary is held to the code).
  return out;
}

/** `listing_terms.set` is an audit event that begins with a table's name; it is not a column. */
const AUDIT_EVENTS_THAT_LOOK_LIKE_COLUMNS = ["listing_terms.set"];
function databaseNames(md: string): string[] {
  return unknownReferences(md, facts, AUDIT_EVENTS_THAT_LOOK_LIKE_COLUMNS);
}

const CHECKS: Record<string, (md: string) => string[]> = { routesAgree, formsAgree, locations, requirements, errors, examplesAndShape, databaseNames };

// ---------------------------------------------------------------------------------------------------------------------------------
// Tests on the real document

const real = read(DOCUMENT);

test("every route file is one this test reads, no page takes a request, and no server action exists", () => {
  assert.deepEqual(routeFilesAreReadable(), []);
  assert.ok(routes.length >= 20, "the route files were found");
  assert.ok(routes.every((r) => r.methods.length > 0), "each route file exports at least one method");
  assert.ok(pages.includes("/") && pages.includes("/factory"), "the pages were found");
});

test("every route path is the path the file is under, with its parameters in braces", () => {
  assert.equal(routePath("app/api/companies/[id]/factory/route.ts"), "/api/companies/{id}/factory");
  assert.ok(routes.some((r) => routePath(r.file) === "/api/health"));
});

for (const [name, check] of Object.entries(CHECKS)) {
  test(`the API reference agrees with the code: ${name}`, () => {
    assert.deepEqual(check(real), []);
  });
}

test("each operation is documented once and in order, and the summary lists what the sections describe", () => {
  const summary = parseSummary(real);
  const entries = parseEntries(real);
  assert.equal(summary.length, entries.length);
  assert.deepEqual(summary.map((s) => s.id), entries.map((e) => e.id));
  assert.equal(new Set(summary.map((s) => `${s.method} ${normalisePath(s.path)}`)).size, summary.length);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Prove the comparison works: change a copy of the real text and each change must be caught

const lines = real.split("\n");
const lineOf = (re: RegExp, from = 0) => {
  const i = lines.findIndex((l, n) => n >= from && re.test(l));
  assert.ok(i >= 0, `the real document has no line matching ${re}`);
  return i;
};
const without = (i: number, count = 1) => lines.filter((_, n) => n < i || n >= i + count).join("\n");
const replaced = (i: number, from: string | RegExp, to: string) => lines.map((l, n) => (n === i ? l.replace(from, to) : l)).join("\n");
const caught = (name: string, md: string, expected: RegExp) => {
  const found = CHECKS[name]!(md);
  assert.ok(found.length > 0, `${name} found nothing in the changed copy`);
  assert.ok(found.some((p) => expected.test(p)), `${name} found ${JSON.stringify(found.slice(0, 3))}, not ${expected}`);
};
const entryStart = (id: string) => lineOf(new RegExp(`^### ${id} `));

test("a method whose entry is removed, or an entry whose route does not exist, is reported", () => {
  const start = entryStart("API-26");
  const end = entryStart("API-27");
  const noEntry = lines.filter((_, n) => n < start || n >= end).filter((l) => !/^\| API-26 \|/.test(l)).join("\n");
  caught("routesAgree", noEntry, /POST \/api\/operator\/providers\/\{pid\}\/unlist .* has no operation in the reference/);
  const bogus = [...lines.slice(0, entryStart("API-29")), "### API-30 POST /api/operator/gone", "", ...lines.slice(entryStart("API-29"))].join("\n");
  caught("routesAgree", bogus, /API-30|gone/);
  caught("routesAgree", replaced(lineOf(/^### API-04 /), "GET", "POST"), /API-04 documents POST \/api\/companies\/\{id\}, which no route exports/);
});

test("a parameter named differently from the route's, a changed path, or a missing summary row is reported", () => {
  caught("routesAgree", replaced(entryStart("API-09"), "{aid}", "{assessment}").replace("| API-09 | GET | `/api/companies/{id}/assessments/{aid}`", "| API-09 | GET | `/api/companies/{id}/assessments/{assessment}`"), /parameters are named/);
  caught("routesAgree", without(lineOf(/^\| API-12 \|/)), /API-12 has a section and is not in the summary table/);
  caught("routesAgree", replaced(lineOf(/^\| API-12 \|/), "`/api/companies/{id}/requirements`", "`/api/companies/{id}/needs`"), /API-12: the summary says/);
});

test("a count in the opening paragraph that is out of date is reported", () => {
  caught("routesAgree", real.replace(/\d+ operations in/, "28 operations in"), /opening paragraph should say/);
});

test("a form mark that disagrees with the pages is reported", () => {
  const row = lineOf(/^\| Form post \| yes\. The page `\/factory`/, entryStart("API-06"));
  caught("formsAgree", replaced(row, "yes. The page", "no. The page"), /API-06: the Form post row says no, and a page posts to it/);
  const get = lineOf(/^\| Form post \| no/, entryStart("API-05"));
  caught("formsAgree", replaced(get, "no", "yes"), /API-05/);
  caught("formsAgree", without(lineOf(/^\| `\/run` \|/)), /page \/run posts to API-21, section 5 says nothing/);
  caught("formsAgree", replaced(lineOf(/^\| `\/operator` \|/), "API-28", "API-29"), /page \/operator posts to/);
});

test("a redirect to a page that does not exist, or a GET with a form answer, is reported", () => {
  const row = lineOf(/^\| 201 \| Body with `ok` true, `digest`/, entryStart("API-11"));
  caught("locations", replaced(row, "`/diagnose?a={aid}&signed=1`", "`/diagnosis?a={aid}&signed=1`"), /\/diagnosis is not a page of the application/);
  caught("locations", replaced(row, /303 to `[^`]*`/, "redirects"), /the Form post cell is JSON or/);
  const get = lineOf(/^\| 401 \| `not_signed_in` \|/, entryStart("API-02"));
  caught("locations", replaced(get, /\| none \|$/, "| JSON |"), /a GET has no form answer/);
});

test("a requirement that does not exist, or an entry that serves none, is reported", () => {
  const row = lineOf(/^\| Serves \| BR-/, entryStart("API-08"));
  caught("requirements", replaced(row, /BR-[A-Z]+-\d{2}/, "BR-DIAG-99"), /BR-DIAG-99 is not a requirement of the BRD/);
  caught("requirements", replaced(row, /\| Serves \| .*$/, "| Serves | the diagnosis |"), /API-08: "Serves" names no requirement/);
});

test("an error code the source answers with but the index lacks, one the index has and no source answers, and a changed status are reported", () => {
  const row = lineOf(/^\| `too_many_deliveries` \|/, lineOf(/^## 4\. /));
  caught("errors", without(row), /too_many_deliveries is answered by the source and is not in the error-code index|API-19 answers too_many_deliveries/);
  caught("errors", replaced(lineOf(/^\| `not_due` \|/, lineOf(/^## 4\. /)), "`not_due`", "`not_due_yet`"), /not_due_yet is in the error-code index and no source answers with it/);
  caught("errors", replaced(lineOf(/^\| `stale` \|/, lineOf(/^## 4\. /)), "| 409 |", "| 400 |"), /stale: the entries give status 409, the index says 400/);
});

test("an error row without a code, an entry without an example, and an example that is not JSON are reported", () => {
  const row = lineOf(/^\| 409 \| `already_withdrawn` \|/, entryStart("API-14"));
  caught("errors", replaced(row, "`already_withdrawn`", "already withdrawn"), /error response names its code as one code span/);
  const start = entryStart("API-16");
  const fenceStart = lineOf(/^```json$/, start);
  caught("examplesAndShape", lines.filter((_, n) => n < fenceStart - 2 || n > fenceStart + 4).join("\n"), /API-16 has no example/);
  caught("examplesAndShape", replaced(fenceStart + 1, /.*/, "{ not json"), /is not valid JSON/);
});

test("a trigger or index named in the text that does not exist is reported", () => {
  const row = lineOf(/^\| 409 \| `too_many_deliveries` \|/, entryStart("API-19"));
  caught("databaseNames", replaced(row, "`engagement_events_delivery_limit`", "`engagement_events_delivery_cap`"), /engagement_events_delivery_cap/);
});

test("a document that cannot be read as a reference is reported, not skipped", () => {
  const empty = CHECKS.routesAgree!("# API reference\n\nNothing here.\n");
  assert.ok(empty.length > 0);
  assert.match(empty[0]!, /no summary table/);
  assert.ok(CHECKS.errors!("# API reference\n").length > 0);
});

// What this test relies on in the helpers and the BRD, so that an empty answer cannot mean "found nothing to look at".
test("the checks have something to compare", () => {
  assert.ok(literals.direct.length >= 20, `${literals.direct.length} error literals`);
  assert.ok(literals.reasons.length >= 20, `${literals.reasons.length} reasons`);
  assert.ok(knownBr.size >= 100, `${knownBr.size} requirements`);
  assert.ok(facts.tables.length >= 16 && facts.triggers.length >= 80, "the migrated database was built");
  assert.ok(existsSync(join(ROOT, DOCUMENT)));
});
