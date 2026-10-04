// The documentation check refuses a merge-conflict marker left in any text file. Tried here on a small tree of its own, with a copy
// of the script, because the script reads the repository it sits in and this repository must stay clean.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SCRIPT = fileURLToPath(new URL("../../../../scripts/check-documentation.mjs", import.meta.url));

function check(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "docs-check-"));
  try {
    mkdirSync(join(root, "scripts"));
    copyFileSync(SCRIPT, join(root, "scripts", "check-documentation.mjs"));
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(root, name, ".."), { recursive: true });
      writeFileSync(join(root, name), text);
    }
    const run = spawnSync(process.execPath, [join(root, "scripts", "check-documentation.mjs")], { cwd: root, encoding: "utf8" });
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a tree with no conflict marker passes, and a Markdown heading underlined with equals signs is not taken for one", () => {
  const clean = check({ "HANDOVER.md": "Title\n=======\n\nText.\n", "modules/x/src/a.ts": "export const a = 1;\n" });
  assert.equal(clean.status, 0, clean.output);
});

test("a marker of either end, in a document, in code, in SQL or in JSON, fails the check and names the file and the line", () => {
  for (const [file, text, line] of [
    ["HANDOVER.md", "line\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> slice-4-procure\n", 2],
    ["modules/x/src/a.ts", "const a = 1;\n>>>>>>> main\n", 2],
    ["drizzle/0001.sql", "<<<<<<< HEAD\nSELECT 1;\n", 1],
    ["package.json", "{\n<<<<<<<\n}\n", 2],
  ] as const) {
    const result = check({ [file]: text });
    assert.equal(result.status, 1, `${file}: ${result.output}`);
    assert.match(result.output, new RegExp(`${file.replace(/[.]/g, "\\.")}:${line}: a merge-conflict marker`), file);
  }
});
