// Reads the findings register (docs/FINDINGS.md) as data: one row for each discrepancy, gap, review finding or known limit that another
// document already records. The register adds no finding of its own, so what can be checked is its form: every row is well formed,
// numbers are contiguous, rows are grouped by module, every source link and every cited path resolves, and the counts at the top are the
// counts of the rows. Pure functions: they take text and, where they need to know what exists, a function that says so.

export const FINDING_MODULES = ["platform", "factory", "diagnose", "procure", "deliver", "run", "journey", "hosting", "demo", "repository"] as const;
export type FindingModule = (typeof FINDING_MODULES)[number];

/** The words the sources use. The register does not rate a finding: where a source gives no severity the row says "not rated". */
export const SEVERITIES = ["high", "medium", "low", "not rated"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const STATUS_KINDS = ["open", "fixed", "decision", "recheck"] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];
const STATUS_PREFIX: Record<StatusKind, string> = { open: "open", fixed: "fixed in", decision: "documented decision", recheck: "evidence changed: re-check" };

export const MAX_STATEMENT_LENGTH = 600;

export type SourceLink = { text: string; target: string };
export type EvidenceItem = { path: string; name?: string };

/** The evidence cell of a finding for which the source names nothing to look at. */
export const NO_EVIDENCE = "none recorded in the source";

export type Finding = {
  id: string;
  number: number;
  statement: string;
  evidence: string;
  /** What the evidence names: a file or directory, and where the source gives one, text that it holds. */
  evidenceItems: EvidenceItem[];
  severity: Severity;
  module: FindingModule;
  /** Every link of the Source cell; the first is the place that records the finding, the rest are other places that record it. */
  sources: SourceLink[];
  status: string;
  statusKind: StatusKind;
};

const ROW = /^\| (FND-(\d{3})) \|/;
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;

const cellsOf = (line: string): string[] => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(" | ").map((c) => c.trim());

export function statusKindOf(status: string): StatusKind | null {
  for (const kind of STATUS_KINDS) if (status === STATUS_PREFIX[kind] || status.startsWith(`${STATUS_PREFIX[kind]} `) || status.startsWith(`${STATUS_PREFIX[kind]}(`)) return kind;
  return null;
}

/**
 * The evidence cell is a list separated by "; ". An item is a path in code, or a path in code, a colon and a name in code:
 * the name is text the file holds (a function, a test title, a setting, a phrase of the source). Returns null for an item of another shape.
 */
export function evidenceItemOf(item: string): EvidenceItem | null {
  const m = /^`([^`]+)`(?:: `([^`]+)`)?$/.exec(item.trim());
  if (!m) return null;
  return m[2] === undefined ? { path: m[1]! } : { path: m[1]!, name: m[2] };
}

/** Every row of the register (seven cells: ID, finding, evidence, severity, module, source, status). Throws one error naming every problem. */
export function parseFindings(markdown: string): Finding[] {
  const out: Finding[] = [];
  const problems: string[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = ROW.exec(line);
    if (!m) continue;
    const id = m[1]!;
    const cells = cellsOf(line);
    if (cells.length !== 7) {
      problems.push(`${id}: ${cells.length} cells, expected 7 (ID, finding, evidence, severity, module, source, status); a "|" inside a cell breaks a row`);
      continue;
    }
    const [, statement, evidence, severity, module, sourceCell, status] = cells as [string, string, string, string, string, string, string];
    if (!statement) problems.push(`${id}: the finding is empty`);
    else if (statement.length > MAX_STATEMENT_LENGTH) problems.push(`${id}: the finding is ${statement.length} characters; it is one line of at most ${MAX_STATEMENT_LENGTH}`);
    const evidenceItems: EvidenceItem[] = [];
    if (!evidence) problems.push(`${id}: no evidence (write what the source names, or "${NO_EVIDENCE}")`);
    else if (evidence !== NO_EVIDENCE) {
      for (const item of evidence.split("; ")) {
        const e = evidenceItemOf(item);
        if (e) evidenceItems.push(e);
        else problems.push(`${id}: the evidence item "${item}" is not \`path\` or \`path\`: \`name\``);
      }
    }
    if (!(SEVERITIES as readonly string[]).includes(severity)) problems.push(`${id}: severity "${severity}" is not ${SEVERITIES.join(", ")}`);
    if (!(FINDING_MODULES as readonly string[]).includes(module)) problems.push(`${id}: module "${module}" is not ${FINDING_MODULES.join(", ")}`);
    const sources: SourceLink[] = [...sourceCell.matchAll(LINK)].map((l) => ({ text: l[1]!, target: l[2]! }));
    if (!sources.length) problems.push(`${id}: the source is not a link`);
    const kind = statusKindOf(status);
    if (!kind) problems.push(`${id}: status "${status}" does not start with ${STATUS_KINDS.map((k) => `"${STATUS_PREFIX[k]}"`).join(", ")}`);
    out.push({ id, number: Number(m[2]), statement, evidence, evidenceItems, severity: severity as Severity, module: module as FindingModule, sources, status, statusKind: kind ?? "open" });
  }
  const seen = new Set<string>();
  for (const f of out) {
    if (seen.has(f.id)) problems.push(`${f.id}: appears twice`);
    seen.add(f.id);
  }
  // An identifier is never reused and never leaves a gap: a finding that is dealt with stays as a row. A new finding takes the next number
  // and goes at the end of its module's rows, so the numbers need not rise down the page, but together they run from FND-001 with no gap.
  const numbers = [...new Set(out.map((f) => f.number))].sort((a, b) => a - b);
  numbers.forEach((n, i) => {
    if (n !== i + 1) problems.push(`FND-${String(n).padStart(3, "0")}: numbers run from FND-001 with no gap, and FND-${String(i + 1).padStart(3, "0")} is missing; a row is never deleted`);
  });
  if (problems.length) throw new Error(`the findings register has ${problems.length} problem(s):\n  - ${[...new Set(problems)].join("\n  - ")}`);
  return out;
}

