#!/usr/bin/env node
// One entry point for every test layer. The design is taken from Saha's runner (layers, a regression guard, a catalogue
// check); the code is new and smaller. See docs/saha-lessons.md.
//
//   node scripts/test.mjs <layer|pr ...> [--guard] [--only <id,...>]
//   node scripts/test.mjs --check-catalogue     fail when a test file is in no layer, or a baseline names a missing suite
//   node scripts/test.mjs --list                print every suite
//   node scripts/test.mjs <layer ...> --update-baseline --reason "<why>"
//                                                deliberately change a module's tests/baseline.json
//
// Layers: static unit integration smoke. Alias: pr (all four). With no argument it runs pr.
// A suite is a file modules/<module>/tests/<layer>/<name>.test.ts, run with `node --test`, or a command listed below.
// Each module keeps its own baseline (modules/<module>/tests/baseline.json): the least number of passing tests per suite.
// --guard fails when a suite is missing, has no baseline, or passes fewer tests than its baseline.
// Exit code: 0 all passed, 1 a suite or the guard failed, 2 usage or catalogue error.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.chdir(ROOT);

const LAYERS = ["static", "unit", "integration", "smoke"];
const ALIASES = { pr: LAYERS };
const TIMEOUT_MIN = { static: 10, unit: 10, integration: 15, smoke: 15 };
// Command suites: run as a process, pass or fail only, no per-test count.
const COMMAND_SUITES = [
  { id: "static/typecheck", layer: "static", cmd: process.execPath, args: ["node_modules/typescript/bin/tsc", "--noEmit"] },
  { id: "static/documentation", layer: "static", cmd: process.execPath, args: ["scripts/check-documentation.mjs"] },
  // The migrations, their journal and their snapshots agree with the schema (drizzle-kit check).
  { id: "static/migrations", layer: "static", cmd: process.execPath, args: ["node_modules/drizzle-kit/bin.cjs", "check"] },
];

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = (valueOf("--only") ?? "").split(",").filter(Boolean);
const reason = valueOf("--reason");
const positional = args.filter((a, i) => !a.startsWith("--") && !["--only", "--reason"].includes(args[i - 1]));

const usage = (msg) => {
  console.error(`${msg}\nUsage: node scripts/test.mjs <${[...LAYERS, "pr"].join("|")} ...> [--guard] [--only <id>] [--update-baseline --reason "<why>"]\n       node scripts/test.mjs --check-catalogue | --list`);
  process.exit(2);
};
for (const f of flags) if (!["--guard", "--check-catalogue", "--list", "--update-baseline", "--only", "--reason"].includes(f)) usage(`Unknown option ${f}.`);
for (const l of positional) if (!LAYERS.includes(l) && !ALIASES[l]) usage(`Unknown layer "${l}".`);
if (flags.has("--update-baseline") && !reason) usage("--update-baseline needs --reason.");

// ---------- catalogue ----------
function discover() {
  const suites = [];
  const errors = [];
  const modulesDir = join(ROOT, "modules");
  const strayTests = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const here = `${rel}/${entry.name}`;
      if (entry.isDirectory()) strayTests(join(dir, entry.name), here);
      else if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) errors.push(`${here}: a test file outside modules/<module>/tests/<layer>/ would never run`);
    }
  };
  for (const mod of existsSync(modulesDir) ? readdirSync(modulesDir) : []) {
    for (const entry of readdirSync(join(modulesDir, mod), { withFileTypes: true })) {
      if (entry.name !== "tests" && entry.isDirectory()) strayTests(join(modulesDir, mod, entry.name), `modules/${mod}/${entry.name}`);
    }
    const testsDir = join(modulesDir, mod, "tests");
    if (!existsSync(testsDir)) continue;
    for (const entry of readdirSync(testsDir, { withFileTypes: true })) {
      if (entry.name === "support") {
        strayTests(join(testsDir, "support"), `modules/${mod}/tests/support`);
        continue;
      }
      if (entry.name === "baseline.json") continue;
      if (!entry.isDirectory() || !LAYERS.includes(entry.name)) {
        errors.push(`modules/${mod}/tests/${entry.name}: not a layer directory (${LAYERS.join(", ")}) or support/`);
        continue;
      }
      for (const file of readdirSync(join(testsDir, entry.name))) {
        if (!file.endsWith(".test.ts")) {
          errors.push(`modules/${mod}/tests/${entry.name}/${file}: a test file must end in .test.ts`);
          continue;
        }
        const name = file.replace(/\.test\.ts$/, "");
        suites.push({ id: `${mod}/${entry.name}/${name}`, layer: entry.name, module: mod, key: `${entry.name}/${name}`, file: `modules/${mod}/tests/${entry.name}/${file}` });
      }
    }
  }
  for (const c of COMMAND_SUITES) suites.push({ ...c, module: null, key: c.id });
  const ids = suites.map((s) => s.id);
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) errors.push(`${id}: two suites have this id`);
  return { suites, errors };
}

const baselinePath = (mod) => join(ROOT, "modules", mod, "tests", "baseline.json");
const readBaseline = (mod) => (existsSync(baselinePath(mod)) ? JSON.parse(readFileSync(baselinePath(mod), "utf8")) : { suites: {} });

function checkCatalogue(catalogue) {
  const errors = [...catalogue.errors];
  const mods = new Set(catalogue.suites.filter((s) => s.module).map((s) => s.module));
  for (const mod of mods) {
    for (const key of Object.keys(readBaseline(mod).suites)) {
      if (!catalogue.suites.some((s) => s.module === mod && s.key === key)) errors.push(`modules/${mod}/tests/baseline.json: names ${key}, but no such suite exists`);
    }
  }
  return errors;
}

