# Platform module: validation

Run on 4 October 2026 by the agent that wrote the code. Environment: a Linux container, Node v22.22.0, pnpm 11.25.0. Verified at commit 1260d45 in a fresh clone of the branch: `pnpm install --frozen-lockfile`, `pnpm build`, then `node scripts/test.mjs` for every layer with `--guard`.

## Results

| Suite | Result |
| --- | --- |
| static/typecheck | pass (`tsc --noEmit`) |
| static/documentation | pass (11 Markdown files, 13 decisions, 13 open questions, 4 sources) |
| platform/static/source-rules | 3 passed |
| platform/unit/session | 6 passed |
| platform/unit/cross-site | 5 passed |
| platform/unit/scope | 5 passed |
| platform/integration/platform-api | 14 passed, against a real D1 database through Miniflare |
| platform/smoke/built-app | 6 passed, the built application in a local Worker |

39 tests and 2 command suites. The guard was clean against `tests/baseline.json`.

## Does the suite catch what it claims to?

Each change below was made to the working tree, the suites were run, and the change was reverted.

| Change | Outcome |
| --- | --- |
| The scope rule allows any signed-in person | 5 tests fail (2 integration, 3 unit) |
| The company handler skips the scope check | 2 integration tests fail |
| Sign-in treats every environment as synthetic | 1 integration test fails |
| The audit-log triggers are removed | 1 integration test fails |
| The code reads an `x-user-id` header by literal name, by a computed name, in bulk, or through `next/headers` | The static source-rules test fails in each form |

The first attempt at the header change used a form the test did not catch. The test was widened and the change re-run in four forms. A header-reading tripwire cannot be complete (STATUS.md, limit 4).

Guard and catalogue behaviour, checked by hand: deleting a test file makes the catalogue check exit 2; deleting one test from a suite makes the guard report "4 passed, baseline is 5" and the runner exit 1; a test file outside a layer directory exits 2. The documentation check was run against a file with a broken link, a broken anchor and three undefined identifiers and reported all five.

Also checked by hand, not as a suite: `pnpm db:local` then `pnpm dev`, sign-in and a read of the signed-in person's own company.

## Browser layer (slice 1b)

Run on 4 October 2026 by the agent that wrote the code. Environment: a Linux container, Node v22.22.0, pnpm 11.25.0, `playwright-core` 1.56.1 (pinned exactly; published 17 October 2025, so past the 7-day policy), headless Chromium 141.0.7390.37 from `/opt/pw-browsers/chromium`, Playwright's default 1280x720 viewport. Built on `slice-1-walking-skeleton` at d5e1fde. From a clean state: `pnpm install --frozen-lockfile`, `pnpm build`, `node scripts/test.mjs pr --guard` (12 of 12 suites passed, guard clean), and `node scripts/check-documentation.mjs` (11 Markdown files, 13 decisions, 13 open questions, 4 sources). No browser was downloaded.

| Suite | Result | What it drives |
| --- | --- | --- |
| platform/browser/pages | 3 passed | The home and sign-in pages render with the SYNTHETIC banner on screen (visible, sized, inside the first screen, above the content); the sign-in page lists only synthetic users; the refusal alert shows |
| platform/browser/session-and-scope | 8 passed | Sign-in through the form; the cookie is HttpOnly, SameSite=Lax, Secure, path `/`, about 8 hours, and a script can neither read nor overwrite it; the person's own company with its SYNTHETIC name; another company's record is a 404 that is identical to a record that does not exist; a second owner sees only their own company; no session gives 401; sign-out clears the cookie and the next read is refused, also after Back |
| platform/browser/cross-origin | 5 passed | A form post with a foreign, `null` or look-alike Origin is refused and sets no cookie; the same post from the application's own origin is accepted; a foreign Origin cannot sign a person out; a real cross-site form post from another website (served inside the browser, nothing leaves the machine) is refused |
| platform/browser/harness | 8 passed | The browser layer's own plumbing: browser resolution order, a clear failure when no browser exists (child run: exit non-zero, 0 passed, 0 skipped), the browser and Worker are closed on a throw and on a hang, requests to other origins are blocked and recorded, the process group is cleaned up on SIGTERM |

