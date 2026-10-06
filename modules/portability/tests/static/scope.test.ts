// The export is a scope path (BR-GOV-05): these rules are read from the source, not from behaviour. The route is thin and hands the
// path id to the handler; the handler's first act is the shared company check, and it reads through the identity, never the URL; the
// module holds no SQL and reads only through the other modules' company-bound data layers, never the provider register, the listing
// terms, the pools or the audit log; and only the export route and the /export page use the module. Tripwires, like the header rule:
// they read the syntax tree and string literals and cannot see code built at run time.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { ROOT, applicationFiles, sqlMentioning } from "../../../platform/tests/support/sql-rules.ts";

const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");
const ROUTE = "app/api/companies/[id]/export/route.ts";
const HANDLER = "modules/portability/src/api/export.ts";
const READER = "modules/portability/src/read.ts";
const PAGE = "app/export/page.tsx";
const source = (file: string) => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const moduleFiles = () => applicationFiles().filter((f) => f.startsWith("modules/portability/src/"));
const importsOf = (file: string) => [...read(file).matchAll(/^import\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)";/gm)].map((m) => ({ type: Boolean(m[1]), names: m[2]!.split(",").map((s) => s.trim()).filter(Boolean), from: m[3]! }));

/** Every table the migrations create. */
function tables(): string[] {
  const out = new Set<string>();
  for (const f of applicationFiles().filter((x) => /^modules\/[^/]+\/src\/db\/schema\.ts$/.test(x))) for (const m of read(f).matchAll(/sqliteTable\(\s*"(\w+)"/g)) out.add(m[1]!);
  return [...out].sort();
}

test("the export route is thin: it exports GET only and hands the path id and nothing else to handleCompanyExport", () => {
  const text = read(ROUTE);
  assert.deepEqual([...text.matchAll(/^export const (\w+)/gm)].map((m) => m[1]), ["dynamic", "GET"]);
  assert.deepEqual(importsOf(ROUTE).map((i) => `${i.from} ${i.names.join(",")}`), [
    "cloudflare:workers env",
    "../../../../../modules/portability/src/api/export.ts handleCompanyExport",
    "../../../../../modules/platform/src/env.ts AppEnv",
  ]);
  assert.match(text.replace(/\s+/g, " "), /export const GET = async \(request: Request, context: \{ params: Promise<\{ id: string \}> \}\) => handleCompanyExport\(request, env as unknown as AppEnv, \(await context\.params\)\.id\);/);
});

test("the handler's first act is authorizeCompanyRead on the path id, it returns any refusal at once, and it reads only through the identity", () => {
  const sf = source(HANDLER);
  let fn: ts.FunctionDeclaration | undefined;
  sf.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === "handleCompanyExport") fn = n;
  });
  assert.ok(fn?.body, "handleCompanyExport is found");
  const [first, second, third] = fn!.body!.statements;
  assert.equal(first!.getText(sf), 'const allowed = await authorizeCompanyRead(request, env, requestedId, "company.export.denied");');
  assert.equal(second!.getText(sf), "if (allowed instanceof Response) return allowed;");
  assert.equal(third!.getText(sf), "const input = await readExportInput(allowed.db, allowed.identity);");
  // The id in the path is compared by the check and used for nothing else.
  assert.equal([...fn!.body!.getText(sf).matchAll(/\brequestedId\b/g)].length, 1);
  assert.doesNotMatch(read(HANDLER), /authorizeCompanyWrite|authorizeOperator|authorizeSignedIn|resolveIdentity|canReadCompany/, "no other way in");
  // The shared check is the one that keeps the operator out: it allows only the person's own company.
  assert.match(read("modules/platform/src/api/authorize.ts"), /if \(!canReadCompany\(identity, requestedId\)\) \{/);
});

