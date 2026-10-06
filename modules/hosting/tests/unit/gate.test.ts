// The launcher's decisions, without starting anything: what must be set before the application is served, who passes the gate, and
// which headers reach the application.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_PROXY_BODY_BYTES, MIN_PASSWORD_CHARACTERS, parseConfig, passesGate, upstreamHeaders } from "../../src/gate.ts";

const SECRET = "k3Jx9mQ2vL8sT5wZ1bN7cR4dF6gH0yPa";
const PASSWORD = "twelve-chars-or-more";
const good = { SESSION_SECRET: SECRET, DEMO_USER: "demo", DEMO_PASSWORD: PASSWORD };

function problemsOf(env: Record<string, string | undefined>): string[] {
  const result = parseConfig(env);
  assert.equal(result.ok, false, "expected the configuration to be refused");
  return result.ok ? [] : result.problems;
}

test("a complete synthetic configuration is accepted and takes its defaults", () => {
  const result = parseConfig(good);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.config.port, 8080);
  assert.equal(result.config.upstreamPort, 8787);
  assert.equal(result.config.environment, "synthetic");
  assert.equal(result.config.demo, false);
  assert.equal(result.config.commit, null);
  assert.equal(result.config.commitIgnored, false);
  assert.deepEqual(result.config.access, { kind: "password", user: "demo", password: PASSWORD });
});

test("only a synthetic environment is served: production, a typo and a different case are refused", () => {
  for (const environment of ["production", "prod", "staging", "Synthetic", "test "]) {
    assert.match(problemsOf({ ...good, APLYD_ENV: environment }).join("\n"), /synthetic environments only/, environment);
  }
  for (const environment of ["local", "synthetic", "test"]) assert.ok(parseConfig({ ...good, APLYD_ENV: environment }).ok, environment);
});

test("the session secret must be long enough and not one repeated character, and the message never prints it", () => {
  assert.match(problemsOf({ ...good, SESSION_SECRET: "short" }).join("\n"), /at least 32 bytes/);
  assert.match(problemsOf({ ...good, SESSION_SECRET: undefined }).join("\n"), /at least 32 bytes/);
  assert.match(problemsOf({ ...good, SESSION_SECRET: "a".repeat(40) }).join("\n"), /repeated character/);
  assert.ok(parseConfig({ ...good, SESSION_SECRET: "a".repeat(31) + "b" }).ok);
  // The floor is in bytes, as the application's is: 15 two-byte characters and two more make exactly 32 bytes.
  assert.ok(parseConfig({ ...good, SESSION_SECRET: "é".repeat(15) + "ee" }).ok);
  assert.match(problemsOf({ ...good, SESSION_SECRET: "é".repeat(15) + "e" }).join("\n"), /at least 32 bytes/);
  for (const bad of ["short", "a".repeat(40)]) assert.ok(!problemsOf({ ...good, SESSION_SECRET: bad }).join("\n").includes(bad), "a refused secret is not echoed");
});

test("the launcher does not start without a gate, and open access has to be asked for in so many words", () => {
  assert.match(problemsOf({ SESSION_SECRET: SECRET }).join("\n"), /Set DEMO_USER and DEMO_PASSWORD/);
  assert.match(problemsOf({ SESSION_SECRET: SECRET, DEMO_USER: "demo" }).join("\n"), /Set DEMO_USER and DEMO_PASSWORD/);
  assert.match(problemsOf({ SESSION_SECRET: SECRET, DEMO_PASSWORD: PASSWORD }).join("\n"), /Set DEMO_USER and DEMO_PASSWORD/);
  assert.match(problemsOf({ SESSION_SECRET: SECRET, DEMO_USER: "", DEMO_PASSWORD: "" }).join("\n"), /Set DEMO_USER and DEMO_PASSWORD/);
  const open = parseConfig({ SESSION_SECRET: SECRET, DEMO_ACCESS: "open" });
  assert.ok(open.ok);
  if (open.ok) assert.deepEqual(open.config.access, { kind: "open" });
  for (const word of ["true", "yes", "OPEN", "1"]) assert.match(problemsOf({ SESSION_SECRET: SECRET, DEMO_ACCESS: word }).join("\n"), /may only be "open"/, word);
  assert.match(problemsOf({ ...good, DEMO_ACCESS: "open" }).join("\n"), /choose one/);
});

