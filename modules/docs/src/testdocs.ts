// Reads the test documents (docs/test/*.md) as data and checks them against the requirements (docs/brd/BRD.md) and the test files. The case
// table in TEST-CASES.md is the one copy of the cases; the traceability matrix and its counts are generated from it and from the BRD, never
// kept by hand. Pure functions, no files: scripts/check-test-docs.mjs gives them the text and a way to read a test file.
import { mentionedIds, AREAS, STATUS_LABEL, type Requirement } from "./brd.ts";

export const LAYERS = ["static", "unit", "integration", "smoke", "browser", "manual"] as const;
export type Layer = (typeof LAYERS)[number];

export const CASE_TYPES = ["positive", "negative", "boundary", "security", "regression", "usability"] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const VERDICTS = ["covered-automated", "covered-partly", "designed-only", "people-only", "not-testable-yet", "uncovered"] as const;
export type Verdict = (typeof VERDICTS)[number];

export type Automation = { kind: "automated"; file: string; title: string } | { kind: "designed" } | { kind: "people" };

export type TestCase = {
  id: string;
  area: string;
  number: number;
  requirements: string[];
  title: string;
  layer: Layer;
  type: CaseType;
  steps: string;
  expected: string;
  automation: Automation;
  /** The expected result starts "Partly:": the test covers part of the case, and the rest is said in the text. */
  partly: boolean;
  /** The expected result starts "Cannot be tested until": nothing that exists can run it yet. */
  notTestable: boolean;
  line: number;
};

export const PARTLY = "Partly: ";
export const NOT_TESTABLE = "Cannot be tested until ";

const CASE_ROW = /^\|\s*(TC-[^\s|]*)\s*\|/;
const CASE_ID = /^TC-([A-Z]+)-(\d{2,3})$/;
const BR_ID = /^BR-([A-Z]+)-\d{2}$/;
const TEST_FILE = /^modules\/[a-z0-9-]+\/tests\/(static|unit|integration|smoke|browser)\/[A-Za-z0-9._-]+\.test\.ts$/;

/** Every case row of the document. Rows that are not well formed are returned as problems, all at once; the rows that are well formed are still returned. */
export function parseCases(markdown: string): { cases: TestCase[]; problems: string[] } {
  const cases: TestCase[] = [];
  const problems: string[] = [];
  let inFence = false;
  markdown.split("\n").forEach((line, index) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) return;
    const m = CASE_ROW.exec(line);
    if (!m) return;
    const shown = m[1]!;
    const here = (message: string) => problems.push(`${shown} (line ${index + 1}): ${message}`);
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split(" | ").map((c) => c.trim());
    if (cells.length !== 8) {
      here(`${cells.length} cells, expected 8 (ID, requirements, title, layer, type, steps and data, expected result, automation); a "|" inside a cell breaks a row`);
      return;
    }
    const [id, reqCell, title, layer, type, steps, expected, automation] = cells as [string, string, string, string, string, string, string, string];
    const before = problems.length;
    const idMatch = CASE_ID.exec(id);
    if (!idMatch) here(`"${id}" is not an ID of the form TC-<AREA>-<NN>`);
    else if (!(idMatch[1]! in AREAS)) here(`"${idMatch[1]}" is not a requirement area (${Object.keys(AREAS).join(", ")})`);
    const requirements = reqCell.split(",").map((r) => r.trim());
    for (const r of requirements) if (!BR_ID.test(r)) here(`"${r}" is not a requirement ID; list them as BR-AREA-NN separated by commas`);
    if (new Set(requirements).size !== requirements.length) here("a requirement is listed twice");
    const firstArea = BR_ID.exec(requirements[0] ?? "")?.[1];
    if (idMatch && firstArea && firstArea !== idMatch[1]) here(`the case is in area ${idMatch[1]} but its first requirement is in area ${firstArea}; the first requirement names the area`);
    if (title.length < 5) here("no title");
    if (!(LAYERS as readonly string[]).includes(layer)) here(`layer "${layer}" is not one of ${LAYERS.join(", ")}`);
    if (!(CASE_TYPES as readonly string[]).includes(type)) here(`type "${type}" is not one of ${CASE_TYPES.join(", ")}`);
    if (steps.length < 5) here("no steps and data");
    if (expected.length < 5) here("no expected result");
    const auto = parseAutomation(automation);
    if (typeof auto === "string") here(auto);
    const partly = expected.startsWith(PARTLY);
    const notTestable = expected.startsWith(NOT_TESTABLE);
    if (typeof auto !== "string") {
      if (auto.kind === "automated") {
        const dir = TEST_FILE.exec(auto.file)?.[1];
        if (layer === "manual") here("an automated case cannot be in the manual layer");
        else if (dir && dir !== layer) here(`the case is in the ${layer} layer but its test file is in tests/${dir}`);
        if (notTestable) here(`a case that "${NOT_TESTABLE.trim()}" something exists cannot also be automated`);
      } else {
        if (partly) here(`"${PARTLY.trim()}" belongs to automated cases only`);
        if (auto.kind === "people" && layer !== "manual") here("a case for people must be in the manual layer");
      }
    }
    if (problems.length > before || !idMatch || typeof auto === "string") return;
    cases.push({
      id,
      area: idMatch[1]!,
      number: Number(idMatch[2]),
      requirements,
      title,
      layer: layer as Layer,
      type: type as CaseType,
      steps,
      expected,
      automation: auto,
      partly,
      notTestable,
      line: index + 1,
    });
  });
  return { cases, problems };
}

