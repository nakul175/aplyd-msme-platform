// Starts the launcher (scripts/serve.mjs) against the BUILT application for a test, as a host would, and stops it with SIGTERM as a platform does.
// Shared by the hosting module's own smoke layer and by any module whose smoke or browser layer needs the application behind the launcher (the demo).
// Needs `pnpm build` first. Ports are chosen free; each launch has its own database (a SQLite file in a new temporary directory).
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const SERVE = join(ROOT, "scripts/serve.mjs");
/** Random per run, 32 characters or more, never printed by a passing test. */
export const SECRET = `smoke-${crypto.randomUUID()}-padding`;
export const PASSWORD = `pw-${crypto.randomUUID()}`;
export const AUTH_PARTS = { user: "demo", password: PASSWORD } as const;
/** The gate's Basic header, as a browser given the password sends it. */
export const AUTH = `Basic ${Buffer.from(`${AUTH_PARTS.user}:${PASSWORD}`).toString("base64")}`;

export type Launched = { base: string; output: () => string; child: ChildProcess };

const children: ChildProcess[] = [];

export const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });

export const exited = (child: ChildProcess, ms: number) =>
  new Promise<number | null>((resolve) => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    const t = setTimeout(() => resolve(null), ms);
    child.once("exit", (code) => {
      clearTimeout(t);
      resolve(code);
    });
  });

/** Starts the launcher with `extra` added to a minimal environment, and returns when `/healthz` answers 200 (up to `timeoutMs`, 90 seconds by default). */
export async function launchServe(extra: Record<string, string>, timeoutMs = 90_000): Promise<Launched> {
  if (!existsSync(join(ROOT, "dist/server/wrangler.json"))) throw new Error("dist/server/wrangler.json is missing. Run `pnpm build` before the smoke layer.");
  const port = await freePort();
  const upstream = await freePort();
  const child = spawn(process.execPath, [SERVE], {
    env: { NODE_ENV: "production", PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CLOUDFLARE_CF_FETCH_ENABLED: "false", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false", PORT: String(port), APLYD_UPSTREAM_PORT: String(upstream), SESSION_SECRET: SECRET, ...extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let log = "";
  child.stdout.on("data", (c) => (log += c));
  child.stderr.on("data", (c) => (log += c));
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the launcher stopped (${child.exitCode}):\n${log}`);
    try {
      if ((await fetch(`${base}/healthz`)).status === 200) return { base, output: () => log, child };
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`the launcher was not healthy in ${Math.round(timeoutMs / 1000)} seconds:\n${log}`);
}

/** The process ids of the direct children of `pid` (the launcher's children are workerd, the Worker's process). Uses `pgrep -P`, which Linux and macOS have; throws if it cannot be run, so a test never passes for want of the tool. */
export function childPids(pid: number): number[] {
  const out = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
  if (out.error) throw new Error(`pgrep could not be run: ${out.error.message}`);
  // pgrep exits 1 when nothing matches, which is an empty list and not an error.
  return out.stdout.split("\n").filter((l) => /^\d+$/.test(l.trim())).map(Number);
}

/** SIGTERM first, as a platform does, so the launcher ends the Worker's process too; SIGKILL only for one that does not leave in 15 seconds. */
export async function stopAllLaunched(): Promise<void> {
  for (const c of children) if (c.exitCode === null) c.kill("SIGTERM");
  for (const c of children) if ((await exited(c, 15_000)) === null) c.kill("SIGKILL");
  children.length = 0;
}
