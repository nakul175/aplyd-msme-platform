// The data-dictionary reader: what it accepts, what it refuses, and that the comparison with the database fails when the document and the
// database part (a table, a column, a trigger, a key, an index, a diagram). The fixtures are small invented ones; the real document and the
// real database are compared in tests/static/dictionary-sync.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditEventNames,
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
  parseTables,
  tableOwners,
  tableUnder,
  triggerParts,
  undrawnRelationships,
  unknownReferences,
  withoutFences,
} from "../../src/dictionary.ts";
import type { SchemaFacts } from "../../src/dictionary.ts";

const COLS = "| Column | Type | Null | Default | Key | Meaning | Allowed values and limits | Written by | Enforced in |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |";
const TRIG = "| Trigger | Event | Migration | Module | Rule | Message |\n| --- | --- | --- | --- | --- | --- |";
const IDX = "| Index | Columns | Unique | Condition | Purpose |\n| --- | --- | --- | --- | --- |";

const DOC = `# Fixture dictionary

## 3. Diagrams

\`\`\`mermaid
erDiagram
    things ||--o{ thing_events : "has"
    things {
        TEXT id PK
        TEXT label
    }
    thing_events {
        INTEGER id PK
        TEXT thing_id FK
        TEXT kind
    }
\`\`\`

## 4. Tables

### things

- Purpose: A parent row.
- Owner module: alpha
- Scope: global
- Append-only: no
- Created in: migration 0001

${COLS}
| \`id\` | TEXT | no | none | PK | The identifier. | Any text. | seed | primary key |
| \`label\` | TEXT | yes | \`''\` | none | A label. | Up to 10 characters. | seed | handler |

### thing_events

- Purpose: What happened to a thing.
- Owner module: alpha
- Scope: company
- Append-only: yes (three triggers)
- Created in: migration 0002

${COLS}
| \`id\` | INTEGER | no | none | PK | The identifier. | Whole number. | database | primary key |
| \`thing_id\` | TEXT | no | none | FK things(id) | The thing. | A thing. | handler | foreign key |
| \`kind\` | TEXT | no | none | none | The kind. | \`open\` or \`closed\`. | handler | \`thing_events_one_close\` |

${IDX}
| \`thing_events_thing\` | \`thing_id\` | no | none | Look-up. |
| \`thing_events_one_close\` | \`thing_id\` | yes | \`kind = 'closed'\` | One close each. |

### Triggers on thing_events

${TRIG}
| \`thing_events_no_update\` | BEFORE UPDATE | 0002 | alpha | Refuses a change. | \`thing_events is append-only\` |
| \`thing_events_no_delete\` | BEFORE DELETE | 0002 | alpha | Refuses a removal. | \`thing_events is append-only\` |
| \`thing_events_no_replace\` | BEFORE INSERT | 0002 | alpha | Refuses a replacement. | \`thing_events is append-only\` |
| \`thing_events_one_close\` | BEFORE INSERT | 0003 | alpha | One close each. | \`already closed\` |
`;

const FACTS: SchemaFacts = {
  tables: [
    {
      name: "things",
      columns: [
        { name: "id", type: "TEXT", notNull: true, default: null, primaryKey: true },
        { name: "label", type: "TEXT", notNull: false, default: "''", primaryKey: false },
      ],
      foreignKeys: [],
      indexes: [],
      checks: [],
      ownerModule: "alpha",
      createdIn: "0001",
    },
    {
      name: "thing_events",
      columns: [
        { name: "id", type: "INTEGER", notNull: true, default: null, primaryKey: true },
        { name: "thing_id", type: "TEXT", notNull: true, default: null, primaryKey: false },
        { name: "kind", type: "TEXT", notNull: true, default: null, primaryKey: false },
      ],
      foreignKeys: [{ table: "things", columns: [{ from: "thing_id", to: "id" }] }],
      indexes: [
        { name: "thing_events_thing", unique: false, columns: ["thing_id"], condition: null },
        { name: "thing_events_one_close", unique: true, columns: ["thing_id"], condition: "kind = 'closed'" },
      ],
      checks: ["thing_events_kind"],
      ownerModule: "alpha",
      createdIn: "0002",
    },
  ],
  triggers: [
    { name: "thing_events_no_update", table: "thing_events", timing: "BEFORE", event: "UPDATE", message: "thing_events is append-only", createdIn: "0002" },
    { name: "thing_events_no_delete", table: "thing_events", timing: "BEFORE", event: "DELETE", message: "thing_events is append-only", createdIn: "0002" },
    { name: "thing_events_no_replace", table: "thing_events", timing: "BEFORE", event: "INSERT", message: "thing_events is append-only", createdIn: "0002" },
    { name: "thing_events_one_close", table: "thing_events", timing: "BEFORE", event: "INSERT", message: "already closed", createdIn: "0003" },
  ],
};
const facts = (change: (f: SchemaFacts) => void): SchemaFacts => {
  const f = structuredClone(FACTS);
  change(f);
  return f;
};
const problems = (doc: string, f: SchemaFacts = FACTS) => compareDictionary(parseDictionary(doc), f);
const mutate = (from: string, to: string) => {
  assert.ok(DOC.includes(from), `the fixture does not contain: ${from}`);
  return DOC.replace(from, to);
};