24 browser tests. With the 39 existing tests and 2 command suites, `pr --guard` ran 63 tests and 2 command suites, all passing. The baseline was updated through `node scripts/test.mjs browser --update-baseline --reason "..."`.

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
- GitHub Actions has not run the browser layer. The workflow step uses the `chrome` channel and runs `google-chrome --version` first; that the runner image has Chrome is assumed, not verified here.
- `playwright-core` 1.63.0 was listed by npm on 4 October 2026 and was not tried.
- One harness test uses `pgrep`. `SIGKILL` on the test process cannot be intercepted, so a Worker can outlive a test process killed that way.

### Browser-layer findings

These are recorded, not fixed (the brief was to test, not to change the application). They are recorded here rather than in a separate file under `tests/browser/`, and STATUS.md points to them.

#### Browser-layer finding 1: a refusal that leaves the request body unread upsets the local dev proxy

`handleSessionWrite` answers 403 to a cross-site request before it reads the body (the Origin check runs first). In `wrangler dev` (Wrangler 4.92.0, workerd 1.20260515.1) the Worker then logs `TypeError: Can't read from request stream after response has been sent` and `kj/async-io.c++:60: disconnected: stream disconnected prematurely`, and the next request through the dev proxy is either given no answer or answered with the proxy's own 503 ("Your worker restarted mid-request"). The application never sees that request. Measured with the application unchanged: 17 of 160 requests after a refusal were lost. In a scratch copy outside the repository whose handler drained the body before answering, 0 of 160 were lost. A health check sent after a refusal absorbs the loss; the browser suites do that through `refusableRequest` in `tests/support/browser.ts`, and the cross-origin suite prints how often it happened.

Severity is unknown. It was seen only through the local dev proxy; it may be a fault of that proxy rather than of the application, and hosted Workers were not tested. If it is real there, a client that is refused would lose its next request. The smoke suite avoids it only by the order of its requests.

To see it: run `pnpm build`, make `refusableRequest` in `tests/support/browser.ts` return without calling `settle`, and run `node scripts/test.mjs browser`. Set `APLYD_BROWSER_DEBUG=1` and `WRANGLER_LOG=debug` to print what the Worker said. A possible direction, not applied: read or cancel the request body before answering the refusal.

#### Browser-layer finding 2: no framing or content-type hardening headers

The responses of the home page, the sign-in page and the JSON API carry only `cache-control`, `content-encoding`, `content-type`, `transfer-encoding` and `vary`. There is no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` or `Referrer-Policy`. Whether the pages can be framed by another website was not demonstrated: Chromium's Private Network Access check stopped the test's fake public origin from loading a frame from loopback. This is read from headers, not shown as an attack. No suite asserts it.

#### Browser-layer finding 3: a signed-out token still works (already known)

The old session token still returns 200 on the company API after sign-out, because sign-out only clears the cookie and the token is not revoked server-side. A token with a changed signature returns 401. This is the known limit 3 in [STATUS.md](STATUS.md). It was seen with a throwaway probe on 4 October 2026; no suite asserts it, so that the limit is not frozen in as expected behaviour.

## Limits

- GitHub Actions ran both workflows on pull request #1 at commit a6c806f on 4 October 2026: `documentation-checks` and `engineering-checks` both passed (frozen install with the pinned pnpm, catalogue, type check, documentation and static suites, build, unit, integration and smoke with the guard). That is one run on one commit. It confirms the workflows start from a clean checkout; it adds no test coverage and does not replace review.
- The same agent wrote the code and the tests. No person and no other agent has reviewed either. Identity and data scope are protected paths.
- On 4 October 2026 a headless Chromium (141.0.7390.37, through `playwright-core` 1.56.1) rendered the pages, held the session cookie and sent cross-site posts to the built application in a local Worker; see "Browser layer (slice 1b)" above. That is one engine, one desktop viewport and HTTP on loopback. No other browser, no mobile browser, no HTTPS on a real host name and no hosted environment has been tested. The smoke layer still reads rendered HTML as text.
- Miniflare runs the same SQLite engine as D1 but is not Cloudflare's hosted D1. No hosted environment has been tested.
- No load or concurrency testing.
- These results do not promote any acceptance case. There is no acceptance register yet.
