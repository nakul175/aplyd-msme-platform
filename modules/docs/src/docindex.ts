// Reads the documentation index (docs/DOCUMENTATION-INDEX.md) as data: the table of documents (section 3), the four reading paths (section 2) and the
// table of checks (section 4). What can be checked is that every document of the repository is listed, that each row says what the document says of
// itself (version, date, status), that the reading paths lead to listed documents, and that every check, path and suite the index names exists.
// Every document is a link, and a link to a file that is not there is broken: there is no label for a document that may not exist yet.
// Pure functions: they take text and, where they need to know what exists, a function that says so.
import { resolveLink } from "./findings.ts";
import { cellsOf, looksLikePath, SUITE_LIKE } from "./glossary.ts";

export const READERS = ["sponsor", "developer", "tester", "operator"] as const;
export type Reader = (typeof READERS)[number];

/** The four reading paths, in the order the index gives them. */
export const PATH_NAMES = ["Sponsor", "Developer", "Tester", "Operator"] as const;
export const MIN_PATH_ITEMS = 3;

/** Words that make a status say nothing. A status says what the document is, not that it is on its way. */
const EMPTY_STATUS = [/being written/i, /\bTBD\b/, /\bto come\b/i, /\bin progress\b/i, /\bcoming soon\b/i, /\bunder construction\b/i, /\bto be written\b/i, /\badded with this set\b/i];

export type IndexedDocument = {
  path: string;
  purpose: string;
  readers: Reader[];
  truth: string;
  status: string;
};

/** What a document says in its opening lines when it gives a date or a version of itself. A date of something else (a source, a decision) is not one. */
const STATES_A_DATE = /\b(?:last updated|date:|prepared (?:on )?\d|version \d)/i;

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE = new RegExp(`\\b\\d{1,2} (?:${MONTHS}) \\d{4}\\b`, "g");

/** The lines of the section whose heading starts with the given text, up to the next heading of the same level. */
function section(markdown: string, level: number, start: string): string[] {
  const lines = markdown.split("\n");
  const mark = "#".repeat(level);
  const from = lines.findIndex((l) => l.startsWith(`${mark} ${start}`));
  if (from < 0) return [];
  const out: string[] = [];
  for (let i = from + 1; i < lines.length; i++) {
    if (new RegExp(`^#{1,${level}} `).test(lines[i]!)) break;
    out.push(lines[i]!);
  }
  return out;
}

const tableRows = (lines: string[]): string[][] => lines.filter((l) => l.startsWith("| ") && !/^\| -/.test(l)).map(cellsOf);

