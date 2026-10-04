// Structural rules from AGENTS.md that a reviewer should not have to catch by eye.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

test("request code reads only the headers on the allow-list, so identity cannot come from a header", () => {
  // A tripwire, not a proof: it catches the usual ways to read a header (literal name, computed name, bulk read).
  const allowed = new Set(["cookie", "origin", "sec-fetch-site", "content-type"]);
  const receiver = String.raw`[Hh]eaders(?:\(\))?\)?\s*`;
  const literal = new RegExp(`${receiver}\\.get\\(\\s*["'\`]([^"'\`]+)["'\`]`, "g");
  const computed = new RegExp(`${receiver}\\.get\\(\\s*(?!["'\`])`);
  const bulk = new RegExp(`${receiver}\\.(entries|forEach|keys|values|has)\\b|\\.\\.\\.[\\w.]+\\.[Hh]eaders|fromEntries\\([\\w.]+\\.[Hh]eaders|new Headers\\([\\w.]+\\.headers`);
  const files = git("ls-files", "--cached", "--others", "--exclude-standard", "modules/*/src/**/*.ts", "app/**/*.ts", "app/**/*.tsx", "worker/**/*.ts");
  assert.ok(files.length > 5, "source files were found");
  for (const file of files) {
    const text = readFileSync(`${ROOT}${file}`, "utf8");
    for (const m of text.matchAll(literal)) {
      assert.ok(allowed.has(m[1].toLowerCase()), `${file} reads header "${m[1]}". Add it to the allow-list only if it can never carry identity.`);
    }
    assert.ok(!computed.test(text), `${file} reads a header by a computed name`);
    assert.ok(!bulk.test(text), `${file} reads headers in bulk`);
  }
});

test("no tracked file is a secret, a database, build output or a source document", () => {
  const tracked = git("ls-files", "--cached", "--others", "--exclude-standard");
  const forbidden = [/(^|\/)\.env(\..*)?$/, /\.dev\.vars$/, /\.(sqlite|db|pem|pdf)$/i, /(^|\/)(node_modules|dist|\.wrangler|\.next|sources)\//];
  for (const f of tracked) {
    if (f === ".env.example") continue;
    for (const re of forbidden) assert.ok(!re.test(f), `${f} must not be in the repository`);
  }
});

test("the environment template holds names only", () => {
  for (const line of readFileSync(`${ROOT}.env.example`, "utf8").split("\n")) {
    if (line.trim() && !line.startsWith("#")) assert.match(line, /^[A-Z_]+=$/, `value found in .env.example: ${line}`);
  }
});
