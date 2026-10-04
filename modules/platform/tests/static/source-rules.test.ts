// Structural rules from AGENTS.md that a reviewer should not have to catch by eye.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { headerReadProblems } from "../support/header-rule.ts";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

test("request code reads only the headers on the allow-list, so identity cannot come from a header", () => {
  // Every source file of the application, found by listing directories (a pathspec with ** skipped top-level files such as app/page.tsx).
  const files = git("ls-files", "--cached", "--others", "--exclude-standard", "--", "app", "worker", "modules").filter(
    (f) => /^(app|worker)\/.*\.tsx?$/.test(f) || /^modules\/[^/]+\/src\/.*\.tsx?$/.test(f),
  );
  for (const mustBeScanned of ["app/page.tsx", "app/layout.tsx", "worker/index.ts", "modules/platform/src/env.ts", "modules/platform/src/identity/resolve.ts"]) {
    assert.ok(files.includes(mustBeScanned), `${mustBeScanned} must be among the scanned files`);
  }
  const problems = files.flatMap((file) => headerReadProblems(file, readFileSync(`${ROOT}${file}`, "utf8")));
  assert.deepEqual(problems, []);
});

test("the header rule accepts plain allowed reads and writes", () => {
  const ok = [
    `const c = request.headers.get("cookie");`,
    `const c = request.headers.get('Origin');`,
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
