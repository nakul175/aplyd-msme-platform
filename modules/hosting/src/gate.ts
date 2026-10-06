// The launcher's decisions, as plain functions so they can be tested without starting anything: what the environment must hold for the
// application to be served, who may pass the access gate, and how a request is handed on to the application. scripts/serve.mjs is
// the thin shell around this file (it starts the application and the proxy and moves bytes).
//
// This hosts a SYNTHETIC deployment. Synthetic sign-in lets anyone who can reach the address sign in as any synthetic user, the
// operator among them, so the launcher refuses to start unless it is told who may pass the gate (or told, in so many words,
// that the address is open), and it refuses any environment that is not a synthetic one: real sign-in is undecided (OQ-13).
import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

export const SYNTHETIC_ENVIRONMENTS = ["local", "synthetic", "test"] as const;
/** The same floor the application applies to its session secret (modules/platform/src/env.ts), checked here so a bad value stops the launch, not the first sign-in. */
export const MIN_SECRET_BYTES = 32;
export const MIN_PASSWORD_CHARACTERS = 12;
/** Larger than any legitimate request this application takes (its own limit is 64 KB). */
export const MAX_PROXY_BODY_BYTES = 256 * 1024;

export type Config = {
  port: number;
  upstreamPort: number;
  environment: string;
  sessionSecret: string;
  access: { kind: "open" } | { kind: "password"; user: string; password: string };
  /** Hosts, besides the Host header of the request itself, whose Origin counts as this site's own (APLYD_PUBLIC_HOSTS): for an ingress that rewrites Host. */
  publicHosts: string[];
  /** Add the demonstration package (the demo module) after the application is up. The database is rebuilt from the migrations and the synthetic seed on every start, so a restart is a reset. */
  demo: boolean;
  /** The git commit this build was made from (APLYD_COMMIT), lower-case hexadecimal, or null when it is not set or is not a commit id. Shown by /healthz so a live address can be matched to a commit. */
  commit: string | null;
  /** True when APLYD_COMMIT holds something that is not a commit id (it is ignored, and the launcher says so); never a reason to refuse to start. */
  commitIgnored: boolean;
};

/** A git commit id as the platform or a build argument gives it: 7 to 64 hexadecimal characters (40 for SHA-1, 64 for SHA-256). Anything else is not one. */
function parseCommit(value: string | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(v) ? v : null;
}

export type ConfigResult = { ok: true; config: Config } | { ok: false; problems: string[] };

type Environment = Record<string, string | undefined>;

