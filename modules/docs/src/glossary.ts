// Reads the glossary (docs/GLOSSARY.md) as data: one row for each term, in four cells (term, meaning, what it is not to be confused with, and
// where it is defined or enforced). What can be checked is the form of the rows, the order, and that the glossary covers what the other
// documents define for their readers: the terms of the BRD and FSD convention tables, and every identifier scheme the documents define.
// Pure functions: they take text and, where they need to know what exists, a function that says so.
import { resolveLink } from "./findings.ts";

export const MAX_MEANING_SENTENCES = 2;

export type GlossaryEntry = {
  term: string;
  meaning: string;
  confusedWith: string;
  where: string;
  /** The letter heading the row sits under. */
  letter: string;
};

const ROW = /^\| \*\*(.+?)\*\* \|/;
export const cellsOf = (line: string): string[] => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(" | ").map((c) => c.trim());

/** The key terms are ordered by: lower case, with anything before the first letter or digit dropped, then the term as written. */
export function sortKey(term: string): string {
  return `${term.toLowerCase().replace(/^[^a-z0-9]+/, "")}\u0000${term}`;
}

export const letterOf = (term: string): string => {
  const first = term.toLowerCase().replace(/^[^a-z0-9]+/, "")[0] ?? "";
  return /[a-z]/.test(first) ? first.toUpperCase() : "";
};

/** Sentences are counted at a full stop, question mark or exclamation mark followed by a capital, a quote, a bracket or the end. Code and links are ignored. */
export function sentenceCount(text: string): number {
  const plain = text.replace(/`[^`]*`/g, "x").replace(/\]\([^)]*\)/g, "]");
  return (plain.match(/[.!?](?:\s+(?=[A-Z"'(\[])|$)/g) ?? []).length;
}

/** Every row of the glossary. Throws one error naming every problem. */
export function parseGlossary(markdown: string): GlossaryEntry[] {
  const out: GlossaryEntry[] = [];
  const problems: string[] = [];
  let inFence = false;
  let letter = "";
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const h = /^## ([A-Z])$/.exec(line);
    if (h) {
      letter = h[1]!;
      continue;
    }
    if (!ROW.test(line)) continue;
    const cells = cellsOf(line);
    const term = ROW.exec(line)![1]!;
    if (cells.length !== 4) {
      problems.push(`${term}: ${cells.length} cells, expected 4 (term, meaning, not to be confused with, where defined); a "|" inside a cell breaks a row`);
      continue;
    }
    const [, meaning, confusedWith, where] = cells as [string, string, string, string];
    if (!meaning) problems.push(`${term}: no meaning`);
    else if (sentenceCount(meaning) > MAX_MEANING_SENTENCES) problems.push(`${term}: the meaning is ${sentenceCount(meaning)} sentences; it is at most ${MAX_MEANING_SENTENCES}`);
    if (!confusedWith) problems.push(`${term}: nothing under "do not confuse with"`);
    if (!where) problems.push(`${term}: nothing under "where defined or enforced"`);
    if (letterOf(term) === "") problems.push(`${term}: a term starts with a letter (a symbol before it is ignored); a number sorts under no heading`);
    else if (letterOf(term) !== letter) problems.push(`${term}: sits under the heading "${letter || "none"}" and belongs under "${letterOf(term)}"`);
    out.push({ term, meaning, confusedWith, where, letter });
  }
  const seen = new Set<string>();
  for (const e of out) {
    if (seen.has(e.term)) problems.push(`${e.term}: defined twice`);
    seen.add(e.term);
  }
  for (let i = 1; i < out.length; i++) {
    if (sortKey(out[i - 1]!.term) > sortKey(out[i]!.term)) problems.push(`${out[i]!.term}: comes after ${out[i - 1]!.term}; terms are in alphabetical order`);
  }
  if (problems.length) throw new Error(`the glossary has ${problems.length} problem(s):\n  - ${[...new Set(problems)].join("\n  - ")}`);
  return out;
}

export type Required = { term: string; source: string; kind: "term" | "basis" | "status" | "area" };

/** The rows of a table in the section whose heading starts with the given number, as arrays of cells (the header and the rule are not rows). */
function sectionTable(markdown: string, number: string): string[][] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^#{2,4} ${number.replace(".", "\\.")}\\b`).test(l));
  if (start < 0) return [];
  const rows: string[][] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6} /.test(lines[i]!)) break;
    if (!lines[i]!.startsWith("| ") || /^\| -/.test(lines[i]!)) continue;
    rows.push(cellsOf(lines[i]!));
  }
  return rows.slice(1);
}