test("the reader binds every read to the identity's company and calls only the company-bound data-layer functions", () => {
  const allowed = [
    "../../diagnose/src/db/assessments.ts listAssessments,loadAssessment",
    "../../deliver/src/db/engagements.ts listEngagements",
    "../../factory/src/db/revisions.ts MAX_REVISIONS_PER_COMPANY,loadHistory,loadRevision",
    "../../platform/src/db/companies.ts loadOwnCompany",
    "../../platform/src/identity/scope.ts Identity",
    "../../procure/src/db/requirements.ts listRequirements",
    "../../run/src/db/outcomes.ts listOutcomes",
    "./bundle.ts ExportInput",
  ];
  assert.deepEqual(importsOf(READER).map((i) => `${i.from} ${i.names.join(",")}`), allowed);
  const text = read(READER);
  assert.match(text, /const companyId = identity\.companyId;/);
  for (const call of ["loadHistory", "listAssessments", "listRequirements", "listEngagements", "loadRevision", "loadAssessment", "listOutcomes"]) {
    const calls = [...text.matchAll(new RegExp(`\\b${call}\\(([^,)]*), ([^,)]*)`, "g"))];
    assert.ok(calls.length >= 1, `${call} is called`);
    for (const c of calls) assert.deepEqual([c[1], c[2]], ["db", "companyId"], `${call} is given the identity's company`);
  }
  assert.match(text, /loadOwnCompany\(db, identity\)/);
});

test("the module holds no SQL of its own and names no table in a query", () => {
  const names = tables();
  assert.ok(names.length >= 16 && names.includes("factory_revisions") && names.includes("listing_terms"), `the schema files were read: ${names.join(", ")}`);
  const files = moduleFiles();
  assert.deepEqual(files, ["modules/portability/src/api/export.ts", "modules/portability/src/bundle.ts", "modules/portability/src/read.ts"]);
  for (const f of [...files, ROUTE, PAGE]) {
    const text = read(f);
    assert.doesNotMatch(text, /\.prepare\(|\.batch\(|\.exec\(/, `${f} runs no statement`);
    for (const t of names) {
      const sql = sqlMentioning(f, text, t).filter((m) => /\b(SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(m.sql));
      assert.deepEqual(sql, [], `${f} names ${t} in what looks like SQL`);
    }
  }
});

test("nothing in the module, the route or the page reaches the provider register, the listing terms, the pools or the audit log", () => {
  const forbidden = /\b(listAllProviders|listPublicProviders|listedProvidersFor|currentTerms|listTermsHistory|setTerms|poolCompanies|listPoolsAtFloor|presentPool|presentRequirements|handlePools|handleOperatorProviders|handleTermsRead)\b|fee_inr|listing_terms|provider_events|provider_services|audit_events|\/db\/providers\.ts|\/db\/pool\.ts|\/src\/pool\.ts/;
  for (const f of [...moduleFiles(), ROUTE, PAGE]) assert.doesNotMatch(read(f), forbidden, f);
  // The one audit write is the export entry itself, through the platform's writer.
  const writes = [...read(HANDLER).matchAll(/recordAudit\(\s*allowed\.db,\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(writes, ["company.export"]);
});

test("only the export route and the /export page use the module: no other page or route, and nothing for the operator or a provider, can hand out the file", () => {
  const users = applicationFiles().filter((f) => (f.startsWith("app/") || f.startsWith("worker/")) && /modules\/portability\//.test(read(f)));
  assert.deepEqual(users.sort(), [ROUTE, PAGE].sort());
  for (const f of applicationFiles().filter((x) => !x.startsWith("modules/portability/"))) {
    if (f === ROUTE) continue;
    assert.doesNotMatch(read(f), /handleCompanyExport/, `${f} calls the export handler`);
  }
  for (const f of applicationFiles().filter((x) => /^app\/(api\/(operator|providers)|operator)\//.test(x))) assert.doesNotMatch(read(f), /portability|buildExport|readExportInput/, f);
  // The page reads through the same reader and builder as the route, so what it counts is what the file holds.
  assert.match(read(PAGE), /readExportInput\(e\.DB, identity\)/);
  assert.match(read(PAGE), /buildExport\(input, new Date\(\)\)/);
});

test("the rules above catch what they are for", () => {
  // A query of a company table that the module might add is seen.
  assert.equal(sqlMentioning("x.ts", 'db.prepare("SELECT * FROM engagements WHERE company_id = ?")', "engagements").length, 1);
  // A reader that took the company from the URL would fail the binding rule.
  const bad = "listRequirements(db, requestedId)";
  const m = /\blistRequirements\(([^,)]*), ([^,)]*)/.exec(bad)!;
  assert.notDeepEqual([m[1], m[2]], ["db", "companyId"]);
});