function integer(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

export function parseConfig(env: Environment): ConfigResult {
  const problems: string[] = [];
  const port = integer(env.PORT, 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push("PORT must be a whole number from 1 to 65535.");
  const upstreamPort = integer(env.APLYD_UPSTREAM_PORT, 8787);
  if (!Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) problems.push("APLYD_UPSTREAM_PORT must be a whole number from 1 to 65535.");
  if (Number.isInteger(port) && port === upstreamPort) problems.push("PORT and APLYD_UPSTREAM_PORT must differ.");

  const environment = env.APLYD_ENV === undefined || env.APLYD_ENV === "" ? "synthetic" : env.APLYD_ENV;
  if (!(SYNTHETIC_ENVIRONMENTS as readonly string[]).includes(environment)) {
    problems.push(`APLYD_ENV is "${environment}". This launcher serves synthetic environments only (${SYNTHETIC_ENVIRONMENTS.join(", ")}): how a real owner signs in is undecided (OQ-13).`);
  }

  const secret = env.SESSION_SECRET ?? "";
  if (new TextEncoder().encode(secret).length < MIN_SECRET_BYTES) problems.push(`SESSION_SECRET must be at least ${MIN_SECRET_BYTES} bytes.`);
  else if (new Set(secret).size < 2) problems.push("SESSION_SECRET must not be one repeated character.");

  const user = env.DEMO_USER ?? "";
  const password = env.DEMO_PASSWORD ?? "";
  let access: Config["access"] | null = null;
  if (env.DEMO_ACCESS === "open") {
    if (user !== "" || password !== "") problems.push("DEMO_ACCESS=open and DEMO_USER or DEMO_PASSWORD are both set: choose one.");
    access = { kind: "open" };
  } else if (env.DEMO_ACCESS !== undefined && env.DEMO_ACCESS !== "") {
    problems.push('DEMO_ACCESS may only be "open" (leave it unset to require DEMO_USER and DEMO_PASSWORD).');
  } else if (user === "" || password === "") {
    problems.push("Set DEMO_USER and DEMO_PASSWORD (the access gate), or DEMO_ACCESS=open to leave the address open. Synthetic sign-in lets anyone who reaches the address sign in as the operator.");
  } else if (user.includes(":")) {
    problems.push("DEMO_USER must not contain a colon.");
  } else if ([...password].length < MIN_PASSWORD_CHARACTERS) {
    problems.push(`DEMO_PASSWORD must be at least ${MIN_PASSWORD_CHARACTERS} characters.`);
  } else {
    access = { kind: "password", user, password };
  }

  const publicHosts: string[] = [];
  for (const raw of (env.APLYD_PUBLIC_HOSTS ?? "").split(",")) {
    const host = raw.trim().toLowerCase();
    if (host === "") continue;
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(host)) problems.push(`APLYD_PUBLIC_HOSTS holds "${raw.trim()}", which is not a host name with an optional port.`);
    else publicHosts.push(host);
  }

  if (problems.length > 0 || access === null) return { ok: false, problems };
  return {
    ok: true,
    config: {
      port,
      upstreamPort,
      environment,
      sessionSecret: secret,
      access,
      publicHosts,
      demo: env.APLYD_DEMO === "true",
      commit: parseCommit(env.APLYD_COMMIT),
      commitIgnored: (env.APLYD_COMMIT ?? "").trim() !== "" && parseCommit(env.APLYD_COMMIT) === null,
    },
  };
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** True when the Authorization header carries the right user and password. Both are compared in constant time, as digests of equal length. */
export function passesGate(authorization: string | undefined, access: Config["access"]): boolean {
  if (access.kind === "open") return true;
  if (authorization === undefined) return false;
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization.trim());
  if (!match) return false;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  const userOk = timingSafeEqual(digest(decoded.slice(0, colon)), digest(access.user));
  const passwordOk = timingSafeEqual(digest(decoded.slice(colon + 1)), digest(access.password));
  return userOk && passwordOk;
}

/**
 * The headers handed to the application. The application refuses a state-changing request whose Origin differs from the origin of the
 * request URL it is given, and the URL it is given is the proxy's own (http, the Host the browser sent), not the public https one the
 * platform's ingress terminated. So an Origin whose host is exactly the Host the browser sent is rewritten to the origin the application
 * sees. Hosts named in `publicHosts` count too, for a platform that rewrites Host on its way in. A page on another site cannot send an Origin with this host, so every other Origin (another host, "null", something that is not
 * a URL) is passed on untouched and the application refuses it as cross-site, as it would without the proxy. The scheme is not compared:
 * the ingress's forwarded-scheme header is not relied on, and the session cookie is Secure, so a request that arrived over plain http
 * carries no session. The gate's own Authorization header is not passed on.
 */
export function upstreamHeaders(headers: IncomingHttpHeaders, publicHosts: readonly string[] = []): IncomingHttpHeaders {
  const out: IncomingHttpHeaders = { ...headers };
  delete out.authorization;
  // Neither header is a list: a value with a comma in it is not an origin, and is left for the application to refuse.
  const origin = typeof headers.origin === "string" ? headers.origin : undefined;
  const hostHeader = typeof headers.host === "string" ? headers.host : undefined;
  const host = hostHeader?.toLowerCase();
  if (origin !== undefined && hostHeader !== undefined && host !== "") {
    let parsed: URL | null = null;
    try {
      parsed = new URL(origin);
    } catch {
      /* not a URL: left as it is */
    }
    if (parsed !== null && (parsed.protocol === "http:" || parsed.protocol === "https:") && (parsed.host.toLowerCase() === host || publicHosts.includes(parsed.host.toLowerCase())) && parsed.origin === origin) out.origin = `http://${hostHeader}`;
  }
  return out;
}
