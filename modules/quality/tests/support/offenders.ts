// The recorded list of known offenders, and the rule that compares a run against it.
//
// The checks in this module measure pages that other modules own. They must not fail today on faults that are already there, and they
// must fail on a new fault. So each file in known-offenders/ lists what is wrong today, one line per fault, and a test fails when
//   - a fault is found that is not on the list (a regression, or a new page with an old kind of fault), or
//   - a fault on the list is no longer found (it was fixed: remove it from the list, so that it cannot come back unnoticed).
// To record the new state after a deliberate change, run the suite with QUALITY_UPDATE_BASELINE=1: the file is rewritten from what was
// found, and the tests pass. Read the diff before committing it. This is separate from the runner's own --update-baseline, which only
// records how many tests pass.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { after } from "node:test";

export type Finding = { check: string; page: string; persona: string; key: string; detail: string };
export type Entry = { check: string; page: string; key: string; personas: string[]; detail: string };
export type BaselineFile = { about: string; recordedOn: string; entries: Entry[] };

export const UPDATE_ENV = "QUALITY_UPDATE_BASELINE";

const tuple = (check: string, page: string, key: string, persona: string) => JSON.stringify([check, page, key, persona]);

/** Groups findings into one entry for each check, page and key, with the personas that have it. The detail is the first persona's. */
export function toEntries(findings: Finding[], personaOrder: readonly string[] = []): Entry[] {
  const order = (p: string) => (personaOrder.includes(p) ? personaOrder.indexOf(p) : personaOrder.length);
  const map = new Map<string, Entry>();
  for (const f of [...findings].sort((a, b) => order(a.persona) - order(b.persona))) {
    const id = JSON.stringify([f.check, f.page, f.key]);
    const entry = map.get(id) ?? { check: f.check, page: f.page, key: f.key, personas: [], detail: f.detail };
    if (!entry.personas.includes(f.persona)) entry.personas.push(f.persona);
    map.set(id, entry);
  }
  return sortEntries([...map.values()]);
}

export const sortEntries = (entries: Entry[]): Entry[] => [...entries].sort((a, b) => a.check.localeCompare(b.check) || a.page.localeCompare(b.page) || a.key.localeCompare(b.key));

export function tuplesOf(entries: Entry[], check?: string): Set<string> {
  const out = new Set<string>();
  for (const e of entries) if (!check || e.check === check) for (const p of e.personas) out.add(tuple(e.check, e.page, e.key, p));
  return out;
}

export type Diff = { added: string[]; removed: string[] };
const show = (t: string) => {
  const [check, page, key, persona] = JSON.parse(t) as string[];
  return `${page}  ${persona}  ${check}  ${key}`;
};

/** What is found now that is not recorded (added), and what is recorded and no longer found (removed), for the checks named. */
export function diff(found: Finding[], recorded: Entry[], checks: string[]): Diff {
  const added: string[] = [];
  const removed: string[] = [];
  for (const check of checks) {
    const now = tuplesOf(toEntries(found.filter((f) => f.check === check)));
    const then = tuplesOf(recorded, check);
    for (const t of now) if (!then.has(t)) added.push(show(t));
    for (const t of then) if (!now.has(t)) removed.push(show(t));
  }
  return { added: added.sort(), removed: removed.sort() };
}

export function readBaseline(path: string): BaselineFile {
  if (!existsSync(path)) return { about: "", recordedOn: "", entries: [] };
  return JSON.parse(readFileSync(path, "utf8")) as BaselineFile;
}

/** One entry to a line, so a change to the list reads as a change to lines. */
export function formatBaseline(file: BaselineFile): string {
  const head = `{\n  "about": ${JSON.stringify(file.about)},\n  "recordedOn": ${JSON.stringify(file.recordedOn)},\n  "entries": [`;
  const lines = file.entries.map((e) => `    ${JSON.stringify(e)}`);
  return `${head}${lines.length ? `\n${lines.join(",\n")}\n  ` : ""}]\n}\n`;
}

export function message(path: string, d: Diff): string {
  const lines: string[] = [];
  if (d.added.length) lines.push(`${d.added.length} fault(s) found that are not on the list of known offenders (${path}). New faults:`, ...d.added.map((l) => `  + ${l}`));
  if (d.removed.length) lines.push(`${d.removed.length} known offender(s) are no longer found, so they were fixed or the page changed. Remove them from the list:`, ...d.removed.map((l) => `  - ${l}`));
  lines.push(`To record the present state on purpose, run the suite again with ${UPDATE_ENV}=1 and read the diff of ${path}.`);
  return lines.join("\n");
}

/**
 * For one suite file: collects what each test finds and, only when QUALITY_UPDATE_BASELINE=1, rewrites the file of known offenders once
 * the suite is over (all checks of the file together, so one test cannot erase the entries of another).
 */
export function useBaseline(path: string, about: string, checks: string[], personaOrder: readonly string[]) {
  const updating = process.env[UPDATE_ENV] === "1";
  const seen = new Map<string, Finding[]>();
  after(() => {
    if (!updating) return;
    const found = checks.flatMap((c) => seen.get(c) ?? []);
    const missing = checks.filter((c) => !seen.has(c));
    if (missing.length) {
      console.error(`${UPDATE_ENV}=1: not rewriting ${path}, because these checks did not run: ${missing.join(", ")}`);
      return;
    }
    writeFileSync(path, formatBaseline({ about, recordedOn: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }), entries: toEntries(found, personaOrder) }));
    console.error(`${UPDATE_ENV}=1: rewrote ${path} with ${found.length} finding(s).`);
  });
  return {
    path,
    /** Throws, with the new and the vanished faults, unless the findings of `checks` are exactly the recorded ones. */
    expect(found: Finding[], checksHere: string[]) {
      for (const c of checksHere) seen.set(c, found.filter((f) => f.check === c));
      if (updating) return;
      const d = diff(found, readBaseline(path).entries, checksHere);
      if (d.added.length || d.removed.length) throw new Error(message(path, d));
    },
  };
}
