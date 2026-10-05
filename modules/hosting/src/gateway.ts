// The server in front of the application: the access gate, a health answer for the platform, and a byte-for-byte hand-over of every other
// request to the application on loopback. The decisions it makes are in gate.ts; this file moves bytes. It starts nothing itself, so a
// test can point it at a stub application.
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MAX_PROXY_BODY_BYTES, passesGate, upstreamHeaders } from "./gate.ts";
import type { Config } from "./gate.ts";

export type GatewayOptions = {
  access: Config["access"];
  upstreamPort: number;
  /** False while the database is being built and the application is starting: every request but /healthz is answered 503, and /healthz says "starting". */
  ready: () => boolean;
  upstreamHost?: string;
  maxBodyBytes?: number;
  /** One line per refused or failed request. Never receives a header, a body or a credential. */
  log?: (line: string) => void;
};

const HOP_BY_HOP = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"];
const HEALTH_CACHE_MS = 2_000;
const HEALTH_TIMEOUT_MS = 2_000;
const UPSTREAM_TIMEOUT_MS = 60_000;
const TEXT = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" };

function reply(res: ServerResponse, status: number, text: string, extra: Record<string, string> = {}): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, { ...TEXT, ...extra });
  res.end(`${text}\n`);
}

export function createGateway(options: GatewayOptions): http.Server {
  const host = options.upstreamHost ?? "127.0.0.1";
  const maxBody = options.maxBodyBytes ?? MAX_PROXY_BODY_BYTES;
  const log = options.log ?? (() => {});
  let healthAt = 0;
  let healthy = false;

  /** Whether the application itself answers its own health route. Asked at most once every two seconds, whoever is asking. */
  const probe = (): Promise<boolean> =>
    new Promise((resolve) => {
      const req = http.get({ host, port: options.upstreamPort, path: "/api/health", timeout: HEALTH_TIMEOUT_MS }, (r) => {
        r.resume();
        resolve(r.statusCode === 200);
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => resolve(false));
    });

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? "/").split("?")[0];

    // The platform's health check cannot present the gate's password, so this one route is answered before the gate. It says only ok or not.
    if (path === "/healthz" && (req.method === "GET" || req.method === "HEAD")) {
      if (!options.ready()) return reply(res, 503, "starting");
      if (Date.now() - healthAt > HEALTH_CACHE_MS) {
        healthy = await probe();
        healthAt = Date.now();
      }
      return reply(res, healthy ? 200 : 503, healthy ? "ok" : "application not answering");
    }

    if (!passesGate(req.headers.authorization, options.access)) {
      log(`401 ${req.method} (access gate)`);
      req.resume();
      return reply(res, 401, "Authentication required.", { "www-authenticate": 'Basic realm="APLYD synthetic demonstration", charset="UTF-8"' });
    }
    if (!options.ready()) {
      req.resume();
      return reply(res, 503, "The application is starting. Try again in a few seconds.", { "retry-after": "5" });
    }

    const declared = req.headers["content-length"];
    if (declared !== undefined && /^\d+$/.test(declared) && Number(declared) > maxBody) {
      log(`413 ${req.method} (declared length)`);
      req.resume();
      return reply(res, 413, "The request is too large.");
    }

    const headers = upstreamHeaders(req.headers);
    for (const name of HOP_BY_HOP) delete headers[name];
    let received = 0;
    let refused = false;
    const out = http.request({ host, port: options.upstreamPort, method: req.method, path: req.url, headers, timeout: UPSTREAM_TIMEOUT_MS }, (upstream) => {
      const responseHeaders = { ...upstream.headers };
      for (const name of HOP_BY_HOP) delete responseHeaders[name];
      res.writeHead(upstream.statusCode ?? 502, upstream.statusMessage, responseHeaders as http.OutgoingHttpHeaders);
      upstream.pipe(res);
      upstream.on("error", () => res.destroy());
    });
    out.on("timeout", () => out.destroy(new Error("the application did not answer in time")));
    out.on("error", (error) => {
      if (refused) return;
      log(`502 ${req.method} (${error.message})`);
      reply(res, 502, "The application did not answer.");
    });
    res.on("close", () => out.destroy());
    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBody && !refused) {
        refused = true;
        log(`413 ${req.method} (streamed length)`);
        out.destroy();
        reply(res, 413, "The request is too large.");
      }
    });
    req.pipe(out);
  });
  // A page that stays open for minutes is normal; a connection that sends nothing is not.
  server.headersTimeout = 20_000;
  server.requestTimeout = 120_000;
  server.on("upgrade", (_req, socket) => socket.destroy());
  return server;
}
