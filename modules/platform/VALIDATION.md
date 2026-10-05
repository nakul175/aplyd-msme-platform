# Platform module: validation

Environment for every result below: a Linux container, Node v22.22.0, pnpm 11.25.0, 4 October 2026. The agent that wrote the code ran the first round. A separate reviewer agent then reviewed pull request #1 at commit d5e1fde and the same author fixed what it found; the fix is the second commit series on the branch.

## Results after the review fixes

Run in the working tree of the branch before the fix commit was made: `pnpm install --frozen-lockfile`, `pnpm build`, then `node scripts/test.mjs pr --update-baseline` (every layer passed, then the baseline was recorded through the runner).

| Suite | Result |
| --- | --- |
| static/typecheck | pass (`tsc --noEmit`) |
| static/documentation | pass |
| static/migrations | pass (`drizzle-kit check`: migrations, journal and snapshots agree with the schema) |
| platform/static/source-rules | 6 passed |
| platform/unit/session | 10 passed |
| platform/unit/cross-site | 8 passed |
| platform/unit/scope | 7 passed |
| platform/unit/secret | 4 passed |
| platform/unit/security-headers | 2 passed |
| platform/unit/migrations | 2 passed |
| platform/integration/platform-api | 26 passed, against a real D1 database through Miniflare |
| platform/smoke/built-app | 11 passed, the built application in a local Worker |

76 tests and 3 command suites (39 tests before the review). The guard was clean against `tests/baseline.json`.

## Independent review of slice 1 (what it found and what was done)

A reviewer agent that had not written the code read the identity, scope, audit, migration, runner and CI files and tried to break them. It proved findings by running them. Its full report is not stored in the repository; this table is the record. "Fixed" means a change and a test that fails without it (see the mutation table).

| Finding | What was wrong | Disposition |
| --- | --- | --- |
| H1 | The audit log accepted `INSERT OR REPLACE` and `REPLACE INTO` that reuse an id, overwriting a row without firing the delete trigger. The claim "append-only by any code path" was false. | Fixed: migration 0002 adds a trigger; tests for both forms. `DROP TRIGGER`, `DROP TABLE` and `ALTER TABLE` cannot be stopped inside SQLite; the claim is reworded and a hash chain over the rows (tamper evidence) is not built. |
| M1 | The header allow-list test skipped top-level files (including `app/page.tsx`, the only file that imports `next/headers`) and missed seven ways of reading a header. | Fixed: a syntax-tree rule, applied to every source file, with tests of the rule itself on 20 bad and 6 good snippets. It is still a tripwire (limit 4). |
| M2 | The build carried `APLYD_ENV=local`, so a deployed build had synthetic sign-in on. | Fixed: the build carries no environment name; only the development server sets `local`. A smoke test starts the built app with a good secret and no name and expects 503. |
| M3 | A one-character `SESSION_SECRET` worked. | Fixed: at least 32 bytes and not one repeated character, in one helper used at both call sites. |
| M4 | Nothing noticed if session expiry, lifetime or cookie flags broke. | Fixed: tests with the clock the handlers really use (end of session to the second), and the exact `Set-Cookie` string. |
| M5 | The malformed-token test passed for the wrong reason; claim checks were held only by the compiler. | Fixed: tokens signed with the real key and odd claims; empty signature on a valid payload. |
| M6 | Scope and sign-in selection tests did not pin exact matching. | Fixed: near-miss ids (case, spacing, prefix, look-alikes, escapes) at unit and integration level; a non-synthetic user cannot sign in. While writing this the author found a further case: a user whose company is an empty string would match an empty id. Fixed. |
| M7 | Anyone could write unlimited rows into the audit log, which cannot be pruned, by sending bad sign-ins. | Fixed for unauthenticated requests: a refused sign-in is written to the log stream, not the audit table. Not fixed for authenticated users (denied reads, sign-out): they are attributable to one person, and flooding is a known limit (STATUS.md, limit 8). |
| L1 | One session token had four valid spellings. | Fixed: one canonical spelling. |
| L2 | A duplicated cookie name let the first value win. | Fixed: a duplicate counts as no cookie. The `__Host-` name prefix is not adopted yet. |
| L3 | A lower-case method such as `patch` was not treated as changing. | Fixed. A POST with neither Origin nor Sec-Fetch-Site is still allowed; a test pins that as a documented limit. |
| L4 | Any content type was accepted, and one crafted type crashed sign-in with a 500. | Fixed: two content types accepted, 415 for others, 400 for an unreadable body. |
| L5 | No security response headers. | Fixed in part: frame-ancestors, base-uri, form-action, nosniff, referrer policy, frame options on every response. No script restrictions yet. |
| L6 | Sign-out only clears the cookie and is not audited. | Audit added. The token still works until it expires (limit 3). |
| L7 | `pnpm test` ran without the guard; test files outside a layer directory were not reported; a todo or cancelled test passed. | Fixed: `pnpm test` runs with the guard; a stray test file fails the catalogue check; todo and cancelled count as failures. A pull request can still edit the baseline by hand; there is no code-owner rule (limit 9). |
| L8 | CI ran only on pull requests; the report file was overwritten. | Fixed: it also runs on pushes to `main`, in one runner call. Actions are pinned to tags, not commit hashes (not changed). Branch protection and required checks were not visible to the reviewer and were not checked. |
| L9 | No migration or schema check in CI; migrations ordered by file name; the health check passed on a database with no triggers. | Fixed: `drizzle-kit check` is a static suite, migrations follow the journal and the run fails when a file and the journal disagree, health reports `auditGuard`. |
| L10, L11 | An unused dependency; docs that overstated. | `zod` removed; STATUS.md corrected. |

