// The API-reference reader: what it accepts, what it refuses, and that the comparison with the routes fails when the document and the routes
// part (a method with no operation, an operation with no route, a renamed parameter). The fixtures are small invented ones; the real
// document and the real routes are compared in tests/static/api-sync.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compareApi, errorIndex, errorLiterals, exportedMethods, formActions, normalisePath, pagePaths, parseEntries, parseSummary, routePath } from "../../src/api.ts";

const entry = (id: string, method: string, path: string, extra: { serves?: string; responses?: string[]; drop?: string } = {}) => {
  const props: [string, string][] = [
    ["Purpose", "Does a thing."],
    ["Serves", extra.serves ?? "BR-DESC-01"],
    ["Caller", "owner"],
    ["Everyone else", "401, 403, 404"],
    ["Content types", "JSON or form"],
    ["Body limit", "64 KiB"],
    ["Side effects", "one row"],
    ["Idempotency", "201 first time"],
    ["Form post", method === "POST" ? "yes, from /thing" : "no"],
  ];
  const responses = extra.responses ?? ["| 201 | `{ \"ok\": true }` | Done. | 303 /thing?saved=1 |", "| 409 | `already_done` | It was done. | 303 /thing?problem=done |"];
  return [
    `### ${id} ${method} ${path}`,
    "",
    "| Item | Detail |",
    "| --- | --- |",
    ...props.filter(([k]) => k !== extra.drop).map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "| Field | Form field | Type | Required | Limits and meaning |",
    "| --- | --- | --- | --- | --- |",
    "| `note` | `note` | text | no | Up to 500 characters. |",
    "",
    "| Status | Code or body | When | Form post |",
    "| --- | --- | --- | --- |",
    ...responses,
    "",
    "```json",
    "{}",
    "```",
    "",
  ].join("\n");
};

const SUMMARY = [
  "| ID | Method | Path | Area | Actor |",
  "| --- | --- | --- | --- | --- |",
  "| API-01 | GET | `/api/things/{id}` | Things | member |",
  "| API-02 | POST | `/api/things/{id}/close` | Things | owner |",
].join("\n");
const DOC = `# Fixture\n\n${SUMMARY}\n\n## 4. Operations\n\n${entry("API-01", "GET", "/api/things/{id}", { responses: ["| 200 | the thing | Found. | none |", "| 404 | `not_found` | No such thing. | none |"] })}\n${entry("API-02", "POST", "/api/things/{id}/close")}\n## 5. Error codes\n\n| Code | Status | Meaning |\n| --- | --- | --- |\n| \`not_found\` | 404 | Missing. |\n| \`already_done\` | 409 | Done. |\n`;
const ROUTES = [
  { file: "app/api/things/[id]/route.ts", methods: ["GET"] },
  { file: "app/api/things/[id]/close/route.ts", methods: ["POST"] },
];

// ---- route files

test("a route file's path is read from where it is, with parameters in braces", () => {
  assert.equal(routePath("app/api/health/route.ts"), "/api/health");
  assert.equal(routePath("app/api/companies/[id]/assessments/[aid]/route.ts"), "/api/companies/{id}/assessments/{aid}");
  assert.throws(() => routePath("app/api/health/page.tsx"), /not a route file/);
  assert.throws(() => routePath("modules/x/route.ts"), /not a route file/);
});

test("two spellings of one path compare equal; different paths do not", () => {
  assert.equal(normalisePath("/api/a/{id}/b/{aid}"), normalisePath("/api/a/{x}/b/{y}"));
  assert.equal(normalisePath("/api/a/[id]"), "/api/a/{}");
  assert.notEqual(normalisePath("/api/a/{id}"), normalisePath("/api/a/{id}/b"));
  assert.equal(normalisePath("/api/a/"), "/api/a");
});

test("exported methods are found however they are exported, and other exports are not methods", () => {
  assert.deepEqual(exportedMethods('export const dynamic = "force-dynamic";\nexport const GET = async () => 1;\nexport const POST = (r: Request) => 2;'), ["GET", "POST"]);
  assert.deepEqual(exportedMethods("export async function DELETE() {}\nexport function PUT() {}"), ["PUT", "DELETE"]);
  assert.deepEqual(exportedMethods("const a = 1; const b = 2;\nexport { a as PATCH, b };"), ["PATCH"]);
  assert.deepEqual(exportedMethods("const GET = 1;\nexport const runtime = 'edge';"), [], "a method that is not exported is not a route");
  assert.deepEqual(exportedMethods("export const get = 1;"), [], "only the upper-case names are methods");
});

