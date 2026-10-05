#!/usr/bin/env node
// Resets the local development database and applies the migrations and the SYNTHETIC seed.
// `pnpm dev` reads the database this script writes (.wrangler/state). It deletes whatever was there.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrationStatements, seedStatements } from "../modules/platform/src/db/migrate.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.chdir(ROOT);
const state = ".wrangler/state";
rmSync(`${state}/v3/d1`, { recursive: true, force: true });
mkdirSync(".wrangler", { recursive: true });
// Same binding and placeholder id as vite.config.ts, so the development server opens the same database.
writeFileSync(
  ".wrangler/local-db.json",
  JSON.stringify({ name: "aplyd-local", compatibility_date: "2026-05-15", d1_databases: [{ binding: "DB", database_name: "aplyd-local", database_id: "00000000-0000-4000-8000-000000000000" }] }),
);
writeFileSync(".wrangler/local-db.sql", [...migrationStatements(), ...seedStatements()].map((s) => s.replace(/;\s*$/, "") + ";").join("\n") + "\n");
const run = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--local", "--config", ".wrangler/local-db.json", "--persist-to", state, "--file", ".wrangler/local-db.sql"], {
  stdio: "inherit",
  env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false" },
});
if (run.status !== 0) process.exit(run.status ?? 1);
console.log("Local database ready: migrations and synthetic seed applied.");