const catalogue = discover();

if (flags.has("--list")) {
  for (const s of catalogue.suites) console.log(`${s.layer.padEnd(12)} ${s.id}`);
  process.exit(0);
}

const catalogueErrors = checkCatalogue(catalogue);
if (catalogueErrors.length) {
  console.error("Test catalogue problems:");
  for (const e of catalogueErrors) console.error(`  - ${e}`);
  process.exit(2);
}
if (flags.has("--check-catalogue")) {
  console.log(`Test catalogue clean: ${catalogue.suites.length} suites in ${new Set(catalogue.suites.map((s) => s.layer)).size} layers.`);
  process.exit(0);
}

// ---------- running ----------
const requested = positional.length ? positional : ["pr"];
const layers = [...new Set(requested.flatMap((l) => ALIASES[l] ?? [l]))];
let selected = catalogue.suites.filter((s) => layers.includes(s.layer));
if (only.length) selected = selected.filter((s) => only.includes(s.id));
if (!selected.length) usage("No suite matches.");

const fmt = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

function run(suite) {
  return new Promise((done) => {
    const [cmd, cmdArgs] = suite.file
      ? [process.execPath, ["--test", "--test-reporter=tap", suite.file]]
      : [suite.cmd, suite.args];
    const started = Date.now();
    let out = "";
    let timedOut = false;
    const child = spawn(cmd, cmdArgs, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: "0" }, stdio: ["ignore", "pipe", "pipe"], detached: true });
    const take = (c) => {
      out += c.toString();
      if (out.length > 2_000_000) out = out.slice(-1_000_000);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    const kill = (sig) => {
      try {
        process.kill(-child.pid, sig);
      } catch {
        /* already gone */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill("SIGTERM");
      setTimeout(() => kill("SIGKILL"), 10_000).unref();
    }, TIMEOUT_MIN[suite.layer] * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const count = (name) => Number(out.match(new RegExp(`^# ${name} (\\d+)`, "m"))?.[1] ?? NaN);
      const result = { id: suite.id, key: suite.key, module: suite.module, layer: suite.layer, exitCode: code ?? 1, timedOut, durationMs: Date.now() - started, output: out };
      if (suite.file) Object.assign(result, { passed: count("pass"), failed: count("fail"), skipped: count("skipped"), todo: count("todo"), cancelled: count("cancelled") });
      done(result);
    });
  });
}

const results = [];
for (const suite of selected) {
  const r = await run(suite);
  const ok = r.exitCode === 0 && !r.timedOut && (r.failed === undefined || (r.failed === 0 && r.passed > 0 && r.skipped === 0 && r.todo === 0 && r.cancelled === 0));
  r.ok = ok;
  results.push(r);
  const detail = r.passed === undefined ? "" : `  ${r.passed} passed${r.failed ? `, ${r.failed} failed` : ""}${r.skipped ? `, ${r.skipped} skipped` : ""}${r.todo ? `, ${r.todo} todo` : ""}${r.cancelled ? `, ${r.cancelled} cancelled` : ""}`;
  console.log(`${ok ? "PASS" : "FAIL"}  ${suite.id.padEnd(46)} ${fmt(r.durationMs).padStart(7)}${detail}${r.timedOut ? "  (timed out)" : ""}`);
  if (!ok) console.log(r.output.split("\n").slice(-60).join("\n"));
}

// ---------- guard and baseline ----------
const problems = [];
if (flags.has("--guard") || flags.has("--update-baseline")) {
  const mods = new Set(results.filter((r) => r.module).map((r) => r.module));
  for (const mod of mods) {
    const baseline = readBaseline(mod).suites;
    for (const r of results.filter((x) => x.module === mod)) {
      if (!(r.key in baseline)) problems.push(`${r.id}: no baseline. Record one with --update-baseline --reason "<why>".`);
      else if (r.passed < baseline[r.key]) problems.push(`${r.id}: ${r.passed} passed, baseline is ${baseline[r.key]}.`);
    }
    if (!only.length) {
      for (const key of Object.keys(baseline)) {
        const layer = key.split("/")[0];
        if (layers.includes(layer) && !results.some((r) => r.module === mod && r.key === key)) problems.push(`modules/${mod}: suite ${key} is in the baseline but did not run.`);
      }
    }
  }
}

const failed = results.filter((r) => !r.ok);
if (flags.has("--update-baseline")) {
  if (failed.length) {
    console.error("Not updating the baseline while a suite fails.");
    process.exit(1);
  }
  for (const mod of new Set(results.filter((r) => r.module).map((r) => r.module))) {
    const current = readBaseline(mod);
    const suites = { ...current.suites };
    for (const r of results.filter((x) => x.module === mod)) suites[r.key] = r.passed;
    writeFileSync(baselinePath(mod), JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), reason, suites }, null, 2) + "\n");
    console.log(`Updated modules/${mod}/tests/baseline.json (${reason}).`);
  }
  process.exit(0);
}

mkdirSync("reports", { recursive: true });
writeFileSync("reports/summary.json", JSON.stringify(results.map(({ output, ...rest }) => rest), null, 2) + "\n");
const passedCount = results.filter((r) => r.ok).length;
console.log(`\n${passedCount} of ${results.length} suites passed.${problems.length ? `\nGuard problems (${problems.length}):\n${problems.map((p) => `  - ${p}`).join("\n")}` : ""}`);
process.exit(failed.length || problems.length ? 1 : 0);
