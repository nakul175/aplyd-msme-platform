// The document set cites its own identifiers: functions (FR), use cases (UC), screens (SCR), messages (MSG), rules (RULE), architecture
// decisions (AD), test scenarios (SC), test cases (TC), regression entries (RP), test data (TD), threats (TH) and operations (API).
// An identifier is defined where it starts a table row or sits in a heading, and may be cited anywhere. A citation of an identifier
// that is defined nowhere is a broken reference, the same fault as a broken link. Pure functions: they take text.

const KINDS: { kind: string; re: RegExp }[] = [
  { kind: "FR", re: /\bFR-[A-Z]+-\d{2,3}\b/g },
  { kind: "UC", re: /\bUC-[A-Z]+-\d{2,3}\b/g },
  { kind: "TC", re: /\bTC-[A-Z]+-\d{2,3}\b/g },
  { kind: "SCR", re: /\bSCR-\d{2,3}\b/g },
  { kind: "MSG", re: /\bMSG-\d{2,3}\b/g },
  { kind: "RULE", re: /\bRULE-\d{2,3}\b/g },
  { kind: "AD", re: /\bAD-\d{2,3}\b/g },
  { kind: "SC", re: /\bSC-\d{2,3}\b/g },
  { kind: "RP", re: /\bRP-\d{2,3}\b/g },
  { kind: "TD", re: /\bTD-\d{2,3}\b/g },
  { kind: "TH", re: /\bTH-\d{2,3}\b/g },
  { kind: "API", re: /\bAPI-\d{2,3}\b/g },
];

export const ID_KIND_NAMES = KINDS.map((k) => k.kind);

const stripFences = (text: string) => text.replace(/```[\s\S]*?```/g, "");

const idsIn = (text: string): string[] => KINDS.flatMap((k) => text.match(k.re) ?? []);

/** Identifiers a text defines: any at the start of a table row, or anywhere in a heading line. */
export function definedIds(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of stripFences(text).split("\n")) {
    if (/^#{1,6}\s/.test(line)) idsIn(line).forEach((i) => out.add(i));
    else {
      const m = /^\| ([A-Z]+(?:-[A-Z]+)?-\d{2,3}) \|/.exec(line);
      if (m && idsIn(m[1]!).length) out.add(m[1]!);
    }
  }
  return out;
}

/** Identifiers a text cites, outside fenced code. */
export function citedIds(text: string): Set<string> {
  return new Set(idsIn(stripFences(text)));
}

/** Every citation, in any of the files, of an identifier that no file defines. */
export function brokenReferences(files: { path: string; text: string }[]): string[] {
  const defined = new Set<string>();
  for (const f of files) definedIds(f.text).forEach((i) => defined.add(i));
  const problems: string[] = [];
  for (const f of files) for (const id of citedIds(f.text)) if (!defined.has(id)) problems.push(`${f.path}: ${id} is cited but defined in no document`);
  return problems.sort();
}
