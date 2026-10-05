// Structural rules from AGENTS.md that a reviewer should not have to catch by eye.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { headerReadProblems } from "../support/header-rule.ts";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

// The two files of the host launcher (modules/hosting). They run in a Node process in front of the Worker, not in it: they hand a request's
// headers on and read one header, Authorization, as the hosting gate's own password (never an application identity; the gate removes it before
// the Worker sees the request). The rule below is about code that decides who a person is, which runs in the Worker. The exemption is exactly these
// two files, and the test after the first one fails if anything the Worker runs imports either of them.
export const HOST_PROCESS_FILES = ["modules/hosting/src/gate.ts", "modules/hosting/src/gateway.ts"];

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

test("the host launcher's files are exempt from the header rule only because nothing the Worker runs imports them", () => {
  const all = git("ls-files", "--cached", "--others", "--exclude-standard", "--", "app", "worker", "modules");
  for (const f of HOST_PROCESS_FILES) assert.ok(all.includes(f), `${f} is listed as exempt but does not exist`);
  const workerSide = all.filter((f) => (/^(app|worker)\/.*\.tsx?$/.test(f) || /^modules\/[^/]+\/src\/.*\.tsx?$/.test(f)) && !f.startsWith("modules/hosting/"));
  const importers = workerSide.filter((f) => /modules\/hosting|\/hosting\/src|gateway\.ts|\bgate\.ts/.test(readFileSync(`${ROOT}${f}`, "utf8")));
  assert.deepEqual(importers, [], "a file the Worker runs refers to the host launcher");
  // The exemption covers only these two files: any other file under modules/hosting/src is scanned like the rest.
  const otherHostFiles = all.filter((f) => /^modules\/hosting\/src\/.*\.tsx?$/.test(f) && !HOST_PROCESS_FILES.includes(f));
  const problems = otherHostFiles.flatMap((f) => headerReadProblems(f, readFileSync(`${ROOT}${f}`, "utf8")));
  assert.deepEqual(problems, []);
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
