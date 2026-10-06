// The Dockerfile and the App Platform spec are never run in CI (there is no container daemon there), so what can be checked about them is
// read from their text: that they agree with the repository's own pins, that no secret is in them, and that every placeholder is refused by
// the launcher rather than served. A text match is not a build; modules/hosting/VALIDATION.md says what has and has not been run.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseConfig } from "../../src/gate.ts";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (f: string) => readFileSync(`${ROOT}${f}`, "utf8");
const dockerfile = read("Dockerfile");
const spec = read(".do/app.yaml");
const pkg = JSON.parse(read("package.json")) as { packageManager: string; engines: { node: string } };

// A line ending in a backslash continues on the next line (the HEALTHCHECK's CMD is not the container's CMD).
const instructions = dockerfile
  .replace(/\\\n\s*/g, " ")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l !== "" && !l.startsWith("#"));

test("the Dockerfile pins the same pnpm as package.json and a Node that satisfies its engines", () => {
  const pnpm = /^pnpm@(\d+\.\d+\.\d+)$/.exec(pkg.packageManager)?.[1];
  assert.ok(pnpm, `package.json packageManager is ${pkg.packageManager}`);
  assert.ok(dockerfile.includes(`pnpm@${pnpm} --activate`), "corepack prepares the pnpm the repository names");
  const from = instructions.filter((l) => l.startsWith("FROM "));
  assert.equal(from.length, 1);
  const node = /^FROM node:(\d+)\.(\d+)\.(\d+)-/.exec(from[0]);
  assert.ok(node, `FROM ${from[0]}: a Node image with an exact version`);
  const min = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(pkg.engines.node);
  assert.ok(min, `engines.node is ${pkg.engines.node}`);
  const have = node!.slice(1).map(Number);
  const need = min!.slice(1).map(Number);
  const ok = have[0] > need[0] || (have[0] === need[0] && (have[1] > need[1] || (have[1] === need[1] && have[2] >= need[2])));
  assert.ok(ok, `Node ${have.join(".")} must be at least ${need.join(".")}`);
});

test("the Dockerfile installs from the lockfile, builds, then runs as a non-root user with NODE_ENV set only after the build", () => {
  const at = (needle: string) => instructions.findIndex((l) => l.includes(needle));
  assert.ok(at("pnpm install --frozen-lockfile") >= 0, "the lockfile is followed exactly");
  assert.ok(at("pnpm build") > at("pnpm install --frozen-lockfile"));
  assert.ok(at("ENV NODE_ENV=production") > at("pnpm build"), "NODE_ENV=production before the install would skip the build's packages");
  assert.ok(at("USER node") > at("COPY . ."), "the user is dropped after the files are in place");
  assert.ok(!instructions.some((l) => /^USER\s+(root|0)\b/.test(l)), "the container never ends as root");
  assert.deepEqual(instructions.filter((l) => l.startsWith("CMD ")), ['CMD ["node", "scripts/serve.mjs"]']);
});

