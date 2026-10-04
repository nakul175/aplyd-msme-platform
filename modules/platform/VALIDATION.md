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

## Limits

- GitHub Actions ran both workflows on pull request #1 at commit a6c806f and again at d5e1fde on 4 October 2026 and they passed. It has not yet run the review-fix commit; its result is added to this file when it has.
- One reviewer agent, one pass. It found one high and seven medium defects in code its author believed sound, so the next pass will likely find more. No person has read this code. Identity, data scope, migrations and the audit log are protected paths.
- Same author fixed what the reviewer found and wrote the new tests. The mutation table is the author's own.
- No browser has rendered a page in this branch. Cookie behaviour in real browsers is untested here (the browser layer is a separate slice).
- Miniflare runs the same SQLite engine as D1 but is not Cloudflare's hosted D1. No hosted environment has been tested, so the behaviour of triggers, pragmas and `vars` on hosted Cloudflare is untested.
- No load or concurrency testing. Timing differences between a denied and a missing company read were not measured.
- These results do not promote any acceptance case. There is no acceptance register yet.
