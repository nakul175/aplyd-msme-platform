# Platform module: status

Owner: the platform module. Paths: `modules/platform/`, `app/`, `worker/`, `drizzle/`, `scripts/`. Last updated 4 October 2026.

This is slice 1, the walking skeleton. It is application plumbing with no product function: sign-in, one company record, the scope rule, an audit trail, and the test pipeline. Protected paths touched: identity, data scope, migrations and the audit log. One reviewer agent has reviewed it and its findings are fixed ([VALIDATION.md](VALIDATION.md)); a person has not.

## What works

- Synthetic sign-in: a person picks one of three synthetic users (two owners in two companies, one platform operator). The session is a signed cookie that carries only the user id and an expiry.
- Identity comes only from that cookie. Company and role are read from the database on every request. A static rule over the syntax tree of every source file allows only `.get("cookie")`, `origin`, `sec-fetch-site` and `content-type` reads of request headers (a tripwire, see limit 4). The session secret must be at least 32 bytes.
- The company record: an owner reads their own company. A request for any other company, or a request from the operator, gets 404 and the attempt is written to the audit log. The query is bound to the signed-in person's company, not the id in the URL.
- The audit log refuses UPDATE, DELETE, `INSERT OR REPLACE` and `REPLACE INTO` that reuse an id, through three database triggers. It cannot refuse `DROP TRIGGER`, `DROP TABLE` or `ALTER TABLE`; nothing inside SQLite can. The health check reports `degraded` when a trigger is missing.
- State-changing requests that another website started are refused (every method but GET, HEAD and OPTIONS, in any letter case). The refused request's body is read so the connection is left clean.
- Every response carries frame-ancestors, base-uri, form-action, nosniff, referrer-policy and frame-options headers. There is no restriction on scripts yet.
- Sign-in accepts two content types and answers 415 or 400 to anything else.
- Sign-in refuses anywhere `APLYD_ENV` is not exactly local, synthetic or test, and without a good `SESSION_SECRET`. A build carries no environment name; only the development server sets `local`.
- The interface shows a SYNTHETIC banner and tag.
- Test runner with layers, per-module baselines and a guard; CI that runs it; a documentation integrity check.
- A browser test layer (slice 1b): the built application in a local Worker, walked in a real headless Chromium through `playwright-core`. It checks that the pages render with the SYNTHETIC banner, that sign-in through the form leaves an HttpOnly, SameSite=Lax session cookie that script on the page cannot read, that the scope rule and sign-out hold in the browser, and that a cross-site post is refused. First run on 4 October 2026 in Chromium 141.0.7390.37 on Linux; GitHub Actions ran it on the same day at commit 0a5633c, with Google Chrome on the runner, and it passed (one run). What it does not prove is in [VALIDATION.md](VALIDATION.md).

## Not built

- Real sign-in (OQ-13). Hosted staging and its access layer, and the deployment workflow (needs the sponsor's Cloudflare account and OQ-07).
- Creating or editing a company record. Slice 2 (Describe, [modules/factory/STATUS.md](../factory/STATUS.md)) adds a factory description to a company as appended versions; the company record itself is still read-only.
- The supply-chain gate (SBOM and audit).
- Any money, vendor, pooling or aggregate code. The invariants in AGENTS.md about vendor-neutral earnings, certification, selling data and the five-company floor have no code to test yet; each gets its test in the slice that adds the code.

## Known limits

1. Synthetic sign-in has no password. Anyone who can reach a synthetic environment can act as any synthetic user. A hosted environment must sit behind an access layer before anyone else is pointed at it.
2. No rate limit on sign-in attempts.
3. A session cannot be revoked before its eight hours end, except by deleting the user or changing `SESSION_SECRET`. Sign-out clears the cookie in that browser and is audited; the token itself stays valid. There is no "sign out everywhere".
4. The header rule is a tripwire. It reads the syntax tree and catches aliasing, spreading, looping, destructuring, optional chaining and unusual spacing; it cannot see a header reached through reflection or a name built at run time, so it does not prove no code path trusts one.
5. The seeded company records are read-only by absence of a write path, not by a database rule.
6. Results are in [VALIDATION.md](VALIDATION.md), with their dates and limits.
7. A POST with neither Origin nor Sec-Fetch-Site is allowed (browsers always send Origin; a client that does not carries nobody's cookie). A test pins this.
8. An authenticated person can still write many rows to the audit log by repeating denied reads or sign-outs. They are attributable to that person; there is no cap or rate limit.
9. The regression baseline can be edited by hand in a pull request. There is no code-owner rule to route that to a person. The audit log has no hash chain, so tampering with the database itself would not be detected.
10. The cookie is named `aplyd_session`, not `__Host-aplyd_session`, and security headers carry no script restrictions (no full Content-Security-Policy).
11. The browser layer covers one browser engine (Chromium) on desktop Linux against a local Worker over plain HTTP on loopback. Firefox, Safari, phones, Secure-cookie behaviour over real HTTPS, and any hosted environment are untested.
