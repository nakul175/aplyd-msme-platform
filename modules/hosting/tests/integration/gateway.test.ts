// The gateway against a stand-in application on loopback: what it answers itself (the gate, the health route, the size limit) and what it
// hands on unchanged. No Worker is started, so this runs in the integration layer without a build.
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createGateway, probeUpstream, watchUpstream } from "../../src/gateway.ts";
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

test("the health route names the commit on a second line when it is given one, in every state, and says nothing about it otherwise", async () => {
  const sha = "034320ce8a21db0818b9b4a39315d0d4b2f976c4";
  await withGateway({ commit: sha }, async (base) => {
    stubHealthy = true;
    const ok = await fetch(`${base}/healthz`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), `ok\ncommit ${sha}\n`);
    assert.equal((await fetch(`${base}/healthz`, { method: "HEAD" })).status, 200);
  });
  // A separate gateway: the application's answer is remembered for two seconds.
  await withGateway({ commit: sha }, async (base) => {
    stubHealthy = false;
    const bad = await fetch(`${base}/healthz`);
    assert.equal(bad.status, 503);
    assert.equal(await bad.text(), `application not answering\ncommit ${sha}\n`);
    stubHealthy = true;
  });
  await withGateway({ commit: "unknown", ready: () => false }, async (base) => {
    const starting = await fetch(`${base}/healthz`);
    assert.equal(starting.status, 503);
    assert.equal(await starting.text(), "starting\ncommit unknown\n");
  });
  await withGateway({}, async (base) => {
    stubHealthy = true;
    assert.equal(await (await fetch(`${base}/healthz`)).text(), "ok\n", "no commit line when none is given");
  });
  seen.length = 0;
  await withGateway({ commit: sha }, async (base) => {
    assert.equal((await fetch(`${base}/sign-in`)).status, 401, "the commit is on the health route only: every other path is still behind the gate");
  });
  assert.deepEqual(seen, []);
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

test("a declared length over the limit is refused at once, before any of the body is sent", async () => {
  seen.length = 0;
  await withGateway({ maxBodyBytes: 1000 }, async (_base, host) => {
    const [h, p] = host.split(":");
    const status = await new Promise<number>((resolve) => {
      const timer = setTimeout(() => resolve(0), 3_000);
      const req = http.request({ host: h, port: Number(p), method: "POST", path: "/api/session", headers: { authorization: AUTH, "content-length": "100000" } }, (res) => {
        clearTimeout(timer);
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", () => resolve(0));
      req.write("z".repeat(10)); // ten bytes of the hundred thousand it declared, then nothing: only the declared length can be what is refused
    });
    assert.equal(status, 413, "answered 413 without waiting for the rest of the body");
  });
  assert.deepEqual(seen, []);
});

test("headers that belong to one hop are not handed on to the application", async () => {
  seen.length = 0;
  await withGateway({}, async (_base, host) => {
    const [h, p] = host.split(":");
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: h, port: Number(p), path: "/page", headers: { authorization: AUTH, "proxy-authorization": "Basic c2VjcmV0", "keep-alive": "timeout=5", te: "trailers", "x-kept": "yes" } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 200);
  });
  assert.equal(seen.length, 1);
  for (const name of ["proxy-authorization", "keep-alive", "te", "authorization"]) assert.equal(seen[0].headers[name], undefined, `${name} reached the application`);
  assert.equal(seen[0].headers["x-kept"], "yes", "an ordinary header goes through");
});

test("Miniflare's control headers sent by a client do not reach the application (S3-04)", async () => {
  seen.length = 0;
  await withGateway({}, async (_base, host) => {
    const [h, p] = host.split(":");
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: h, port: Number(p), path: "/page", headers: { authorization: AUTH, "MF-Original-URL": "http://x.example/api/session", "MF-CF-Blob": "{not json", "Mf-Route-Override": "other", "x-kept": "yes" } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 200);
  });
  assert.equal(seen.length, 1);
  assert.deepEqual(Object.keys(seen[0].headers).filter((n) => n.startsWith("mf-")), [], "no mf- header reached the application");
  assert.equal(seen[0].headers["x-kept"], "yes");
});

test("the health probe is true for a 200, false for anything else, and false for an application that is not there", async () => {
  stubHealthy = true;
  assert.equal(await probeUpstream("127.0.0.1", stubPort), true);
  stubHealthy = false;
  assert.equal(await probeUpstream("127.0.0.1", stubPort), false);
  stubHealthy = true;
  const dead = http.createServer();
  await new Promise<void>((r) => dead.listen(0, "127.0.0.1", () => r()));
  const port = (dead.address() as AddressInfo).port;
  await new Promise((r) => dead.close(r));
  assert.equal(await probeUpstream("127.0.0.1", port), false);
  // An application that accepts the connection and never answers: false once the time is up, not a hang.
  const silent = http.createServer(() => {});
  await new Promise<void>((r) => silent.listen(0, "127.0.0.1", () => r()));
  const started = Date.now();
  assert.equal(await probeUpstream("127.0.0.1", (silent.address() as AddressInfo).port, 150), false);
  assert.ok(Date.now() - started < 3_000);
  silent.closeAllConnections();
  await new Promise((r) => silent.close(r));
});

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("the watchdog fires once, after the set number of failed probes in a row, and never before (S6)", async () => {
  const fired: number[] = [];
  let asked = 0;
  const stop = watchUpstream({ probe: async () => (asked++, false), probes: 3, intervalMs: 5, onDead: (n) => fired.push(n) });
  await settle(120);
  stop();
  assert.deepEqual(fired, [3], "once, with the count");
  assert.equal(asked, 3, "it stopped asking when it fired");
  // One fewer failure than the limit is not enough, however long it goes on being asked.
  const answers = [false, false, true]; // repeated: two failures, then an answer, again and again
  let i = 0;
  const reset: number[] = [];
  const stop2 = watchUpstream({ probe: async () => answers[i++ % answers.length], probes: 3, intervalMs: 3, onDead: (n) => reset.push(n) });
  await settle(150);
  stop2();
  assert.deepEqual(reset, [], "an answer between the failures starts the count again, so two in a row never reach three");
  assert.ok(i > answers.length, "it was asked many times");
});

test("the watchdog counts a probe that throws as a failure, can be stopped, and does nothing with 0 probes", async () => {
  const thrown: number[] = [];
  const stop = watchUpstream({ probe: async () => { throw new Error("boom"); }, probes: 2, intervalMs: 3, onDead: (n) => thrown.push(n) });
  await settle(100);
  stop();
  assert.deepEqual(thrown, [2]);

  const stopped: number[] = [];
  let asked = 0;
  const stop2 = watchUpstream({ probe: async () => (asked++, false), probes: 2, intervalMs: 40, onDead: (n) => stopped.push(n) });
  stop2();
  stop2();
  await settle(150);
  assert.deepEqual(stopped, [], "stopped before the first probe: it never fires");
  assert.equal(asked, 0);

  // Stopped while a probe is in flight: the late answer is ignored.
  const late: number[] = [];
  const stop3 = watchUpstream({ probe: () => new Promise((r) => setTimeout(() => r(false), 60)), probes: 1, intervalMs: 3, onDead: (n) => late.push(n) });
  await settle(30);
  stop3();
  await settle(150);
  assert.deepEqual(late, []);

  const off: number[] = [];
  let askedOff = 0;
  const stop4 = watchUpstream({ probe: async () => (askedOff++, false), probes: 0, intervalMs: 3, onDead: (n) => off.push(n) });
  await settle(60);
  stop4();
  assert.deepEqual(off, []);
  assert.equal(askedOff, 0, "0 probes: never asked");
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
