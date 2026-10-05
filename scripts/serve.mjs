#!/usr/bin/env node
// Serves the BUILT application (dist/, from `pnpm build`) on one port, for a host that runs a container or a process (DigitalOcean App
// Platform, a Droplet, any machine with Node 22). The application is a Cloudflare Worker with a D1 database; this runs the same Worker
// code in workerd through Miniflare, with an in-memory SQLite database that is built from the migrations and the SYNTHETIC seed at every
// start. So it is a demonstration host, not a production one: a restart is a reset, and nothing here is durable.
//
//   SESSION_SECRET   at least 32 bytes, not one repeated character
//   DEMO_USER, DEMO_PASSWORD   the access gate (HTTP Basic), or DEMO_ACCESS=open to leave the address open
//   PORT             default 8080
//   APLYD_ENV        local, synthetic (default) or test; anything else is refused
//   APLYD_DEMO=true  add the demonstration package after start (modules/demo)
//
// The choices that can be tested without starting anything are in modules/hosting/src/gate.ts and gateway.ts.
import { Miniflare } from "miniflare";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGateway } from "../modules/hosting/src/gateway.ts";
import { parseConfig } from "../modules/hosting/src/gate.ts";
import { migrationStatements, seedStatements } from "../modules/platform/src/db/migrate.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const parsed = parseConfig(process.env);
if (!parsed.ok) {
  console.error("The application was not started:");
  for (const problem of parsed.problems) console.error(`  - ${problem}`);
  process.exit(2);
}
const config = parsed.config;

const dist = join(ROOT, "dist", "server");
if (!existsSync(join(dist, "wrangler.json"))) {
  console.error("dist/server/wrangler.json is missing. Run `pnpm build` first.");
  process.exit(2);
}
const built = JSON.parse(readFileSync(join(dist, "wrangler.json"), "utf8"));

let ready = false;
const gateway = createGateway({ access: config.access, upstreamPort: config.upstreamPort, ready: () => ready, log: (line) => console.log(line) });
await new Promise((resolveListening, reject) => {
  gateway.once("error", reject);
  gateway.listen(config.port, "0.0.0.0", () => resolveListening(undefined));
});
console.log(`Listening on port ${config.port}; starting the application (${config.environment}, access: ${config.access.kind === "open" ? "OPEN" : "password"}).`);

// The Worker's modules are listed explicitly: Miniflare's own module search stops at the built Worker's dynamic imports.
const modules = [
  { type: "ESModule", path: join(dist, "index.js") },
  ...readdirSync(dist, { recursive: true })
    .filter((f) => /\.m?js$/.test(f) && f !== "index.js")
    .map((f) => ({ type: "ESModule", path: join(dist, f) })),
];
const worker = new Miniflare({
  modulesRoot: dist,
  modules,
  compatibilityDate: built.compatibility_date,
  compatibilityFlags: built.compatibility_flags,
  d1Databases: { DB: built.d1_databases[0].database_id },
  bindings: { APLYD_ENV: config.environment, SESSION_SECRET: config.sessionSecret },
  assets: { directory: resolve(dist, built.assets.directory), routerConfig: { has_user_worker: true }, assetConfig: {} },
  host: "127.0.0.1",
  port: config.upstreamPort,
});

// Miniflare registers its own SIGINT and SIGTERM handlers that exit at once (code 130 or 143), before this file could stop the gateway or wait for
// the Worker's process to end. They are replaced by the ones below; Miniflare's exit hook still runs when the process exits.
process.removeAllListeners("SIGINT");
process.removeAllListeners("SIGTERM");

let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  ready = false;
  console.log("Stopping.");
  const force = setTimeout(() => process.exit(code), 10_000);
  force.unref();
  await new Promise((r) => gateway.close(() => r(undefined)));
  gateway.closeAllConnections();
  try {
    await worker.dispose();
  } catch {
    /* already stopped */
  }
  process.exit(code);
}
process.on("SIGTERM", () => void stop(0));
process.on("SIGINT", () => void stop(0));

try {
  await worker.ready;
  const db = await worker.getD1Database("DB");
  for (const statement of [...migrationStatements(), ...seedStatements()]) await db.prepare(statement).run();
  if (config.demo) {
    const demoSeed = join(ROOT, "modules", "demo", "src", "seed.ts");
    if (!existsSync(demoSeed)) throw new Error("APLYD_DEMO=true, but this build has no demonstration package (modules/demo).");
    const { seedDemo } = await import(demoSeed);
    await seedDemo(`http://127.0.0.1:${config.upstreamPort}`);
  }
  ready = true;
  console.log("The application is ready.");
} catch (error) {
  console.error(`The application did not start: ${error instanceof Error ? error.message : String(error)}`);
  await stop(1);
}
