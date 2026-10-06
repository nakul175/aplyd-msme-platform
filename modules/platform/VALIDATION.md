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

## Review-fixes branch (migration 0014, bounded body reader, input limits)

Environment: a Linux container, Node v22.22.0, pnpm 11.25.0, 5 October 2026. The branch `review-fixes-s2-s4` (draft pull request #8) is stacked on slice 6. It carries what the independent reviews of slices 2 to 5 found the application kept and the database did not (migration 0014), a bounded reader for request bodies (`readTextWithin`), input limits in the factory module, and the tests written for those findings. The same agent that wrote the code wrote the tests and the mutation list; a second agent, which had not written either, then reviewed the branch.

**Results.** On the branch tip before the review of the branch (`d144e22`): `node scripts/test.mjs static unit --guard` 30 of 30 suites, and `node scripts/test.mjs integration --guard` 7 of 7 suites (factory 34, diagnose 34, procure 34, deliver 32, run 29, platform 26 and 2). After the fixes below, the full run (`pnpm build`, then `node scripts/test.mjs pr --guard`) was made on the tip of the next branch in the stack, which holds this branch and one more test file; its result is in `modules/journey/VALIDATION.md`: **54 of 54 suites passed** after the one fix described under "What the first runs found", with the baselines recorded through the runner (`--update-baseline`) and no count lower than before. A pass there is a pass of this branch's code: the journey module adds no application code.

**Independent review of the branch (0 high, 3 medium, 3 low).** The reviewer proved findings by probes through Miniflare D1 on the real migrations and spot-checked five of the mutations (all caught). Its full report is not stored in the repository; this is the record.

| Finding | What was wrong | Disposition |
| --- | --- | --- |
| **M1** The 500-character note limit is bypassed by a NUL character | SQLite's `length()` stops at a NUL: a note of `a`, a NUL and 100,000 more characters counted as one and was accepted in `factory_revisions` and `listing_terms` (probed). STATUS said the table holds the limit. | **Fixed.** Each of the six note triggers also refuses a note over 2,000 bytes (`length(CAST(note AS BLOB))`). A test in each of factory, diagnose, procure (three tables) and deliver stores `a`, a NUL and 5,000 characters and expects refusal. **Not fixed:** the older CHECKs on a milestone's title and test (migration 0010) and on a run note (0012) count with `length()` too and have the same gap; STATUS (deliver, run) says so. The diagnose handler counts characters and does not refuse control characters, unlike the factory handler; a short note with a NUL in it is stored as text. |
| **M2** `answers` stored as a BLOB passes "answers are a JSON object" | The bytes of `{}` bound as a BLOB satisfy `json_valid()`; the column kept the BLOB, which `JSON.parse` in the factory reader cannot read: the failure the trigger was written to prevent, and unrepairable because rows are append-only. | **Fixed.** The three revision triggers require `typeof(answers) = 'text'`; a test inserts the BLOB and expects the refusal. |
| **M3** `readTextWithin` bounds the sum of the pieces, not one piece | A piece is in memory when it is checked; "never held beyond the bound" was stronger than the code. | **Reworded**, not changed: the comment in `body.ts` and STATUS say the bound is checked between pieces and is not a hard cap on memory; the platform limits the size of a request itself. The unit tests use 1 KiB pieces and do not show the difference. |
| **L1** `?problem=__proto__` crashes the person's own page | `PROBLEMS[q.problem]` on a plain object answers `Object.prototype` for `__proto__` (and a function for `constructor`), which React cannot draw: a 500 on the factory page. The same line was in the diagnose, procure, deliver, run and operator pages. | **Fixed on all six pages** with `Object.hasOwn`. A static rule (`platform/static/page-lookups`) names the pattern; a built-application test requests every page with `problem=__proto__`, `constructor`, `toString` and `saved=...` and expects 200 and no `[object Object]`. |
| **L2** "No insert is refused by two triggers" is not true everywhere | The header of 0014 said so for every trigger; only the three revision triggers are exclusive. A second engagement for an engaged requirement with an unlisted provider matches two rules (not run). | **Reworded** in the migration header and in deliver STATUS limit 17. Not made exclusive. |
| **L3** Blank text means ASCII blanks only | A title of non-breaking spaces is stored by direct SQL. | Already stated as a gap in deliver STATUS limit 17; unchanged. |

**What the first runs found, besides the review.** The merge of slice 6 into this branch turned `platform/static/source-rules` red: the new body reader reads the `content-length` header, which the "identity never comes from a header" rule did not allow. A length is not an identity, so the header was added to the allow-list (with its own accepted case in the rule's test and a line in STATUS); the rule still reports any other header. The first full run on the next branch in the stack (the only run of the browser layer on this code) failed one factory browser test, "a draft with nothing filled in is refused and nothing is saved": it waited for a 400 from the form post, and the branch now sends a form back to the page with a message (a 303). The change was meant and the test was out of date; it now follows the redirect and checks the message and that nothing was written. A branch that changes what a page answers needs the browser layer run before it is called finished: the integration layer had passed.

**Mutation checks.** Sixty breaks of migration 0014 and its tests, listed in `modules/platform/mutations/review-fixes-0014.json`, run with `scripts/mutation/mutate.py` on two throwaway copies of the branch tip at once (a baseline of the four integration suites was green on both first). They are: each of the 19 triggers neutered (a trigger that cannot fire), and 41 boundary and weakening variants (limits one over and one under, a rule that counts every company, the wrong table's rows, text or NULL allowed, a blank-trim that leaves out one character, a limit that overlaps another rule). **57 of the 60 were caught and 3 survived.** One of the 57 is a hang, not a failure: the variant "a sign-off with no decision is refused too" left the diagnose suite running with no output, and I killed it after about 8 minutes, so it is counted as detected (a suite that never finishes fails a build) but no assertion named it, and I did not find out why it hangs. The three survivors were: (1) "amount: text allowed" (the range check also refuses text, so the table refused it either way, but not with the rule's own message: the test now pins the message), (2) "deliveries: limit applies after the close" (a real gap: the delivery limit could answer after an engagement was closed, overlapping the rule about closing; a test now closes the engagement at the limit and expects the closing rule only) and (3) "engagement: provider rule overlaps another company's requirement" (a real gap: the provider rule also answered for a requirement that was not the company's; a test now expects it not to). Rerun on a copy with the three test lines, all three are caught. The first sixty ran against `d144e22`, before the fixes for M1 and M2; the second set checks those fixes.

**Second set, for the fixes the review prompted** (`modules/platform/mutations/review-fixes-0014b.json`, 9 breaks, run on a copy with the fixes after its tests had passed alone): the byte bound removed from each of the six note triggers (one per table), the answers rule that does not look at the stored type, and an unguarded message lookup put back on the run page and on the deliver page. **All 9 caught**, the last two by the static rule `platform/static/page-lookups`. The built-application test of the six pages was not mutation-checked (a mutation there needs a build for each break).

**What these results do not show.**
- The mutation list is the author's, and the author wrote the tests it checks. The reviewer found two holes (NUL, BLOB) that no mutant covered: a mutation table shows only the breaks someone thought of.
- A "caught" is a failed suite, not a named failing assertion; two runs shared a two-core machine with a reviewer agent and builds, so a suite that failed for time and not for the break would be counted. No suite here has a timer that could do that, and one mutant that hung the suite (not failed it) is listed above, not counted as a clean catch.
- Miniflare runs the same SQLite as D1 but is not hosted D1: how `length()` of text with a NUL, or `json_valid` of a BLOB, behaves there was not tested.
- The triggers refuse a second writer's rows; nothing here shows that a second writer does not exist (a migration, a script run by a person with database access).
- No person has read this branch.

## Limits

- GitHub Actions ran both workflows on pull request #1 at commit a6c806f and again at d5e1fde on 4 October 2026 and they passed. It also ran at d5b3c12, the review-fix commit, on 4 October 2026 (17:33 UTC) and passed.
- One reviewer agent, one pass. It found one high and seven medium defects in code its author believed sound, so the next pass will likely find more. No person has read this code. Identity, data scope, migrations and the audit log are protected paths.
- Same author fixed what the reviewer found and wrote the new tests. The mutation table is the author's own.
- On 4 October 2026 a headless Chromium (141.0.7390.37, through `playwright-core` 1.56.1) rendered the pages, held the session cookie and sent cross-site posts to the built application in a local Worker; see "Browser layer (slice 1b)" above. That is one engine, one desktop viewport and HTTP on loopback. No other browser, no mobile browser, no HTTPS on a real host name and no hosted environment has been tested. The smoke layer still reads rendered HTML as text.
- Miniflare runs the same SQLite engine as D1 but is not Cloudflare's hosted D1. No hosted environment has been tested, so the behaviour of triggers, pragmas and `vars` on hosted Cloudflare is untested.
- No load or concurrency testing. Timing differences between a denied and a missing company read were not measured.
- These results do not promote any acceptance case. There is no acceptance register yet.

## Session end on a form post (6 October 2026, branch `slice-11d-polish`, BR-UX-06)

An agent wrote the change and its tests; no person has read it. It touches the identity response, a protected path. Run on 6 October 2026 after `pnpm build` of the tree that commit cbfd34f holds (the last change to a page; later commits change tests and documents only).

| Check | Result |
| --- | --- |
| `platform/unit/refusal` (new): the helper for a no-session answer, form and program callers, the content types, the methods | 5 passed |
| `platform/static/source-rules` | 9 passed (one new: the 401 body is written only in `http.ts`; every caller of `resolveIdentity(` uses `notSignedIn(request)`) |
| `platform/integration/platform-api` | 29 passed (3 new: every `authorize*` check, the company read and the session read, for a form and for a program) |
| `factory/integration/factory-api` | 35 passed (1 new: no cookie, an empty cookie, an altered cookie, a multipart form; a valid session still saves) |
| `run/integration/run-api` | 29 passed; one assertion changed on purpose (see below) |
| `platform/smoke/session-expiry` (new), on the built application over HTTP | 3 passed: no cookie, empty, altered and run-out cookies and a multipart form all get 303 to `/sign-in?expired=1`; a program call gets 401 JSON; the sign-in page shows the message only for `expired=1` |
| `platform/browser/session-expired` (new), real Chromium | 3 passed: the Describe form is filled in, the cookie is cleared (and, in the second test, replaced by a validly signed token eight hours old), Save is pressed, the person lands on the sign-in page with the message and the typed text is not saved; a script's JSON post still gets 401 JSON |
| `platform/browser/session-and-scope`, `platform/browser/pages` | see the factory and procure sections of the same date for the run that covered them; both unchanged |

**One existing test was changed, and why.** `run/integration/run-api`, the test "a form post refused before the person is known is answered as the platform answers every module...", asserted that a form post with no session gets 401 JSON. That was the behaviour BR-UX-06 names as the fault, and the test's own register row (TC-UX-07) says it records today's behaviour and must change when this is fixed. It now asserts 303 to `/sign-in?expired=1` and adds an assertion that a JSON post still gets 401. Its title was kept because the test-case register cites it by title; the register row needs rewriting by its owner.

**Mutation check.** With `notSignedIn` changed to always answer 401 JSON, four tests failed across the three files run (`unit/refusal`, `factory-api`, `platform-api`); restored afterwards. The smoke and browser tests were not mutated (that needs a rebuild).

**What this does not show.** One browser engine; a local Worker; no hosted environment. The browser test ends the session by clearing the cookie and by planting an old signed token; it does not wait eight hours, and it does not test a session ended by changing `SESSION_SECRET`. Nothing here shows what the Sites dispatcher does in front of the Worker when its own session ends. No acceptance case is promoted: BR-UX-06 stays Partial (the other refusals in the list above are still JSON for a form).
