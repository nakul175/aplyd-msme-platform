// Rules read from the source and the migrations, not from behaviour: how engagements may be queried, that nothing a provider
// does or is paid changes what APLYD earns (D-03), and that every message the API sends a form post back with has a place on the
// page. They are tripwires, like the header rule: they read SQL written as string literals and cannot see SQL built at run time.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { ROOT, applicationFiles, problemsWith, sqlMentioning } from "../../../platform/tests/support/sql-rules.ts";

const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");
const DELIVER_TABLES = ["engagements", "milestones", "engagement_events"];
const DATA_LAYER = "modules/deliver/src/db/engagements.ts";
// A string that names a table and is not SQL (an import path such as "../db/engagements.ts") does not count.
const queries = (file: string, table: string) => sqlMentioning(file, read(file), table).filter((m) => /\b(SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(m.sql));
const changes = (file: string, table: string) => queries(file, table).filter((m) => /\b(UPDATE|DELETE|REPLACE)\b/i.test(m.sql) || /\bINSERT OR\b/i.test(m.sql));
/** The one shared fragment of the read statements: it has no WHERE of its own, and every use of it adds one. */
const FRAGMENT = /^SELECT g\.id, g\.requirement_id/;

test("no query anywhere changes, deletes or replaces a row of an engagement table: they are append-only", () => {
  const all = applicationFiles();
  assert.ok(all.includes(DATA_LAYER), "the data layer is among the scanned files");
  for (const table of DELIVER_TABLES) {
    assert.ok(all.flatMap((f) => queries(f, table)).length >= 2, `the scan finds queries on ${table}`);
    assert.deepEqual(all.flatMap((f) => changes(f, table).map((m) => `${f}:${m.line}`)), [], table);
  }
});

test("every read of an engagement table is bound to one company; the shared fragment is only ever used with a company in the WHERE", () => {
  const all = applicationFiles();
  for (const table of DELIVER_TABLES) {
    const unbound = all.flatMap((f) => problemsWith(f, read(f), table).filter((p) => !isFragment(f, p)));
    assert.deepEqual(unbound, [], table);
  }
  const uses = sqlMentioning(DATA_LAYER, read(DATA_LAYER), "SELECT_ENGAGEMENTS");
  assert.ok(uses.length >= 2, "the fragment is used by the list and by the single read");
  for (const m of uses) assert.match(m.sql.replace(/\s+/g, " "), /WHERE g\.company_id = \?/, `${DATA_LAYER}:${m.line} adds the company to the fragment`);
});

function isFragment(file: string, problem: string): boolean {
  const line = Number(/:(\d+) /.exec(problem)?.[1]);
  return file === DATA_LAYER && queries(file, "engagements").some((m) => m.line === line && FRAGMENT.test(m.sql.trim()));
}

test("every INSERT into an engagement table binds the company and checks the parent row belongs to it, in the same statement", () => {
  const inserts = DELIVER_TABLES.flatMap((t) => queries(DATA_LAYER, t).filter((m) => new RegExp(`^\\s*INSERT INTO\\s+${t}\\b`, "i").test(m.sql)).map((m) => ({ t, ...m })));
  assert.deepEqual(inserts.map((i) => i.t).sort(), ["engagement_events", "engagements", "milestones"], "one INSERT for each table, and no other");
  for (const m of inserts) {
    const sql = m.sql.replace(/\s+/g, " ");
    assert.match(sql, /\bcompany_id\b/, `${m.line} writes the company`);
    assert.match(sql, /WHERE EXISTS \(SELECT 1 FROM \w+ WHERE id = \? AND company_id = \?\)/, `${m.line} checks the parent is the company's`);
  }
});

// The run module records measurements against an engagement. Its one statement that names an engagement table is the INSERT that
// checks, in the same statement, that the engagement is the company's: the same check this module's own inserts make. It may do that
// and nothing else with them.
const RUN_FILE = "modules/run/src/db/outcomes.ts";
const isRunInsert = (f: string, sql: string) =>
  f === RUN_FILE && /^INSERT INTO outcome_events\b/.test(sql.trim()) && /WHERE EXISTS \(SELECT 1 FROM engagements WHERE id = \? AND company_id = \?\)$/.test(sql.replace(/\s+/g, " ").trim());

test("the engagement tables are touched only by the deliver data layer: no page, route or other module queries them, apart from the run module's insert that checks the engagement is the company's", () => {
  for (const f of applicationFiles()) {
    if (f === DATA_LAYER) continue;
    for (const table of DELIVER_TABLES) assert.deepEqual(queries(f, table).filter((m) => !isRunInsert(f, m.sql)), [], `${f} ${table}`);
  }
  const exception = queries(RUN_FILE, "engagements");
  assert.equal(exception.length, 1, "the run module names an engagement table once");
  assert.ok(isRunInsert(RUN_FILE, exception[0].sql), "and in that one shape");
  for (const table of ["milestones", "engagement_events"]) assert.deepEqual(queries(RUN_FILE, table), [], `the run module does not query ${table}`);
});

// ---- D-03: nothing recorded here can change what APLYD earns, and no revenue line depends on the provider chosen

type Column = { table: string; column: string };
function columnsInMigrations(): Column[] {
  const out: Column[] = [];
  for (const file of readdirSync(`${ROOT}drizzle`).filter((f) => f.endsWith(".sql")).sort()) {
    const text = readFileSync(`${ROOT}drizzle/${file}`, "utf8");
    for (const m of text.matchAll(/CREATE TABLE `(\w+)` \(([\s\S]*?)\n\);/g)) {
      for (const line of m[2].split("\n")) {
        const col = /^\s*`(\w+)`\s+(text|integer|real|blob|numeric)\b/i.exec(line);
        if (col) out.push({ table: m[1], column: col[1] });
      }
    }
  }
  return out;
}
const MONEY_WORDS = new Set(["fee", "fees", "price", "amount", "cost", "costs", "paise", "rupee", "rupees", "inr", "payment", "commission", "percent", "percentage", "pct", "rate", "margin", "revenue", "rebate", "referral", "incentive", "discount", "take", "markup", "royalty", "payout"]);
const isMoneyColumn = (name: string) => name.split("_").some((w) => MONEY_WORDS.has(w));

test("the money columns are the listing fee in the terms, its copy on a listing, the owner's own agreed price on a milestone, and the amount the owner says they paid", () => {
  const money = columnsInMigrations().filter((c) => isMoneyColumn(c.column)).map((c) => `${c.table}.${c.column}`).sort();
  assert.deepEqual(money, ["engagement_events.amount_inr", "listing_terms.fee_inr", "milestones.agreed_inr", "provider_events.fee_inr"]);
});

test("the engagement tables hold what was chosen, planned and recorded, and no fee, share, commission or reference to the listing", () => {
  const columns = columnsInMigrations();
  const of = (table: string) => columns.filter((c) => c.table === table).map((c) => c.column);
  assert.deepEqual(of("engagements"), ["id", "company_id", "requirement_id", "provider_id", "created_at", "created_by"]);
  assert.deepEqual(of("milestones"), ["id", "engagement_id", "company_id", "seq", "title", "acceptance_test", "due_on", "agreed_inr", "created_at", "created_by"]);
  assert.deepEqual(of("engagement_events"), ["id", "engagement_id", "company_id", "at", "user_id", "kind", "milestone_id", "amount_inr", "note"]);
});

test("no statement reads a price or a payment recorded here together with the listing fee or the listing terms, and none reads one across companies", () => {
  // The only things that carry APLYD's earnings are listing_terms.fee_inr and provider_events.fee_inr. A statement that read both
  // those and the owner's own prices could make one depend on the other.
  for (const f of applicationFiles()) {
    const text = read(f);
    for (const table of ["milestones", "engagement_events"]) {
      for (const m of queries(f, table)) {
        const sql = m.sql.replace(/\s+/g, " ");
        assert.ok(!/\bfee_inr\b|\blisting_terms\b|\bprovider_events\b/.test(sql), `${f}:${m.line} reads ${table} together with the listing fee`);
        if (/\b(SUM|AVG|MAX|MIN|COUNT)\s*\(\s*(\w+\.)?(agreed_inr|amount_inr)/i.test(sql)) assert.fail(`${f}:${m.line} aggregates a price or a payment`);
      }
    }
    if (f.startsWith("modules/deliver/")) assert.ok(!/\bfee_inr\b|\blisting_terms\b|currentTerms/.test(text), `${f} does not touch the listing fee`);
  }
});

// ---- the page and the API agree on every message

test("every ?problem= key the deliver API redirects with has a message on /deliver or /procure, and every message there is sent by something", () => {
  const api = read("modules/deliver/src/api/engagements.ts");
  const dbText = read(DATA_LAYER);
  const reasons = (type: string) => new Set([...(new RegExp(`export type ${type} = [^\\n]*`).exec(dbText)?.[0] ?? "").matchAll(/reason: ((?:"\w+"(?: \| )?)+)/g)].flatMap((m) => [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1])));
  const literal = (text: string, page: "deliver" | "procure") => new Set([...text.matchAll(new RegExp(`/${page}\\?problem=(\\w+)`, "g"))].map((m) => m[1]));
  const keysOf = (file: string) => {
    const block = /const PROBLEMS: Record<string, string> = \{([\s\S]*?)\n\};/.exec(read(file))?.[1] ?? "";
    return new Set([...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
  };

  // /deliver: the literal keys in the API (MISSING names one), and the reasons the data layer can give for adding a milestone and for an event
  const deliverSent = new Set([...literal(api, "deliver"), ...[...reasons("AddMilestoneResult"), ...reasons("EventResult")].filter((r) => r !== "not_found")]);
  const deliverShown = keysOf("app/deliver/page.tsx");
  assert.ok(deliverSent.size >= 9 && deliverShown.size >= 9, `the scan found ${deliverSent.size} keys sent and ${deliverShown.size} shown`);
  assert.deepEqual([...deliverSent].filter((k) => !deliverShown.has(k)).sort(), [], "sent, with no message on /deliver");
  assert.deepEqual([...deliverShown].filter((k) => !deliverSent.has(k)).sort(), [], "a /deliver message nothing sends");

  // /procure: what the engagement endpoint sends there, and what the requirement endpoints send
  const created = [...reasons("CreateResult")].filter((r) => r !== "not_found" && r !== "requirement_withdrawn"); // a withdrawn requirement is sent as "withdrawn", a key the requirement endpoints already use
  const procureSent = new Set([...literal(api, "procure"), ...created, ...[...read("modules/procure/src/api/requirements.ts").matchAll(/problem=(\w+)/g)].map((m) => m[1]), "engaged", "not_signed_off", "not_accepted", "previously_withdrawn"]); // the last three are the requirement data layer's reasons, sent as problem=${reason}
  const procureShown = keysOf("app/procure/page.tsx");
  assert.deepEqual([...procureSent].filter((k) => !procureShown.has(k)).sort(), [], "sent, with no message on /procure");
  assert.deepEqual([...procureShown].filter((k) => !procureSent.has(k)).sort(), [], "a /procure message nothing sends");
});

test("every ?saved= word the page can show is a kind of event the API can record, or the milestone", () => {
  const block = /const SAVED: Record<string, string> = \{([\s\S]*?)\n\};/.exec(read("app/deliver/page.tsx"))?.[1] ?? "";
  const shown = [...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(shown, ["accepted", "closed", "delivered", "milestone", "payment_recorded", "plan_agreed", "rejected"]);
  assert.match(read("modules/deliver/src/api/engagements.ts"), /saved=\$\{kind\}/);
  assert.match(read("modules/deliver/src/api/engagements.ts"), /saved=milestone/);
});
