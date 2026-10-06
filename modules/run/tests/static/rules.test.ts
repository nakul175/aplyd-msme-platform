// Rules read from the source and the migrations, not from behaviour: how outcome_events may be queried, that nothing recorded here
// touches the listing fee (D-03), that the run module reaches other modules' tables only through their own data layers, and that
// every message the API sends a form post back with has a place on the page. Tripwires, like the header rule: they read SQL
// written as string literals and cannot see SQL built at run time.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { ROOT, applicationFiles, problemsWith, sqlMentioning } from "../../../platform/tests/support/sql-rules.ts";

const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");
const DATA_LAYER = "modules/run/src/db/outcomes.ts";
const API = "modules/run/src/api/outcomes.ts";
const queries = (file: string, table: string) => sqlMentioning(file, read(file), table).filter((m) => /\b(SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(m.sql));
const changes = (file: string, table: string) => queries(file, table).filter((m) => /\b(UPDATE|DELETE|REPLACE)\b/i.test(m.sql) || /\bINSERT OR\b/i.test(m.sql));

test("no query anywhere changes, deletes or replaces a row of outcome_events: it is append-only", () => {
  const all = applicationFiles();
  assert.ok(all.includes(DATA_LAYER), "the data layer is among the scanned files");
  assert.ok(all.flatMap((f) => queries(f, "outcome_events")).length >= 2, "the scan finds the queries on outcome_events");
  assert.deepEqual(all.flatMap((f) => changes(f, "outcome_events").map((m) => `${f}:${m.line}`)), []);
});

test("every read of outcome_events is bound to one company, and the one INSERT binds the company and checks the engagement is the company's, in the same statement", () => {
  const all = applicationFiles();
  assert.deepEqual(all.flatMap((f) => problemsWith(f, read(f), "outcome_events")), []);
  const reads = queries(DATA_LAYER, "outcome_events").filter((m) => /^\s*SELECT/i.test(m.sql));
  assert.equal(reads.length, 1, "one read");
  assert.match(reads[0].sql.replace(/\s+/g, " "), /WHERE company_id = \? AND engagement_id = \?/);
  const inserts = queries(DATA_LAYER, "outcome_events").filter((m) => /^\s*INSERT INTO\s+outcome_events\b/i.test(m.sql));
  assert.equal(inserts.length, 1, "one INSERT, and no other");
  const sql = inserts[0].sql.replace(/\s+/g, " ");
  assert.match(sql, /\bcompany_id\b/);
  assert.match(sql, /WHERE EXISTS \(SELECT 1 FROM engagements WHERE id = \? AND company_id = \?\)/);
});

test("outcome_events is touched only by the run data layer: no page, route or other module queries it", () => {
  for (const f of applicationFiles()) if (f !== DATA_LAYER) assert.deepEqual(queries(f, "outcome_events"), [], f);
});

test("the run module reads other modules' data only through their data layers: the one statement of its own that names another table is the engagement check in its INSERT", () => {
  const others = ["engagements", "milestones", "engagement_events", "requirements", "requirement_events", "providers", "provider_events", "provider_services", "listing_terms", "assessments", "assessment_events", "factory_revisions"];
  const mine = applicationFiles().filter((f) => f.startsWith("modules/run/") || f.startsWith("app/run/"));
  assert.ok(mine.length >= 4, `the scan finds the run module's files: ${mine.join(", ")}`);
  const found = mine.flatMap((f) => others.flatMap((t) => queries(f, t).map((m) => `${f} ${t}`)));
  assert.deepEqual([...new Set(found)], [`${DATA_LAYER} engagements`]);
});

test("the outcome table holds the owner's measurements and nothing about money: no fee, share, commission, price or reference to the listing", () => {
  const sql = readdirSync(`${ROOT}drizzle`).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(`${ROOT}drizzle/${f}`, "utf8")).join("\n");
  const body = /CREATE TABLE `outcome_events` \(([\s\S]*?)\n\);/.exec(sql)?.[1] ?? "";
  const columns = [...body.split("\n").flatMap((l) => /^\s*`(\w+)`\s+(text|integer|real|blob|numeric)\b/i.exec(l)?.[1] ?? [])];
  assert.deepEqual(columns, ["id", "engagement_id", "company_id", "at", "user_id", "kind", "review_no", "value", "verdict", "in_use", "note"]);
  assert.doesNotMatch(body, /fee|commission|price|amount|rupee|inr|payment/i);
});

