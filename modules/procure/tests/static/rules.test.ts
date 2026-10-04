// Rules read from the source and the migrations, not from behaviour: how requirements may be queried, that the only read across
// companies returns counts, that no number below five companies can leave the module, and that nothing in the schema or the
// listing code lets APLYD's earnings depend on which provider is chosen (D-03). They are tripwires, like the header rule: they
// read SQL written as string literals and cannot see SQL built at run time.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { ROOT, applicationFiles, problemsWith, sqlMentioning } from "../../../platform/tests/support/sql-rules.ts";

const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");
const COMPANY_TABLES = ["requirements", "requirement_events"];
const REGISTRY_TABLES = ["providers", "provider_services", "provider_events", "listing_terms"];
const ALL_TABLES = [...COMPANY_TABLES, ...REGISTRY_TABLES];
const POOL_FILE = "modules/procure/src/db/pool.ts";
// A string that names a table and is not SQL (an import path such as "../db/requirements.ts") does not count.
const queries = (file: string, table: string) => sqlMentioning(file, read(file), table).filter((m) => /\b(SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(m.sql));
const changes = (file: string, table: string) => queries(file, table).filter((m) => /\b(UPDATE|DELETE|REPLACE)\b/i.test(m.sql) || /\bINSERT OR\b/i.test(m.sql));

test("no query anywhere changes, deletes or replaces a row of any procure table: they are append-only", () => {
  const all = applicationFiles();
  assert.ok(all.includes("modules/procure/src/db/requirements.ts") && all.includes("modules/procure/src/db/providers.ts"), "the data layer is among the scanned files");
  for (const table of ALL_TABLES) {
    assert.ok(all.flatMap((f) => queries(f, table)).length >= 2, `the scan finds queries on ${table}`);
    assert.deepEqual(all.flatMap((f) => changes(f, table).map((m) => `${f}:${m.line}`)), [], table);
  }
});

// The deliver module joins an engagement to its requirement and to the provider's public name. It may do that and nothing else
// with these tables: the fragment below is the whole of it, its join names the company, and its own static test requires every
// use of it to add the company to the WHERE.
const DELIVER_FILE = "modules/deliver/src/db/engagements.ts";
const isDeliverJoin = (f: string, sql: string) => f === DELIVER_FILE && /^SELECT g\.id, g\.requirement_id/.test(sql.trim());

test("every read of a company's requirements is bound to one company, except the two counting queries in pool.ts and the deliver module's join, which is bound through the engagement", () => {
  const all = applicationFiles();
  for (const table of COMPANY_TABLES) {
    const unbound = all
      .filter((f) => f !== POOL_FILE)
      .flatMap((f) => problemsWith(f, read(f), table).filter((p) => !(f === DELIVER_FILE && queries(f, table).some((m) => p.endsWith(`:${m.line} reads ${table} without "company_id = ?"`) && isDeliverJoin(f, m.sql)))));
    assert.deepEqual(unbound, [], table);
  }
  const join = queries(DELIVER_FILE, "requirements").find((m) => isDeliverJoin(DELIVER_FILE, m.sql))!;
  assert.ok(join, "the deliver join exists");
  assert.match(join.sql.replace(/\s+/g, " "), /JOIN requirements r ON r\.id = g\.requirement_id AND r\.company_id = g\.company_id/, "the join names the requirement and its company");
  assert.equal(queries(POOL_FILE, "requirements").length, 2, "pool.ts holds exactly the two counting queries");
});

test("the counting queries select counts of companies and the pool's own key, and nothing that names a company, a person or a requirement", () => {
  const found = queries(POOL_FILE, "requirements");
  const selectList = (sql: string) => /^\s*SELECT\s+(.*?)\s+FROM\s/is.exec(sql)?.[1].replace(/\s+/g, " ") ?? "";
  const lists = found.map((m) => selectList(m.sql)).sort();
  assert.deepEqual(lists, [
    "COUNT(DISTINCT r.company_id) AS companies",
    "r.cluster AS cluster, r.opportunity_id AS opportunity_id, COUNT(DISTINCT r.company_id) AS companies",
  ]);
  for (const m of found) {
    assert.ok(/COUNT\(DISTINCT r\.company_id\)/.test(m.sql), "counts companies, not requirements");
    assert.ok(/NOT EXISTS \(SELECT 1 FROM requirement_events e WHERE e\.requirement_id = r\.id AND e\.kind = 'withdraw'\)/.test(m.sql.replace(/\s+/g, " ")), "a withdrawn requirement is not counted");
  }
  const listing = found.find((m) => /GROUP BY/i.test(m.sql))!;
  assert.match(listing.sql.replace(/\s+/g, " "), /HAVING COUNT\(DISTINCT r\.company_id\) >= \?/, "a pool below the floor is not listed");
  assert.match(read(POOL_FILE), /\.bind\(AGGREGATE_FLOOR\)/, "the floor bound is the constant");
});

test("a pool's size reaches a caller only through presentPool, and only the API files call the counting queries", () => {
  const callsOf = (name: string) => {
    const hits: { file: string; call: ts.CallExpression; sf: ts.SourceFile }[] = [];
    for (const file of applicationFiles()) {
      const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) hits.push({ file, call: n, sf });
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    return hits;
  };
  const counted = callsOf("poolCompanies");
  assert.ok(counted.length >= 1, "the scan finds the call");
  for (const { file, call, sf } of counted) {
    assert.match(file, /^modules\/procure\/src\/api\//, `${file} calls poolCompanies`);
    let parent: ts.Node = call.parent;
    while (ts.isAwaitExpression(parent) || ts.isParenthesizedExpression(parent)) parent = parent.parent;
    assert.ok(ts.isCallExpression(parent) && parent.expression.getText(sf) === "presentPool", `${file}: the count is passed straight to presentPool`);
  }
  for (const { file } of callsOf("listPoolsAtFloor")) assert.match(file, /^modules\/procure\/src\/api\//, file);
  for (const f of applicationFiles().filter((x) => x.startsWith("app/") || x.startsWith("worker/"))) {
    assert.ok(!/\bpoolCompanies\b|\blistPoolsAtFloor\b/.test(read(f)), `${f} does not use the counting queries itself`);
  }
});

test("pages and routes do not query the procure tables themselves, and only the procure data layer does, apart from the deliver module's join and its checks that a requirement is the company's", () => {
  for (const f of applicationFiles()) {
    if (f.startsWith("modules/procure/src/db/")) continue;
    for (const table of ALL_TABLES) {
      const found = queries(f, table);
      if (f !== DELIVER_FILE) {
        assert.deepEqual(found, [], `${f} ${table}`);
        continue;
      }
      // Of the registry only the provider's name and summary are read, by the join; of the requirements the join and the
      // existence check inside the engagement insert, which names the company. Nothing here reads a fee, a listing or a term.
      assert.ok(!["provider_services", "provider_events", "listing_terms"].includes(table) || found.length === 0, `${f} reads ${table}`);
      for (const m of found) {
        const sql = m.sql.replace(/\s+/g, " ");
        const ok = isDeliverJoin(f, m.sql) || (/^INSERT INTO (engagements|milestones|engagement_events) /.test(sql) && /EXISTS \(SELECT 1 FROM requirements WHERE id = \? AND company_id = \?\)/.test(sql)) || /^SELECT (id, provider_id|1 AS present) FROM engagements /.test(sql);
        assert.ok(ok || !/\b(requirements|providers)\b/.test(sql.replace(/engagements|requirement_id|provider_id/g, "")), `${f}:${m.line} reads ${table} in a way the deliver module is not allowed to`);
      }
    }
  }
});

// ---- D-03: no revenue line that can vary with the provider chosen

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

test("the money columns that carry APLYD's earnings are the listing fee in the terms and the copy of it on a listing; the deliver module adds only the owner's own figures (see its static test)", () => {
  const columns = columnsInMigrations();
  assert.ok(columns.length > 40 && columns.some((c) => c.table === "listing_terms" && c.column === "fee_inr"), "the migrations were read");
  const money = columns.filter((c) => isMoneyColumn(c.column)).map((c) => `${c.table}.${c.column}`).sort();
  // Every other money column is the owner's own record of a price or a payment, in a table of the deliver module that never names the listing.
  const others = money.filter((m) => m !== "listing_terms.fee_inr" && m !== "provider_events.fee_inr");
  assert.deepEqual(others, ["engagement_events.amount_inr", "milestones.agreed_inr"]);
});

test("the listing terms hold one fee and nothing that could make it differ: no provider, requirement, company, offer, deal or percentage", () => {
  const terms = columnsInMigrations().filter((c) => c.table === "listing_terms").map((c) => c.column);
  assert.deepEqual(terms, ["version", "at", "user_id", "fee_inr", "note"]);
  const listing = columnsInMigrations().filter((c) => c.table === "provider_events").map((c) => c.column);
  assert.deepEqual(listing, ["id", "provider_id", "at", "user_id", "kind", "terms_version", "fee_inr", "note"], "a listing names its provider, the terms it was made under and the fee copied from them, and nothing about demand or choice");
});

test("the listing statement copies the fee from the terms in force; no caller supplies one, and the endpoint reads no fee from the request", () => {
  const source = read("modules/procure/src/db/providers.ts");
  const sf = ts.createSourceFile("providers.ts", source, ts.ScriptTarget.Latest, true);
  const fn = sf.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === "listProvider")!;
  assert.ok(fn, "listProvider exists");
  const inputType = fn.parameters[1].type!.getText(sf);
  assert.ok(!/fee/i.test(inputType), `listProvider takes no fee: ${inputType}`);
  const insert = queries("modules/procure/src/db/providers.ts", "provider_events").find((m) => /'list'/.test(m.sql))!;
  const sql = insert.sql.replace(/\s+/g, " ");
  assert.match(sql, /SELECT p\.id, \?, \?, 'list', t\.version, t\.fee_inr, \?/);
  assert.match(sql, /t\.version = \(SELECT MAX\(version\) FROM listing_terms\)/);
  assert.ok(!/fee_inr\) VALUES/.test(sql), "the fee is not a bound value");

  const api = ts.createSourceFile("providers.ts", read("modules/procure/src/api/providers.ts"), ts.ScriptTarget.Latest, true);
  const handler = api.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === "handleProviderList")!;
  assert.ok(handler, "handleProviderList exists");
  assert.ok(!/bodyField\(\s*body\s*,\s*["'`]fee/i.test(handler.getText(api)), "the list endpoint does not read a fee from the request");
});

test("providers are ordered by name alone, in every query that orders them", () => {
  const file = "modules/procure/src/db/providers.ts";
  const ordered = queries(file, "providers").filter((m) => /\bORDER BY\b/i.test(m.sql) && /FROM providers p/.test(m.sql));
  assert.equal(ordered.length, 2);
  for (const m of ordered) assert.match(m.sql.replace(/\s+/g, " "), /ORDER BY p\.name COLLATE NOCASE, p\.id\s*$/, "name, then id");
  const publicQuery = queries(file, "providers").find((m) => /JOIN provider_services/.test(m.sql))!;
  assert.ok(!/fee|terms|listing_terms/i.test(publicQuery.sql.replace(/provider_events/g, "")), "what an owner sees of the providers is not ordered or filtered by fee or terms");
});

test("the owner's page prints a pool as a lower bound and never reads an exact count", () => {
  const page = read("app/procure/page.tsx");
  assert.match(page, /r\.pool\.atLeast/, "the page shows the lower bound");
  assert.ok(page.includes("`At least ${r.pool.atLeast} companies"), "and says it is a lower bound, so a number is not read as the count");
  assert.ok(!/\bpool\??\.companies\b/.test(page), "the page does not read an exact count of a pool");
  assert.ok(!/shown: true[;,]\s*companies/.test(read("modules/procure/src/pool.ts")), "the view of a pool that is shown has no exact count");
});