/** Rows of one module are together, the modules come in the order of FINDING_MODULES, and the numbers rise within a module. */
export function checkGrouping(findings: Finding[]): string[] {
  const problems: string[] = [];
  let last = -1;
  const done = new Set<FindingModule>();
  let current: FindingModule | null = null;
  let previous: Finding | null = null;
  for (const f of findings) {
    if (f.module !== current) {
      if (current) done.add(current);
      if (done.has(f.module)) problems.push(`${f.id}: module ${f.module} appears again after another module; rows of one module are together`);
      const at = FINDING_MODULES.indexOf(f.module);
      if (at < last) problems.push(`${f.id}: module ${f.module} comes after ${FINDING_MODULES[last]}; the order is ${FINDING_MODULES.join(", ")}`);
      last = Math.max(last, at);
      current = f.module;
    } else if (previous && f.number < previous.number) problems.push(`${f.id}: comes after ${previous.id}; within a module the numbers rise down the page`);
    previous = f;
  }
  return problems;
}

/**
 * The anchors of a Markdown file, made as GitHub makes them: fenced blocks are not headings, a heading is lower-cased, the text of an
 * inline code span is kept (only its backticks go), punctuation other than letters, digits, spaces, hyphens and underscores is dropped,
 * spaces become hyphens, and a heading that repeats takes -1, -2.
 * scripts/check-documentation.mjs differs: it removes inline code before it slugs and it drops underscores. A link to a heading that
 * holds a code span or an underscore can therefore pass here and fail that script; the test of this register reports it (see
 * scriptAnchors).
 */
export function headingAnchors(markdown: string): Set<string> {
  return anchorsFrom(markdown.replace(/```[\s\S]*?```/g, ""), /[^\p{L}\p{N}\s_-]/gu);
}

/** The anchors scripts/check-documentation.mjs makes: inline code removed before slugging, underscores dropped. */
export function scriptAnchors(markdown: string): Set<string> {
  return anchorsFrom(markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, ""), /[^\p{L}\p{N}\s-]/gu);
}

function anchorsFrom(text: string, drop: RegExp): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  for (const m of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = m[1]!.trim().toLowerCase().replace(drop, "").replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n === 0 ? base : `${base}-${n}`);
  }
  return out;
}

/** Resolve a relative link from the file that holds it. Returns a path from the repository root, or null if it leaves the repository. */
export function resolveLink(fromFile: string, target: string): { path: string; anchor: string } | null {
  const [pathPart = "", anchor = ""] = target.split("#");
  const parts = pathPart === "" ? fromFile.split("/") : [...fromFile.split("/").slice(0, -1), ...pathPart.split("/")];
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") {
      if (!stack.length) return null;
      stack.pop();
    } else stack.push(p);
  }
  return { path: stack.join("/"), anchor };
}

export type Resolver = {
  exists: (path: string) => boolean;
  anchors: (path: string) => Set<string>;
  /** The anchors scripts/check-documentation.mjs makes; when given, a link must resolve under both rules. */
  scriptAnchors?: (path: string) => Set<string>;
};

