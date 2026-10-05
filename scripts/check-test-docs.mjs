#!/usr/bin/env node
// Test documentation integrity. Reads docs/test/*.md and docs/brd/BRD.md as data (modules/docs/src/testdocs.ts) and checks:
//   1. every case row of TEST-CASES.md is well formed (eight cells, a known layer and type, the automation grammar, IDs unique and numbered in order);
//   2. every requirement a case cites exists in the BRD, and every requirement in the BRD is cited by at least one case;
//   3. every automated case names a test file that exists and a title that file declares, word for word;
//   4. every Must requirement that the BRD calls Built or Partial has an automated case, or is named in the known-gaps block (which must itself be true);
//   5. the coverage counts and the matrix in TRACEABILITY.md are what the cases add up to (run with --write to regenerate them);
//   6. every case, requirement and code path the other six documents name exists, and their SC, RP and TD entries are numbered in order.
// Exit code 0 when clean, 1 when a problem is found.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRequirements } from "../modules/docs/src/brd.ts";
import { TEST_DOCUMENTS, checkTestDocuments, parseCases, withTraceability } from "../modules/docs/src/testdocs.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BRD = "docs/brd/BRD.md";
const write = process.argv.includes("--write");

const exists = (p) => existsSync(join(ROOT, p));
const read = (p) => (exists(p) ? readFileSync(join(ROOT, p), "utf8") : undefined);

const problems = [];
let reqs = [];
try {
  reqs = parseRequirements(read(BRD) ?? "");
} catch (e) {
  problems.push(e.message);
}

const docs = Object.fromEntries(Object.values(TEST_DOCUMENTS).map((p) => [p, read(p)]));

if (write && reqs.length && docs[TEST_DOCUMENTS.cases] !== undefined && docs[TEST_DOCUMENTS.traceability] !== undefined) {
  const parsed = parseCases(docs[TEST_DOCUMENTS.cases]);
  if (parsed.problems.length === 0 && parsed.cases.length > 0) {
    const wanted = withTraceability(docs[TEST_DOCUMENTS.traceability], parsed.cases, reqs);
    if (wanted !== docs[TEST_DOCUMENTS.traceability]) {
      writeFileSync(join(ROOT, TEST_DOCUMENTS.traceability), wanted);
      docs[TEST_DOCUMENTS.traceability] = wanted;
      console.log(`${TEST_DOCUMENTS.traceability}: the coverage counts and the matrix were regenerated.`);
    }
  }
}

let caseCount = 0;
if (reqs.length) {
  const result = checkTestDocuments({ brd: reqs, docs, read, exists });
  problems.push(...result.problems);
  caseCount = result.cases.length;
}

if (problems.length) {
  console.error(`Test documentation check failed (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Test documentation check passed: ${caseCount} cases cover ${reqs.length} requirements, every automated case names a test that exists, the matrix is current.`);