const bolds = (text: string): string[] => [...text.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]!);

/**
 * The terms the other documents define for their readers: the first column of the FSD convention table (split at commas), the placeholder
 * identifiers named in its meanings, the area codes it lists, the columns of the BRD table of columns, and the words of its Basis and Status today rows.
 */
export function requiredTerms(fsd: string, brd: string): Required[] {
  const out: Required[] = [];
  for (const [first = "", meaning = ""] of sectionTable(fsd, "1.3")) {
    for (const part of first.split(", ")) out.push({ term: part.trim(), source: "FSD 1.3", kind: "term" });
    for (const t of meaning.match(/(?<![A-Za-z-])[A-Z]{2,5}-NN\b/g) ?? []) if (t !== first) out.push({ term: t, source: "FSD 1.3", kind: "term" });
    const areas = /Areas: ([A-Z, ]+)\./.exec(meaning);
    if (areas) for (const a of areas[1]!.split(", ")) out.push({ term: a.trim(), source: "FSD 1.3 (areas)", kind: "area" });
  }
  for (const [column = "", meaning = ""] of sectionTable(brd, "1.2")) {
    out.push({ term: column, source: "BRD 1.2", kind: "term" });
    if (column === "Basis") for (const w of bolds(meaning)) out.push({ term: w, source: "BRD 1.2 (Basis)", kind: "basis" });
    if (column === "Status today") for (const w of bolds(meaning)) out.push({ term: w.replace(/:$/, ""), source: "BRD 1.2 (Status today)", kind: "status" });
  }
  const seen = new Set<string>();
  return out.filter((r) => {
    const k = `${r.kind}|${r.term}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** What the glossary lacks of the required terms, each as a sentence naming where the term comes from. */
export function missingTerms(required: Required[], entries: GlossaryEntry[]): string[] {
  const terms = entries.map((e) => e.term);
  const has = (r: Required): boolean => {
    if (r.kind === "basis") return terms.includes(r.term) || terms.includes(`${r.term} (as a Basis)`);
    if (r.kind === "status") return terms.includes(r.term) || terms.includes(`${r.term} (as a Status today)`);
    return terms.some((t) => t === r.term || t.split(", ").includes(r.term));
  };
  return required.filter((r) => !has(r)).map((r) => `"${r.term}" (${r.source}) has no entry in the glossary`);
}

/** The prefix of each identifier scheme a text defines: at the start of a table row or in a heading (BR, TC, D, OQ, and S for S1 to S4). */
export function definedPrefixes(markdown: string): Set<string> {
  const out = new Set<string>();
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /(?:^\| |^#{1,6} )([A-Z]{1,5})(?:-[A-Z]{2,5})?-(\d{2,3})\b/.exec(line);
    if (m) out.add(m[1]!);
    if (/^\| S\d \|/.test(line)) out.add("S");
  }
  return out;
}

/** Every identifier scheme that some document defines has a glossary entry whose term starts with the prefix and a hyphen. */
export function missingPrefixes(prefixes: Set<string>, entries: GlossaryEntry[]): string[] {
  return [...prefixes].sort().filter((p) => !entries.some((e) => e.term.startsWith(`${p}-`))).map((p) => `the identifier scheme ${p}-nn is defined in the documents and has no entry in the glossary`);
}

const PATH_SPAN = /`([^`]+)`/g;
export const looksLikePath = (s: string): boolean => /^[A-Za-z0-9_.\/-]+$/.test(s) && !s.startsWith("/") && (s.includes("/") || /\.[a-z]{1,5}$/.test(s)) && !/\*|</.test(s);

/** Every path in code in the "where" cell exists, and every link in it leads to a file. Placeholders (`<name>`, `*`) are not paths. */
export function checkWhere(entries: GlossaryEntry[], fromFile: string, exists: (path: string) => boolean): string[] {
  const problems: string[] = [];
  for (const e of entries) {
    for (const m of e.where.matchAll(PATH_SPAN)) if (looksLikePath(m[1]!) && !exists(m[1]!)) problems.push(`${e.term}: the path ${m[1]} does not exist`);
    for (const l of e.where.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const r = resolveLink(fromFile, l[1]!);
      if (!r || !exists(r.path)) problems.push(`${e.term}: the link ${l[1]} does not resolve to a file`);
    }
  }
  return problems;
}

/** What to look for in the repository's files: the term without its bracket qualifier, and an identifier scheme such as AD-nn as "AD-". */
export function searchKey(term: string): string {
  return term.replace(/\s*\([^)]*\)\s*$/, "").replace(/-(?:AREA-)?n{2,3}$/i, "-");
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A term the repository does not use: it is in no file of the corpus (the text of every file but the glossary), as a whole word, in any case. */
export function unusedTerms(entries: GlossaryEntry[], corpus: string): string[] {
  const out: string[] = [];
  for (const e of entries) {
    const key = searchKey(e.term);
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(key)}${/[A-Za-z0-9]$/.test(key) ? "(?![A-Za-z0-9])" : ""}`, "i");
    if (!re.test(corpus)) out.push(`"${e.term}" is in no file of the repository outside the glossary: look for "${key}"`);
  }
  return out;
}

/** The identifier of a suite of the test runner: a layer and a name, with the module before them (docs/unit/ids, static/documentation). */
export const SUITE_LIKE = /^(?:[a-z]+\/)?(?:static|unit|integration|smoke|browser)\/[a-z0-9-]+$/;

/** A path in code that names a directory or file (it holds a slash) exists, wherever it is in the text. A bare file name is not checked: it has no place to be looked up, and a suite identifier is not a path. */
export function checkPathsInText(markdown: string, exists: (path: string) => boolean): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    for (const m of line.matchAll(PATH_SPAN)) if (m[1]!.includes("/") && !SUITE_LIKE.test(m[1]!) && looksLikePath(m[1]!) && !exists(m[1]!)) out.push(`the path ${m[1]} does not exist`);
  }
  return [...new Set(out)];
}

export type StageRow = { stage: string; step: string; page: string; module: string; area: string };

/** The rows of the table of the five stages: the stage, the step name, the page name, the module and the area code. */
export function stageRows(markdown: string): StageRow[] {
  const lines = markdown.split("\n");
  const from = lines.findIndex((l) => /^## The five stages/.test(l));
  if (from < 0) return [];
  const out: StageRow[] = [];
  for (let i = from + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]!)) break;
    if (!lines[i]!.startsWith("| ") || /^\| -/.test(lines[i]!)) continue;
    const c = cellsOf(lines[i]!);
    if (c.length === 5 && c[0] !== "Stage (thesis, BRD)") out.push({ stage: c[0]!, step: c[1]!, page: c[2]!, module: c[3]!.replace(/`/g, ""), area: c[4]! });
  }
  return out;
}

/** The step and page names of the stage table are the ones the progress strip's source holds, in the same order, and the module of each is a directory. */
export function checkStages(rows: StageRow[], progressSource: string, exists: (path: string) => boolean): string[] {
  const out: string[] = [];
  const pairs = [...progressSource.matchAll(/short: "([^"]+)", page: "([^"]+)"/g)].map((m) => ({ step: m[1]!, page: m[2]! }));
  if (rows.length !== pairs.length) out.push(`the stage table has ${rows.length} rows and the progress strip has ${pairs.length} stages`);
  rows.forEach((r, i) => {
    const p = pairs[i];
    if (p && (p.step !== r.step || p.page !== r.page)) out.push(`${r.stage}: the table says "${r.step}" and "${r.page}" and the progress strip says "${p.step}" and "${p.page}"`);
    if (!exists(r.module)) out.push(`${r.stage}: the module ${r.module} does not exist`);
  });
  return out;
}