/** The Automation cell: `designed`, `people`, or `automated: <path> :: <title>`. A string is the reason it is not one of those. */
export function parseAutomation(cell: string): Automation | string {
  if (cell === "designed") return { kind: "designed" };
  if (cell === "people") return { kind: "people" };
  const m = /^automated: (\S+) :: (.+)$/.exec(cell);
  if (!m) return `the automation "${cell.slice(0, 60)}" is not "designed", "people" or "automated: <test file path> :: <test title>"`;
  const [, file, title] = m as unknown as [string, string, string];
  if (!TEST_FILE.test(file)) return `"${file}" is not a test file path of the form modules/<module>/tests/<layer>/<name>.test.ts`;
  return { kind: "automated", file, title };
}

/** The titles of the test(), it() and describe() calls in a test file, as written between the quotes of the first argument. */
export function declaredTitles(fileText: string): string[] {
  const out: string[] = [];
  for (const m of fileText.matchAll(/\b(?:test|it|describe)(?:\.[a-z]+)?\(\s*(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) out.push(m[2]!);
  return out;
}

/** Numbering: IDs unique, and in each area the numbers run 1, 2, 3 and so on in the order they appear, with no gap. */
export function checkNumbering(cases: TestCase[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const next: Record<string, number> = {};
  for (const c of cases) {
    if (seen.has(c.id)) {
      problems.push(`${c.id} (line ${c.line}): appears twice`);
      continue;
    }
    seen.add(c.id);
    const want = (next[c.area] ?? 0) + 1;
    if (c.number !== want) problems.push(`${c.id} (line ${c.line}): the next ${c.area} case should be TC-${c.area}-${String(want).padStart(2, "0")}; numbers run in order with no gap`);
    next[c.area] = Math.max(next[c.area] ?? 0, c.number);
  }
  return problems;
}

/** Every requirement a case cites exists in the BRD. */
export function checkRequirementsExist(cases: TestCase[], reqs: Requirement[]): string[] {
  const known = new Set(reqs.map((r) => r.id));
  const problems: string[] = [];
  for (const c of cases) for (const r of c.requirements) if (!known.has(r)) problems.push(`${c.id} (line ${c.line}): cites ${r}, which is not a requirement in the BRD`);
  return problems;
}

/** Every requirement in the BRD is cited by at least one case. */
export function checkEveryRequirementCovered(cases: TestCase[], reqs: Requirement[]): string[] {
  const cited = new Set(cases.flatMap((c) => c.requirements));
  return reqs.filter((r) => !cited.has(r.id)).map((r) => `${r.id}: no case cites it; write a case, or a "${NOT_TESTABLE.trim()}" row if nothing exists to test yet`);
}

/** Every automated case names a file that exists and a title that file declares, word for word. `read` returns the text of a repository file, or undefined. */
export function checkAutomation(cases: TestCase[], read: (path: string) => string | undefined): string[] {
  const problems: string[] = [];
  const titles = new Map<string, string[] | null>();
  for (const c of cases) {
    if (c.automation.kind !== "automated") continue;
    const { file, title } = c.automation;
    if (!titles.has(file)) {
      const text = read(file);
      titles.set(file, text === undefined ? null : declaredTitles(text));
    }
    const declared = titles.get(file);
    if (declared === null || declared === undefined) problems.push(`${c.id} (line ${c.line}): the test file ${file} does not exist`);
    else if (!declared.includes(title)) problems.push(`${c.id} (line ${c.line}): ${file} declares no test titled "${title}"`);
  }
  return problems;
}

export const GAPS_START = "<!-- AUTOMATION-GAPS-START -->";
export const GAPS_END = "<!-- AUTOMATION-GAPS-END -->";

/** The requirements the known-gaps block lists: lines of the form "- BR-AREA-NN: reason" between its two markers. */
export function parseGaps(markdown: string): { found: boolean; ids: string[] } {
  const a = markdown.indexOf(GAPS_START);
  const b = markdown.indexOf(GAPS_END);
  if (a < 0 || b < a) return { found: false, ids: [] };
  const ids: string[] = [];
  for (const line of markdown.slice(a + GAPS_START.length, b).split("\n")) {
    const m = /^- (BR-[A-Z]+-\d{2})\b/.exec(line.trim());
    if (m) ids.push(m[1]!);
  }
  return { found: true, ids };
}

const isAutomated = (c: TestCase) => c.automation.kind === "automated";

/**
 * Every Must requirement that the BRD calls Built or Partial has at least one automated case, or is named in the known-gaps block. The block is
 * policed from the other side too: it may list only a Must requirement that is Built or Partial and has no automated case, so it cannot go stale.
 */
export function checkMustAutomated(cases: TestCase[], reqs: Requirement[], gaps: { found: boolean; ids: string[] }): string[] {
  const problems: string[] = [];
  if (!gaps.found) problems.push(`the case document needs ${GAPS_START} and ${GAPS_END} around the list of requirements with no automated case`);
  const byId = new Map(reqs.map((r) => [r.id, r]));
  const listed = new Set(gaps.ids);
  for (const id of gaps.ids) {
    const r = byId.get(id);
    if (!r) problems.push(`${id}: listed in the known-gaps block, but it is not a requirement in the BRD`);
    else if (r.priority !== "Must" || (r.status !== "built" && r.status !== "partial")) problems.push(`${id}: listed in the known-gaps block, but it is not a Must requirement that is Built or Partial`);
    else if (cases.some((c) => c.requirements.includes(id) && isAutomated(c))) problems.push(`${id}: listed in the known-gaps block, but a case now automates it; remove it from the list`);
  }
  for (const r of reqs) {
    if (r.priority !== "Must" || (r.status !== "built" && r.status !== "partial")) continue;
    if (cases.some((c) => c.requirements.includes(r.id) && isAutomated(c))) continue;
    if (!listed.has(r.id)) problems.push(`${r.id}: a Must requirement that is ${r.status === "built" ? "Built" : "Partial"} has no automated case and is not in the known-gaps block`);
  }
  return problems;
}

/** The verdict for one requirement from the cases that cite it. The rule is in the text of TRACEABILITY.md. */
export function verdictOf(cases: TestCase[]): Verdict {
  if (cases.length === 0) return "uncovered";
  const automated = cases.filter(isAutomated);
  const open = cases.filter((c) => !isAutomated(c) && !c.notTestable);
  if (automated.length) return automated.every((c) => !c.partly) && open.length === 0 ? "covered-automated" : "covered-partly";
  if (open.some((c) => c.automation.kind === "designed")) return "designed-only";
  if (open.length) return "people-only";
  return "not-testable-yet";
}

export type MatrixRow = {
  id: string;
  title: string;
  priority: string;
  status: string;
  cases: string[];
  automated: number;
  verdict: Verdict;
};

export function buildMatrix(cases: TestCase[], reqs: Requirement[]): MatrixRow[] {
  return reqs.map((r) => {
    const mine = cases.filter((c) => c.requirements.includes(r.id));
    return {
      id: r.id,
      title: r.title,
      priority: r.priority,
      status: STATUS_LABEL[r.status],
      cases: mine.map((c) => c.id),
      automated: mine.filter(isAutomated).length,
      verdict: verdictOf(mine),
    };
  });
}

/** Case IDs for a table cell: runs of three or more consecutive numbers in one area are written "TC-ID-10 to TC-ID-14". */
export function compactIds(ids: string[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < ids.length) {
    let j = i;
    const [area] = split(ids[i]!);
    while (j + 1 < ids.length) {
      const [a2, n2] = split(ids[j + 1]!);
      if (a2 !== area || n2 !== split(ids[j]!)[1] + 1) break;
      j += 1;
    }
    parts.push(j - i >= 2 ? `${ids[i]} to ${ids[j]}` : ids.slice(i, j + 1).join(", "));
    i = j + 1;
  }
  return parts.join(", ");
}
function split(id: string): [string, number] {
  const m = /^TC-([A-Z]+)-(\d+)$/.exec(id);
  return m ? [m[1]!, Number(m[2])] : [id, -1];
}

export const NOT_LINKED = "to be linked";
export const COVERAGE_START = "<!-- COVERAGE-START -->";
export const COVERAGE_END = "<!-- COVERAGE-END -->";
export const MATRIX_START = "<!-- MATRIX-START -->";
export const MATRIX_END = "<!-- MATRIX-END -->";

/** The functional-requirements cell of each matrix row as it stands, so that links added by hand survive a regeneration. */
export function functionalCells(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  const a = markdown.indexOf(MATRIX_START);
  const b = markdown.indexOf(MATRIX_END);
  if (a < 0 || b < a) return out;
  for (const line of markdown.slice(a, b).split("\n")) {
    const m = /^\| (BR-[A-Z]+-\d{2}) \|/.exec(line);
    if (!m) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split(" | ").map((c) => c.trim());
    if (cells.length === 8) out.set(m[1]!, cells[7]!);
  }
  return out;
}

export function renderMatrix(rows: MatrixRow[], functional: Map<string, string> = new Map()): string {
  const lines = [
    "| Requirement | Title | Priority | BRD status | Cases | Automated cases | Verdict | Functional requirements |",
    "| --- | --- | --- | --- | --- | ---: | --- | --- |",
  ];
  for (const r of rows) lines.push(`| ${r.id} | ${r.title} | ${r.priority} | ${r.status} | ${r.cases.length ? compactIds(r.cases) : "none"} | ${r.automated} | ${r.verdict} | ${functional.get(r.id) || NOT_LINKED} |`);
  return lines.join("\n");
}

const count = <T>(items: T[], pick: (t: T) => string) => {
  const out: Record<string, number> = {};
  for (const i of items) out[pick(i)] = (out[pick(i)] ?? 0) + 1;
  return out;
};

/** The counts block of TRACEABILITY.md: cases by layer, type and automation, and requirements by verdict. */
export function renderCoverage(rows: MatrixRow[], cases: TestCase[], reqs: Requirement[]): string {
  const row = (label: string, by: Record<string, number>, keys: readonly string[]) => `| ${label} | ${keys.map((k) => by[k] ?? 0).join(" | ")} | ${cases.length} |`;
  const kind = (c: TestCase) => c.automation.kind;
  const lines = [
    `Cases: ${cases.length}, citing ${new Set(cases.flatMap((c) => c.requirements)).size} of ${reqs.length} requirements.`,
    "",
    `| Cases by | ${LAYERS.join(" | ")} | All |`,
    `| --- | ${LAYERS.map(() => "---:").join(" | ")} | ---: |`,
    row("Layer", count(cases, (c) => c.layer), LAYERS),
    "",
    `| Cases by | ${CASE_TYPES.join(" | ")} | All |`,
    `| --- | ${CASE_TYPES.map(() => "---:").join(" | ")} | ---: |`,
    row("Type", count(cases, (c) => c.type), CASE_TYPES),
    "",
    "| Cases by | automated | designed | people | All |",
    "| --- | ---: | ---: | ---: | ---: |",
    row("Automation", count(cases, kind), ["automated", "designed", "people"]),
    "",
    `| Requirements by verdict | ${["Must", "Should", "Could"].join(" | ")} | All |`,
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  for (const v of VERDICTS) {
    const mine = rows.filter((r) => r.verdict === v);
    lines.push(`| ${v} | ${["Must", "Should", "Could"].map((p) => mine.filter((r) => r.priority === p).length).join(" | ")} | ${mine.length} |`);
  }
  lines.push(`| **All** | ${["Must", "Should", "Could"].map((p) => rows.filter((r) => r.priority === p).length).join(" | ")} | ${rows.length} |`);
  const mustBuilt = reqs.filter((r) => r.priority === "Must" && (r.status === "built" || r.status === "partial"));
  const withAutomated = mustBuilt.filter((r) => rows.find((x) => x.id === r.id)!.automated > 0);
  lines.push("", `Must requirements that the BRD calls Built or Partial: ${mustBuilt.length}. With at least one automated case: ${withAutomated.length}. Without: ${mustBuilt.length - withAutomated.length}${mustBuilt.length === withAutomated.length ? "" : ` (${mustBuilt.filter((r) => !withAutomated.includes(r)).map((r) => r.id).join(", ")}; see the known gaps in TEST-CASES.md)`}.`);
  return lines.join("\n");
}

/** `markdown` with the text between two markers replaced. Throws if the markers are missing. */
export function withBlock(markdown: string, start: string, end: string, body: string): string {
  const a = markdown.indexOf(start);
  const b = markdown.indexOf(end);
  if (a < 0 || b < a) throw new Error(`the document needs ${start} and ${end} where the generated text goes`);
  return `${markdown.slice(0, a + start.length)}\n${body}\n${markdown.slice(b)}`;
}

/** TRACEABILITY.md as it should be: both generated blocks regenerated, the hand-edited functional-requirements cells kept. */
export function withTraceability(markdown: string, cases: TestCase[], reqs: Requirement[]): string {
  const rows = buildMatrix(cases, reqs);
  const kept = functionalCells(markdown);
  const withCoverage = withBlock(markdown, COVERAGE_START, COVERAGE_END, renderCoverage(rows, cases, reqs));
  return withBlock(withCoverage, MATRIX_START, MATRIX_END, renderMatrix(rows, kept));
}

/** Entries such as SC-01 that a document introduces with a heading: unique, and numbered 01, 02, 03 with no gap. */
export function checkSequence(markdown: string, prefix: string, documentName: string): string[] {
  const problems: string[] = [];
  const re = new RegExp(`^#{2,4} (${prefix}-(\\d{2,3}))\\b`, "gm");
  const seen = new Set<string>();
  let want = 1;
  for (const m of markdown.replace(/```[\s\S]*?```/g, "").matchAll(re)) {
    const id = m[1]!;
    if (seen.has(id)) problems.push(`${documentName}: ${id} appears twice`);
    seen.add(id);
    if (Number(m[2]) !== want) problems.push(`${documentName}: expected ${prefix}-${String(want).padStart(2, "0")} next but found ${id}; numbers run in order with no gap`);
    want = Number(m[2]) + 1;
  }
  if (seen.size === 0) problems.push(`${documentName}: no ${prefix}-NN heading found`);
  return problems;
}

/** Case IDs a text mentions, each once, whether or not they exist. */
export function mentionedCaseIds(text: string): string[] {
  return [...new Set([...text.matchAll(/\bTC-[A-Z]+-\d{2,3}\b/g)].map((m) => m[0]))];
}

const REPO_PATH = /^(?:modules|scripts|app|worker|drizzle|\.github)\/[^\s*?<>]+$/;

/** Repository paths a text names in code spans (outside fenced blocks), for paths under the code and test directories. */
export function mentionedPaths(text: string): string[] {
  const body = text.replace(/```[\s\S]*?```/g, "");
  const out = new Set<string>();
  for (const m of body.matchAll(/`([^`\n]+)`/g)) {
    const token = m[1]!.trim().replace(/[.,;:]$/, "");
    if (REPO_PATH.test(token)) out.add(token);
  }
  return [...out];
}

/** The documents other than the case table: every case, requirement and path they name exists, and their entries are numbered in order. */
export function checkDocument(name: string, markdown: string, cases: TestCase[], reqs: Requirement[], exists: (path: string) => boolean, sequences: string[] = []): string[] {
  const problems: string[] = [];
  const known = new Set(cases.map((c) => c.id));
  const body = markdown.replace(/```[\s\S]*?```/g, "");
  for (const id of mentionedCaseIds(body)) if (!known.has(id)) problems.push(`${name}: ${id} is mentioned but is not a case in TEST-CASES.md`);
  const knownReqs = new Set(reqs.map((r) => r.id));
  for (const id of mentionedIds(body)) if (!knownReqs.has(id)) problems.push(`${name}: ${id} is mentioned but is not a requirement in the BRD`);
  for (const p of mentionedPaths(markdown)) if (!exists(p)) problems.push(`${name}: the path ${p} does not exist in the repository`);
  for (const prefix of sequences) problems.push(...checkSequence(markdown, prefix, name));
  return problems;
}

export type Inputs = {
  casesText: string;
  traceabilityText: string;
  reqs: Requirement[];
  read: (path: string) => string | undefined;
};

/** Checks (a) to (f) on the case table and the traceability document. Returns every problem, and the cases when the table could be read. */
export function checkCaseTable(input: Inputs): { problems: string[]; cases: TestCase[] } {
  const { cases, problems } = parseCases(input.casesText);
  const all = [...problems];
  if (cases.length === 0) all.push("TEST-CASES.md: no case rows found");
  all.push(...checkNumbering(cases));
  all.push(...checkRequirementsExist(cases, input.reqs));
  all.push(...checkEveryRequirementCovered(cases, input.reqs));
  all.push(...checkAutomation(cases, input.read));
  all.push(...checkMustAutomated(cases, input.reqs, parseGaps(input.casesText)));
  if (problems.length === 0 && cases.length > 0) {
    try {
      const wanted = withTraceability(input.traceabilityText, cases, input.reqs);
      if (wanted !== input.traceabilityText) all.push("TRACEABILITY.md: the coverage counts or the matrix are out of date; run node scripts/check-test-docs.mjs --write");
    } catch (e) {
      all.push(`TRACEABILITY.md: ${(e as Error).message}`);
    }
  }
  return { problems: all, cases };
}

export const TEST_DOCUMENTS = {
  strategy: "docs/test/TEST-STRATEGY.md",
  scenarios: "docs/test/TEST-SCENARIOS.md",
  cases: "docs/test/TEST-CASES.md",
  regression: "docs/test/REGRESSION-PACK.md",
  traceability: "docs/test/TRACEABILITY.md",
  uat: "docs/test/UAT-PLAN.md",
  data: "docs/test/TEST-DATA.md",
} as const;

/** The entries each document numbers with headings: scenarios SC-01 and so on, regression pack entries RP-01, data sets TD-01. */
const SEQUENCES: Partial<Record<keyof typeof TEST_DOCUMENTS, string[]>> = { scenarios: ["SC"], regression: ["RP"], data: ["TD"] };

/**
 * All the checks on the seven documents, for the script and for the static test. `docs` maps each document's path to its text (undefined when
 * the file is missing); `read` returns the text of a test file; `exists` says whether a repository path exists.
 */
export function checkTestDocuments(input: {
  brd: Requirement[];
  docs: Record<string, string | undefined>;
  read: (path: string) => string | undefined;
  exists: (path: string) => boolean;
}): { problems: string[]; cases: TestCase[] } {
  const problems: string[] = [];
  for (const path of Object.values(TEST_DOCUMENTS)) if (input.docs[path] === undefined) problems.push(`${path}: the document does not exist`);
  const casesText = input.docs[TEST_DOCUMENTS.cases];
  const traceabilityText = input.docs[TEST_DOCUMENTS.traceability];
  if (casesText === undefined || traceabilityText === undefined) return { problems, cases: [] };
  const table = checkCaseTable({ casesText, traceabilityText, reqs: input.brd, read: input.read });
  problems.push(...table.problems.map((p) => (/^(TC-|BR-)/.test(p) ? `${TEST_DOCUMENTS.cases}: ${p}` : p)));
  for (const [key, path] of Object.entries(TEST_DOCUMENTS) as [keyof typeof TEST_DOCUMENTS, string][]) {
    const text = input.docs[path];
    if (text === undefined) continue;
    problems.push(...checkDocument(path, text, table.cases, input.brd, input.exists, SEQUENCES[key] ?? []));
  }
  return { problems, cases: table.cases };
}
