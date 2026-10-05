// The gateway against a stand-in application on loopback: what it answers itself (the gate, the health route, the size limit) and what it
// hands on unchanged. No Worker is started, so this runs in the integration layer without a build.
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createGateway } from "../../src/gateway.ts";
import type { GatewayOptions } from "../../src/gateway.ts";

type Seen = { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string };
const seen: Seen[] = [];
let stub: http.Server;
let stubPort = 0;
let stubHealthy = true;

const PASSWORD = "twelve-chars-or-more";
const AUTH = `Basic ${Buffer.from(`demo:${PASSWORD}`).toString("base64")}`;
const access = { kind: "password", user: "demo", password: PASSWORD } as const;

before(async () => {
  stub = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (req.url === "/api/health") {
        res.writeHead(stubHealthy ? 200 : 500, { "content-type": "application/json" });
        return res.end("{}");
      }
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
      if (req.url === "/redirect") {
        res.writeHead(303, { location: "/", "set-cookie": "aplyd_session=abc; HttpOnly; Secure; SameSite=Lax; Path=/" });
        return res.end();
      }
      res.writeHead(200, { "content-type": "text/plain", "x-from-stub": "yes", connection: "keep-alive" });
      res.end(`stub saw ${req.method} ${req.url}`);
    });
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", () => r()));
  stubPort = (stub.address() as AddressInfo).port;
});
after(async () => {
  stub.closeAllConnections();
  await new Promise((r) => stub.close(r));
});

async function withGateway<T>(options: Partial<GatewayOptions>, run: (base: string, host: string) => Promise<T>): Promise<T> {
  const gateway = createGateway({ access, upstreamPort: stubPort, ready: () => true, ...options });
  await new Promise<void>((r) => gateway.listen(0, "127.0.0.1", () => r()));
  const port = (gateway.address() as AddressInfo).port;
  try {
    return await run(`http://127.0.0.1:${port}`, `127.0.0.1:${port}`);
  } finally {
    gateway.closeAllConnections();
    await new Promise((r) => gateway.close(r));
  }
}

test("a request without the password, or with a wrong one, is refused and never reaches the application", async () => {
  seen.length = 0;
  await withGateway({}, async (base) => {
    const none = await fetch(`${base}/sign-in`);
    assert.equal(none.status, 401);
    assert.match(none.headers.get("www-authenticate") ?? "", /^Basic realm=/);
    assert.equal(none.headers.get("cache-control"), "no-store");
    const wrong = await fetch(`${base}/sign-in`, { headers: { authorization: `Basic ${Buffer.from("demo:wrong").toString("base64")}` } });
    assert.equal(wrong.status, 401);
    const post = await fetch(`${base}/api/session`, { method: "POST", body: "email=operator@synthetic.invalid", headers: { "content-type": "application/x-www-form-urlencoded" } });
    assert.equal(post.status, 401);
  });
  assert.deepEqual(seen, [], "the application saw none of the three");
});

test("with the password the request reaches the application, and the password does not", async () => {
  seen.length = 0;
  await withGateway({}, async (base) => {
    const res = await fetch(`${base}/sign-in?x=1`, { headers: { authorization: AUTH, cookie: "aplyd_session=abc" } });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "stub saw GET /sign-in?x=1");
    assert.equal(res.headers.get("x-from-stub"), "yes");
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].headers.authorization, undefined, "the gate's credentials stop at the gate");
  assert.equal(seen[0].headers.cookie, "aplyd_session=abc", "the application's own cookie goes through");
});

test("the health route answers without the password and says only ok or not", async () => {
  await withGateway({}, async (base) => {
    stubHealthy = true;
    const ok = await fetch(`${base}/healthz`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.text()).trim(), "ok");
  });
  await withGateway({}, async (base) => {
    stubHealthy = false;
    const bad = await fetch(`${base}/healthz`);
    assert.equal(bad.status, 503);
    assert.ok(!/stub|500|health/i.test(await bad.text()), "the application's own answer is not repeated");
    stubHealthy = true;
  });
  await withGateway({ ready: () => false }, async (base) => {
    const starting = await fetch(`${base}/healthz`);
    assert.equal(starting.status, 503);
    assert.match(await starting.text(), /starting/);
  });
});

test("only the exact health path is open: its neighbours are behind the gate", async () => {
  seen.length = 0;
  await withGateway({}, async (base) => {
    for (const path of ["/healthz/", "/healthz/x", "/healthzz", "/api/health", "//healthz", "/%68ealthz"]) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 401, path);
    }
    const post = await fetch(`${base}/healthz`, { method: "POST" });
    assert.equal(post.status, 401, "a POST to the health path is not a health check");
  });
  assert.deepEqual(seen, []);
});

test("while the application is starting every other request is answered 503 after the gate, not handed on", async () => {
  seen.length = 0;
  await withGateway({ ready: () => false }, async (base) => {
    const res = await fetch(`${base}/`, { headers: { authorization: AUTH } });
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("retry-after"), "5");
    const unauth = await fetch(`${base}/`);
    assert.equal(unauth.status, 401, "the gate comes first even while starting");
  });
  assert.deepEqual(seen, []);
});

