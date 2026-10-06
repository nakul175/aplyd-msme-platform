// A presenter script that names a button the pages no longer have is worse than none. Every text the script puts in quotes as something to
// press, fill in or open is looked for in the sources of the pages and modules that render it, so a renamed label fails here, not in front of an audience.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { STEPS } from "../../src/script.ts";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "app", "modules"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f) => /^app\/.*\.tsx$/.test(f) || /^modules\/(?!demo\/)[^/]+\/src\/.*\.tsx?$/.test(f));
const SOURCE = files.map((f) => readFileSync(`${ROOT}${f}`, "utf8")).join("\n");

test("every label the script names is in the pages' or modules' own text", () => {
  assert.ok(files.includes("app/factory/page.tsx") && files.includes("modules/factory/src/questionnaire.ts"), "the search covers the pages and the questionnaire");
  const missing: string[] = [];
  for (const s of STEPS) for (const label of s.labels) if (!SOURCE.includes(label)) missing.push(`step ${s.n}: "${label}"`);
  assert.deepEqual(missing, []);
});

test("the home page links the script opens from", () => {
  const home = readFileSync(`${ROOT}app/page.tsx`, "utf8");
  for (const s of STEPS) assert.ok(home.includes(s.open) || SOURCE.includes(s.open), `step ${s.n} opens "${s.open}", which no page offers`);
});

test("every label is named once at most per step and is not empty", () => {
  for (const s of STEPS) {
    assert.equal(new Set(s.labels).size, s.labels.length, `step ${s.n} repeats a label`);
    for (const l of s.labels) assert.ok(l.trim().length >= 4, `step ${s.n}: "${l}"`);
  }
});