## Does the suite catch what it claims to?

Each change was made to the working tree, the named layers were run, and the change was reverted. 28 changes: the first run caught 26 and let 2 survive (a test that signed with the good secret and read with the weak one, which fails for the wrong reason; and no static check of the Worker entry). Both tests were fixed and the two changes now fail.

| Change | Layers that failed |
| --- | --- |
| Secret length check removed; one-repeated-character check removed; the secret helper bypassed at either call site | unit and integration |
| Session clock in the wrong unit at either call site; lifetime changed to a year | integration (and unit for the lifetime) |
| Cookie without `Secure`; `SameSite=None` | integration |
| Empty signature accepted; claim type checks removed; non-canonical signature accepted; duplicate cookie lets the first win | unit |
| Scope compares case-insensitively, by prefix, after trimming, or allows an empty company id | unit |
| Sign-in without the synthetic check; audit detail cap removed; refused sign-in audited again; body not drained after a cross-site refusal; content-type check removed; health ignores the triggers; the 0002 trigger renamed away | integration |
| Method check misses lower case | unit |
| A header read added to `app/page.tsx` or to `worker/index.ts` | static |
| Security headers dropped from the Worker entry | static |

Also run by hand and not as a suite: `pnpm db:local`, then `pnpm dev`, then a synthetic sign-in over HTTP with the development server, to confirm the build change did not remove the environment name from development.

## Browser layer (slice 1b)

Run on 4 October 2026 by the agent that wrote the code. Environment: a Linux container, Node v22.22.0, pnpm 11.25.0, `playwright-core` 1.56.1 (pinned exactly; published 17 October 2025, so past the 7-day policy), headless Chromium 141.0.7390.37 from `/opt/pw-browsers/chromium`, Playwright's default 1280x720 viewport. Built on `slice-1-walking-skeleton` at d5e1fde. From a clean state: `pnpm install --frozen-lockfile`, `pnpm build`, `node scripts/test.mjs pr --guard` (12 of 12 suites passed, guard clean), and `node scripts/check-documentation.mjs` (11 Markdown files, 13 decisions, 13 open questions, 4 sources). No browser was downloaded.

| Suite | Result | What it drives |
| --- | --- | --- |
| platform/browser/pages | 3 passed | The home and sign-in pages render with the SYNTHETIC banner on screen (visible, sized, inside the first screen, above the content); the sign-in page lists only synthetic users; the refusal alert shows |
| platform/browser/session-and-scope | 8 passed | Sign-in through the form; the cookie is HttpOnly, SameSite=Lax, Secure, path `/`, about 8 hours, and a script can neither read nor overwrite it; the person's own company with its SYNTHETIC name; another company's record is a 404 that is identical to a record that does not exist; a second owner sees only their own company; no session gives 401; sign-out clears the cookie and the next read is refused, also after Back |
| platform/browser/cross-origin | 5 passed | A form post with a foreign, `null` or look-alike Origin is refused and sets no cookie; the same post from the application's own origin is accepted; a foreign Origin cannot sign a person out; a real cross-site form post from another website (served inside the browser, nothing leaves the machine) is refused |
| platform/browser/harness | 8 passed | The browser layer's own plumbing: browser resolution order, a clear failure when no browser exists (child run: exit non-zero, 0 passed, 0 skipped), the browser and Worker are closed on a throw and on a hang, requests to other origins are blocked and recorded, the process group is cleaned up on SIGTERM |