// ---- reading Markdown

test("headings are found, and a hash line inside a fenced block is not a heading", () => {
  const s = parseSections("# One\ntext\n```\n# not a heading\n```\n## Two\nmore");
  assert.deepEqual(s.map((x) => [x.level, x.title]), [[1, "One"], [2, "Two"]]);
  assert.equal(s[1]!.line, 6);
});

test("a table is read with its line numbers; a ragged row is a problem and not a row; a fenced table is skipped", () => {
  const lines = ["text", "| A | B |", "| --- | --- |", "| 1 | 2 |", "| 3 | 4 | 5 |", "", "```", "| X | Y |", "| --- | --- |", "| 1 | 2 |", "```"];
  const { tables, problems: p } = parseTables(lines, 10);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0]!.rows.map((r) => [r.cells, r.line]), [[["1", "2"], 13]]);
  assert.equal(p.length, 1);
  assert.match(p[0]!, /line 14: 3 cells, expected 2/);
});

test("fences are removed before names are looked for in prose", () => {
  assert.equal(withoutFences("a `x`\n```\n`y`\n```\nb `z`").includes("`y`"), false);
  assert.ok(withoutFences("a `x`\n```\n`y`\n```\nb `z`").includes("`z`"));
});

// ---- the dictionary

test("a well-formed dictionary is read into tables, columns, indexes and triggers", () => {
  const d = parseDictionary(DOC);
  assert.deepEqual(d.tables.map((t) => t.name), ["things", "thing_events"]);
  const t = d.tables[1]!;
  assert.equal(t.appendOnly, true);
  assert.equal(t.createdIn, "0002");
  assert.deepEqual(t.columns.map((c) => [c.name, c.type, c.nullable, c.default, c.key]), [
    ["id", "INTEGER", false, null, ["PK"]],
    ["thing_id", "TEXT", false, null, ["FK things(id)"]],
    ["kind", "TEXT", false, null, []],
  ]);
  assert.equal(d.tables[0]!.columns[1]!.default, "''");
  assert.deepEqual(t.indexes.map((i) => [i.name, i.columns, i.unique, i.condition]), [["thing_events_thing", ["thing_id"], false, null], ["thing_events_one_close", ["thing_id"], true, "kind = 'closed'"]]);
  assert.deepEqual(d.triggers.map((x) => [x.name, x.table, x.event, x.migration, x.message]).at(-1), ["thing_events_one_close", "thing_events", "BEFORE INSERT", "0003", "already closed"]);
});

test("the dictionary and the database agree on the fixture", () => {
  assert.deepEqual(problems(DOC), []);
});

test("every kind of malformed section is named, all at once", () => {
  const bad = DOC.replace("- Purpose: A parent row.\n", "")
    .replace("- Append-only: yes (three triggers)", "- Append-only: maybe")
    .replace("| `label` | TEXT | yes |", "| `label` | text | perhaps |")
    .replace("| `id` | TEXT | no | none | PK |", "| id | TEXT | no | none | PK |")
    .replace("| `kind` | TEXT | no | none | none |", "| `kind` | TEXT | no | `x | none | oops |")
    .replace("| 0002 | alpha | Refuses a change.", "| 2 | alpha | Refuses a change.");
  assert.throws(
    () => parseDictionary(bad),
    (e: Error) => {
      assert.match(e.message, /things: no "- Purpose: \.\.\." line/);
      assert.match(e.message, /thing_events: "Append-only" must start with yes or no/);
      assert.match(e.message, /Null must be yes or no, not "perhaps"/);
      assert.match(e.message, /the type must be an upper-case SQLite type, not "text"/);
      assert.match(e.message, /the column name must be one code span, not "id"/);
      assert.match(e.message, /cells, expected 9; a "\|" inside a cell breaks a row/);
      assert.match(e.message, /Migration must be four digits, not "2"/);
      return true;
    },
  );
});

