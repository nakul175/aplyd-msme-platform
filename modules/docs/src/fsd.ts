// Reads the functional specification (docs/fsd/FSD.md) as data: its functional requirement rows, and the table in section 11 that says
// which functions cover each business requirement. The two must agree with each other and with the BRD. Pure functions: they take text.
import type { Requirement, Status } from "./brd.ts";
import { STATUS_LABEL } from "./brd.ts";

export const FR_STATUSES = ["AS BUILT", "PARTIAL", "TO BE"] as const;
export type FrStatus = (typeof FR_STATUSES)[number];

export type FunctionalRequirement = { id: string; area: string; number: number; statement: string; traces: string[]; status: FrStatus };

const FR_ROW = /^\| (FR-([A-Z]+)-(\d{2})) \|/;
const BR = /\bBR-[A-Z]+-\d{2}\b/g;
const FR = /\bFR-[A-Z]+-\d{2}\b/g;

const cellsOf = (line: string): string[] => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(" | ").map((c) => c.trim());

/** Every FR row of the document (six cells: ID, statement, traces to, rules, outputs, status). Throws one error naming every problem. */
export function parseFunctionalRequirements(markdown: string, requirements: Requirement[]): FunctionalRequirement[] {
  const known = new Set(requirements.map((r) => r.id));
  const out: FunctionalRequirement[] = [];
  const problems: string[] = [];
  for (const line of markdown.split("\n")) {
    const m = FR_ROW.exec(line);
    if (!m) continue;
    const id = m[1]!;
    const cells = cellsOf(line);
    if (cells.length !== 6) {
      problems.push(`${id}: ${cells.length} cells, expected 6`);
      continue;
    }
    const [, statement, tracesCell, , , statusCell] = cells as [string, string, string, string, string, string];
    const traces = [...new Set(tracesCell.match(BR) ?? [])];
    if (!traces.length) problems.push(`${id}: traces to no business requirement`);
    for (const t of traces) if (!known.has(t)) problems.push(`${id}: traces to ${t}, which is not in the BRD`);
    if (!(FR_STATUSES as readonly string[]).includes(statusCell)) problems.push(`${id}: status "${statusCell}" is not ${FR_STATUSES.join(", ")}`);
    out.push({ id, area: m[2]!, number: Number(m[3]), statement, traces, status: statusCell as FrStatus });
  }
  const seen = new Set<string>();
  for (const f of out) {
    if (seen.has(f.id)) problems.push(`${f.id}: appears twice`);
    seen.add(f.id);
  }
  const byArea = new Map<string, number[]>();
  for (const f of out) byArea.set(f.area, [...(byArea.get(f.area) ?? []), f.number]);
  for (const [area, numbers] of byArea) {
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    sorted.forEach((n, i) => {
      if (n !== i + 1) problems.push(`FR-${area}: numbers are not contiguous from 01 (found ${String(n).padStart(2, "0")} where ${String(i + 1).padStart(2, "0")} was expected)`);
    });
  }
  if (problems.length) throw new Error(`the functional requirements have ${problems.length} problem(s):\n  - ${[...new Set(problems)].join("\n  - ")}`);
  return out;
}

/** The business requirements each function names, inverted: BR ID to the FR IDs that name it, in document order. */
export function functionsByRequirement(frs: FunctionalRequirement[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of frs) for (const b of f.traces) map.set(b, [...(map.get(b) ?? []), f.id]);
  return map;
}

/** The traceability table of section 11: BR ID to the status word it states and the FR IDs it lists. */
export function parseCoverageTable(markdown: string): Map<string, { status: string; frs: string[] }> {
  const start = markdown.search(/^## 11\./m);
  if (start < 0) throw new Error("the document has no section 11");
  const next = markdown.slice(start + 3).search(/^## \d+\./m);
  const section = next < 0 ? markdown.slice(start) : markdown.slice(start, start + 3 + next);
  const out = new Map<string, { status: string; frs: string[] }>();
  for (const line of section.split("\n")) {
    const m = /^\| (BR-[A-Z]+-\d{2}) \|/.exec(line);
    if (!m) continue;
    const cells = cellsOf(line);
    if (cells.length !== 4) throw new Error(`${m[1]}: section 11 row has ${cells.length} cells, expected 4`);
    out.set(m[1]!, { status: cells[1]!, frs: cells[2]!.match(FR) ?? [] });
  }
  return out;
}

const WORD: Record<Status, string> = Object.fromEntries(Object.entries(STATUS_LABEL)) as Record<Status, string>;

/** Section 11 against the function rows and the BRD: every requirement has a row, its status is the BRD's, its function list is exactly the functions that name it. */
export function checkCoverage(markdown: string, requirements: Requirement[], frs: FunctionalRequirement[]): string[] {
  const table = parseCoverageTable(markdown);
  const by = functionsByRequirement(frs);
  const problems: string[] = [];
  for (const r of requirements) {
    const row = table.get(r.id);
    if (!row) {
      problems.push(`${r.id}: no row in section 11`);
      continue;
    }
    if (row.status !== WORD[r.status]) problems.push(`${r.id}: section 11 says "${row.status}" but the BRD says "${WORD[r.status]}"`);
    const want = [...(by.get(r.id) ?? [])].sort();
    const have = [...row.frs].sort();
    if (want.join() !== have.join()) problems.push(`${r.id}: section 11 lists [${have.join(", ")}] but the functions that name it are [${want.join(", ")}]`);
  }
  const ids = new Set(requirements.map((r) => r.id));
  for (const id of table.keys()) if (!ids.has(id)) problems.push(`${id}: in section 11 but not in the BRD`);
  return problems;
}
