// Every identifier any Markdown file cites is defined in some Markdown file.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { brokenReferences } from "../../src/ids.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");

test("no document cites a function, use case, screen, message, rule, decision, scenario, case, regression entry, test data set, threat or operation that is defined nowhere", () => {
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && existsSync(join(ROOT, f)));
  assert.deepEqual(brokenReferences(paths.map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }))), []);
});