test("nothing in the run module reads or writes the listing fee, the listing terms or a provider's listing, and no query adds up measurements across companies", () => {
  for (const f of applicationFiles().filter((f) => f.startsWith("modules/run/") || f.startsWith("app/run/"))) {
    assert.doesNotMatch(read(f), /\bfee_inr\b|\blisting_terms\b|currentTerms|provider_events/, f);
    for (const m of queries(f, "outcome_events")) assert.doesNotMatch(m.sql, /\b(SUM|AVG|MAX|MIN|COUNT)\s*\(/i, `${f}:${m.line} aggregates measurements`);
  }
  const page = read("app/run/page.tsx");
  assert.doesNotMatch(page, /\bfee\b|commission|₹|rupee/i, "the page shows no fee, commission or amount of money");
});

// ---- the page and the API agree on every message

test("every ?problem= key the run API redirects with has a message on /run, and every message there is sent by something", () => {
  const api = read(API);
  const dbText = read(DATA_LAYER);
  const reasons = [...(/export type RecordResult = [^\n]*/.exec(dbText)?.[0] ?? "").matchAll(/"(\w+)"/g)].map((m) => m[1]).filter((r) => r !== "ok");
  const sent = new Set([...[...api.matchAll(/\/run\?problem=(\w+)/g)].map((m) => m[1]), ...reasons.filter((r) => r !== "not_found")]);
  const block = /const PROBLEMS: Record<string, string> = \{([\s\S]*?)\n\};/.exec(read("app/run/page.tsx"))?.[1] ?? "";
  const shown = new Set([...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
  assert.ok(sent.size >= 7 && shown.size >= 7, `the scan found ${sent.size} keys sent and ${shown.size} shown`);
  assert.deepEqual([...sent].filter((k) => !shown.has(k)).sort(), [], "sent, with no message on /run");
  assert.deepEqual([...shown].filter((k) => !sent.has(k)).sort(), [], "a /run message nothing sends");
});

test("every ?saved= word the page can show is one the API sends", () => {
  const block = /const SAVED: Record<string, string> = \{([\s\S]*?)\n\};/.exec(read("app/run/page.tsx"))?.[1] ?? "";
  assert.deepEqual([...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]).sort(), ["baseline", "correction", "review"]);
  assert.match(read(API), /saved=\$\{kind\}/);
  assert.match(read(API), /\/run\?saved=correction"/);
});

// ---- corrections (BR-RUN-09)

test("outcome_corrections is append-only, read only bound to the company, written by one INSERT that checks the corrected number is this engagement's and this company's, and touched only by the run data layer", () => {
  const all = applicationFiles();
  assert.deepEqual(all.flatMap((f) => changes(f, "outcome_corrections").map((m) => `${f}:${m.line}`)), []);
  assert.deepEqual(all.flatMap((f) => problemsWith(f, read(f), "outcome_corrections")), []);
  for (const f of all) if (f !== DATA_LAYER) assert.deepEqual(queries(f, "outcome_corrections"), [], f);
  const reads = queries(DATA_LAYER, "outcome_corrections").filter((m) => /^\s*SELECT/i.test(m.sql));
  assert.equal(reads.length, 1, "one read");
  assert.match(reads[0].sql.replace(/\s+/g, " "), /WHERE company_id = \? AND engagement_id = \?/);
  const inserts = queries(DATA_LAYER, "outcome_corrections").filter((m) => /^\s*INSERT INTO\s+outcome_corrections\b/i.test(m.sql));
  assert.equal(inserts.length, 1, "one INSERT, and no other");
  assert.match(inserts[0].sql.replace(/\s+/g, " "), /WHERE EXISTS \(SELECT 1 FROM outcome_events WHERE id = \? AND engagement_id = \? AND company_id = \?\)$/);
});

test("the correction table holds a number and a reason and nothing about money", () => {
  const sql = readdirSync(`${ROOT}drizzle`).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(`${ROOT}drizzle/${f}`, "utf8")).join("\n");
  const body = /CREATE TABLE `outcome_corrections` \(([\s\S]*?)\n\);/.exec(sql)?.[1] ?? "";
  const columns = [...body.split("\n").flatMap((l) => /^\s*`(\w+)`\s+(text|integer|real|blob|numeric)\b/i.exec(l)?.[1] ?? [])];
  assert.deepEqual(columns, ["id", "outcome_id", "engagement_id", "company_id", "at", "user_id", "value", "reason"]);
  assert.doesNotMatch(body, /fee|commission|price|amount|rupee|inr|payment/i);
});
