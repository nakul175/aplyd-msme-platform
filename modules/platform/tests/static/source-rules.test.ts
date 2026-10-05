// Structural rules from AGENTS.md that a reviewer should not have to catch by eye.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { headerReadProblems } from "../support/header-rule.ts";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

// Files that run in a Node process beside the Worker, not in it: the host launcher's gate and gateway (modules/hosting), which hand a request's
// headers on and read one header, Authorization, as the hosting gate's own password (never an application identity; the gate removes it before
// the Worker sees the request), and the demonstration's HTTP client (modules/demo), which reads the one response header that sets its session.
// The rule below is about code that decides who a person is, which runs in the Worker. The exemption is exactly these files, and the test after
// the first one fails if anything the Worker runs can reach one of them through imports.
export const HOST_PROCESS_FILES = ["modules/hosting/src/gate.ts", "modules/hosting/src/gateway.ts", "modules/demo/src/client.ts"];

test("request code reads only the headers on the allow-list, so identity cannot come from a header", () => {
  // Every source file of the application, found by listing directories (a pathspec with ** skipped top-level files such as app/page.tsx).
  const files = git("ls-files", "--cached", "--others", "--exclude-standard", "--", "app", "worker", "modules")
    .filter((f) => /^(app|worker)\/.*\.tsx?$/.test(f) || /^modules\/[^/]+\/src\/.*\.tsx?$/.test(f))
    .filter((f) => !HOST_PROCESS_FILES.includes(f));
  for (const mustBeScanned of ["app/page.tsx", "app/layout.tsx", "worker/index.ts", "modules/platform/src/env.ts", "modules/platform/src/identity/resolve.ts"]) {
    assert.ok(files.includes(mustBeScanned), `${mustBeScanned} must be among the scanned files`);
  }
  const problems = files.flatMap((file) => headerReadProblems(file, readFileSync(`${ROOT}${file}`, "utf8")));
  assert.deepEqual(problems, []);
});

/** The files a relative import in `text` names, as repository paths (the extension is added when the specifier has none). */
function importsOf(file: string, text: string, known: Set<string>): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) {
    const spec = m[1];
    if (!spec.startsWith(".")) continue;
    const parts = `${file.split("/").slice(0, -1).join("/")}/${spec}`.split("/");
    const stack: string[] = [];
    for (const part of parts) (part === ".." ? stack.pop() : part !== "." && part !== "" ? stack.push(part) : undefined);
    const base = stack.join("/");
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) if (known.has(candidate)) out.push(candidate);
  }
  return out;
}

test("the files exempt from the header rule are exempt only because nothing the Worker runs can reach them", () => {
  const all = git("ls-files", "--cached", "--others", "--exclude-standard", "--", "app", "worker", "modules").filter((f) => /\.tsx?$/.test(f));
  const known = new Set(all);
  for (const f of HOST_PROCESS_FILES) assert.ok(known.has(f), `${f} is listed as exempt but does not exist`);
  // Everything reachable from the Worker's entry and the pages, through relative imports.
  const roots = all.filter((f) => /^(app|worker)\//.test(f));
  const seen = new Set<string>(roots);
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop()!;
    for (const next of importsOf(file, readFileSync(`${ROOT}${file}`, "utf8"), known)) if (!seen.has(next)) (seen.add(next), queue.push(next));
  }
  assert.ok(seen.has("modules/platform/src/env.ts"), "the walk reaches the platform's code, so it is following imports");
  assert.deepEqual(HOST_PROCESS_FILES.filter((f) => seen.has(f)), [], "a file the Worker runs can reach a host-process file");
  // The exemption covers only these files: every other source file of those modules is scanned like the rest.
  const others = all.filter((f) => /^modules\/(hosting|demo)\/src\//.test(f) && !HOST_PROCESS_FILES.includes(f));
  assert.deepEqual(others.flatMap((f) => headerReadProblems(f, readFileSync(`${ROOT}${f}`, "utf8"))), []);
});

test("the import walk finds what it should: a relative import with and without an extension, up a directory, and a dynamic one", () => {
  const known = new Set(["a/b/c.ts", "a/d.ts", "a/b/e/index.ts", "a/f.tsx"]);
  assert.deepEqual(importsOf("a/b/x.ts", `import { y } from "./c.ts"; import "../d"; const z = await import("./e"); import q from "../f";`, known).sort(), ["a/b/c.ts", "a/b/e/index.ts", "a/d.ts", "a/f.tsx"]);
  assert.deepEqual(importsOf("a/b/x.ts", `import fs from "node:fs"; import z from "zod"; import m from "./missing.ts";`, known), []);
});

test("the header rule accepts plain allowed reads and writes", () => {
  const ok = [
    `const c = request.headers.get("cookie");`,
    `const c = request.headers.get('Origin');`,
    `const n = request.headers.get("Content-Length");`,
    `const c = (await headers()).get("cookie");`,
    `import { headers } from "next/headers"; const c = (await headers()).get("cookie");`,
    `const h = new Headers(); h.set("x", "y"); response.headers.set("a", "b"); response.headers.append("a", "b");`,
    `function json(status: number, body: unknown, headers: Record<string, string> = {}) { return new Response("", { status, headers: { a: "b", ...headers } }); }`,
  ];
  for (const code of ok) assert.deepEqual(headerReadProblems("x.ts", code), [], code);
});

test("the header rule reports every way of reading a header that is not a plain allowed get", () => {
  const bad = [
    `request.headers.get("x-user-id")`,
    `const n = "x-user-id"; request.headers.get(n)`,
    `request.headers.get ( "x-user-id" )`,
    `request.headers?.get("x-user-id")`,
    `const h = request.headers; h.get("cookie")`,
    `for (const [k, v] of request.headers) {}`,
    `Array.from(request.headers)`,
    `new Headers(request.headers)`,
    `({ ...request.headers })`,
    `Object.fromEntries(request.headers)`,
    `request.headers["get"]("cookie")`,
    `request["headers"].get("x-user-id")`,
    `const { headers: hh } = request; hh.get("cookie")`,
    `const { headers } = request;`,
    `request.headers.forEach((v) => v)`,
    `request.headers.has("cookie")`,
    `import { headers } from "next/headers"; const h = await headers(); h.get("cookie")`,
    `import { headers } from "next/headers"; (await headers()).get("authorization")`,
    `import { headers as hs } from "next/headers"; (await hs()).entries()`,
    `import * as nh from "next/headers"; nh.headers()`,
  ];
  for (const code of bad) assert.notDeepEqual(headerReadProblems("x.ts", code), [], `should be reported: ${code}`);
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

test("the Worker entry adds the security headers to every response it returns", () => {
  const entry = readFileSync(`${ROOT}worker/index.ts`, "utf8");
  assert.match(entry, /withSecurityHeaders\(\s*await handler\.fetch\(/);
});
