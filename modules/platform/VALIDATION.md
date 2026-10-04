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

## Limits

- GitHub Actions ran both workflows on pull request #1 at commit a6c806f on 4 October 2026: `documentation-checks` and `engineering-checks` both passed (frozen install with the pinned pnpm, catalogue, type check, documentation and static suites, build, unit, integration and smoke with the guard). That is one run on one commit. It confirms the workflows start from a clean checkout; it adds no test coverage and does not replace review.
- The same agent wrote the code and the tests. No person and no other agent has reviewed either. Identity and data scope are protected paths.
- No browser has rendered a page. The smoke layer reads rendered HTML as text. Cookie behaviour (`Secure`, `SameSite`) in real browsers is untested.
- Miniflare runs the same SQLite engine as D1 but is not Cloudflare's hosted D1. No hosted environment has been tested.
- No load or concurrency testing.
- These results do not promote any acceptance case. There is no acceptance register yet.
