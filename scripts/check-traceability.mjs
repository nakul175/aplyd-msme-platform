#!/usr/bin/env node
// Requirement integrity. Reads docs/brd/BRD.md as data (modules/docs/src/brd.ts) and checks:
//   1. every requirement row is well formed (six cells, a known area, priority and basis, a status, an acceptance criterion), IDs unique;
//   2. the counts block in section 11 of the BRD is what the tables add up to (run with --write to regenerate it);
//   3. every BR-xxx-nn that any Markdown file mentions is a requirement that exists;
//   4. the functional specification (docs/fsd/FSD.md): its function rows trace to requirements that exist, and its section 11 says
//      exactly which functions cover each requirement;
//   5. every FR, UC, SCR, MSG, RULE, AD, SC, TC, RP, TD, TH and API identifier any Markdown file cites is defined in some Markdown file.
// Exit code 0 when clean, 1 when a problem is found.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mentionedIds, parseRequirements, withCounts } from "../modules/docs/src/brd.ts";
import { checkCoverage, parseFunctionalRequirements } from "../modules/docs/src/fsd.ts";
import { brokenReferences } from "../modules/docs/src/ids.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BRD = "docs/brd/BRD.md";
const write = process.argv.includes("--write");

const problems = [];
let reqs = [];
const text = readFileSync(join(ROOT, BRD), "utf8");
try {
  reqs = parseRequirements(text);
} catch (e) {
  problems.push(e.message);
}

if (reqs.length) {
  const wanted = withCounts(text, reqs);
  if (wanted !== text) {
    if (write) {
      writeFileSync(join(ROOT, BRD), wanted);
      console.log(`${BRD}: the counts were regenerated.`);
    } else problems.push(`${BRD}: the counts in section 11 are out of date; run node scripts/check-traceability.mjs --write`);
  }
  const known = new Set(reqs.map((r) => r.id));
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && existsSync(join(ROOT, f)));
  for (const f of files) {
    const body = readFileSync(join(ROOT, f), "utf8").replace(/```[\s\S]*?```/g, "");
    for (const id of mentionedIds(body)) if (!known.has(id)) problems.push(`${f}: ${id} is mentioned but is not a requirement in ${BRD}`);
  }
}

if (reqs.length && existsSync(join(ROOT, "docs/fsd/FSD.md"))) {
  try {
    const fsd = readFileSync(join(ROOT, "docs/fsd/FSD.md"), "utf8");
    problems.push(...checkCoverage(fsd, reqs, parseFunctionalRequirements(fsd, reqs)));
  } catch (e) {
    problems.push(e.message);
  }
}
{
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && existsSync(join(ROOT, f)));
  problems.push(...brokenReferences(files.map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }))));
}

if (problems.length) {
  console.error(`Traceability check failed (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Traceability check passed: ${reqs.length} requirements, counts current, the FSD covers each exactly, every cited identifier is defined.`);
