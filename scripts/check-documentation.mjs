#!/usr/bin/env node
// Documentation integrity. Uses only Node, so the docs workflow needs no install.
//   1. Every relative Markdown link resolves to a file, and any #anchor to a heading in it.
//   2. Every decision, proposal, carried-forward position, open question and source ID that is mentioned is defined.
//   3. Every source in the register has a 64-character SHA-256.
//   4. No file holds a merge-conflict marker (a merge committed without being resolved put one in HANDOVER.md on slice 5).
// Exit code 0 when clean, 1 when a problem is found.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function markdownFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], { cwd: ROOT, encoding: "utf8" });
    return out.split("\n").filter(Boolean).filter((f) => existsSync(join(ROOT, f)));
  } catch {
    const found = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", ".git", "dist", ".next", ".wrangler"].includes(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".md")) found.push(relative(ROOT, p));
      }
    };
    walk(ROOT);
    return found;
  }
}

const stripCode = (text) => text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
const slug = (heading) =>
  heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");

function anchorsOf(file) {
  const text = stripCode(readFileSync(join(ROOT, file), "utf8"));
  const seen = new Map();
  const set = new Set();
  for (const m of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = slug(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    set.add(n === 0 ? base : `${base}-${n}`);
  }
  return set;
}

const problems = [];
const files = markdownFiles();
const anchorCache = new Map();
const anchors = (f) => anchorCache.get(f) ?? (anchorCache.set(f, anchorsOf(f)), anchorCache.get(f));

// 1. Links
for (const file of files) {
  const text = stripCode(readFileSync(join(ROOT, file), "utf8"));
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    const [path, hash] = target.split("#");
    const resolved = path === "" ? file : relative(ROOT, resolve(ROOT, dirname(file), path));
    if (!existsSync(join(ROOT, resolved))) {
      problems.push(`${file}: link to "${target}" does not resolve`);
      continue;
    }
    if (hash && resolved.endsWith(".md") && !anchors(resolved).has(hash)) {
      problems.push(`${file}: link to "${target}" has no matching heading`);
    }
  }
}

// 2. Defined identifiers
function definedIds(file, pattern) {
  if (!existsSync(join(ROOT, file))) return new Set();
  const ids = new Set();
  for (const m of readFileSync(join(ROOT, file), "utf8").matchAll(pattern)) ids.add(m[1]);
  return ids;
}
const defined = {
  decision: definedIds("docs/decisions.md", /^\|\s*([DPC]-\d{2})\s*\|/gm),
  question: definedIds("docs/open-questions.md", /^\|\s*(OQ-\d{2})\s*\|/gm),
  source: definedIds("docs/sources.md", /^\|\s*(S\d)\s*\|/gm),
};
const mentions = [
  [/\b([DPC]-\d{2})\b/g, defined.decision, "decision, proposal or position"],
  [/\b(OQ-\d{2})\b/g, defined.question, "open question"],
  [/(?<![\w-])(S\d)(?![\w-])/g, defined.source, "source"],
];
for (const file of files) {
  const text = stripCode(readFileSync(join(ROOT, file), "utf8"));
  for (const [re, set, label] of mentions) {
    for (const m of text.matchAll(re)) {
      if (!set.has(m[1])) problems.push(`${file}: ${m[1]} is mentioned but no ${label} with that ID is defined`);
    }
  }
}

// 3. Checksums
if (existsSync(join(ROOT, "docs/sources.md"))) {
  for (const line of readFileSync(join(ROOT, "docs/sources.md"), "utf8").split("\n")) {
    const row = line.match(/^\|\s*(S\d)\s*\|/);
    if (row && !/\|\s*[0-9a-f]{64}\s*\|\s*$/.test(line)) problems.push(`docs/sources.md: ${row[1]} has no 64-character SHA-256`);
  }
}

// 4. Conflict markers: a line that starts "<<<<<<< " or ">>>>>>> " (git writes both, with a branch name after them), in any text file
// that is in the repository. A bare "=======" line is not looked for on its own: Markdown uses it to underline a heading.
const TEXT = /\.(md|mjs|cjs|js|jsx|ts|tsx|json|sql|yml|yaml|css|html|txt|toml)$/;
function textFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\n").filter(Boolean).filter((f) => TEXT.test(f) && existsSync(join(ROOT, f)));
  } catch {
    const found = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", ".git", "dist", ".next", ".wrangler"].includes(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (TEXT.test(name)) found.push(relative(ROOT, p));
      }
    };
    walk(ROOT);
    return found;
  }
}
for (const file of textFiles()) {
  readFileSync(join(ROOT, file), "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (/^(<{7}|>{7})( |$)/.test(line)) problems.push(`${file}:${i + 1}: a merge-conflict marker is still in the file`);
    });
}

if (problems.length) {
  console.error(`Documentation check failed (${problems.length}):`);
  for (const p of [...new Set(problems)]) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Documentation check passed: ${files.length} Markdown files, no conflict markers, ${defined.decision.size} decisions, ${defined.question.size} open questions, ${defined.source.size} sources.`);