test("the headings of the column table are fixed, and so are the Default and Key spellings", () => {
  assert.throws(() => parseDictionary(DOC.replace("| Column | Type | Null |", "| Column | Kind | Null |")), /the column table's headings must be/);
  assert.throws(() => parseDictionary(DOC.replace("| `label` | TEXT | yes | `''` | none |", "| `label` | TEXT | yes | '' | none |")), /Default must be "none" or one code span/);
  assert.throws(() => parseDictionary(DOC.replace("FK things(id)", "FK things")), /Key must be "none" or items/);
  assert.throws(() => parseDictionary(DOC.replace("| Index | Columns | Unique |", "| Index | Columns | Distinct |")), /the index table's headings must be/);
  assert.throws(() => parseDictionary(DOC.replace("| Trigger | Event | Migration |", "| Trigger | When | Migration |")), /the trigger table's headings must be/);
});

test("a section listed twice, a trigger listed twice, and a trigger message that is not one code span are refused", () => {
  const twice = `${DOC}\n### things\n\n- Purpose: x\n- Owner module: alpha\n- Scope: global\n- Append-only: no\n- Created in: migration 0001\n\n${COLS}\n| \`id\` | TEXT | no | none | PK | m | l | w | e |\n`;
  assert.throws(() => parseDictionary(twice), /things: the section appears twice/);
  assert.throws(() => parseDictionary(mutate("| `thing_events_no_delete` | BEFORE DELETE", "| `thing_events_no_update` | BEFORE DELETE")), /thing_events_no_update: the trigger is listed twice/);
  assert.throws(() => parseDictionary(mutate("| `already closed` |", "| already closed |")), /Message must be the exact text the trigger raises/);
});

// ---- comparing it with the database

test("a table with no section, and a section for a table that does not exist, are both found", () => {
  assert.match(problems(DOC, facts((f) => f.tables.push({ ...structuredClone(FACTS.tables[0]!), name: "extra" })))[0]!, /table extra has no section/);
  const extraSection = `${DOC}\n### ghosts\n\n- Purpose: x\n- Owner module: alpha\n- Scope: global\n- Append-only: no\n- Created in: migration 0001\n\n${COLS}\n| \`id\` | TEXT | no | none | PK | m | l | w | e |\n`;
  assert.match(problems(extraSection).join("\n"), /section for ghosts, which is not a table/);
});

test("a column missing from its section, a column the table no longer has, a different order, type, null, default or key are each found", () => {
  assert.match(problems(DOC, facts((f) => f.tables[0]!.columns.push({ name: "extra", type: "TEXT", notNull: false, default: null, primaryKey: false })))[0]!, /things: column extra is not in its section/);
  assert.match(problems(DOC, facts((f) => f.tables[0]!.columns.pop()))[0]!, /the section names column label, which the table does not have/);
  assert.match(problems(DOC, facts((f) => f.tables[0]!.columns.reverse())).join("\n"), /listed in a different order/);
  assert.match(problems(DOC, facts((f) => (f.tables[0]!.columns[0]!.type = "INTEGER")))[0]!, /things\.id: the type is INTEGER, the dictionary says TEXT/);
  assert.match(problems(DOC, facts((f) => (f.tables[0]!.columns[1]!.notNull = true)))[0]!, /things\.label: the column is NOT NULL, the dictionary says nullable/);
  assert.match(problems(DOC, facts((f) => (f.tables[0]!.columns[1]!.default = "'x'")))[0]!, /things\.label: the default is 'x', the dictionary says ''/);
  assert.match(problems(DOC, facts((f) => (f.tables[1]!.foreignKeys = [])))[0]!, /thing_events\.thing_id: the key is "none", the dictionary says "FK things\(id\)"/);
  assert.match(problems(DOC, facts((f) => (f.tables[0]!.columns[1]!.primaryKey = true)))[0]!, /things\.label: the key is "PK"/);
});

test("an index that changed, vanished or appeared is found", () => {
  assert.match(problems(DOC, facts((f) => (f.tables[1]!.indexes[0]!.columns = ["kind"])))[0]!, /index thing_events_thing is on \(kind\)/);
  assert.match(problems(DOC, facts((f) => (f.tables[1]!.indexes[0]!.unique = true)))[0]!, /index thing_events_thing is unique/);
  assert.match(problems(DOC, facts((f) => (f.tables[1]!.indexes[1]!.condition = "kind = 'open'")))[0]!, /has the condition kind = 'open', the dictionary says kind = 'closed'/);
  assert.match(problems(DOC, facts((f) => f.tables[1]!.indexes.pop()))[0]!, /the section names index thing_events_one_close, which the table does not have/);
  assert.match(problems(DOC, facts((f) => f.tables[1]!.indexes.push({ name: "new_idx", unique: false, columns: ["kind"], condition: null })))[0]!, /index new_idx is not in its section/);
});

test("append-only, the migration that creates a table and the module that owns it are checked", () => {
  assert.ok(problems(DOC, facts((f) => f.triggers.splice(0, 1))).some((p) => /thing_events: the table is not append-only/.test(p)));
  assert.ok(problems(DOC, facts((f) => (f.tables[0]!.createdIn = "0009"))).some((p) => /things: it is created in migration 0009, the dictionary says 0001/.test(p)));
  assert.ok(problems(DOC, facts((f) => (f.tables[0]!.ownerModule = "beta"))).some((p) => /things: its schema is in the beta module, the dictionary says alpha/.test(p)));
});

test("a trigger absent from the catalogue, one the database lacks, and one that differs in table, event, migration, message or module are found", () => {
  assert.match(problems(DOC, facts((f) => f.triggers.push({ name: "thing_events_new", table: "thing_events", timing: "BEFORE", event: "INSERT", message: "x", createdIn: "0004" })))[0]!, /trigger thing_events_new \(on thing_events\) is not in the catalogue/);
  assert.match(problems(DOC, facts((f) => f.triggers.pop())).join("\n"), /the catalogue names trigger thing_events_one_close, which the migrated database does not have/);
  assert.match(problems(DOC, facts((f) => (f.triggers[3]!.timing = "AFTER")))[0]!, /it is AFTER INSERT, the catalogue says BEFORE INSERT/);
  assert.match(problems(DOC, facts((f) => (f.triggers[3]!.createdIn = "0014")))[0]!, /its current text is in migration 0014, the catalogue says 0003/);
  assert.match(problems(DOC, facts((f) => (f.triggers[3]!.message = "already shut")))[0]!, /it raises "already shut", the catalogue says "already closed"/);
  assert.match(problems(DOC, facts((f) => (f.tables[1]!.ownerModule = "beta"))).join("\n"), /its table belongs to the beta module/);
  assert.match(problems(DOC, facts((f) => (f.triggers[3]!.table = "things")))[0]!, /it is on things, the catalogue lists it under thing_events/);
});

test("a rename in the database is found from both sides at once", () => {
  const f = facts((x) => {
    x.triggers[3]!.name = "thing_events_single_close";
    x.tables[0]!.columns[1]!.name = "caption";
  });
  const p = problems(DOC, f).join("\n");
  assert.match(p, /trigger thing_events_single_close \(on thing_events\) is not in the catalogue/);
  assert.match(p, /the catalogue names trigger thing_events_one_close, which the migrated database does not have/);
  assert.match(p, /things: column caption is not in its section/);
  assert.match(p, /the section names column label, which the table does not have/);
});

test("prose that names a column, index, trigger or check that is not there is found; names that are there are not", () => {
  assert.deepEqual(unknownReferences("The `things.label` is checked by `thing_events_kind` and `thing_events_one_close`; see `thing_events_thing`. A `kind` of `open`.", FACTS), []);
  assert.match(unknownReferences("It reads `things.caption`.", FACTS)[0]!, /things has no column caption/);
  assert.match(unknownReferences("The trigger `thing_events_single_close` refuses it.", FACTS)[0]!, /thing_events_single_close: looks like a name from the database/);
  assert.deepEqual(unknownReferences("```\n`thing_events_gone`\n```\nNothing else.", FACTS), [], "a fenced example is not prose");
  assert.deepEqual(unknownReferences("The `thing_events_gone` is explained here.", FACTS, ["thing_events_gone"]), [], "a name the caller says is known");
  assert.deepEqual(unknownReferences("The audit event `things.created` is written.", FACTS, ["things.created"]), [], "a dotted name the caller says is known is an event, not a column");
  assert.match(unknownReferences("The audit event `things.created` is written.", FACTS)[0]!, /things has no column created/);
});

// ---- what the migration files say

test("the migration that creates a table, and the latest that creates a trigger, are found; a file without a number is refused", () => {
  const idx = migrationIndex([
    { name: "0000_init.sql", text: "CREATE TABLE `a` (\n x\n);\n--> statement-breakpoint\nCREATE TABLE `b` (\n x\n);" },
    { name: "0001_x.sql", text: "CREATE TRIGGER a_no_update BEFORE UPDATE ON a\nBEGIN\nEND;\n--> statement-breakpoint\nCREATE TRIGGER a_old BEFORE INSERT ON a\nBEGIN\nEND;" },
    { name: "0002_y.sql", text: "DROP TRIGGER a_old;\nCREATE TRIGGER a_old BEFORE INSERT ON a\nBEGIN\nEND;\nCREATE TABLE `c` (x);" },
  ]);
  assert.deepEqual(idx.tables, { a: "0000", b: "0000", c: "0002" });
  assert.deepEqual(idx.triggers, { a_no_update: "0001", a_old: "0002" });
  assert.throws(() => migrationIndex([{ name: "init.sql", text: "" }]), /four digits/);
});

test("which module defines a table is read from the schema files", () => {
  const owners = tableOwners([
    { path: "modules/alpha/src/db/schema.ts", text: 'export const a = sqliteTable("things", {});\nexport const b = sqliteTable(\n  "thing_events",\n  {});' },
    { path: "modules/beta/src/db/schema.ts", text: 'sqliteTable("others", {})' },
    { path: "docs/x.ts", text: 'sqliteTable("stray", {})' },
  ]);
  assert.deepEqual(owners, { things: "alpha", thing_events: "alpha", others: "beta" });
});

test("a trigger's event, timing and message are read from its SQL, and a partial index's condition from its SQL", () => {
  assert.deepEqual(triggerParts("CREATE TRIGGER t BEFORE INSERT ON x\nWHEN NEW.a = 1\nBEGIN\n  SELECT RAISE(ABORT, 'it''s refused');\nEND"), { timing: "BEFORE", event: "INSERT", message: "it's refused" });
  assert.throws(() => triggerParts("CREATE TABLE x (a)"), /not a trigger/);
  assert.equal(indexCondition(`CREATE UNIQUE INDEX \`i\` ON \`t\` (\`a\`) WHERE "t"."kind" = 'signoff'`), "kind = 'signoff'");
  assert.equal(indexCondition("CREATE INDEX `i` ON `t` (`a`)"), null);
});

// ---- diagrams

const DIAGRAM = DOC.split("```mermaid\n")[1]!.split("```")[0]!;

test("the diagram blocks of a document are found by their fence", () => {
  const blocks = erBlocks(DOC);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.line, 5);
  assert.equal(erBlocks("```mermaid\nflowchart LR\n  a --> b\n```").length, 0, "only an erDiagram counts");
});

test("a diagram that matches the database passes; a table, a key, a type, a column or a cardinality that does not is found", () => {
  assert.deepEqual(compareEr(parseEr(DIAGRAM, 5), FACTS), []);
  assert.match(compareEr(parseEr(DIAGRAM.replace("things {", "gadgets {"), 5), FACTS).join("\n"), /gadgets is not a table/);
  assert.match(compareEr(parseEr(DIAGRAM.replace("||--o{", "|o--o{"), 5), FACTS).join("\n"), /thing_events to things is mandatory \(NOT NULL\), the diagram says optional/);
  assert.match(compareEr(parseEr(DIAGRAM.replace("INTEGER id PK", "TEXT id PK"), 5), FACTS)[0]!, /thing_events\.id is INTEGER, the diagram says TEXT/);
  assert.match(compareEr(parseEr(DIAGRAM.replace("TEXT thing_id FK", "TEXT thing_id"), 5), FACTS)[0]!, /thing_events\.thing_id is part of a foreign key/);
  assert.match(compareEr(parseEr(DIAGRAM.replace("        TEXT kind\n", ""), 5), FACTS)[0]!, /thing_events lists \(id, thing_id\), the table has \(id, thing_id, kind\)/);
  assert.match(compareEr(parseEr(DIAGRAM.replace("things ||--o{ thing_events", "thing_events ||--o{ things"), 5), FACTS)[0]!, /things has no foreign key to thing_events/);
});

test("a diagram written in another style is refused, and an unclosed block is named", () => {
  assert.throws(() => parseEr("erDiagram\n  a --> b", 3), /not a relationship/);
  assert.throws(() => parseEr("erDiagram\n  a {\n    one_word_only\n  }", 3), /an attribute reads "type name \[PK, FK\]"/);
  assert.throws(() => parseEr("erDiagram\n  a {\n    TEXT id", 3), /the block of a is never closed/);
});

test("a foreign key that no diagram draws is found", () => {
  assert.deepEqual(undrawnRelationships([parseEr(DIAGRAM, 5)], FACTS), []);
  assert.deepEqual(undrawnRelationships([parseEr("erDiagram\n  things {\n    TEXT id PK\n  }", 5)], FACTS), ["thing_events to things"]);
});

// ---- lists the code can contradict

test("the first code span of a column of a table under a heading is read; a cell without one is named", () => {
  const md = "## 5. Lists\n\n| Name | Note |\n| --- | --- |\n| `a` and `b` | x |\n| none | y |\n| `c` | z |\n\n## 6. Other\n";
  const t = tableUnder(md, /^5\. Lists/);
  assert.ok(t);
  const { values, problems: p } = firstSpans(t, 0);
  assert.deepEqual(values, ["a", "c"]);
  assert.match(p[0]!, /line 6: the cell has no code span/);
  assert.equal(tableUnder(md, /^7\./), null);
});

test("two lists are compared: missing, extra and repeated entries are each named", () => {
  assert.deepEqual(compareSets("kinds", ["a", "b"], ["b", "a"]), []);
  assert.deepEqual(compareSets("kinds", ["a", "z"], ["a", "b"]), ["kinds: b is in the code and not in the document", "kinds: z is in the document and not in the code"]);
  assert.deepEqual(compareSets("kinds", ["a", "a"], ["a"]), ["kinds: a is listed twice"]);
});

test("audit event names are read from every way the code writes one, and template names are kept apart", () => {
  const found = auditEventNames([
    {
      path: "x.ts",
      text: [
        'await recordAudit(env.DB, "session.created", { userId });',
        'const a = auditIfChanged(db, "assessment.created", { userId });',
        "const b = auditIfChanged(db, `engagement.${kind}`, { userId });",
        'authorizeCompanyRead(request, env, requestedId, "factory.read.denied")',
        'await authorizeCompanyWrite(request, env, requestedId, "factory.write.denied");',
        'authorizeOperator(request, env, "operator.read.denied", false)',
        'await refuse(env.DB, "company.read.denied", identity, requestedId);',
        "export async function authorizeCompanyRead(request: Request, env: AppEnv, requestedId: string, event: string)",
        "recordAudit(db, event, { userId })",
      ].join("\n"),
    },
  ]);
  assert.deepEqual(found.literal, ["assessment.created", "company.read.denied", "factory.read.denied", "factory.write.denied", "operator.read.denied", "session.created"]);
  assert.deepEqual(found.templates, ["engagement.${kind}"]);
});

test("whole-number constants are read, including products and digit separators; other constants are left alone", () => {
  assert.deepEqual(constantNumbers("export const MAX_BODY_CHARACTERS = 64 * 1024;\nexport const MAX_FEE_INR = 10_000_000;\nconst FLOOR: number = 5;\nexport const NAME = \"x\";\nexport const ratio = 3;\nexport const SUM = 1 + 2;"), { MAX_BODY_CHARACTERS: 65536, MAX_FEE_INR: 10000000, FLOOR: 5 });
});
