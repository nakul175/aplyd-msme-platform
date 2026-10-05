// Reads the data dictionary (docs/design/DATA-DICTIONARY.md) as data and compares it with the migrated database. Pure functions over text and
// small plain objects: no file and no database is opened here. The tests build the facts (a migrated in-memory SQLite and the text of the
// migration files) and give them in, together with the document.
//
// The document is written so that it can be read this way: one section for each table, headed by the bare table name; one table of columns
// under a fixed row of headings; one catalogue of triggers for each table, headed "Triggers on <table>"; and Mermaid diagrams whose
// relationships are foreign keys. A section that does not follow the shape is refused, naming every malformed row at once.

export type Section = { level: number; title: string; line: number; body: string[]; bodyLine: number };

/** The headings of a Markdown text, each with the lines up to the next heading. A "#" line inside a fenced block is not a heading. */
export function parseSections(markdown: string): Section[] {
  const out: Section[] = [];
  let fence = false;
  let current: Section | null = null;
  markdown.split("\n").forEach((text, i) => {
    const fenceLine = /^\s*```/.test(text);
    if (fenceLine) fence = !fence;
    const heading = !fence && !fenceLine ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(text) : null;
    if (heading) {
      current = { level: heading[1]!.length, title: heading[2]!, line: i + 1, body: [], bodyLine: i + 2 };
      out.push(current);
    } else if (current) current.body.push(text);
  });
  return out;
}

export type MdTable = { header: string[]; rows: { cells: string[]; line: number }[]; line: number };

const isRule = (line: string) => /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
const cellsOf = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** The pipe tables in some lines. A row with a different number of cells from its heading row is a problem, not a row. */
export function parseTables(lines: string[], firstLine = 1): { tables: MdTable[]; problems: string[] } {
  const tables: MdTable[] = [];
  const problems: string[] = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence || !/^\s*\|/.test(line) || !isRule(lines[i + 1] ?? "")) continue;
    const header = cellsOf(line);
    if (cellsOf(lines[i + 1]!).length !== header.length) problems.push(`line ${firstLine + i}: the rule under the heading row has a different number of cells`);
    const table: MdTable = { header, rows: [], line: firstLine + i };
    let j = i + 2;
    for (; j < lines.length && /^\s*\|/.test(lines[j]!); j++) {
      const cells = cellsOf(lines[j]!);
      if (cells.length !== header.length) problems.push(`line ${firstLine + j}: ${cells.length} cells, expected ${header.length}; a "|" inside a cell breaks a row`);
      else table.rows.push({ cells, line: firstLine + j });
    }
    tables.push(table);
    i = j - 1;
  }
  return { tables, problems };
}

/** The text of every `code span` in a string. */
export const codeSpans = (text: string): string[] => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);

/** A Markdown text without its fenced blocks. */
export const withoutFences = (markdown: string): string => markdown.replace(/^\s*```[\s\S]*?^\s*```[^\n]*$/gm, "");

// ---------------------------------------------------------------------------------------------------------------------------------
// The tables and triggers of the dictionary

export const COLUMN_HEADER = ["Column", "Type", "Null", "Default", "Key", "Meaning", "Allowed values and limits", "Written by", "Enforced in"];
export const INDEX_HEADER = ["Index", "Columns", "Unique", "Condition", "Purpose"];
export const TRIGGER_HEADER = ["Trigger", "Event", "Migration", "Module", "Rule", "Message"];

export type ColumnDoc = { name: string; type: string; nullable: boolean; default: string | null; key: string[]; meaning: string; limits: string; writtenBy: string; enforcedIn: string; line: number };
export type IndexDoc = { name: string; columns: string[]; unique: boolean; condition: string | null; purpose: string; line: number };
export type TableDoc = { name: string; line: number; purpose: string; owner: string; scope: string; appendOnly: boolean; createdIn: string; columns: ColumnDoc[]; indexes: IndexDoc[] };
export type TriggerDoc = { name: string; table: string; event: string; migration: string; module: string; rule: string; message: string; line: number };
export type ParsedDictionary = { tables: TableDoc[]; triggers: TriggerDoc[] };

const IDENT = /^[a-z][a-z0-9_]*$/;
const span = (cell: string): string | null => /^`([^`\n]+)`$/.exec(cell)?.[1] ?? null;
const FACTS = ["Purpose", "Owner module", "Scope", "Append-only", "Created in"] as const;

function parseTableSection(s: Section, problems: string[]): TableDoc | null {
  const at = (n: number | string, msg: string) => problems.push(`${s.title}: ${typeof n === "number" ? `line ${n}: ` : ""}${msg}`);
  const facts = new Map<string, string>();
  for (const l of s.body) {
    const m = /^- (Purpose|Owner module|Scope|Append-only|Created in): (.+)$/.exec(l);
    if (m) facts.set(m[1]!, m[2]!.trim());
  }
  for (const f of FACTS) if (!facts.has(f)) at("section", `no "- ${f}: ..." line`);
  const appendOnly = facts.get("Append-only") ?? "";
  if (!/^(yes|no)\b/.test(appendOnly)) at("section", `"Append-only" must start with yes or no, not "${appendOnly.slice(0, 20)}"`);
  const created = /^migration (\d{4})$/.exec(facts.get("Created in") ?? "")?.[1];
  if (!created) at("section", `"Created in" must read "migration NNNN"`);

  const { tables, problems: tableProblems } = parseTables(s.body, s.bodyLine);
  for (const p of tableProblems) problems.push(`${s.title}: ${p}`);
  const columnTable = tables.find((t) => t.header[0] === "Column");
  if (!columnTable) {
    at("section", "no table of columns");
    return null;
  }
  if (columnTable.header.join(" | ") !== COLUMN_HEADER.join(" | ")) at(columnTable.line, `the column table's headings must be: ${COLUMN_HEADER.join(", ")}`);
  const columns: ColumnDoc[] = [];
  for (const { cells, line } of columnTable.rows) {
    const [name, type, nul, dflt, key, meaning, limits, writtenBy, enforcedIn] = cells as [string, string, string, string, string, string, string, string, string];
    const n = span(name);
    if (!n || !IDENT.test(n)) {
      at(line, `the column name must be one code span, not "${name}"`);
      continue;
    }
    if (!/^[A-Z]+$/.test(type)) at(line, `${n}: the type must be an upper-case SQLite type, not "${type}"`);
    if (nul !== "yes" && nul !== "no") at(line, `${n}: Null must be yes or no, not "${nul}"`);
    const d = dflt === "none" ? null : span(dflt);
    if (dflt !== "none" && d === null) at(line, `${n}: Default must be "none" or one code span, not "${dflt}"`);
    if (key !== "none" && !key.split("; ").every((k) => k === "PK" || /^FK [a-z_]+\([a-z_, ]+\)$/.test(k))) at(line, `${n}: Key must be "none" or items "PK" and "FK table(column, ...)" separated by "; ", not "${key}"`);
    for (const [label, v] of [["Meaning", meaning], ["Allowed values and limits", limits], ["Written by", writtenBy], ["Enforced in", enforcedIn]] as const) if (v === "") at(line, `${n}: ${label} is empty`);
    columns.push({ name: n, type, nullable: nul === "yes", default: d, key: key === "none" ? [] : key.split("; "), meaning, limits, writtenBy, enforcedIn, line });
  }
  if (new Set(columns.map((c) => c.name)).size !== columns.length) at("section", "a column is listed twice");

  const indexes: IndexDoc[] = [];
  const indexTable = tables.find((t) => t.header[0] === "Index");
  if (indexTable) {
    if (indexTable.header.join(" | ") !== INDEX_HEADER.join(" | ")) at(indexTable.line, `the index table's headings must be: ${INDEX_HEADER.join(", ")}`);
    for (const { cells, line } of indexTable.rows) {
      const [name, cols, unique, cond, purpose] = cells as [string, string, string, string, string];
      const n = span(name);
      const c = span(cols);
      if (!n || !c) {
        at(line, `an index row needs its name and its columns as code spans: "${name}", "${cols}"`);
        continue;
      }
      if (unique !== "yes" && unique !== "no") at(line, `${n}: Unique must be yes or no`);
      const w = cond === "none" ? null : span(cond);
      if (cond !== "none" && w === null) at(line, `${n}: Condition must be "none" or one code span`);
      if (purpose === "") at(line, `${n}: Purpose is empty`);
      indexes.push({ name: n, columns: c.split(",").map((x) => x.trim()), unique: unique === "yes", condition: w, purpose, line });
    }
  }
  if (problems.some((p) => p.startsWith(`${s.title}:`))) return null;
  return { name: s.title, line: s.line, purpose: facts.get("Purpose")!, owner: facts.get("Owner module")!, scope: facts.get("Scope")!, appendOnly: appendOnly.startsWith("yes"), createdIn: created!, columns, indexes };
}

function parseTriggerSection(s: Section, table: string, problems: string[]): TriggerDoc[] {
  const at = (n: number | string, msg: string) => problems.push(`${s.title}: ${typeof n === "number" ? `line ${n}: ` : ""}${msg}`);
  const { tables, problems: tableProblems } = parseTables(s.body, s.bodyLine);
  for (const p of tableProblems) problems.push(`${s.title}: ${p}`);
  const t = tables.find((x) => x.header[0] === "Trigger");
  if (!t) {
    at("section", "no table of triggers");
    return [];
  }
  if (t.header.join(" | ") !== TRIGGER_HEADER.join(" | ")) at(t.line, `the trigger table's headings must be: ${TRIGGER_HEADER.join(", ")}`);
  const out: TriggerDoc[] = [];
  for (const { cells, line } of t.rows) {
    const [name, event, migration, module, rule, message] = cells as [string, string, string, string, string, string];
    const n = span(name);
    const m = span(message);
    if (!n || !IDENT.test(n)) {
      at(line, `the trigger name must be one code span, not "${name}"`);
      continue;
    }
    if (!/^(BEFORE|AFTER) (INSERT|UPDATE|DELETE)$/.test(event)) at(line, `${n}: Event must read like "BEFORE INSERT", not "${event}"`);
    if (!/^\d{4}$/.test(migration)) at(line, `${n}: Migration must be four digits, not "${migration}"`);
    if (module === "" || rule === "") at(line, `${n}: Module and Rule must not be empty`);
    if (m === null) at(line, `${n}: Message must be the exact text the trigger raises, as one code span`);
    out.push({ name: n, table, event, migration, module, rule, message: m ?? "", line });
  }
  return out;
}

/** The dictionary's tables and triggers. Throws one error naming every malformed part. */
export function parseDictionary(markdown: string): ParsedDictionary {
  const problems: string[] = [];
  const tables: TableDoc[] = [];
  const triggers: TriggerDoc[] = [];
  for (const s of parseSections(markdown)) {
    if (s.level !== 3) continue;
    const group = /^Triggers on ([a-z][a-z0-9_]*)$/.exec(s.title);
    if (group) triggers.push(...parseTriggerSection(s, group[1]!, problems));
    else if (IDENT.test(s.title)) {
      const t = parseTableSection(s, problems);
      if (t) tables.push(t);
    }
  }
  const seen = new Set<string>();
  for (const t of tables) (seen.has(t.name) ? problems.push(`${t.name}: the section appears twice`) : seen.add(t.name));
  const seenTrigger = new Set<string>();
  for (const t of triggers) (seenTrigger.has(t.name) ? problems.push(`${t.name}: the trigger is listed twice`) : seenTrigger.add(t.name));
  if (problems.length) throw new Error(`the data dictionary has ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
  return { tables, triggers };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// What the migrated database says

export type SchemaFacts = {
  tables: {
    name: string;
    columns: { name: string; type: string; notNull: boolean; default: string | null; primaryKey: boolean }[];
    /** Each foreign key once; for a composite key the pairs are in the order SQLite lists them. */
    foreignKeys: { table: string; columns: { from: string; to: string }[] }[];
    /** Created with CREATE INDEX (not the key SQLite makes for a primary key). */
    indexes: { name: string; unique: boolean; columns: string[]; condition: string | null }[];
    /** Names of the CHECK constraints. */
    checks: string[];
    ownerModule: string | null;
    createdIn: string | null;
  }[];
  triggers: { name: string; table: string; timing: string; event: string; message: string; createdIn: string | null }[];
};

/** The migration (its four-digit number) that creates each table, and the latest one that creates each trigger. Files are given in the journal's order. */
export function migrationIndex(files: { name: string; text: string }[]): { tables: Record<string, string>; triggers: Record<string, string> } {
  const tables: Record<string, string> = {};
  const triggers: Record<string, string> = {};
  for (const f of files) {
    const n = /(\d{4})/.exec(f.name)?.[1];
    if (!n) throw new Error(`a migration file name starts with four digits: ${f.name}`);
    for (const m of f.text.matchAll(/^CREATE TABLE `?(\w+)`?/gm)) tables[m[1]!] ??= n;
    for (const m of f.text.matchAll(/^CREATE TRIGGER (\w+)/gm)) triggers[m[1]!] = n;
  }
  return { tables, triggers };
}

/** Which module's schema.ts defines each table. Paths are repository paths. */
export function tableOwners(files: { path: string; text: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of files) {
    const module = /^modules\/([^/]+)\//.exec(f.path)?.[1];
    if (!module) continue;
    for (const m of f.text.matchAll(/sqliteTable\(\s*"([a-z_]+)"/g)) out[m[1]!] = module;
  }
  return out;
}

/** The event, timing and message of a trigger, from its SQL as SQLite stores it. */
export function triggerParts(sql: string): { timing: string; event: string; message: string } {
  const head = /CREATE TRIGGER\s+\w+\s+(BEFORE|AFTER)\s+(INSERT|UPDATE|DELETE)\b/.exec(sql);
  if (!head) throw new Error(`not a trigger: ${sql.slice(0, 60)}`);
  const message = /RAISE\s*\(\s*ABORT\s*,\s*'((?:[^']|'')*)'\s*\)/.exec(sql)?.[1]?.replaceAll("''", "'") ?? "";
  return { timing: head[1]!, event: head[2]!, message };
}

/** The condition of a partial index, as written after WHERE, without quotes or table names. */
export function indexCondition(sql: string): string | null {
  const m = /\bWHERE\s+([\s\S]+?);?\s*$/.exec(sql);
  return m ? m[1]!.replace(/"[a-z_]+"\./g, "").replaceAll('"', "").replace(/\s+/g, " ").trim() : null;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

/** Everything the dictionary says that the database can contradict. An empty list means they agree. */
export function compareDictionary(doc: ParsedDictionary, facts: SchemaFacts): string[] {
  const out: string[] = [];
  const docTables = new Map(doc.tables.map((t) => [t.name, t]));
  const factTables = new Map(facts.tables.map((t) => [t.name, t]));
  for (const t of facts.tables) if (!docTables.has(t.name)) out.push(`table ${t.name} has no section`);
  for (const t of doc.tables) if (!factTables.has(t.name)) out.push(`the dictionary has a section for ${t.name}, which is not a table of the migrated database`);

  for (const f of facts.tables) {
    const d = docTables.get(f.name);
    if (!d) continue;
    const here = (m: string) => out.push(`${f.name}: ${m}`);
    const factNames = f.columns.map((c) => c.name);
    const docNames = d.columns.map((c) => c.name);
    for (const n of factNames) if (!docNames.includes(n)) here(`column ${n} is not in its section`);
    for (const n of docNames) if (!factNames.includes(n)) here(`the section names column ${n}, which the table does not have`);
    if (sameSet(factNames, docNames) && factNames.join(",") !== docNames.join(",")) here(`the columns are listed in a different order from the table (${factNames.join(", ")})`);
    for (const c of f.columns) {
      const dc = d.columns.find((x) => x.name === c.name);
      if (!dc) continue;
      const col = (m: string) => out.push(`${f.name}.${c.name}: ${m}`);
      if (dc.type.toUpperCase() !== c.type.toUpperCase()) col(`the type is ${c.type}, the dictionary says ${dc.type}`);
      if (dc.nullable === c.notNull) col(`the column is ${c.notNull ? "NOT NULL" : "nullable"}, the dictionary says ${dc.nullable ? "nullable" : "NOT NULL"}`);
      if (dc.default !== c.default) col(`the default is ${c.default ?? "none"}, the dictionary says ${dc.default ?? "none"}`);
      const wanted = [
        ...(c.primaryKey ? ["PK"] : []),
        ...f.foreignKeys.filter((k) => k.columns.some((p) => p.from === c.name)).map((k) => `FK ${k.table}(${k.columns.map((p) => p.to).join(", ")})`),
      ];
      if (!sameSet(wanted, dc.key)) col(`the key is "${wanted.join("; ") || "none"}", the dictionary says "${dc.key.join("; ") || "none"}"`);
    }
    const dI = new Map(d.indexes.map((i) => [i.name, i]));
    for (const i of f.indexes) {
      const x = dI.get(i.name);
      if (!x) {
        here(`index ${i.name} is not in its section`);
        continue;
      }
      if (x.columns.join(",") !== i.columns.join(",")) here(`index ${i.name} is on (${i.columns.join(", ")}), the dictionary says (${x.columns.join(", ")})`);
      if (x.unique !== i.unique) here(`index ${i.name} is ${i.unique ? "unique" : "not unique"}, the dictionary says the opposite`);
      if ((x.condition ?? "none") !== (i.condition ?? "none")) here(`index ${i.name} has the condition ${i.condition ?? "none"}, the dictionary says ${x.condition ?? "none"}`);
    }
    for (const x of d.indexes) if (!f.indexes.some((i) => i.name === x.name)) here(`the section names index ${x.name}, which the table does not have`);
    const triggersHere = new Set(facts.triggers.filter((t) => t.table === f.name).map((t) => t.name));
    const appendOnly = ["no_update", "no_delete", "no_replace"].every((s) => triggersHere.has(`${f.name}_${s}`));
    if (d.appendOnly !== appendOnly) here(`the table is ${appendOnly ? "" : "not "}append-only (the three triggers ${appendOnly ? "exist" : "are not all there"}), the dictionary says ${d.appendOnly ? "yes" : "no"}`);
    if (f.createdIn !== null && d.createdIn !== f.createdIn) here(`it is created in migration ${f.createdIn}, the dictionary says ${d.createdIn}`);
    if (f.ownerModule !== null && d.owner !== f.ownerModule) here(`its schema is in the ${f.ownerModule} module, the dictionary says ${d.owner}`);
  }

  const docTriggers = new Map(doc.triggers.map((t) => [t.name, t]));
  for (const t of facts.triggers) {
    const d = docTriggers.get(t.name);
    if (!d) {
      out.push(`trigger ${t.name} (on ${t.table}) is not in the catalogue`);
      continue;
    }
    const here = (m: string) => out.push(`trigger ${t.name}: ${m}`);
    if (d.table !== t.table) here(`it is on ${t.table}, the catalogue lists it under ${d.table}`);
    if (d.event !== `${t.timing} ${t.event}`) here(`it is ${t.timing} ${t.event}, the catalogue says ${d.event}`);
    if (t.createdIn !== null && d.migration !== t.createdIn) here(`its current text is in migration ${t.createdIn}, the catalogue says ${d.migration}`);
    if (d.message !== t.message) here(`it raises "${t.message}", the catalogue says "${d.message}"`);
    const owner = facts.tables.find((x) => x.name === t.table)?.ownerModule ?? null;
    if (owner !== null && d.module !== owner) here(`its table belongs to the ${owner} module, the catalogue says ${d.module}`);
  }
  for (const d of doc.triggers) if (!facts.triggers.some((t) => t.name === d.name)) out.push(`the catalogue names trigger ${d.name}, which the migrated database does not have`);
  return out;
}

/**
 * Names in the prose that refer to something that is not there. A `table.column` whose table exists but whose column does not (unless the caller lists it in alsoKnown); and a
 * name that begins with a table's name and an underscore (the way indexes, triggers and checks are named) but is none of the names the
 * database has. This is what catches a trigger, index or column that was renamed or dropped while a sentence still mentions it.
 */
export function unknownReferences(markdown: string, facts: SchemaFacts, alsoKnown: string[] = []): string[] {
  const tables = new Set(facts.tables.map((t) => t.name));
  const known = new Set<string>([...tables, ...alsoKnown, ...facts.triggers.map((t) => t.name)]);
  for (const t of facts.tables) {
    for (const c of t.columns) known.add(c.name);
    for (const i of t.indexes) known.add(i.name);
    for (const c of t.checks) known.add(c);
  }
  const out = new Set<string>();
  for (const s of codeSpans(withoutFences(markdown))) {
    const dotted = /^([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)$/.exec(s);
    if (dotted && tables.has(dotted[1]!)) {
      // A name the caller knows (an audit event such as listing_terms.set) is not a reference to a column.
      if (!alsoKnown.includes(s) && !facts.tables.find((t) => t.name === dotted[1])!.columns.some((c) => c.name === dotted[2])) out.add(`${s}: ${dotted[1]} has no column ${dotted[2]}`);
      continue;
    }
    if (IDENT.test(s) && !known.has(s) && [...tables].some((t) => s.startsWith(`${t}_`))) out.add(`${s}: looks like a name from the database (it begins with a table's name) but the database has no such index, trigger, check or column`);
  }
  return [...out];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Mermaid entity-relationship diagrams

export type ErDiagram = {
  line: number;
  entities: Map<string, { type: string; name: string; keys: string[] }[]>;
  relationships: { parent: string; child: string; optional: boolean; label: string }[];
};

/** The text of every fenced mermaid block that is an erDiagram, with the line it starts on. */
export function erBlocks(markdown: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^```mermaid\s*$/.test(lines[i]!)) continue;
    let j = i + 1;
    while (j < lines.length && !/^```\s*$/.test(lines[j]!)) j++;
    const text = lines.slice(i + 1, j).join("\n");
    if (/^\s*erDiagram\b/.test(text)) out.push({ line: i + 1, text });
    i = j;
  }
  return out;
}

/** Reads an erDiagram written in the one style this document uses. Anything else is refused. */
export function parseEr(block: string, line = 1): ErDiagram {
  const diagram: ErDiagram = { line, entities: new Map(), relationships: [] };
  const problems: string[] = [];
  let open: string | null = null;
  block.split("\n").forEach((raw, i) => {
    const l = raw.trim();
    if (l === "" || l === "erDiagram" || l.startsWith("%%")) return;
    const at = `diagram at line ${line}, line ${i + 1}`;
    if (open) {
      if (l === "}") {
        open = null;
        return;
      }
      const a = /^(\w+)\s+(\w+)(?:\s+((?:PK|FK)(?:\s*,\s*(?:PK|FK))*))?(?:\s+"[^"]*")?$/.exec(l);
      if (!a) problems.push(`${at}: an attribute reads "type name [PK, FK]", not "${l}"`);
      else diagram.entities.get(open)!.push({ type: a[1]!, name: a[2]!, keys: a[3] ? a[3].split(",").map((k) => k.trim()) : [] });
      return;
    }
    const rel = /^(\w+)\s+(\|\||\|o)--(o\{|\|\{)\s+(\w+)\s*:\s*"([^"]*)"$/.exec(l);
    if (rel) {
      diagram.relationships.push({ parent: rel[1]!, child: rel[4]!, optional: rel[2] === "|o", label: rel[5]! });
      for (const e of [rel[1]!, rel[4]!]) if (!diagram.entities.has(e)) diagram.entities.set(e, []);
      return;
    }
    const ent = /^(\w+)\s*\{$/.exec(l);
    if (ent) {
      open = ent[1]!;
      if (!diagram.entities.has(open)) diagram.entities.set(open, []);
      return;
    }
    problems.push(`${at}: not a relationship ("parent ||--o{ child : \\"label\\"", with |o for an optional parent) or an entity block: "${l}"`);
  });
  if (open) problems.push(`diagram at line ${line}: the block of ${open} is never closed`);
  if (problems.length) throw new Error(problems.join("\n"));
  return diagram;
}

/**
 * A diagram against the database. Every entity is a table. Every relationship is a foreign key from the child to the parent, and "||" means
 * every such key is NOT NULL (an optional parent "|o" otherwise). An entity with a block lists every column, in order, with its type and
 * with PK and FK where the column is a primary key or part of a foreign key.
 */
export function compareEr(d: ErDiagram, facts: SchemaFacts): string[] {
  const out: string[] = [];
  const at = `diagram at line ${d.line}`;
  const tables = new Map(facts.tables.map((t) => [t.name, t]));
  for (const [name, attrs] of d.entities) {
    const t = tables.get(name);
    if (!t) {
      out.push(`${at}: ${name} is not a table`);
      continue;
    }
    if (attrs.length === 0) continue;
    if (attrs.map((a) => a.name).join(",") !== t.columns.map((c) => c.name).join(",")) out.push(`${at}: ${name} lists (${attrs.map((a) => a.name).join(", ")}), the table has (${t.columns.map((c) => c.name).join(", ")})`);
    for (const a of attrs) {
      const c = t.columns.find((x) => x.name === a.name);
      if (!c) continue;
      if (a.type.toUpperCase() !== c.type.toUpperCase()) out.push(`${at}: ${name}.${a.name} is ${c.type}, the diagram says ${a.type}`);
      const isFk = t.foreignKeys.some((k) => k.columns.some((p) => p.from === a.name));
      if (a.keys.includes("PK") !== c.primaryKey) out.push(`${at}: ${name}.${a.name} ${c.primaryKey ? "is" : "is not"} a primary key, the diagram says the opposite`);
      if (a.keys.includes("FK") !== isFk) out.push(`${at}: ${name}.${a.name} ${isFk ? "is" : "is not"} part of a foreign key, the diagram says the opposite`);
    }
  }
  for (const r of d.relationships) {
    const child = tables.get(r.child);
    const keys = child?.foreignKeys.filter((k) => k.table === r.parent) ?? [];
    if (keys.length === 0) {
      out.push(`${at}: ${r.child} has no foreign key to ${r.parent}`);
      continue;
    }
    const mandatory = keys.some((k) => k.columns.every((p) => child!.columns.find((c) => c.name === p.from)?.notNull));
    if (mandatory === r.optional) out.push(`${at}: ${r.child} to ${r.parent} is ${mandatory ? "mandatory (NOT NULL)" : "optional (a nullable column)"}, the diagram says ${r.optional ? "optional" : "mandatory"}`);
  }
  return out;
}

/** The foreign keys (child and parent table) that no diagram draws. */
export function undrawnRelationships(diagrams: ErDiagram[], facts: SchemaFacts): string[] {
  const drawn = new Set(diagrams.flatMap((d) => d.relationships.map((r) => `${r.child}>${r.parent}`)));
  const out = new Set<string>();
  for (const t of facts.tables) for (const k of t.foreignKeys) if (!drawn.has(`${t.name}>${k.table}`)) out.add(`${t.name} to ${k.table}`);
  return [...out];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lists in the document that the code can contradict

/** The table under the first heading whose title matches. */
export function tableUnder(markdown: string, title: RegExp, index = 0): MdTable | null {
  const s = parseSections(markdown).find((x) => title.test(x.title));
  if (!s) return null;
  return parseTables(s.body, s.bodyLine).tables[index] ?? null;
}

/** The first code span of a column of a table, one for each row. A row without one is named in the problem list. */
export function firstSpans(t: MdTable, column = 0): { values: string[]; problems: string[] } {
  const values: string[] = [];
  const problems: string[] = [];
  for (const r of t.rows) {
    const v = codeSpans(r.cells[column] ?? "")[0];
    if (v === undefined) problems.push(`line ${r.line}: the cell has no code span`);
    else values.push(v);
  }
  return { values, problems };
}

/** What is missing from a list, what is extra in it, and what is in it twice, each named. */
export function compareSets(what: string, documented: string[], real: string[]): string[] {
  const out: string[] = [];
  const d = new Set(documented);
  const r = new Set(real);
  for (const x of r) if (!d.has(x)) out.push(`${what}: ${x} is in the code and not in the document`);
  for (const x of d) if (!r.has(x)) out.push(`${what}: ${x} is in the document and not in the code`);
  const seen = new Set<string>();
  for (const x of documented) (seen.has(x) ? out.push(`${what}: ${x} is listed twice`) : seen.add(x));
  return out;
}

/**
 * The audit event names a set of source files can write: literal names given to recordAudit, auditIfChanged, the platform's company and
 * operator checks, and a module's own refusal helper; and names built with a template (kept apart, with the placeholder in them).
 */
export function auditEventNames(files: { path: string; text: string }[]): { literal: string[]; templates: string[] } {
  const literal = new Set<string>();
  const templates = new Set<string>();
  const patterns = [
    /(?:recordAudit|auditIfChanged)\(\s*[\w.]+,\s*(?:"([^"]+)"|`([^`]+)`)/g,
    /authorize(?:CompanyRead|CompanyWrite)\(\s*request,\s*env,\s*\w+,\s*"([^"]+)"/g,
    /authorizeOperator\(\s*request,\s*env,\s*"([^"]+)"/g,
    /\brefuse\(\s*[\w.]+,\s*"([^"]+)"/g,
  ];
  for (const f of files) {
    for (const re of patterns) {
      for (const m of f.text.matchAll(re)) {
        const name = m[1] ?? m[2];
        if (name === undefined) continue;
        (name.includes("${") ? templates : literal).add(name);
      }
    }
  }
  return { literal: [...literal].sort(), templates: [...templates].sort() };
}

/** Whole-number constants declared as `export const NAME = 64 * 1024;` or `= 100_000_000;`, by name. Anything else is left out. */
export function constantNumbers(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of text.matchAll(/^(?:export )?const ([A-Z][A-Z0-9_]*)(?::\s*number)? = (\d[\d_]*(?: \* \d[\d_]*)*);/gm)) {
    out[m[1]!] = m[2]!.split(" * ").reduce((n, part) => n * Number(part.replaceAll("_", "")), 1);
  }
  return out;
}