test("the Dockerfile and the spec hold no secret, and the Dockerfile sets none of the launcher's secrets", () => {
  for (const name of ["SESSION_SECRET", "DEMO_PASSWORD", "DEMO_USER"]) {
    assert.ok(!instructions.some((l) => /^(ENV|ARG)\b/.test(l) && l.includes(name)), `${name} is not set in the image`);
  }
  assert.ok(!/DEMO_ACCESS/.test(dockerfile.replace(/#.*$/gm, "")), "the image does not turn open access on");
  const values = [...spec.matchAll(/^\s*value:\s*(.+)$/gm)].map((m) => m[1].trim());
  assert.ok(values.length >= 4);
  // Every literal value is one of four known ones: the environment name, the demonstration switch, the commit variable the platform fills in (a
  // bindable variable, not a value anyone types) and the secret placeholder. Anything else, a real-looking secret included, fails.
  for (const v of values) assert.ok(["synthetic", '"true"', "${_self.COMMIT_HASH}", "REPLACE_ME"].includes(v), `unexpected value in the spec: ${v}`);
  assert.ok(!/DEMO_ACCESS/.test(spec.replace(/#.*$/gm, "")), "the spec does not turn open access on");
});

test("every secret in the spec is an encrypted value, and the placeholder is refused by the launcher", () => {
  for (const key of ["SESSION_SECRET", "DEMO_USER", "DEMO_PASSWORD"]) {
    const block = new RegExp(`- key: ${key}\\n\\s+value: REPLACE_ME\\n\\s+type: SECRET\\n\\s+scope: RUN_TIME`);
    assert.match(spec, block, `${key} must be a RUN_TIME SECRET with the placeholder`);
  }
  const placeholder = parseConfig({ APLYD_ENV: "synthetic", SESSION_SECRET: "REPLACE_ME", DEMO_USER: "REPLACE_ME", DEMO_PASSWORD: "REPLACE_ME" });
  assert.equal(placeholder.ok, false, "a deploy with the placeholders must not start");
  // And with a real secret but the placeholder password: still refused.
  const half = parseConfig({ SESSION_SECRET: "k3Jx9mQ2vL8sT5wZ1bN7cR4dF6gH0yPa", DEMO_USER: "demo", DEMO_PASSWORD: "REPLACE_ME" });
  assert.equal(half.ok, false);
});

test("each of the spec's three placeholders is refused on its own, with the other two set to good values (S3-05)", () => {
  // The spec and the status page say the container does not start while ANY of the three is still the placeholder. Only DEMO_USER used to slip through.
  const real = { APLYD_ENV: "synthetic", SESSION_SECRET: "k3Jx9mQ2vL8sT5wZ1bN7cR4dF6gH0yPa", DEMO_USER: "demo", DEMO_PASSWORD: "a-real-password-here" };
  assert.equal(parseConfig(real).ok, true, "the control: these values start");
  for (const key of ["SESSION_SECRET", "DEMO_USER", "DEMO_PASSWORD"] as const) {
    const placeholder = new RegExp(`- key: ${key}\\n\\s+value: (\\S+)`).exec(spec)?.[1];
    assert.equal(placeholder, "REPLACE_ME", `${key} in the spec carries the placeholder`);
    const result = parseConfig({ ...real, [key]: placeholder });
    assert.equal(result.ok, false, `${key} alone as the placeholder must stop the launch`);
    if (!result.ok) assert.ok(result.problems.some((p) => p.startsWith(`${key} is still the placeholder`)), result.problems.join(" | "));
  }
});

test("the spec points at the Dockerfile, the port and health route the launcher serves, and is not deployed on every push", () => {
  assert.match(spec, /dockerfile_path: Dockerfile/);
  assert.match(spec, /http_port: 8080/);
  assert.match(spec, /http_path: \/healthz/);
  assert.match(spec, /deploy_on_push: false/);
  assert.match(spec, /instance_count: 1/, "one instance: the database is a file in the container's own temporary directory, so a second instance would hold a different one");
  assert.match(spec, /branch: main/);
  assert.match(spec, /value: synthetic/);
  assert.ok(!/APLYD_DEMO/.test(spec) || /key: APLYD_DEMO\n\s+value: "?true"?/.test(spec));
  assert.ok(dockerfile.includes("ENV PORT=8080") && dockerfile.includes("EXPOSE 8080"));
});

test("the commit is shown from a run-time value the platform fills in, and the image can be given one at build time after the build", () => {
  assert.match(spec, /- key: APLYD_COMMIT\n\s+value: \$\{_self\.COMMIT_HASH\}\n\s+scope: RUN_TIME/, "App Platform's bindable variables are available at run time only for a Dockerfile build");
  const at = (needle: string) => instructions.findIndex((l) => l.includes(needle));
  assert.ok(at("ARG APLYD_COMMIT") > at("pnpm build"), "declared after the build, so a new commit does not redo the install and the build");
  assert.ok(at("ENV APLYD_COMMIT=$APLYD_COMMIT") > at("ARG APLYD_COMMIT"));
  assert.ok(at("ARG APLYD_COMMIT") < at("USER node"));
});

test("the spec turns the demonstration on, as the live app does, and the cast is not a secret", () => {
  assert.match(spec, /- key: APLYD_DEMO\n\s+value: "true"\n\s+scope: RUN_TIME/);
});

test("the container's build context leaves out secrets, dependencies and build output", () => {
  const ignore = read(".dockerignore").split("\n").map((l) => l.trim());
  for (const entry of [".git", "node_modules", "dist", ".next", ".env", ".env.*", "*.pem"]) assert.ok(ignore.includes(entry), `.dockerignore lists ${entry}`);
});

test("the build context leaves out the local development secrets and key files, and the Dockerfile copies the whole context (S3-09)", () => {
  const ignore = read(".dockerignore").split("\n").map((l) => l.trim());
  // .dev.vars is where a developer keeps SESSION_SECRET locally (docs/design/LLD.md 3.6); the Dockerfile's `COPY . .` would carry it into an image built from a working tree.
  for (const entry of [".dev.vars", ".dev.vars.*", "*.key", "*.pem"]) assert.ok(ignore.includes(entry), `.dockerignore lists ${entry}`);
  assert.ok(instructions.includes("COPY . ."), "the check matters because the Dockerfile copies everything the context holds");
  // Git keeps the same files out of the repository, so an App Platform build from git never has them either.
  const gitignore = read(".gitignore").split("\n").map((l) => l.trim());
  assert.ok(gitignore.includes(".dev.vars"), ".gitignore lists .dev.vars");
});
