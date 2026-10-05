// The data dictionary against the real repository. The test applies every migration to an empty in-memory database, reads the tables, columns,
// indexes, triggers and checks back from SQLite, and compares them with docs/design/DATA-DICTIONARY.md. It also compares the lists in the
// document (questionnaire, library, clusters, event kinds, audit events, limits) with the code that holds them. A change to any of these
// that is not made in the document fails here, and the last tests change a copy of the document in memory to show that the comparison fails.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { BUDGET_CEILING, LIBRARY, LIBRARY_VERSION } from "../../../diagnose/src/library.ts";
import { ENGINE_VERSION } from "../../../diagnose/src/engine.ts";
import { QUESTIONNAIRE_VERSION, REQUIRED_TO_CONFIRM, SECTIONS } from "../../../factory/src/questionnaire.ts";
import { EVENT_KINDS } from "../../../deliver/src/state.ts";
import { migrationFiles, migrationStatements } from "../../../platform/src/db/migrate.ts";
import { CLUSTERS } from "../../../procure/src/clusters.ts";
import { parseSummary } from "../../src/api.ts";
import {
  auditEventNames,
  codeSpans,
  compareDictionary,
  compareEr,
  compareSets,
  constantNumbers,
  erBlocks,
  firstSpans,
  indexCondition,
  migrationIndex,
  parseDictionary,
  parseEr,
  parseSections,
  tableOwners,
  tableUnder,
  triggerParts,
  undrawnRelationships,
  unknownReferences,
  withoutFences,
} from "../../src/dictionary.ts";
import type { MdTable, SchemaFacts } from "../../src/dictionary.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const DOCUMENT = "docs/design/DATA-DICTIONARY.md";
const git = (...a: string[]) => execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...a], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

// ---------------------------------------------------------------------------------------------------------------------------------
// What the code and the database say