24 browser tests. On the first run (before the merge with the review fixes) these were added to the 39 existing tests and 2 command suites: 63 tests, all passing. After merging the review fixes the full run was 100 tests (24 browser, 76 others) and 3 command suites, all passing; the baseline was updated through the runner.

Stability, on the final code: 9 consecutive full runs of the browser layer passed (the `pr` run and 8 more). The cross-origin suite alone passed 20 consecutive runs. In 13 of those 20 runs the local dev proxy lost a health check after a refused request (15 lost of 140 requests); see finding 1. Before the helper that absorbs this existed, the cross-origin suite failed in each of its first 8 runs.

### Can the browser suites fail?

Each change below was made to the working tree, the browser layer was run, and the change was reverted. The other layers were not run for these changes.

| Change | Outcome |
| --- | --- |
| `HttpOnly` removed from the session cookie | 3 browser tests fail (cookie attributes, script cannot read the cookie, the accepted post's Set-Cookie) |
| The company route skips the scope check and loads the id in the URL | 2 fail (another company's record, the second owner) |
| The cross-site check always answers "same site" | 4 of the 5 cross-origin tests fail; the same-origin control passes |
| Sign-out sends a live cookie instead of clearing it | 1 fails (sign-out) |
| The SYNTHETIC banner is not rendered | 3 of 3 pages tests fail |
| The SYNTHETIC banner is rendered with `display: none` | 3 of 3 pages tests fail; the smoke suite, which reads HTML as text, still passed 6 of 6 |
| The cookie is `SameSite=None` | 1 fails (cookie attributes) |
| The harness leaves the Worker running on `stop()` | 2 harness tests fail |
| The harness's signal handlers are removed | 1 harness test fails |

### What a headless Chromium test does not prove

- One engine (Chromium 141) at one desktop viewport on Linux. Firefox, Safari, mobile browsers and other versions are untested, and so are screen readers and keyboard-only use. The banner is checked as visible and on the first screen, not for contrast or legibility.
- The application is served over HTTP on loopback. Chromium treats loopback as a trustworthy origin and so accepts the `Secure` cookie. That is not the same as HTTPS on a real host name, and no test used one.
- The Worker and database are local (`wrangler dev`, Miniflare). No hosted Cloudflare environment was driven. Response headers, caching and the dev proxy's behaviour can differ there.
- Playwright's own Node-side cookie jar does not send a `Secure` cookie to `http://127.0.0.1`. The suites therefore read the application through the browser's `fetch`, and attach a cookie by hand where a Node-side request needs one. A test that appears to be signed in through `context.request` is not.
- A cross-site post from another website is simulated: the other website is served inside the browser by a test route, and every non-application origin is blocked. It shows what the server does with the Origin header a real browser sends. It does not show what other browsers do.
- The same agent wrote the application, the tests and these mutations. No person and no other agent has reviewed them. Identity and data scope remain protected paths.
- GitHub Actions ran both workflows on pull request #2 at commit 0a5633c on 4 October 2026 (started 17:37 UTC) and they passed; the engineering workflow took 1 minute 27 seconds. That is the first run of the browser layer on a GitHub-hosted runner, with Google Chrome through the `chrome` channel. It is one run on one runner image; how often it passes over many runs is not known.
- `playwright-core` 1.63.0 was listed by npm on 4 October 2026 and was not tried.
- One harness test uses `pgrep`. `SIGKILL` on the test process cannot be intercepted, so a Worker can outlive a test process killed that way.

### Browser-layer findings

These were recorded, not fixed, when found (the brief was to test, not to change the application). Findings 1 and 2 were fixed afterwards by the slice 1 review fixes. They are recorded here rather than in a separate file under `tests/browser/`, and STATUS.md points to them.

#### Browser-layer finding 1: a refusal that leaves the request body unread upsets the local dev proxy

Status: fixed in the slice 1 review fixes, which this branch now contains (the handler reads the body before it refuses). After the merge, 6 runs of the cross-origin suite (7 refused requests each, 42 in all) lost 0 health checks; before, 15 of 140 requests were lost. The workaround in `refusableRequest` stays as a safeguard and keeps counting. The text below describes the state before the fix.

`handleSessionWrite` answers 403 to a cross-site request before it reads the body (the Origin check runs first). In `wrangler dev` (Wrangler 4.92.0, workerd 1.20260515.1) the Worker then logs `TypeError: Can't read from request stream after response has been sent` and `kj/async-io.c++:60: disconnected: stream disconnected prematurely`, and the next request through the dev proxy is either given no answer or answered with the proxy's own 503 ("Your worker restarted mid-request"). The application never sees that request. Measured with the application unchanged: 17 of 160 requests after a refusal were lost. In a scratch copy outside the repository whose handler drained the body before answering, 0 of 160 were lost. A health check sent after a refusal absorbs the loss; the browser suites do that through `refusableRequest` in `tests/support/browser.ts`, and the cross-origin suite prints how often it happened.

Severity is unknown. It was seen only through the local dev proxy; it may be a fault of that proxy rather than of the application, and hosted Workers were not tested. If it is real there, a client that is refused would lose its next request. The smoke suite avoids it only by the order of its requests.

To see it: run `pnpm build`, make `refusableRequest` in `tests/support/browser.ts` return without calling `settle`, and run `node scripts/test.mjs browser`. Set `APLYD_BROWSER_DEBUG=1` and `WRANGLER_LOG=debug` to print what the Worker said. A possible direction, not applied: read or cancel the request body before answering the refusal.

#### Browser-layer finding 2: no framing or content-type hardening headers

Status: fixed in the slice 1 review fixes (headers on every response, asserted by the smoke layer; this layer does not assert them). Script restrictions are still absent. The text below describes the state before the fix.

The responses of the home page, the sign-in page and the JSON API carry only `cache-control`, `content-encoding`, `content-type`, `transfer-encoding` and `vary`. There is no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` or `Referrer-Policy`. Whether the pages can be framed by another website was not demonstrated: Chromium's Private Network Access check stopped the test's fake public origin from loading a frame from loopback. This is read from headers, not shown as an attack. No suite asserts it.

#### Browser-layer finding 3: a signed-out token still works (already known)

The old session token still returns 200 on the company API after sign-out, because sign-out only clears the cookie and the token is not revoked server-side. A token with a changed signature returns 401. This is the known limit 3 in [STATUS.md](STATUS.md). It was seen with a throwaway probe on 4 October 2026; no suite asserts it, so that the limit is not frozen in as expected behaviour.

## Limits

- GitHub Actions ran both workflows on pull request #1 at commit a6c806f and again at d5e1fde on 4 October 2026 and they passed. It also ran at d5b3c12, the review-fix commit, on 4 October 2026 (17:33 UTC) and passed.
- One reviewer agent, one pass. It found one high and seven medium defects in code its author believed sound, so the next pass will likely find more. No person has read this code. Identity, data scope, migrations and the audit log are protected paths.
- Same author fixed what the reviewer found and wrote the new tests. The mutation table is the author's own.
- On 4 October 2026 a headless Chromium (141.0.7390.37, through `playwright-core` 1.56.1) rendered the pages, held the session cookie and sent cross-site posts to the built application in a local Worker; see "Browser layer (slice 1b)" above. That is one engine, one desktop viewport and HTTP on loopback. No other browser, no mobile browser, no HTTPS on a real host name and no hosted environment has been tested. The smoke layer still reads rendered HTML as text.
- Miniflare runs the same SQLite engine as D1 but is not Cloudflare's hosted D1. No hosted environment has been tested, so the behaviour of triggers, pragmas and `vars` on hosted Cloudflare is untested.
- No load or concurrency testing. Timing differences between a denied and a missing company read were not measured.
- These results do not promote any acceptance case. There is no acceptance register yet.