test("an Origin that is this site's own is rewritten for the application; a foreign one is left for the application to refuse", async () => {
  seen.length = 0;
  await withGateway({}, async (base, host) => {
    const own = await fetch(`${base}/api/session`, { method: "POST", headers: { authorization: AUTH, origin: `https://${host}` }, body: "x=1" });
    assert.equal(own.status, 200);
    const foreign = await fetch(`${base}/api/session`, { method: "POST", headers: { authorization: AUTH, origin: "https://evil.example" }, body: "x=1" });
    assert.equal(foreign.status, 200, "the stand-in does not judge the Origin; the real application does");
  });
  assert.equal(seen[0].headers.origin?.startsWith("http://127.0.0.1:"), true, `the application saw ${seen[0].headers.origin}`);
  assert.equal(seen[1].headers.origin, "https://evil.example");
});

test("with a listed public host, an Origin from that host is rewritten even though Host differs", async () => {
  seen.length = 0;
  await withGateway({ publicHosts: ["demo.example"] }, async (base) => {
    await fetch(`${base}/api/session`, { method: "POST", headers: { authorization: AUTH, origin: "https://demo.example" }, body: "x=1" });
    await fetch(`${base}/api/session`, { method: "POST", headers: { authorization: AUTH, origin: "https://other.example" }, body: "x=1" });
  });
  assert.equal(seen[0].headers.origin?.startsWith("http://127.0.0.1:"), true);
  assert.equal(seen[1].headers.origin, "https://other.example");
});

test("redirects and cookies come back as the application sent them, and a body goes through whole", async () => {
  seen.length = 0;
  await withGateway({}, async (base) => {
    const res = await fetch(`${base}/redirect`, { headers: { authorization: AUTH }, redirect: "manual" });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/");
    assert.match(res.headers.get("set-cookie") ?? "", /^aplyd_session=abc; HttpOnly; Secure; SameSite=Lax/);
    const body = "email=" + "a".repeat(5000);
    const post = await fetch(`${base}/api/session`, { method: "POST", headers: { authorization: AUTH, "content-type": "application/x-www-form-urlencoded" }, body });
    assert.equal(post.status, 200);
  });
  assert.equal(seen[1].body.length, 5006);
  assert.equal(seen[1].headers["content-type"], "application/x-www-form-urlencoded");
});

test("a body over the limit is refused with 413 whether its length is declared or streamed, and the application never sees it", async () => {
  seen.length = 0;
  await withGateway({ maxBodyBytes: 1000 }, async (base, host) => {
    const declared = await fetch(`${base}/api/session`, { method: "POST", headers: { authorization: AUTH }, body: "x".repeat(1001) });
    assert.equal(declared.status, 413);
    const fits = await fetch(`${base}/api/session`, { method: "POST", headers: { authorization: AUTH }, body: "x".repeat(1000) });
    assert.equal(fits.status, 200);
    // Streamed with no length: chunked, in pieces that together pass the limit.
    const status = await new Promise<number>((resolve, reject) => {
      const [h, p] = host.split(":");
      const req = http.request({ host: h, port: Number(p), method: "POST", path: "/api/session", headers: { authorization: AUTH, "transfer-encoding": "chunked" } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.write("y".repeat(600));
      setTimeout(() => {
        req.write("y".repeat(600));
        req.end();
      }, 50);
    });
    assert.equal(status, 413);
  });
  assert.equal(seen.length, 1, "only the request that fit reached the application");
});

test("when the application is down the gateway says 502 and its health route says 503, and it does not crash", async () => {
  const dead = http.createServer();
  await new Promise<void>((r) => dead.listen(0, "127.0.0.1", () => r()));
  const port = (dead.address() as AddressInfo).port;
  await new Promise((r) => dead.close(r));
  await withGateway({ upstreamPort: port }, async (base) => {
    const res = await fetch(`${base}/`, { headers: { authorization: AUTH } });
    assert.equal(res.status, 502);
    assert.ok(!/ECONNREFUSED|127\.0\.0\.1/.test(await res.text()), "no address or error text is shown");
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 503);
  });
});

test("open access hands every request on, and a log line never holds a header or a credential", async () => {
  const lines: string[] = [];
  await withGateway({ access: { kind: "open" }, log: (l) => lines.push(l) }, async (base) => {
    const res = await fetch(`${base}/sign-in`);
    assert.equal(res.status, 200);
  });
  await withGateway({ log: (l) => lines.push(l) }, async (base) => {
    await fetch(`${base}/`, { headers: { authorization: AUTH } }).then((r) => r.text());
    await fetch(`${base}/`, { headers: { authorization: `Basic ${Buffer.from("demo:leaked-password-x").toString("base64")}` } });
  });
  assert.ok(lines.length >= 1);
  for (const line of lines) assert.ok(!/leaked-password|Basic |twelve-chars/.test(line), line);
});

test("an upgrade request (a websocket) is closed, not handed on", async () => {
  seen.length = 0;
  await withGateway({ access: { kind: "open" } }, async (_base, host) => {
    const [h, p] = host.split(":");
    const closed = await new Promise<boolean>((resolve) => {
      const req = http.request({ host: h, port: Number(p), path: "/", headers: { connection: "Upgrade", upgrade: "websocket" } });
      req.on("upgrade", () => resolve(false));
      req.on("response", (r) => {
        r.resume();
        resolve(false);
      });
      req.on("error", () => resolve(true));
      req.end();
    });
    assert.equal(closed, true);
  });
  assert.deepEqual(seen, []);
});