function collect() {
  const db = new DatabaseSync(":memory:");
  for (const s of migrationStatements()) db.exec(s);
  const files = migrationFiles().map((f) => ({ name: basename(f), text: readFileSync(f, "utf8") }));
  const mig = migrationIndex(files);
  const owners = tableOwners(git("modules/*/src/db/schema.ts").map((path) => ({ path, text: read(path) })));
  const rows = db.prepare("select name, sql from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as { name: string; sql: string }[];
  const tables: SchemaFacts["tables"] = rows.map((t) => {
    const info = db.prepare(`pragma table_info(${t.name})`).all() as { name: string; type: string; notnull: number; dflt_value: unknown; pk: number }[];
    const columns = info.map((c) => ({ name: c.name, type: String(c.type), notNull: c.notnull === 1, default: c.dflt_value === null ? null : String(c.dflt_value), primaryKey: c.pk > 0 }));
    const fkRows = db.prepare(`pragma foreign_key_list(${t.name})`).all() as { id: number; seq: number; table: string; from: string; to: string }[];
    const byId = new Map<number, { table: string; columns: { from: string; to: string; seq: number }[] }>();
    for (const f of fkRows) {
      const g = byId.get(f.id) ?? { table: f.table, columns: [] };
      g.columns.push({ from: f.from, to: f.to, seq: f.seq });
      byId.set(f.id, g);
    }
    const foreignKeys = [...byId.values()].map((g) => ({ table: g.table, columns: g.columns.sort((a, b) => a.seq - b.seq).map(({ from, to }) => ({ from, to })) }));
    const indexes = (db.prepare(`pragma index_list(${t.name})`).all() as { name: string; unique: number; origin: string }[])
      .filter((i) => i.origin === "c")
      .map((i) => {
        const sql = (db.prepare("select sql from sqlite_master where type='index' and name=?").get(i.name) as { sql: string }).sql;
        const cols = (db.prepare(`pragma index_info(${i.name})`).all() as { seqno: number; name: string }[]).sort((a, b) => a.seqno - b.seqno).map((x) => x.name);
        return { name: i.name, unique: i.unique === 1, columns: cols, condition: indexCondition(sql) };
      });
    const checks = [...t.sql.matchAll(/CONSTRAINT "([^"]+)" CHECK/g)].map((m) => m[1]!);
    return { name: t.name, columns, foreignKeys, indexes, checks, ownerModule: owners[t.name] ?? null, createdIn: mig.tables[t.name] ?? null };
  });
  const triggers = (db.prepare("select name, tbl_name, sql from sqlite_master where type='trigger' order by tbl_name, name").all() as { name: string; tbl_name: string; sql: string }[]).map((r) => {
    const p = triggerParts(r.sql);
    return { name: r.name, table: r.tbl_name, timing: p.timing, event: p.event, message: p.message, createdIn: mig.triggers[r.name] ?? null };
  });
  const sqlOf: Record<string, string> = Object.fromEntries(rows.map((r) => [r.name, r.sql]));
  return { tables, triggers, sqlOf, migrationFiles: files };
}
const collected = collect();
const facts: SchemaFacts = { tables: collected.tables, triggers: collected.triggers };

const sourceFiles = git("modules/*/src/*.ts", "modules/*/src/**/*.ts").map((path) => ({ path, text: read(path) }));
const constants = (path: string): Record<string, number> => constantNumbers(read(path));

/** Audit event names the code can write, with the two templates expanded. A new template is a failure until the test knows what it expands to. */
function auditNamesInCode(): { names: string[]; problems: string[] } {
  const { literal, templates } = auditEventNames(sourceFiles);
  const problems: string[] = [];
  const expanded: string[] = [];
  for (const t of templates) {
    if (t === "engagement.${kind}") expanded.push(...EVENT_KINDS.map((k) => `engagement.${k}`));
    else if (t === "outcome.${shape.kind}") expanded.push("outcome.baseline", "outcome.review");
    else problems.push(`the code builds an audit event name with a template this test does not know: ${t}`);
  }
  return { names: [...literal, ...expanded].sort(), problems };
}
const AUDIT = auditNamesInCode();

const indian = (n: number): string => {
  const s = String(n);
  if (s.length <= 3) return s;
  return `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${s.slice(-3)}`;
};

/** The words inside quotes after `"table"."column" =` or `IN (...)` in a CHECK, in the order they appear. */
function checkWords(table: string, column: string): string[] {
  const sql = collected.sqlOf[table]!;
  const out: string[] = [];
  for (const m of sql.matchAll(new RegExp(`"${table}"\\."${column}"\\s*(?:=\\s*'([a-z_]+)'|IN\\s*\\(([^)]*)\\))`, "g"))) {
    if (m[1]) out.push(m[1]);
    else for (const w of m[2]!.matchAll(/'([a-z_]+)'/g)) out.push(w[1]!);
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The checks. Each takes the text of the document and returns problems, so that the same checks run on the real text and on changed copies.

const need = (md: string, title: RegExp, label: string, problems: string[], index = 0): MdTable | null => {
  const t = tableUnder(md, title, index);
  if (!t) problems.push(`no table under the heading ${label}`);
  return t;
};
const cells = (t: MdTable, column: number) => t.rows.map((r) => r.cells[column] ?? "");
const plain = (s: string) => s.replaceAll("`", "");

function structure(md: string): string[] {
  try {
    return compareDictionary(parseDictionary(md), facts);
  } catch (e) {
    return [(e as Error).message];
  }
}

function references(md: string): string[] {
  return unknownReferences(md, facts, AUDIT.names);
}

function diagrams(md: string): string[] {
  const out: string[] = [];
  const parsed = [];
  for (const b of erBlocks(md)) {
    try {
      const d = parseEr(b.text, b.line);
      parsed.push(d);
      out.push(...compareEr(d, facts));
    } catch (e) {
      out.push((e as Error).message);
    }
  }
  if (parsed.length < 2) out.push("expected an overall diagram and at least one diagram for a family");
  out.push(...undrawnRelationships(parsed, facts).map((r) => `no diagram draws the foreign key from ${r}`));
  const withColumns = new Set(parsed.flatMap((d) => [...d.entities].filter(([, attrs]) => attrs.length > 0).map(([name]) => name)));
  for (const t of facts.tables) if (!withColumns.has(t.name)) out.push(`no diagram lists the columns of ${t.name}`);
  return out;
}

function counts(md: string): string[] {
  const out: string[] = [];
  const t = need(md, /^1\.1 /, "1.1", out);
  if (t) {
    const guard = (x: { name: string; table: string }) => ["no_update", "no_delete", "no_replace"].some((g) => x.name === `${x.table}_${g}`);
    const guards = facts.triggers.filter(guard).length;
    const expected: Record<string, number> = {
      Migrations: collected.migrationFiles.length,
      Tables: facts.tables.length,
      Columns: facts.tables.reduce((n, x) => n + x.columns.length, 0),
      "Indexes made with CREATE INDEX": facts.tables.reduce((n, x) => n + x.indexes.length, 0),
      Triggers: facts.triggers.length,
      "Triggers that make a table append-only": guards,
      "Triggers that enforce a rule": facts.triggers.length - guards,
      "Tables that are append-only": facts.tables.filter((x) => ["no_update", "no_delete", "no_replace"].every((g) => facts.triggers.some((y) => y.name === `${x.name}_${g}`))).length,
    };
    const documented = Object.fromEntries(t.rows.map((r) => [r.cells[0]!, r.cells[1]!]));
    for (const [k, v] of Object.entries(expected)) if (documented[k] !== String(v)) out.push(`the count "${k}" is ${v}, the document says ${documented[k] ?? "nothing"}`);
    for (const k of Object.keys(documented)) if (!(k in expected)) out.push(`the count "${k}" is not one this test knows`);
  }
  const m = need(md, /^4\. /, "4", out);
  if (m) {
    const documented = Object.fromEntries(m.rows.map((r) => [r.cells[0]!, `${r.cells[1]} ${r.cells[2]}`]));
    for (const f of collected.migrationFiles) {
      const n = f.name.slice(0, 4);
      const created = [...f.text.matchAll(/^CREATE TRIGGER (\w+)/gm)].length;
      const dropped = [...f.text.matchAll(/^DROP TRIGGER (\w+)/gm)].length;
      if (documented[n] !== `${created} ${dropped}`) out.push(`migration ${n} creates ${created} triggers and drops ${dropped}, the document says ${documented[n] ?? "nothing"}`);
    }
  }
  return out;
}

function families(md: string): string[] {
  const out: string[] = [];
  const t = need(md, /^1\.4 /, "1.4", out);
  if (!t) return out;
  const listed: string[] = [];
  for (const r of t.rows) {
    const tables = codeSpans(r.cells[2] ?? "");
    listed.push(...tables);
    for (const name of tables) {
      const owner = facts.tables.find((x) => x.name === name)?.ownerModule;
      if (owner && owner !== r.cells[1]) out.push(`line ${r.line}: ${name} belongs to the ${owner} module, the family says ${r.cells[1]}`);
    }
  }
  return [...out, ...compareSets("tables in the families", listed, facts.tables.map((x) => x.name))];
}

function questionnaire(md: string): string[] {
  const out: string[] = [];
  const s = need(md, /^5\.1 /, "5.1", out);
  const q = need(md, /^5\.2 /, "5.2", out);
  const fields = SECTIONS.flatMap((x) => x.fields);
  if (s) {
    const ids = firstSpans(s);
    out.push(...ids.problems, ...compareSets("questionnaire sections", ids.values, SECTIONS.map((x) => x.id)));
    for (const r of s.rows) {
      const section = SECTIONS.find((x) => x.id === codeSpans(r.cells[0] ?? "")[0]);
      if (section && plain(r.cells[1] ?? "") !== section.title) out.push(`section ${section.id} is titled "${section.title}", the document says "${plain(r.cells[1] ?? "")}"`);
      if (section) out.push(...compareSets(`questions of section ${section.id}`, codeSpans(r.cells[2] ?? ""), section.fields.map((f) => f.key)));
    }
    const text = parseSections(md).find((x) => /^5\.1 /.test(x.title))!.body.join(" ");
    const m = /version (\d+) and has (\d+) questions in (\d+) sections/.exec(text);
    if (!m || Number(m[1]) !== QUESTIONNAIRE_VERSION || Number(m[2]) !== fields.length || Number(m[3]) !== SECTIONS.length) out.push(`5.1 should say version ${QUESTIONNAIRE_VERSION} with ${fields.length} questions in ${SECTIONS.length} sections`);
  }
  if (q) {
    const keys = firstSpans(q);
    out.push(...keys.problems, ...compareSets("questions", keys.values, fields.map((f) => f.key)));
    for (const r of q.rows) {
      const section = SECTIONS.find((x) => x.fields.some((f) => f.key === codeSpans(r.cells[0] ?? "")[0]));
      const f = section?.fields.find((x) => x.key === codeSpans(r.cells[0] ?? "")[0]);
      if (!section || !f) continue;
      const limits = f.kind === "text" ? `up to ${f.maxLength} characters` : f.kind === "number" ? `whole number from ${f.min} to ${f.max}` : f.kind === "choice" ? "one of the values" : f.maxChoices ? `any of the values, at most ${f.maxChoices}` : "any of the values";
      const required = (REQUIRED_TO_CONFIRM as readonly string[]).includes(f.key) ? "yes" : "no";
      const values = f.kind === "choice" || f.kind === "multi" ? f.options.map((o) => o.value) : [];
      const at = `question ${f.key}`;
      if (r.cells[1] !== section.id) out.push(`${at} is in section ${section.id}, the document says ${r.cells[1]}`);
      if (r.cells[2] !== f.kind) out.push(`${at} is of kind ${f.kind}, the document says ${r.cells[2]}`);
      if (r.cells[3] !== limits) out.push(`${at} has the limit "${limits}", the document says "${r.cells[3]}"`);
      if (r.cells[4] !== required) out.push(`${at} ${required === "yes" ? "is" : "is not"} required to confirm, the document says ${r.cells[4]}`);
      out.push(...compareSets(`values of ${f.key}`, codeSpans(r.cells[5] ?? ""), values));
    }
  }
  return out;
}

function library(md: string): string[] {
  const out: string[] = [];
  const t = need(md, /^5\.3 /, "5.3", out);
  const b = need(md, /^5\.3 /, "5.3", out, 1);
  if (t) {
    const ids = firstSpans(t);
    out.push(...ids.problems, ...compareSets("library entries", ids.values, LIBRARY.map((o) => o.id)));
    for (const r of t.rows) {
      const o = LIBRARY.find((x) => x.id === codeSpans(r.cells[0] ?? "")[0]);
      if (!o) continue;
      if (r.cells[1] !== o.kind) out.push(`${o.id} is of kind ${o.kind}, the document says ${r.cells[1]}`);
      out.push(...compareSets(`problems addressed by ${o.id}`, codeSpans(r.cells[2] ?? ""), o.addresses));
      if (r.cells[3] !== o.risk.level) out.push(`${o.id} has risk ${o.risk.level}, the document says ${r.cells[3]}`);
    }
    const text = parseSections(md).find((x) => /^5\.3 /.test(x.title))!.body.join(" ");
    const ai = LIBRARY.filter((o) => o.kind === "ai").length;
    const wanted = `has ${LIBRARY.length} entries (${LIBRARY.length - ai} that are not AI and ${ai} that are), version ${LIBRARY_VERSION}, and the engine is version ${ENGINE_VERSION}`;
    if (!text.includes(wanted)) out.push(`5.3 should say: ${wanted}`);
  }
  if (b) {
    const names = firstSpans(b);
    out.push(...names.problems, ...compareSets("budget bands", names.values, Object.keys(BUDGET_CEILING)));
    for (const r of b.rows) {
      const band = codeSpans(r.cells[0] ?? "")[0] ?? "";
      const ceiling = BUDGET_CEILING[band];
      if (ceiling === undefined) continue;
      const wanted = ceiling === null ? "no ceiling" : `₹${indian(ceiling)}`;
      if (r.cells[1] !== wanted) out.push(`band ${band} has the ceiling ${wanted}, the document says ${r.cells[1]}`);
    }
  }
  const c = need(md, /^5\.4 /, "5.4", out);
  if (c) {
    out.push(...compareSets("clusters", firstSpans(c).values, CLUSTERS.map((x) => x.id)));
    for (const r of c.rows) {
      const k = CLUSTERS.find((x) => x.id === codeSpans(r.cells[0] ?? "")[0]);
      if (k && r.cells[1] !== k.label) out.push(`cluster ${k.id} is labelled "${k.label}", the document says "${r.cells[1]}"`);
    }
  }
  return out;
}

function eventKinds(md: string): string[] {
  const out: string[] = [];
  const t = need(md, /^5\.5 /, "5.5", out);
  if (!t) return out;
  const tables = ["assessment_events", "requirement_events", "provider_events", "engagement_events", "outcome_events"];
  out.push(...compareSets("event tables in 5.5", t.rows.map((r) => r.cells[0]!), tables));
  for (const r of t.rows) {
    const name = r.cells[0]!;
    if (!tables.includes(name)) continue;
    out.push(...compareSets(`kinds of ${name}`, codeSpans(r.cells[1] ?? ""), checkWords(name, "kind")));
    const others = [...checkWords(name, "decision"), ...checkWords(name, "verdict"), ...checkWords(name, "in_use")];
    out.push(...compareSets(`other values of ${name}`, codeSpans(r.cells[2] ?? ""), others));
  }
  if (!/BETWEEN 1 AND 3/.test(collected.sqlOf["outcome_events"]!)) out.push("outcome_events no longer limits review_no to 1 to 3 as the document says");
  out.push(...compareSets("event kinds of engagements in the code", EVENT_KINDS as unknown as string[], checkWords("engagement_events", "kind")));
  return out;
}

function auditEvents(md: string): string[] {
  const out: string[] = [...AUDIT.problems];
  const t = need(md, /^5\.8 /, "5.8", out);
  if (!t) return out;
  const names = firstSpans(t);
  out.push(...names.problems, ...compareSets("audit events", names.values, AUDIT.names));
  for (const r of t.rows) for (const id of r.cells[1]?.match(/API-\d{2}/g) ?? []) if (!apiIds().has(id)) out.push(`${plain(r.cells[0] ?? "")} is written by ${id}, which the API reference does not define`);
  return out;
}

let apiCache: Set<string> | undefined;
function apiIds(): Set<string> {
  if (!apiCache) {
    const path = "docs/design/API-REFERENCE.md";
    if (!existsSync(join(ROOT, path))) throw new Error(`${path} does not exist, and the dictionary names the operations in it`);
    apiCache = new Set(parseSummary(read(path)).map((o) => o.id));
  }
  return apiCache;
}

function operationIds(md: string): string[] {
  const out: string[] = [];
  for (const id of new Set(withoutFences(md).match(/\bAPI-\d{2}\b/g) ?? [])) if (!apiIds().has(id)) out.push(`the dictionary names ${id}, which the API reference does not define`);
  return out;
}

function limits(md: string): string[] {
  const out: string[] = [];
  const t = need(md, /^8\. /, "8", out);
  if (!t) return out;
  for (const r of t.rows) {
    const label = r.cells[0] ?? "";
    const value = r.cells[1] ?? "";
    const rupees = value.startsWith("₹");
    const number = Number(value.replace(/[₹,]/g, ""));
    if (!/^₹?[\d,]+$/.test(value) || !Number.isInteger(number)) {
      out.push(`line ${r.line}: the value of "${label}" is not a whole number: ${value}`);
      continue;
    }
    if (rupees && indian(number) !== value.slice(1)) out.push(`line ${r.line}: ${value} is not grouped in the Indian way (${indian(number)})`);
    if (!rupees && String(number) !== value) out.push(`line ${r.line}: ${value} is not written as plain digits`);
    const defined = codeSpans(r.cells[2] ?? "");
    if (defined.length === 0) out.push(`line ${r.line}: "${label}" names no constant`);
    for (const d of defined) {
      const m = /^(\S+) ([A-Z][A-Z0-9_]*)$/.exec(d);
      if (!m) {
        out.push(`line ${r.line}: "${d}" is not "path CONSTANT"`);
        continue;
      }
      if (!existsSync(join(ROOT, m[1]!))) {
        out.push(`line ${r.line}: ${m[1]} does not exist`);
        continue;
      }
      const real = constants(m[1]!)[m[2]!];
      if (real === undefined) out.push(`line ${r.line}: ${m[1]} has no constant ${m[2]} (or it is not a plain whole number)`);
      else if (real !== number) out.push(`line ${r.line}: ${m[2]} in ${m[1]} is ${real}, the document says ${number}`);
    }
  }
  return out;
}

/** A code span of the form `path name` in a Where column names a function or constant that is in that file; a status word listed beside it is a string that file contains. */
function places(md: string): string[] {
  const out: string[] = [];
  const check = (t: MdTable | null, label: string, valueColumn?: number) => {
    if (!t) return;
    for (const r of t.rows) {
      for (const s of codeSpans(r.cells[2] ?? "")) {
        const m = /^(\S+\.tsx?) ([A-Za-z_]\w*)$/.exec(s);
        if (!m) {
          out.push(`${label} line ${r.line}: "${s}" is not "path name"`);
          continue;
        }
        if (!existsSync(join(ROOT, m[1]!))) {
          out.push(`${label} line ${r.line}: ${m[1]} does not exist`);
          continue;
        }
        const text = read(m[1]!);
        if (!new RegExp(`\\b(?:function|const)\\s+${m[2]}\\b`).test(text)) out.push(`${label} line ${r.line}: ${m[1]} defines no ${m[2]}`);
        if (valueColumn !== undefined) for (const v of codeSpans(r.cells[valueColumn] ?? "")) if (!text.includes(`"${v}"`) && !text.includes(`'${v}'`) && !text.includes(`${v}:`)) out.push(`${label} line ${r.line}: ${m[1]} never mentions the value ${v}`);
      }
    }
  };
  const status = need(md, /^5\.7 /, "5.7", out);
  const derived = need(md, /^6\. /, "6", out);
  check(status, "5.7", 1);
  check(derived, "6");
  if ((derived?.rows.length ?? 0) + (status?.rows.length ?? 0) < 20) out.push("the stored-versus-derived and status tables have lost rows");
  return out;
}

function paths(md: string): string[] {
  const out: string[] = [];
  const known = new Set(git("--", "app", "worker", "modules", "docs", "drizzle", "scripts"));
  for (const s of codeSpans(withoutFences(md))) {
    const p = s.split(" ")[0]!;
    if (/^(app|worker|modules|docs|drizzle|scripts)\/[\w./-]+\.[a-z]+$/.test(p) && !known.has(p) && !existsSync(join(ROOT, p))) out.push(`${p} is named in the document and is not in the repository`);
  }
  return out;
}

/** What section 9 cites as evidence, held to the line. When a pinned line changes the discrepancy may be gone, and the document must be revised. */
const EVIDENCE: { file: string; line: number; has: RegExp }[] = [
  { file: "modules/deliver/src/api/engagements.ts", line: 4, has: /providers do not sign in \(OQ-13\)/ },
  { file: "modules/deliver/src/db/schema.ts", line: 63, has: /Providers do not sign in here \(OQ-13\)/ },
  { file: "modules/run/src/api/outcomes.ts", line: 4, has: /providers do not sign in \(OQ-13\)/ },
  { file: "modules/run/src/db/schema.ts", line: 10, has: /Providers do not sign in \(OQ-13\)/ },
  { file: "modules/platform/src/api/session.ts", line: 40, has: /Real sign-in .* \(OQ-07\)/ },
  { file: "modules/platform/src/db/schema.ts", line: 17, has: /owner \| operator/ },
  { file: "modules/platform/src/db/schema.ts", line: 21, has: /refuses UPDATE and DELETE/ },
  { file: "modules/platform/src/db/schema.ts", line: 28, has: /Never personal data/ },
  { file: "modules/deliver/STATUS.md", line: 60, has: /review-fixes branch/ },
  { file: "modules/deliver/STATUS.md", line: 61, has: /review-fixes branch/ },
  { file: "modules/diagnose/STATUS.md", line: 46, has: /review-fixes branch/ },
  { file: "modules/diagnose/STATUS.md", line: 47, has: /review-fixes branch/ },
  { file: "modules/procure/STATUS.md", line: 54, has: /review-fixes branch/ },
  { file: "modules/journey/STATUS.md", line: 5, has: /stacked on the review-fixes branch/ },
];

function discrepancies(md: string): string[] {
  const out: string[] = [];
  const section = parseSections(md).find((x) => /^9\. /.test(x.title));
  if (!section) return ["no section 9"];
  const text = section.body.join("\n");
  for (const e of EVIDENCE) {
    const lines = existsSync(join(ROOT, e.file)) ? read(e.file).split("\n") : [];
    if (!e.has.test(lines[e.line - 1] ?? "")) out.push(`${e.file} line ${e.line} no longer says ${e.has}: the discrepancy it shows may be gone, so revise section 9`);
    const cited = [...text.matchAll(new RegExp(`${e.file.replaceAll(".", "\\.")}\``, "g"))].some((m) => new RegExp(`\\b${e.line}\\b`).test(text.slice(m.index!, m.index! + e.file.length + 30)));
    if (!cited) out.push(`section 9 does not cite ${e.file} line ${e.line}`);
  }
  const session = read("modules/platform/src/api/session.ts");
  if (!/request\.text\(\)/.test(session) || /readTextWithin|takeBody/.test(session)) out.push("modules/platform/src/api/session.ts reads its body differently now: revise discrepancy 6 of section 9");
  if (!/modules\/platform\/src\/api\/session\.ts/.test(text)) out.push("section 9 does not cite modules/platform/src/api/session.ts");
  // Discrepancy 4: outcome_events has a CHECK on the note and no trigger on it.
  if (facts.triggers.some((t) => t.table === "outcome_events" && /note/.test(t.name))) out.push("outcome_events now has a note trigger: revise discrepancy 4 of section 9");
  if (facts.triggers.filter((t) => /_note_is_short$/.test(t.name)).length !== 6) out.push("the number of note triggers is no longer six: revise discrepancy 4 and the limits table");
  return out;
}

const CHECKS: Record<string, (md: string) => string[]> = { structure, references, diagrams, counts, families, questionnaire, library, eventKinds, auditEvents, operationIds, limits, places, paths, discrepancies };

// ---------------------------------------------------------------------------------------------------------------------------------
// Tests on the real document

const real = read(DOCUMENT);

for (const [name, check] of Object.entries(CHECKS)) {
  test(`the data dictionary agrees with the code and the migrated database: ${name}`, () => {
    assert.deepEqual(check(real), []);
  });
}

test("the database the test builds is the one the document describes: 16 tables, 15 migrations, 91 triggers", () => {
  // These are the figures of 5 October 2026; the document's own counts table is held to the database above, so this only fails when both move together.
  assert.equal(facts.tables.length, 16);
  assert.equal(collected.migrationFiles.length, 15);
  assert.equal(facts.triggers.length, 91);
});

test("every table has a section, every section has a table, and no trigger is missing from the catalogue", () => {
  const doc = parseDictionary(real);
  assert.deepEqual(doc.tables.map((t) => t.name).sort(), facts.tables.map((t) => t.name).sort());
  assert.deepEqual(doc.triggers.map((t) => t.name).sort(), facts.triggers.map((t) => t.name).sort());
  assert.equal(doc.tables.reduce((n, t) => n + t.columns.length, 0), facts.tables.reduce((n, t) => n + t.columns.length, 0));
});

test("every column text names who writes it and where its limit is enforced", () => {
  const empty = parseDictionary(real).tables.flatMap((t) => t.columns.filter((c) => !c.meaning.trim() || !c.writtenBy.trim() || !c.enforcedIn.trim() || !c.limits.trim()).map((c) => `${t.name}.${c.name}`));
  assert.deepEqual(empty, []);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Prove the comparison works: change a copy of the real text and each change must be caught

const lines = real.split("\n");
const lineOf = (re: RegExp, from = 0) => {
  const i = lines.findIndex((l, n) => n >= from && re.test(l));
  assert.ok(i >= 0, `the real document has no line matching ${re}`);
  return i;
};
const without = (i: number) => lines.filter((_, n) => n !== i).join("\n");
const replaced = (i: number, from: string | RegExp, to: string) => lines.map((l, n) => (n === i ? l.replace(from, to) : l)).join("\n");
const caught = (name: string, md: string, expected: RegExp) => {
  const found = CHECKS[name]!(md);
  assert.ok(found.length > 0, `${name} found nothing in the changed copy`);
  assert.ok(found.some((p) => expected.test(p)), `${name} found ${JSON.stringify(found.slice(0, 3))}, not ${expected}`);
};

test("a column row removed from its section is reported", () => {
  const section = lineOf(/^### factory_revisions$/);
  caught("structure", without(lineOf(/^\| `answers` \|/, section)), /factory_revisions: column answers is not in its section/);
});

test("a column that is not in the table is reported", () => {
  const section = lineOf(/^### companies$/);
  const row = lineOf(/^\| `name` \|/, section);
  caught("structure", lines.flatMap((l, n) => (n === row ? [l, l.replace("`name`", "`nickname`")] : [l])).join("\n"), /the section names column nickname/);
});

test("a changed type, nullability or default is reported", () => {
  const section = lineOf(/^### companies$/);
  const row = lineOf(/^\| `created_at` \|/, section);
  caught("structure", replaced(row, "TEXT", "INTEGER"), /companies\.created_at: the type is/);
  caught("structure", replaced(row, "| no |", "| yes |"), /companies\.created_at: the column is NOT NULL/);
  const synthetic = lineOf(/^\| `is_synthetic` \|/, section);
  caught("structure", replaced(synthetic, "`1`", "`0`"), /companies\.is_synthetic: the default is 1/);
});

test("a section for a table that does not exist is reported", () => {
  const i = lineOf(/^## 4\. /);
  const copy = [...lines.slice(0, i), "### invoices", "", "- Purpose: invented.", "- Owner module: platform", "- Scope: none", "- Append-only: no", "- Created in: migration 0000", "", ...lines.slice(i)];
  caught("structure", copy.join("\n"), /invoices/);
});

test("a table with no section is reported", () => {
  const start = lineOf(/^### outcome_events$/);
  const end = lineOf(/^## 4\. /);
  caught("structure", [...lines.slice(0, start), ...lines.slice(end)].join("\n"), /table outcome_events has no section/);
});

test("a trigger renamed, removed, or given another message is reported", () => {
  const row = lineOf(/^\| `engagements_no_replace` \|/);
  caught("structure", replaced(row, "`engagements_no_replace`", "`engagements_no_overwrite`"), /engagements_no_replace.* is not in the catalogue|engagements_no_overwrite/);
  caught("structure", without(row), /trigger engagements_no_replace \(on engagements\) is not in the catalogue/);
  const note = lineOf(/^\| `listing_terms_note_is_short` \|/);
  caught("structure", replaced(note, /`[^`]*`\s*\|$/, "`a different message` |"), /listing_terms_note_is_short: it raises/);
});

test("an index removed from its section, or a table claimed append-only that is not, is reported", () => {
  const row = lineOf(/^\| `assessments_company` \|/);
  caught("structure", without(row), /index assessments_company is not in its section/);
  const section = lineOf(/^### companies$/);
  caught("structure", replaced(lineOf(/^- Append-only: /, section), "no", "yes"), /companies: the table is not append-only/);
});

test("a prose mention of a trigger, index or column that is gone is reported", () => {
  caught("references", `${real}\n\nSee also \`engagements_old_guard\` and \`companies.nickname\`.\n`, /engagements_old_guard|companies\.nickname/);
});

test("a relationship that is not a foreign key, or a foreign key that is not drawn, is reported", () => {
  const i = lineOf(/^  assessments \|\|--o\{ requirements /);
  caught("diagrams", lines.flatMap((l, n) => (n === i ? [l, "  providers ||--o{ assessments : \"invented\""] : [l])).join("\n"), /assessments has no foreign key to providers/);
  const gone = lines.filter((l) => !/^  assessments (?:\|\||\|o)--o\{ requirements /.test(l)).join("\n");
  caught("diagrams", gone, /no diagram draws the foreign key from requirements to assessments/);
});

test("a changed count, family, or limit is reported", () => {
  const triggers = lineOf(/^\| Triggers \| /);
  caught("counts", replaced(triggers, /\d+ \|$/, "90 |"), /the count "Triggers"/);
  const row = lineOf(/^\| Procure \|/);
  caught("families", replaced(row, "`provider_events`", ""), /provider_events/);
  const limit = lineOf(/^\| Revisions for a company \|/);
  caught("limits", replaced(limit, "| 500 |", "| 501 |"), /MAX_REVISIONS_PER_COMPANY .* is 500, the document says 501/);
  caught("limits", replaced(limit, "| 500 |", "| five hundred |"), /not a whole number/);
});

test("a list that differs from the code is reported: a question, a library entry, a cluster, an audit event, an event kind", () => {
  caught("questionnaire", without(lineOf(/^\| `shifts` \|/, lineOf(/^### 5\.2 /))), /questions: shifts is in the code and not in the document/);
  const entry = lineOf(/^\| `[\w-]+` \| non_ai \|/, lineOf(/^### 5\.3 /));
  caught("library", without(entry), /library entries: .* is in the code and not in the document/);
  caught("library", replaced(entry, "| non_ai |", "| ai |"), /is of kind non_ai, the document says ai/);
  caught("questionnaire", replaced(lineOf(/^\| `year_started` \|/), "1900 to 2026", "1900 to 2025"), /year_started has the limit/);
  caught("library", without(lineOf(/^\| `synthetic-cluster-3` \|/)), /clusters: synthetic-cluster-3 is in the code and not in the document/);
  caught("auditEvents", without(lineOf(/^\| `session\.ended` \|/)), /audit events: session\.ended is in the code and not in the document/);
  caught("auditEvents", replaced(lineOf(/^\| `session\.ended` \|/), "`session.ended`", "`session.finished`"), /session\.finished is in the document and not in the code/);
  caught("eventKinds", replaced(lineOf(/^\| provider_events \|/), "`unlist`", "`delist`"), /kinds of provider_events/);
});

test("a function or constant that moved, or an operation that does not exist, is reported", () => {
  const row = lineOf(/^\| Review due dates \|/);
  caught("places", replaced(row, "dueAt", "dueDate"), /defines no dueDate/);
  caught("places", replaced(row, "modules/run/src/state.ts", "modules/run/src/states.ts"), /does not exist/);
  caught("operationIds", `${real}\n\nSee API-99.\n`, /API-99/);
  caught("paths", `${real}\n\nSee \`modules/nowhere/src/gone.ts\`.\n`, /modules\/nowhere\/src\/gone\.ts/);
});

test("evidence cited in section 9 that has changed is reported", () => {
  const row = lineOf(/^\| 1 \|/, lineOf(/^## 9\. /));
  caught("discrepancies", replaced(row, "modules/deliver/src/api/engagements.ts", "modules/deliver/src/api/other.ts"), /does not cite modules\/deliver\/src\/api\/engagements\.ts line 4/);
});

test("a document that cannot be read as a dictionary is reported with every problem", () => {
  const bad = real.replace(/^- Owner module: .*$/m, "- Owner module: nobody");
  assert.ok(structure(bad).length > 0);
  assert.deepEqual(structure(real), []);
});