test("the gate's user and password must be usable", () => {
  assert.match(problemsOf({ ...good, DEMO_USER: "a:b" }).join("\n"), /colon/);
  assert.match(problemsOf({ ...good, DEMO_PASSWORD: "x".repeat(MIN_PASSWORD_CHARACTERS - 1) }).join("\n"), /at least 12 characters/);
  assert.ok(parseConfig({ ...good, DEMO_PASSWORD: "x".repeat(MIN_PASSWORD_CHARACTERS) }).ok);
  // A password may contain a colon: only the first colon of the decoded header separates user from password.
  assert.ok(parseConfig({ ...good, DEMO_PASSWORD: "has:a:colon:inside" }).ok);
});

test("ports must be whole numbers in range and different from each other", () => {
  for (const port of ["0", "65536", "80.5", "-1", "abc", "8e3", " 8080"]) assert.match(problemsOf({ ...good, PORT: port }).join("\n"), /PORT must be/, port);
  assert.match(problemsOf({ ...good, APLYD_UPSTREAM_PORT: "x" }).join("\n"), /APLYD_UPSTREAM_PORT must be/);
  assert.match(problemsOf({ ...good, PORT: "9000", APLYD_UPSTREAM_PORT: "9000" }).join("\n"), /must differ/);
  const ok = parseConfig({ ...good, PORT: "3000", APLYD_UPSTREAM_PORT: "3001" });
  assert.ok(ok.ok && ok.config.port === 3000 && ok.config.upstreamPort === 3001);
});

test("public hosts are optional, lower-cased, and refused when they are not host names", () => {
  const none = parseConfig(good);
  assert.ok(none.ok && none.config.publicHosts.length === 0);
  const two = parseConfig({ ...good, APLYD_PUBLIC_HOSTS: "Demo.Example, app.example:8443 ,," });
  assert.ok(two.ok);
  if (two.ok) assert.deepEqual(two.config.publicHosts, ["demo.example", "app.example:8443"]);
  for (const bad of ["https://demo.example", "demo.example/path", "-x.example", "a b", "demo.example:99999x", "x@y"]) {
    assert.match(problemsOf({ ...good, APLYD_PUBLIC_HOSTS: bad }).join("\n"), /APLYD_PUBLIC_HOSTS/, bad);
  }
});

test("every problem is reported at once, so one launch shows all of them", () => {
  const problems = problemsOf({ APLYD_ENV: "production", SESSION_SECRET: "short", PORT: "0" });
  assert.ok(problems.length >= 4, problems.join(" | "));
});

test("demonstration mode is on only for the exact word true", () => {
  for (const [value, expected] of [["true", true], ["TRUE", false], ["1", false], ["yes", false], ["", false], [undefined, false]] as const) {
    const result = parseConfig({ ...good, APLYD_DEMO: value });
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.config.demo, expected, String(value));
  }
});

test("the commit is taken only when it is a commit id, and anything else is ignored and never stops the launch", () => {
  const sha = "034320ce8a21db0818b9b4a39315d0d4b2f976c4";
  for (const [value, expected] of [[sha, sha], [sha.toUpperCase(), sha], [`  ${sha}\n`, sha], ["034320c", "034320c"], ["a".repeat(64), "a".repeat(64)], ["034320", null], ["a".repeat(65), null], ["", null], [undefined, null], ["unknown", null], ["${_self.COMMIT_HASH}", null], ["034320c; rm -rf /", null], ["034320c\ncommit evil", null], ["g34320c", null]] as const) {
    const result = parseConfig({ ...good, APLYD_COMMIT: value });
    assert.ok(result.ok, `a commit of ${JSON.stringify(value)} must not stop the launch`);
    if (result.ok) {
      assert.equal(result.config.commit, expected, String(value));
      assert.equal(result.config.commitIgnored, expected === null && (value ?? "").trim() !== "", `commitIgnored for ${JSON.stringify(value)}`);
    }
  }
});

const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
const access = { kind: "password", user: "demo", password: PASSWORD } as const;

