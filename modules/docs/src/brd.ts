// Reads the business requirements document (docs/brd/BRD.md) as data. The requirement tables are the one copy of the requirements;
// nothing else keeps a second list that could drift from them. Pure functions, no files: scripts/check-traceability.mjs and the tests
// give them the text.

export const AREAS = {
  GOV: "Governance and constraints",
  ID: "Identity, access and audit",
  DESC: "Describe",
  DIAG: "Diagnose",
  PROC: "Procure",
  DEPL: "Deploy",
  RUN: "Run",
  OPS: "Operator",
  UX: "User experience",
  DATA: "Data and privacy",
  COM: "Commercial",
  NFR: "Non-functional",
} as const;
export type Area = keyof typeof AREAS;

export const STATUSES = ["built", "partial", "not-built", "open", "unverified"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = { built: "Built", partial: "Partial", "not-built": "Not built", open: "Open", unverified: "Unverified" };

export const PRIORITIES = ["Must", "Should", "Could"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const BASES = ["Decided", "Carried", "Thesis", "Study", "Rule", "Built", "Proposed"] as const;

export type Requirement = {
  id: string;
  area: Area;
  title: string;
  statement: string;
  priority: Priority;
  basis: string;
  acceptance: string;
  statusText: string;
  status: Status;
};

export const REQUIREMENT_ID = /\bBR-([A-Z]+)-(\d{2})\b/g;
const ROW = /^\| (BR-[A-Z]+-\d{2}) \|/;

export function classifyStatus(text: string): Status {
  const t = text.trim();
  if (/^Not built\b/.test(t)) return "not-built";
  if (/^Built\b/.test(t)) return "built";
  if (/^Partial\b/.test(t)) return "partial";
  if (/^Open\b/.test(t)) return "open";
  if (/^Unverified\b/.test(t)) return "unverified";
  throw new Error(`a status must start with Built, Partial, Not built, Open or Unverified, not "${t.slice(0, 40)}"`);
}

/** Every requirement row of the document. Throws one error naming every malformed row. */
export function parseRequirements(markdown: string): Requirement[] {
  const out: Requirement[] = [];
  const problems: string[] = [];
  for (const line of markdown.split("\n")) {
    const m = ROW.exec(line);
    if (!m) continue;
    const id = m[1]!;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split(" | ").map((c) => c.trim());
    if (cells.length !== 6) {
      problems.push(`${id}: ${cells.length} cells, expected 6 (ID, requirement, priority, basis, acceptance criterion, status); a "|" inside a cell breaks a row`);
      continue;
    }
    const [, requirement, priority, basis, acceptance, statusText] = cells as [string, string, string, string, string, string];
    const area = id.split("-")[1] as string;
    if (!(area in AREAS)) problems.push(`${id}: "${area}" is not an area (${Object.keys(AREAS).join(", ")})`);
    if (!PRIORITIES.includes(priority as Priority)) problems.push(`${id}: priority "${priority}" is not Must, Should or Could`);
    if (!BASES.some((b) => basis.startsWith(b))) problems.push(`${id}: basis "${basis}" does not start with ${BASES.join(", ")}`);
    if (acceptance.length < 10) problems.push(`${id}: no acceptance criterion`);
    const title = /^\*\*(.+?)\*\*/.exec(requirement)?.[1] ?? "";
    if (!title) problems.push(`${id}: the requirement does not start with a bold title`);
    let status: Status = "open";
    try {
      status = classifyStatus(statusText);
    } catch (e) {
      problems.push(`${id}: ${(e as Error).message}`);
    }
    out.push({ id, area: area as Area, title, statement: requirement.replace(/^\*\*.+?\*\*\s*/, ""), priority: priority as Priority, basis, acceptance, statusText, status });
  }
  const seen = new Set<string>();
  for (const r of out) {
    if (seen.has(r.id)) problems.push(`${r.id}: appears twice`);
    seen.add(r.id);
  }
  if (problems.length) throw new Error(`the requirement tables have ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
  return out;
}

export type Counts = Record<Status, number>;
export const emptyCounts = (): Counts => ({ built: 0, partial: 0, "not-built": 0, open: 0, unverified: 0 });

export function countByArea(reqs: Requirement[]): Record<Area, Counts> {
  const by = Object.fromEntries((Object.keys(AREAS) as Area[]).map((a) => [a, emptyCounts()])) as Record<Area, Counts>;
  for (const r of reqs) by[r.area][r.status] += 1;
  return by;
}

const START = "<!-- STATUS-COUNTS-START -->";
const END = "<!-- STATUS-COUNTS-END -->";

/** The generated block that sits between the two markers in the document. */
export function renderCounts(reqs: Requirement[]): string {
  const by = countByArea(reqs);
  const total = emptyCounts();
  const lines = [
    "| Area | Requirements | Built | Partial | Not built | Open | Unverified |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const a of Object.keys(AREAS) as Area[]) {
    const c = by[a];
    const n = STATUSES.reduce((s, k) => s + c[k], 0);
    for (const k of STATUSES) total[k] += c[k];
    lines.push(`| ${AREAS[a]} (${a}) | ${n} | ${c.built} | ${c.partial} | ${c["not-built"]} | ${c.open} | ${c.unverified} |`);
  }
  lines.push(`| **All** | **${reqs.length}** | **${total.built}** | **${total.partial}** | **${total["not-built"]}** | **${total.open}** | **${total.unverified}** |`);
  const pri = PRIORITIES.map((p) => `${reqs.filter((r) => r.priority === p).length} ${p}`).join(", ");
  const mustGap = reqs.filter((r) => r.priority === "Must" && r.status !== "built").length;
  lines.push("", `By priority (a proposal, OQ-16): ${pri}. Of the ${reqs.filter((r) => r.priority === "Must").length} Must requirements, ${mustGap} are not fully built.`);
  return lines.join("\n");
}

/** Put the generated block between the markers. Throws if the markers are missing. */
export function withCounts(markdown: string, reqs: Requirement[]): string {
  const a = markdown.indexOf(START);
  const b = markdown.indexOf(END);
  if (a < 0 || b < a) throw new Error(`the document needs ${START} and ${END} where the counts go`);
  return `${markdown.slice(0, a + START.length)}\n${renderCounts(reqs)}\n${markdown.slice(b)}`;
}

/** Requirement IDs a text mentions (each once), whether or not they exist. */
export function mentionedIds(text: string): string[] {
  return [...new Set([...text.matchAll(/\bBR-[A-Z]+-\d{2}\b/g)].map((m) => m[0]))];
}
