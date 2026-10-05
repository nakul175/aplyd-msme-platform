// A page that takes a message key from the address must look it up with Object.hasOwn: `MESSAGES[q.problem]` on a plain object
// answers a function or Object.prototype for `constructor` or `__proto__`, which the page then tries to draw. The built-application
// smoke test shows the failure; this one names the pattern, so a new page that repeats it fails before a build.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const APP = fileURLToPath(new URL("../../../../app", import.meta.url));

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? pages(join(dir, e.name)) : e.name === "page.tsx" ? [join(dir, e.name)] : []));
}

/** A lookup in an object by a key that came from the address (`q.…`, `searchParams.…`, `params.…`) and is not guarded by hasOwn. */
export function unguardedLookups(source: string): string[] {
  const found: string[] = [];
  source.split("\n").forEach((line, i) => {
    if (/[A-Z][A-Z_]+\[(q|query|searchParams|sp|params)\.[A-Za-z]+\]/.test(line) && !/Object\.hasOwn\(/.test(line) && !/^\s*\{?\s*[A-Z][A-Z_]+\[(q|query|searchParams|sp|params)\.[A-Za-z]+\]\}?\s*$/.test(line)) found.push(`${i + 1}: ${line.trim()}`);
  });
  return found;
}

test("the rule sees an unguarded lookup and accepts a guarded one", () => {
  assert.equal(unguardedLookups("{q.problem && PROBLEMS[q.problem] ? (").length, 1);
  assert.equal(unguardedLookups("{q.problem && Object.hasOwn(PROBLEMS, q.problem) ? (").length, 0);
  assert.equal(unguardedLookups("{PROBLEMS[q.problem]}").length, 0, "the draw that follows a guarded test is not the guard");
});

test("no page looks a message up by a key from the address without Object.hasOwn", () => {
  const problems: string[] = [];
  for (const file of pages(APP)) for (const p of unguardedLookups(readFileSync(file, "utf8"))) problems.push(`${file.slice(APP.length - 3)}:${p}`);
  assert.deepEqual(problems, []);
});