test("a route file that hides its exports is refused, not skipped", () => {
  assert.throws(() => exportedMethods('export * from "./other.ts";'), /hides its methods/);
  assert.throws(() => exportedMethods("export const { GET, POST } = handlers;"), /hides its methods/);
});

test("page addresses come from page files", () => {
  assert.deepEqual(pagePaths(["app/page.tsx", "app/diagnose/page.tsx", "app/api/health/route.ts", "app/layout.tsx", "app/a/b/page.tsx"]), ["/", "/diagnose", "/a/b"]);
});

// ---- the forms of the pages

test("a form's action is read from a string, a template, a helper call and a helper inside a template", () => {
  const page = [
    "const base = (id: string) => `/api/companies/${companyId}/engagements/${id}`;",
    '<form method="post" action="/api/session">',
    "<form method=\"post\" action={`/api/companies/${companyId}/requirements`} data-testid=\"x\">",
    '<form method="post" action={`${base(g.id)}/events`} data-testid={`form-${kind}`}>',
    '<form key={k} method="post" action={base(g.id)} data-testid="y">',
    '<form method="get" action="/search">',
  ].join("\n");
  assert.deepEqual(formActions("app/x/page.tsx", page), [
    "/api/session",
    "/api/companies/{}/requirements",
    "/api/companies/{}/engagements/{}/events",
    "/api/companies/{}/engagements/{}",
  ]);
});

test("a form whose action cannot be resolved is refused", () => {
  assert.throws(() => formActions("app/x/page.tsx", '<form method="post" action={somewhere}>'), /cannot resolve/);
  assert.throws(() => formActions("app/x/page.tsx", '<form method="post" action={elsewhere(id)}>'), /not a local template helper/);
  assert.deepEqual(formActions("app/x/page.tsx", "<p>no forms</p>"), []);
});

// ---- the summary table and the sections

test("the summary table is read", () => {
  const s = parseSummary(DOC);
  assert.deepEqual(s.map((o) => [o.id, o.method, o.path, o.area, o.actor]), [["API-01", "GET", "/api/things/{id}", "Things", "member"], ["API-02", "POST", "/api/things/{id}/close", "Things", "owner"]]);
});

