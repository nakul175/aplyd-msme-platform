// Starts the BUILT application (dist/) in a local Worker with its own empty database, migrations and synthetic seed applied.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrationStatements, seedStatements } from "../../src/db/migrate.ts";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const WRANGLER = join(ROOT, "node_modules/wrangler/bin/wrangler.js");
const CONFIG = join(ROOT, "dist/server/wrangler.json");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

export type RunningWorker = {
  base: string;
  /** Stops the Worker and removes its temporary files. Safe to call more than once. */
  stop: () => Promise<void>;
  /** Synchronous and abrupt: kills the Worker's process group and removes its files. For signal and exit handlers only. */
  killNow: () => void;
  /** Everything the Worker process has printed so far, for diagnosing a failure. */
  output: () => string;
};

export async function startBuiltApp(vars: Record<string, string>): Promise<RunningWorker> {
  if (!existsSync(CONFIG)) throw new Error("dist/server/wrangler.json is missing. Run `pnpm build` before the smoke layer.");
  const work = mkdtempSync(join(tmpdir(), "aplyd-smoke-"));
  const state = join(work, "state");
  const sql = join(work, "setup.sql");
  writeFileSync(sql, [...migrationStatements(), ...seedStatements()].map((s) => s.replace(/;\s*$/, "") + ";").join("\n") + "\n");
  const env = {
    ...process.env,
    // Without this, Wrangler fetches Request.cf from the network a few seconds after start and, when that fails or is slow,
    // reloads the Worker, so requests sent in that window get "worker restarted mid-request" (503) or hang.
    CLOUDFLARE_CF_FETCH_ENABLED: "false",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: join(work, "logs"),
    WRANGLER_REGISTRY_PATH: join(work, "registry"),
    MINIFLARE_REGISTRY_PATH: join(work, "miniflare"),
  };
  const setup = spawnSync(process.execPath, [WRANGLER, "d1", "execute", "DB", "--local", "--config", CONFIG, "--persist-to", state, "--file", sql], { env, encoding: "utf8" });
  if (setup.status !== 0) throw new Error(`database setup failed:\n${setup.stdout}\n${setup.stderr}`);

  const port = await freePort();
  const varArgs = Object.entries(vars).flatMap(([k, v]) => ["--var", `${k}:${v}`]);
  const child = spawn(process.execPath, [WRANGLER, "dev", "--config", CONFIG, "--local", "--persist-to", state, "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0", ...varArgs], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let log = "";
  child.stdout.on("data", (c) => (log += c));
  child.stderr.on("data", (c) => (log += c));
  const base = `http://127.0.0.1:${port}`;

  const killNow = () => {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {
      /* already gone */
    }
    rmSync(work, { recursive: true, force: true });
  };

  const stop = async () => {
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      /* already gone */
    }
    await new Promise((r) => setTimeout(r, 500));
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {
      /* already gone */
    }
    rmSync(work, { recursive: true, force: true });
  };

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.status === 200) return { base, stop, killNow, output: () => log };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await stop();
  throw new Error(`the built application did not become healthy in 90 seconds:\n${log.slice(-3000)}`);
}