/** Every link of every Source cell leads to a file and, where it names a heading, to a heading that is there. */
export function checkSourceLinks(findings: Finding[], fromFile: string, resolver: Resolver): string[] {
  const problems: string[] = [];
  for (const f of findings) {
    for (const s of f.sources) {
      if (/^(https?:|mailto:)/.test(s.target)) {
        problems.push(`${f.id}: the source link "${s.target}" is outside the repository; a source is a document of the repository`);
        continue;
      }
      const r = resolveLink(fromFile, s.target);
      if (!r || !resolver.exists(r.path)) {
        problems.push(`${f.id}: the source link "${s.target}" does not resolve to a file`);
        continue;
      }
      if (!r.anchor) problems.push(`${f.id}: the source link "${s.target}" names no heading; a source is a section`);
      else if (r.path.endsWith(".md") && !resolver.anchors(r.path).has(r.anchor)) problems.push(`${f.id}: the source link "${s.target}" has no matching heading`);
      else if (r.path.endsWith(".md") && resolver.scriptAnchors && !resolver.scriptAnchors(r.path).has(r.anchor)) {
        problems.push(`${f.id}: the source link "${s.target}" matches a heading on GitHub but not for scripts/check-documentation.mjs, which drops code and underscores before it slugs; link to a heading without either`);
      }
    }
  }
  return problems;
}

export type Files = { exists: (path: string) => boolean; contains: (path: string, text: string) => boolean };

/** Every path the evidence names exists, and holds the text named after it, unless the row says the evidence changed (then the point of the row is that it may not). */
export function checkEvidence(findings: Finding[], files: Files): string[] {
  const problems: string[] = [];
  for (const f of findings) {
    if (f.statusKind === "recheck") continue;
    for (const e of f.evidenceItems) {
      if (!files.exists(e.path)) problems.push(`${f.id}: the evidence "${e.path}" does not exist; correct it or mark the row "evidence changed: re-check"`);
      else if (e.name !== undefined && !files.contains(e.path, e.name)) problems.push(`${f.id}: "${e.path}" no longer holds "${e.name}"; correct it or mark the row "evidence changed: re-check"`);
    }
  }
  return problems;
}

export type ModuleCounts = { module: FindingModule | "all"; total: number; open: number; recheck: number; fixed: number; decision: number; high: number; medium: number; low: number; notRated: number };

/** One line of counts for each module that has rows, then a total. */
export function countsOf(findings: Finding[]): ModuleCounts[] {
  const rows: ModuleCounts[] = [];
  const blank = (module: FindingModule | "all"): ModuleCounts => ({ module, total: 0, open: 0, recheck: 0, fixed: 0, decision: 0, high: 0, medium: 0, low: 0, notRated: 0 });
  const add = (c: ModuleCounts, f: Finding) => {
    c.total += 1;
    c[f.statusKind === "open" ? "open" : f.statusKind === "recheck" ? "recheck" : f.statusKind === "fixed" ? "fixed" : "decision"] += 1;
    c[f.severity === "not rated" ? "notRated" : f.severity] += 1;
  };
  const all = blank("all");
  for (const module of FINDING_MODULES) {
    const mine = findings.filter((f) => f.module === module);
    if (!mine.length) continue;
    const c = blank(module);
    for (const f of mine) {
      add(c, f);
      add(all, f);
    }
    rows.push(c);
  }
  rows.push(all);
  return rows;
}

export const COUNTS_START = "<!-- FINDINGS-COUNTS-START -->";
export const COUNTS_END = "<!-- FINDINGS-COUNTS-END -->";

/** The counts table, as it must stand between the markers. */
export function countsBlock(findings: Finding[]): string {
  const head = ["| Module | Findings | Open | Re-check | Fixed | Documented decision | High | Medium | Low | Not rated |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
  const lines = countsOf(findings).map((c) => {
    const name = c.module === "all" ? "**All**" : c.module;
    const n = (v: number) => (c.module === "all" ? `**${v}**` : String(v));
    return `| ${name} | ${n(c.total)} | ${n(c.open)} | ${n(c.recheck)} | ${n(c.fixed)} | ${n(c.decision)} | ${n(c.high)} | ${n(c.medium)} | ${n(c.low)} | ${n(c.notRated)} |`;
  });
  return [...head, ...lines].join("\n");
}

/** The block between the markers is exactly the counts of the rows. */
export function checkCounts(markdown: string, findings: Finding[]): string[] {
  const start = markdown.indexOf(COUNTS_START);
  const end = markdown.indexOf(COUNTS_END);
  if (start < 0 || end < 0 || end < start) return [`the counts block is missing: it sits between ${COUNTS_START} and ${COUNTS_END}`];
  const found = markdown.slice(start + COUNTS_START.length, end).trim();
  const expected = countsBlock(findings);
  return found === expected ? [] : [`the counts block does not match the rows; it must read:\n${expected}`];
}