test("the gate admits the right user and password and nothing near them", () => {
  assert.equal(passesGate(basic("demo", PASSWORD), access), true);
  assert.equal(passesGate(`basic ${basic("demo", PASSWORD).slice(6)}`, access), true, "the scheme word is case-insensitive");
  assert.equal(passesGate(undefined, access), false);
  assert.equal(passesGate("", access), false);
  assert.equal(passesGate(basic("demo", PASSWORD + "x"), access), false);
  assert.equal(passesGate(basic("demo", PASSWORD.slice(0, -1)), access), false);
  assert.equal(passesGate(basic("Demo", PASSWORD), access), false, "the user is case-sensitive");
  assert.equal(passesGate(basic("", PASSWORD), access), false);
  assert.equal(passesGate(basic("demo", ""), access), false);
  assert.equal(passesGate(basic("demo", PASSWORD).replace("Basic ", "Bearer "), access), false);
  assert.equal(passesGate(`Basic ${Buffer.from("demo").toString("base64")}`, access), false, "no colon in the decoded value");
  assert.equal(passesGate("Basic !!!not-base64!!!", access), false);
  assert.equal(passesGate(PASSWORD, access), false);
});

test("a password with colons is compared whole: only the first colon of the decoded value ends the user", () => {
  const colons = { kind: "password", user: "demo", password: "has:a:colon:inside" } as const;
  assert.equal(passesGate(basic("demo", "has:a:colon:inside"), colons), true);
  assert.equal(passesGate(basic("demo", "has"), colons), false);
  assert.equal(passesGate(basic("demo", "has:a:colon"), colons), false);
  assert.equal(passesGate(basic("other", "has:a:colon:inside"), colons), false);
});

test("open access admits everyone, with or without a header", () => {
  assert.equal(passesGate(undefined, { kind: "open" }), true);
  assert.equal(passesGate("Basic nonsense", { kind: "open" }), true);
});

test("the gate's own credentials are not handed to the application", () => {
  const out = upstreamHeaders({ host: "demo.example", authorization: basic("demo", PASSWORD), cookie: "aplyd_session=abc" });
  assert.equal(out.authorization, undefined);
  assert.equal(out.cookie, "aplyd_session=abc");
});

test("an Origin that is this site's own is rewritten to the origin the application sees, whatever scheme the browser used", () => {
  assert.equal(upstreamHeaders({ host: "demo.example", origin: "https://demo.example" }).origin, "http://demo.example");
  assert.equal(upstreamHeaders({ host: "demo.example", origin: "http://demo.example" }).origin, "http://demo.example");
  assert.equal(upstreamHeaders({ host: "Demo.Example:8443", origin: "https://demo.example:8443" }).origin, "http://Demo.Example:8443");
});

test("every other Origin reaches the application unchanged, so the application still refuses it as cross-site", () => {
  const cases = [
    "https://evil.example",
    "https://demo.example.evil.example",
    "https://evildemo.example",
    "https://demo.example:444",
    "null",
    "",
    "demo.example",
    "ftp://demo.example",
    "https://demo.example/path",
    "https://user@demo.example",
    "https://demo.example, https://evil.example",
  ];
  for (const origin of cases) assert.equal(upstreamHeaders({ host: "demo.example", origin }).origin, origin, JSON.stringify(origin));
  assert.equal(upstreamHeaders({ host: "demo.example" }).origin, undefined, "no Origin stays none");
  assert.equal(upstreamHeaders({ origin: "https://demo.example" }).origin, "https://demo.example", "no Host: nothing to compare with");
});

test("a listed public host's Origin is rewritten too, when the platform has rewritten Host; an unlisted one still is not", () => {
  const inner = { host: "10.0.0.5:8080", origin: "https://demo.example" };
  assert.equal(upstreamHeaders(inner).origin, "https://demo.example", "without the list, a rewritten Host makes the Origin foreign");
  assert.equal(upstreamHeaders(inner, ["demo.example"]).origin, "http://10.0.0.5:8080");
  assert.equal(upstreamHeaders({ ...inner, origin: "https://evil.example" }, ["demo.example"]).origin, "https://evil.example");
  assert.equal(upstreamHeaders({ ...inner, origin: "https://demo.example:444" }, ["demo.example"]).origin, "https://demo.example:444", "the port is part of the host");
});

test("the request size limit is above anything the application accepts and far below anything that could matter", () => {
  assert.ok(MAX_PROXY_BODY_BYTES > 64 * 1024, "the application's own limit is 64 KB");
  assert.ok(MAX_PROXY_BODY_BYTES <= 1024 * 1024);
});