/** Every document of the table in section 3. Throws one error naming every malformed row. */
export function parseDocuments(markdown: string, indexPath: string): IndexedDocument[] {
  const out: IndexedDocument[] = [];
  const problems: string[] = [];
  for (const cells of tableRows(section(markdown, 2, "3."))) {
    if (cells[0] === "Document") continue;
    const label = cells[0] ?? "(empty)";
    if (cells.length !== 5) {
      problems.push(`${label}: ${cells.length} cells, expected 5 (document, purpose, readers, source of truth for, status and date); a "|" inside a cell breaks a row`);
      continue;
    }
    const [first, purpose, readersCell, truth, status] = cells as [string, string, string, string, string];
    let path = "";
    const link = /^\[[^\]]+\]\(([^)\s]+)\)$/.exec(first);
    if (link) {
      const r = resolveLink(indexPath, link[1]!);
      if (!r || r.anchor) problems.push(`${label}: the link ${link[1]} must lead to a file, without an anchor`);
      else path = r.path;
    } else problems.push(`${label}: the first cell is a link to the document`);
    for (const [name, v] of [["purpose", purpose], ["source of truth", truth], ["status and date", status]] as const) if (!v) problems.push(`${label}: no ${name}`);
    const parts = readersCell.split(", ").map((r) => r.trim());
    const known = parts.every((r) => r === "all" || (READERS as readonly string[]).includes(r));
    if (!known) problems.push(`${label}: the readers are ${READERS.join(", ")} or all; found "${readersCell}"`);
    else if (parts.includes("all") && parts.length > 1) problems.push(`${label}: "all" stands alone`);
    else if (new Set(parts).size !== parts.length) problems.push(`${label}: a reader is named twice`);
    const readers = parts.includes("all") ? [...READERS] : (parts.filter((r) => r !== "all") as Reader[]);
    if (EMPTY_STATUS.some((re) => re.test(status))) problems.push(`${label}: the status "${status}" says nothing; give what the document is, its date and whether a person has reviewed it`);
    out.push({ path, purpose, readers, truth, status });
  }
  const seen = new Set<string>();
  for (const d of out) {
    if (d.path && seen.has(d.path)) problems.push(`${d.path}: listed twice`);
    seen.add(d.path);
  }
  if (problems.length) throw new Error(`the document table has ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
  return out;
}

/** True for a file the index must list: every Markdown file, and every HTML page under docs/. */
export const isDocumentPath = (path: string): boolean => /\.md$/.test(path) || (path.startsWith("docs/") && /\.html$/.test(path));

/** The documents of the repository the index does not list. */
export function missingFromIndex(documents: IndexedDocument[], tracked: string[]): string[] {
  const listed = new Set(documents.map((d) => d.path));
  return tracked.filter(isDocumentPath).filter((p) => !listed.has(p)).sort().map((p) => `${p} is a document of the repository and the index does not list it`);
}

/** Every listed document exists: a link to a file that is not there is broken. */
export function missingListed(documents: IndexedDocument[], exists: (path: string) => boolean): string[] {
  return documents.filter((d) => !exists(d.path)).map((d) => `${d.path}: the link leads to a file that is not there`);
}

/**
 * What a row says of its document is what the document says of itself: each date and each commit in the status is in the document, the version is
 * the one its opening lines state (a document that quotes an earlier version further down does not pass for it), and a draft that is "not reviewed
 * by a person" says so. A row that says "No date stated" is for a document that gives no date or version of itself in its first lines.
 */
export function checkStatusClaims(documents: IndexedDocument[], read: (path: string) => string | null): string[] {
  const out: string[] = [];
  for (const d of documents) {
    const text = read(d.path);
    if (text === null) continue;
    for (const date of d.status.match(DATE) ?? []) if (!text.includes(date)) out.push(`${d.path}: the status gives ${date} and the document does not`);
    for (const commit of d.status.match(/\b(?=[0-9a-f]*\d)[0-9a-f]{7}\b/g) ?? []) if (!text.includes(commit)) out.push(`${d.path}: the status gives the commit ${commit} and the document does not`);
    const version = /\bVersion (\d+\.\d+)/.exec(d.status);
    if (version) {
      const own = /\bVersion (\d+\.\d+)/.exec(text.split("\n").slice(0, 25).join("\n"));
      if (own && own[1] !== version[1]) out.push(`${d.path}: the status gives Version ${version[1]} and the opening lines of the document say Version ${own[1]}`);
      else if (!own && !text.includes(`Version ${version[1]}`)) out.push(`${d.path}: the status gives Version ${version[1]} and the document does not`);
    }
    if (/draft, not reviewed by a person/i.test(d.status) && !/not reviewed by a person/i.test(text)) out.push(`${d.path}: the status says "not reviewed by a person" and the document does not`);
    if (d.status.startsWith("No date stated")) {
      const found = STATES_A_DATE.exec(text.split("\n").slice(0, 25).join("\n"));
      if (found) out.push(`${d.path}: the status says no date is stated and the first lines say "${found[0]}"`);
    }
  }
  return out;
}

export type ReadingPath = { name: string; items: { number: number; text: string; links: string[] }[] };

/** The reading paths of section 2: a heading for each reader and a numbered list under it. */
export function parseReadingPaths(markdown: string, indexPath: string): ReadingPath[] {
  const out: ReadingPath[] = [];
  for (const line of section(markdown, 2, "2.")) {
    const h = /^### (.+)$/.exec(line);
    if (h) {
      out.push({ name: h[1]!.trim(), items: [] });
      continue;
    }
    const item = /^(\d+)\. (.+)$/.exec(line);
    if (item && out.length) {
      const links = [...item[2]!.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => resolveLink(indexPath, m[1]!)?.path ?? m[1]!);
      out[out.length - 1]!.items.push({ number: Number(item[1]), text: item[2]!, links });
    }
  }
  return out;
}

/** The four paths are there in order, each has at least three numbered items, and each item leads to a listed document or points at the module pages. */
export function checkReadingPaths(paths: ReadingPath[], documents: IndexedDocument[]): string[] {
  const out: string[] = [];
  const names = paths.map((p) => p.name);
  if (names.join("|") !== PATH_NAMES.join("|")) out.push(`the reading paths are ${PATH_NAMES.join(", ")} in that order; found ${names.join(", ") || "none"}`);
  const listed = new Set(documents.map((d) => d.path));
  for (const p of paths) {
    if (p.items.length < MIN_PATH_ITEMS) out.push(`${p.name}: ${p.items.length} item(s), at least ${MIN_PATH_ITEMS} are needed`);
    p.items.forEach((item, i) => {
      if (item.number !== i + 1) out.push(`${p.name}: item ${i + 1} is numbered ${item.number}`);
      for (const l of item.links) if (!listed.has(l)) out.push(`${p.name}, item ${item.number}: ${l} is not a document the index lists`);
      const says = /`modules\/<name>\/`/.test(item.text);
      if (!item.links.length && !says) out.push(`${p.name}, item ${item.number}: no link to a listed document, and it does not point at the pages under modules/<name>/`);
    });
  }
  return out;
}

export type IndexedCheck = { path: string; documents: string; checks: string; run: string };

/** The rows of the table of checks in section 4. Throws one error naming every malformed row. */
export function parseChecks(markdown: string): IndexedCheck[] {
  const out: IndexedCheck[] = [];
  const problems: string[] = [];
  for (const cells of tableRows(section(markdown, 2, "4."))) {
    if (cells[0] === "Check") continue;
    if (cells.length !== 4) {
      problems.push(`${cells[0] ?? "(empty)"}: ${cells.length} cells, expected 4 (check, documents it checks, what it checks, how to run it)`);
      continue;
    }
    const [first, documents, checks, run] = cells as [string, string, string, string];
    const code = /^`([^`]+)`$/.exec(first);
    if (!code) {
      problems.push(`${first}: the first cell is the path of the check in code`);
      continue;
    }
    for (const [name, v] of [["documents it checks", documents], ["what it checks", checks], ["how to run it", run]] as const) if (!v) problems.push(`${code[1]}: no ${name}`);
    out.push({ path: code[1]!, documents, checks, run });
  }
  if (problems.length) throw new Error(`the table of checks has ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
  return out;
}

/** The suite a check runs as: scripts/check-x.mjs is static/x, and modules/m/tests/layer/x.test.ts is m/layer/x. */
export function suiteIdOf(path: string): string | null {
  const script = /^scripts\/check-([a-z-]+)\.mjs$/.exec(path);
  if (script) return `static/${script[1]}`;
  const test = /^modules\/([a-z]+)\/tests\/(static|unit|integration|smoke|browser)\/([a-z0-9-]+)\.test\.ts$/.exec(path);
  return test ? `${test[1]}/${test[2]}/${test[3]}` : null;
}

/**
 * Every check file the index must name is named, each named check is there, and each "how to run it" is the command that runs exactly that suite and
 * names a suite the runner lists.
 */
export function checkChecks(checks: IndexedCheck[], expected: string[], exists: (path: string) => boolean, suiteIds: Set<string>): string[] {
  const out: string[] = [];
  const named = new Set(checks.map((c) => c.path));
  for (const p of expected) if (!named.has(p)) out.push(`${p} is a check and the table of checks does not name it`);
  for (const c of checks) {
    if (!exists(c.path)) out.push(`${c.path}: named in the table of checks and not there`);
    const id = suiteIdOf(c.path);
    if (!id) {
      out.push(`${c.path}: not a script of scripts/ or a test of a module, so its suite cannot be told`);
      continue;
    }
    if (!suiteIds.has(id)) out.push(`${c.path}: the runner lists no suite ${id}`);
    const layer = id.includes("/unit/") ? "unit" : "static";
    if (!c.run.includes(`\`node scripts/test.mjs ${layer} --only ${id}\``)) out.push(`${c.path}: "how to run it" is "node scripts/test.mjs ${layer} --only ${id}" in code; found ${c.run}`);
  }
  return out;
}

/** Every path in code in the index exists, and every suite in code is one the runner lists. */
export function checkCodeSpans(markdown: string, exists: (path: string) => boolean, suiteIds: Set<string>): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const span = m[1]!;
      if (SUITE_LIKE.test(span)) {
        if (!suiteIds.has(span)) out.push(`${span}: the runner lists no such suite`);
      } else if (looksLikePath(span) && !exists(span)) out.push(`${span}: the path does not exist`);
    }
  }
  return [...new Set(out)];
}

/** The suites the runner lists: each line of `node scripts/test.mjs --list` is a layer and an identifier. */
export function suiteIdsOf(listing: string): Set<string> {
  const ids = new Set<string>();
  for (const line of listing.split("\n")) {
    const m = /^(?:static|unit|integration|smoke|browser)\s+(\S+)\s*$/.exec(line);
    if (m) ids.add(m[1]!);
  }
  return ids;
}