test("a malformed summary row is named, all at once", () => {
  const bad = SUMMARY.replace("API-01 | GET", "API-1 | GET").replace("| `/api/things/{id}/close` |", "| /api/things/{id}/close |");
  assert.throws(() => parseSummary(bad), /"API-1" is not an operation ID/);
  assert.throws(() => parseSummary(SUMMARY.replace("| member", "| clerk")), /the actor must be one of/);
  assert.throws(() => parseSummary(SUMMARY.replace("| GET |", "| FETCH |")), /"FETCH" is not an HTTP method/);
  assert.throws(() => parseSummary(SUMMARY.replace("| Actor |", "| Who |")), /headings must be/);
  assert.throws(() => parseSummary("no table here"), /no summary table/);
  assert.throws(() => parseSummary(bad), /the path must be one code span that starts with \//);
});

test("an operation section is read: properties, request fields, responses and the example", () => {
  const e = parseEntries(DOC);
  assert.deepEqual(e.map((x) => [x.id, x.method, x.path]), [["API-01", "GET", "/api/things/{id}"], ["API-02", "POST", "/api/things/{id}/close"]]);
  assert.equal(e[1]!.properties.get("Caller"), "owner");
  assert.equal(e[1]!.fields.length, 1);
  assert.deepEqual(e[1]!.responses.map((r) => [r.status, r.code]), [[201, null], [409, "already_done"]]);
  assert.equal(e[1]!.hasExample, true);
});

test("every kind of malformed operation section is named, all at once", () => {
  const bad = [
    entry("API-01", "GET", "/api/things/{id}", { serves: "none yet", drop: "Idempotency" }),
    entry("API-02", "POST", "/api/things/{id}/close", { responses: ["| 409 | already done | It was done. | 303 /thing |", "| abc | x | y | z |"] }),
  ].join("\n");
  assert.throws(
    () => parseEntries(bad),
    (e: Error) => {
      assert.match(e.message, /API-01: the properties table has no "Idempotency" row/);
      assert.match(e.message, /API-01: "Serves" names no requirement/);
      assert.match(e.message, /API-02: line \d+: an error response names its code as one code span/);
      assert.match(e.message, /API-02: line \d+: "abc" is not an HTTP status/);
      assert.match(e.message, /API-02: no success response \(2xx\)/);
      return true;
    },
  );
  assert.throws(() => parseEntries("### API-03 POST nowhere\n"), /reads "### API-NN METHOD \/path"/);
  assert.throws(() => parseEntries(entry("API-04", "POST", "/api/x").replace("| Field |", "| Name |")), /no table of request fields/);
});

// ---- the routes against the document

const compare = (routes = ROUTES, doc = DOC) => compareApi(routes, parseSummary(doc), parseEntries(doc));

test("the reference and the routes agree on the fixture", () => {
  assert.deepEqual(compare(), []);
});

test("a method with no operation is found, whatever the route", () => {
  assert.deepEqual(compare([...ROUTES, { file: "app/api/other/route.ts", methods: ["GET", "DELETE"] }]), [
    "GET /api/other (app/api/other/route.ts) has no operation in the reference",
    "DELETE /api/other (app/api/other/route.ts) has no operation in the reference",
  ]);
  assert.match(compare([{ file: "app/api/things/[id]/route.ts", methods: ["GET", "PUT"] }, ROUTES[1]!])[0]!, /PUT \/api\/things\/\{id\} .* has no operation/);
});

test("an operation whose route is gone, or whose method is no longer exported, is found", () => {
  assert.match(compare([ROUTES[0]!]).join("\n"), /API-02 documents POST \/api\/things\/\{id\}\/close, which no route exports/);
  assert.match(compare([{ file: ROUTES[0]!.file, methods: [] }, ROUTES[1]!]).join("\n"), /API-01 documents GET \/api\/things\/\{id\}, which no route exports/);
});

test("a parameter named differently in the document and the route is found, though the paths match", () => {
  const renamed = DOC.replaceAll("/api/things/{id}", "/api/things/{thing}");
  const p = compareApi(ROUTES, parseSummary(renamed), parseEntries(renamed));
  assert.equal(p.length, 2);
  assert.match(p[0]!, /API-01: the path is \/api\/things\/\{thing\}, the route's parameters are named \/api\/things\/\{id\}/);
});

test("the summary table and the sections must agree, and an operation is documented once", () => {
  const moved = DOC.replace("| API-02 | POST | `/api/things/{id}/close` |", "| API-02 | POST | `/api/things/{id}/shut` |");
  assert.match(compareApi(ROUTES, parseSummary(moved), parseEntries(DOC)).join("\n"), /API-02: the summary says POST \/api\/things\/\{id\}\/shut, the section says POST \/api\/things\/\{id\}\/close/);
  assert.match(compareApi(ROUTES, parseSummary(DOC).slice(0, 1), parseEntries(DOC)).join("\n"), /API-02 has a section and is not in the summary table/);
  assert.match(compareApi(ROUTES, [...parseSummary(DOC), { id: "API-03", method: "GET", path: "/x", area: "a", actor: "owner", line: 1 }], parseEntries(DOC)).join("\n"), /API-03 is in the summary table and has no section/);
  const twice = `${DOC}\n${entry("API-03", "GET", "/api/things/{id}")}`;
  assert.match(compareApi(ROUTES, parseSummary(DOC), parseEntries(twice)).join("\n"), /GET \/api\/things\/\{\} is documented 2 times \(API-01, API-03\)/);
  const sameId = DOC.replace("API-02 POST", "API-01 POST");
  assert.match(compareApi(ROUTES, parseSummary(DOC), parseEntries(sameId)).join("\n"), /API-01 is used by two operations/);
  const unordered = DOC.replace("| API-01 | GET | `/api/things/{id}` | Things | member |\n| API-02 | POST | `/api/things/{id}/close` | Things | owner |", "| API-02 | POST | `/api/things/{id}/close` | Things | owner |\n| API-01 | GET | `/api/things/{id}` | Things | member |");
  assert.match(compareApi(ROUTES, parseSummary(unordered), parseEntries(DOC)).join("\n"), /not in order of ID/);
});

// ---- error codes

test("the error-code index is read, and a heading that is not it is not mistaken for it", () => {
  assert.deepEqual(errorIndex(DOC), [{ code: "not_found", status: "404" }, { code: "already_done", status: "409" }]);
  assert.throws(() => errorIndex("# x\n\n## 5. Errors\n"), /no section "N\. Error codes"/);
  assert.throws(() => errorIndex("## 5. Error codes\n\nnothing\n"), /no table headed Code/);
});

test("error codes are read from the handlers and the reasons from the data layers", () => {
  const found = errorLiterals([
    { path: "a.ts", text: 'return json(404, { error: "not_found" });\nreturn { status: 413, error: "too_large" };\njson(409, { error: made.reason });' },
    { path: "b.ts", text: 'return { ok: false, reason: "undecided" };\nexport type R = { ok: false; reason: "a_b" | "c_d" | "e" };\nconst x = { reason: "changed" };' },
  ]);
  assert.deepEqual(found.direct, ["not_found", "too_large"]);
  assert.deepEqual(found.reasons, ["a_b", "c_d", "changed", "e", "undecided"]);
});
