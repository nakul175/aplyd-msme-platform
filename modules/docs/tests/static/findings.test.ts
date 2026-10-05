// The real findings register: every row is well formed, the rows are grouped by module, every source link leads to a heading that is
// there, the evidence each row names exists, and the counts at the top are the counts of the rows.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkCounts, checkEvidence, checkGrouping, checkSourceLinks, FINDING_MODULES, headingAnchors, parseFindings, resolveLink } from "../../src/findings.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const REGISTER = "docs/FINDINGS.md";
const text = readFileSync(join(ROOT, REGISTER), "utf8");
const findings = parseFindings(text);

const anchorCache = new Map<string, Set<string>>();
const resolver = {
  exists: (path: string) => existsSync(join(ROOT, path)),
  anchors: (path: string) => anchorCache.get(path) ?? (anchorCache.set(path, headingAnchors(readFileSync(join(ROOT, path), "utf8"))), anchorCache.get(path)!),
};
const files = {
  exists: resolver.exists,
  contains: (path: string, name: string) => {
    if (statSync(join(ROOT, path)).isDirectory()) {
      try {
        return execFileSync("git", ["grep", "-F", "-l", "--untracked", "-e", name, "--", path], { cwd: ROOT, encoding: "utf8" }).trim() !== "";
      } catch {
        return false;
      }
    }
    return readFileSync(join(ROOT, path), "utf8").includes(name);
  },
};

test("the register has rows, and every row is well formed with the numbers FND-001 onward and no gap", () => {
  assert.ok(findings.length >= 100, `${findings.length} rows`);
  assert.equal(findings.length, new Set(findings.map((f) => f.id)).size);
});

test("rows are grouped by module in the order the register states, and numbers rise within a module", () => {
  assert.deepEqual(checkGrouping(findings), []);
  for (const m of FINDING_MODULES.filter((m) => m !== "repository")) assert.ok(existsSync(join(ROOT, "modules", m)), `modules/${m} does not exist`);
});

test("every source link leads to a file of the repository and to a heading that is there", () => {
  assert.deepEqual(checkSourceLinks(findings, REGISTER, resolver), []);
});

test("every file or text a row names as evidence exists, unless the row says the evidence changed", () => {
  assert.deepEqual(checkEvidence(findings, files), []);
});

test("the counts at the top are the counts of the rows", () => {
  assert.deepEqual(checkCounts(text, findings), []);
});

test("every status and validation page of a module is the source of at least one finding", () => {
  const cited = new Set(findings.flatMap((f) => f.sources.map((s) => resolveLink(REGISTER, s.target)?.path)));
  const pages = readdirSync(join(ROOT, "modules"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => ["STATUS.md", "VALIDATION.md"].map((p) => `modules/${d.name}/${p}`))
    .filter((p) => existsSync(join(ROOT, p)));
  assert.deepEqual(pages.filter((p) => !cited.has(p)).map((p) => `${p} records no finding in the register; add its known limits and review findings, or say in the register why it has none`), []);
});

test("a finding that its source records as fixed names the slice or branch", () => {
  const vague = findings.filter((f) => f.statusKind === "fixed" && !/^fixed in \S/.test(f.status));
  assert.deepEqual(vague.map((f) => f.id), []);
});
