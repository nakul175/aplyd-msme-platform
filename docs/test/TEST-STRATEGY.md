# Test strategy

Version 0.1. Date 5 October 2026. Status: draft, not reviewed by a person.

This document says how the APLYD MSME platform is tested: which kinds of test exist and which do not, where each runs, what a pass does and does not mean, which risks are tested first, and what the tests leave unproven. It is written from the test files, the runner and the CI workflows in the repository on 5 October 2026, and from the [business requirements document](../brd/BRD.md). Statements about what exists today are marked AS BUILT and were checked in the files named. Statements about what should exist are marked TO BE and are proposals for the sponsor. Everything the application holds is SYNTHETIC. No person has reviewed the code or the tests, and no business requirement has been accepted.

How this relates to the other documents: the [business requirements](../brd/BRD.md) say what must be true; the [functional specification](../fsd/FSD.md), [high-level design](../design/HLD.md) and [low-level design](../design/LLD.md) say how; the [test scenarios](TEST-SCENARIOS.md) chain steps into journeys, the [test cases](TEST-CASES.md) are the one copy of the cases, the [regression pack](REGRESSION-PACK.md) says which run on which change, the [traceability matrix](TRACEABILITY.md) joins requirements to cases, the [UAT plan](UAT-PLAN.md) covers what only people can decide, and the [test data](TEST-DATA.md) says what data each uses. The working rules are in [AGENTS.md](../../AGENTS.md) and [Development](../DEVELOPMENT.md).

Claims that are not plain from a file carry a tag: [Certain] (read in a file or computed from one), [Likely] (a strong inference), [Guessing] (a proposal that needs testing). Counts were computed on 5 October 2026 by reading the test files and the baseline files; they will change, and the commands in section 8 recompute them.

## 1. Objectives

1. Show, on synthetic data, that each behaviour the BRD marks Built or Partial exists and does what its acceptance criterion says. A passing test is evidence of this, not acceptance (section 7).
2. Keep six invariants from breaking without notice: APLYD's earnings never vary with the vendor an owner chooses (D-03); no aggregate figure comes from fewer than five companies (C-04); one company's data is never visible to another company or to the operator; confirmed records, revisions, audit entries and applied migrations are never edited or deleted; no fee is shown to an owner; only synthetic data enters the system. Section 5 says where each is tested.
3. Let many agents change the code without a person reading it (HANDOVER.md, "Merged without review") and still notice when a test is lost, shrinks or is skipped. The regression guard in the runner exists for this.
4. Say plainly what is not tested, so that a green run is not read as more than it is (section 10).
5. Separate what a machine can show from what a person must witness, and give the second kind its own plan ([UAT plan](UAT-PLAN.md)).

Testing here is not a substitute for the ten-owner test ([worksheet](../ten-owner-test.md)), which asks whether owners want what was built. No test in the repository can answer that.

## 2. Test levels

### 2.1 Levels that are built (AS BUILT)

Each test is a file `modules/<module>/tests/<layer>/<name>.test.ts`, run by `node --test`. The runner, `scripts/test.mjs`, finds them by directory, so a test file outside a layer directory is an error (`--check-catalogue`). Counts below are the sums of the nine code modules' baseline files (`modules/<module>/tests/baseline.json`), which the last recorded full run reported as 524 tests in 61 suites ([demonstration VALIDATION.md](../../modules/demo/VALIDATION.md), 5 October 2026). They exclude the documentation module's tests (section 2.2). On 6 October 2026, at commit 696640e, the catalogue lists 118 suites, and the baselines of the eleven code modules (the nine above, `modules/portability` and `modules/quality`) sum to 804 tests: 70 static, 333 unit, 234 integration, 77 smoke and 90 browser. The documentation module's baselines add 254 (109 static, 145 unit). These are least counts that a run must reach, not the result of a run, and the new suites were not run for this update.

| Layer | What it checks | What it runs against | Per-suite limit in the runner | Tests |
| --- | --- | --- | --- | ---: |
| static | Source and documents without running the application: header-reading rule over the syntax tree, every query bound to a company, no query that changes an append-only table, message tables match the codes sent, deployment files, tracked files hold no secret or build output | The files in the repository | 10 minutes | 58 |
| unit | Pure functions with no database: session tokens, the scope check, the cross-site check, the body reader, the questionnaire, the ranking engine, the pool floor, the state tables, the gateway configuration | Functions called directly | 10 minutes | 139 |
| integration | The request handlers against a real SQLite database (workerd's, through Miniflare) with every migration and the synthetic seed applied, a fresh database for each test; also the hosting gateway against a stub HTTP server | Handlers and the database | 15 minutes | 205 |
| smoke | The built application (`dist/`) in a local Worker, walked over HTTP: pages, forms, redirects, headers, the health route; also the hosting launcher started as a process | The built application, one throwaway database per file | 15 minutes | 68 |
| browser | The built application in headless Chromium through playwright-core: pages render with the SYNTHETIC banner, sign-in through the form, the cookie read from the browser, scope, a cross-site post, whole journeys | The built application and a real browser, a fresh browser context per test, every request to another address blocked | 15 minutes | 54 |

Four more suites are commands, not test files, and are pass or fail only: `static/typecheck` (tsc), `static/documentation` (`scripts/check-documentation.mjs`: links, identifiers, source checksums, conflict markers), `static/traceability` (`scripts/check-traceability.mjs`: the BRD is well formed and its counts are current) and `static/migrations` (`drizzle-kit check`).

Inside the browser layer a single test is limited to 60 seconds, set-up to 180 seconds and teardown to 60 seconds (`modules/platform/tests/support/browser.ts`); the whole-journey test and the demonstration walk are allowed 170 seconds each (`modules/journey/tests/browser/journey.test.ts`, `modules/demo/tests/browser/walk.test.ts`). [Certain]

### 2.2 Checks on the documents themselves (AS BUILT, with one registration open)

The documentation module (`modules/docs/`) reads documents as data and tests the readers. Its static tests run the real checks on the real documents; its unit tests break fixtures on purpose to show each check can fail. Three groups exist: the BRD reader and its checks (`scripts/check-traceability.mjs`), the test-document checks (`scripts/check-test-docs.mjs`, which this set of documents is checked by: every case row is well formed, every requirement is cited, every automated case names a real test file and a title that file declares, every Must requirement that is Built or Partial has an automated case or is a stated gap, and the matrix in [TRACEABILITY.md](TRACEABILITY.md) is current), and the data-dictionary and API-reference checks written alongside the design documents. Their counts are not in the 524 above. The test-document checks have 21 unit tests and 14 static tests. [Certain] They are not traced to requirements: they test the documents, not the product.

### 2.3 The regression baseline guard (AS BUILT)

`node scripts/test.mjs pr --guard` (what `pnpm test` runs) fails when a suite is missing, has no baseline, or passes fewer tests than its baseline, and a skipped, todo or cancelled test counts as a failure even without `--guard`. `--update-baseline --reason "<why>"` is the way to lower or add a baseline. It is a ratchet against silent loss of tests, nothing more: it says how many tests passed, not what they check. Its own failure paths are not tested (case TC-NFR-21 is designed, not built), and a baseline can also be edited by hand in a pull request, with no code-owner rule to stop it ([platform VALIDATION.md](../../modules/platform/VALIDATION.md), finding L7 and its limits). [Certain]

### 2.4 Mutation checks (AS BUILT, run by hand)

A mutation check breaks the code in one small way and runs the tests; a test that still passes is either missing or the break does not matter. The tool is `scripts/mutation/mutate.py`, break lists are kept in `modules/platform/mutations/`, `modules/procure/mutations/`, `modules/deliver/mutations/` and `modules/run/mutations/`, and each module's VALIDATION.md records how many were caught, which survived and what was done. The diagnose and factory modules record their break tables in VALIDATION.md only. Nothing in CI runs them, because a run takes tens of minutes on the layers that start a Worker (`scripts/mutation/README.md`). The breaks were written by the agent that wrote the code and the tests, so they show only the mistakes that agent thought of: slice 1's reviewer found two holes (a NUL byte and a BLOB) that no break covered ([platform VALIDATION.md](../../modules/platform/VALIDATION.md)). The journey test has never had a break run against it ([journey VALIDATION.md](../../modules/journey/VALIDATION.md)). [Certain]

### 2.5 Levels that are not built (TO BE)

| Level | Why it matters here | What exists instead |
| --- | --- | --- |
| Accessibility audit | The owners are not technical (BR-UX-09, BR-UX-05); a keyboard-only and screen-reader check, and a check of contrast | Browser tests find fields by their labels. Nothing checks contrast, keyboard use or a screen reader. Case TC-UX-27 is designed |
| Performance and load | Response-time and availability targets are not set (BR-NFR-08, BR-NFR-09, OQ-16) | One start-up time and one idle memory reading on the development machine ([hosting VALIDATION.md](../../modules/hosting/VALIDATION.md)). No load test, no timing of a denied read against a missing one, no two Workers racing |
| Independent security testing | No person has read the identity, scope, migration or money code (BR-NFR-14, OQ-08) | Reviews by agents, one or two passes per slice, each of which found defects its author thought absent |
| Usability testing with owners | Whether owners can follow the pages is unknown; the BRD records, as risk RK-09, that owners cannot follow them, as the sponsor reported on 5 October 2026 | Nothing. The cases are people-only ([UAT plan](UAT-PLAN.md)) |
| The ten-owner test | Whether owners act on a plan, would pay, and agree with the ranking | A worksheet and a proposed bar ([ten-owner-test.md](../ten-owner-test.md)); not run |
| Backup and restore drill | Real data would need a restore that has been run and timed (BR-NFR-07) | The demonstration database is in memory and a restart resets it. Nothing to restore |
| Other browsers, phones, HTTPS on a real host, a hosted environment | Owners use phones; real hosting differs from loopback | Chromium 141 on a desktop at one viewport over HTTP on loopback, against Miniflare and not Cloudflare's hosted D1 |

## 3. Environments

| Environment | What it is | Used for | Data | Limits |
| --- | --- | --- | --- | --- |
| Local machine | Node 22.18 or later (22.22.0 in the recorded runs), pnpm 11.25.0, `pnpm db:local` for a database, `pnpm dev` for the application | Every layer; the smoke and browser layers need `pnpm build` first | SYNTHETIC seed from every `modules/*/db/seed-synthetic.sql` | The browser layer needs a Chromium: `APLYD_CHROMIUM_PATH`, then `/opt/pw-browsers/chromium`, then Google Chrome through Playwright's `chrome` channel. It never downloads one and never skips |
| Test databases | Miniflare in the test process, one fresh database per integration test; a temporary directory with its own database per smoke or browser file, removed at stop | Isolation between tests | SYNTHETIC seed | Same SQLite engine as D1, but not Cloudflare's hosted D1; triggers and pragmas on the hosted service are untested |
| CI | GitHub Actions on `ubuntu-latest` with Node 22 and the runner's Google Chrome. `engineering-checks` runs the catalogue check, install, build and `pr --guard`; `documentation-checks` runs `scripts/check-documentation.mjs` | Every pull request, and every push to `main` that changes more than Markdown or `docs/` | SYNTHETIC; no secrets, no hosted database, no deployment | One run on one runner image shows it passes there; how often it passes over many runs is not known ([platform VALIDATION.md](../../modules/platform/VALIDATION.md)) |
| Hosted synthetic demonstration | `scripts/serve.mjs` runs the built application in workerd behind a gate (one shared password), with an in-memory database rebuilt at every start; `Dockerfile` and `.do/app.yaml` describe a DigitalOcean App Platform deployment | Showing the demonstration (`APLYD_DEMO=true`) | SYNTHETIC; a restart is a reset | The launcher was tested on loopback. The Dockerfile and the app spec were never built, run or applied by the agent that wrote them, and whether the sponsor has since deployed one is not recorded in the repository ([hosting VALIDATION.md](../../modules/hosting/VALIDATION.md)). Not production |
| Production | None exists. Real data needs OQ-07, OQ-09 and OQ-13 settled first | Not applicable | Never | Not accepted for production or real patient or company data |

## 4. Tools

| Tool | Version | Used for |
| --- | --- | --- |
| `node:test` and `node:assert/strict` | Node 22.18 or later | Every test file. TypeScript runs by type stripping, so a test file has no enums or parameter properties and imports with the `.ts` suffix |
| Miniflare and workerd | miniflare 4.20260515.0 | A real SQLite database for integration tests; the Worker for smoke and browser tests (through wrangler 4.92.0) |
| playwright-core and Chromium | playwright-core 1.56.1, Chromium 141 | The browser layer. Pinned to match the browser in the development container; the seven-day package rule applies to it |
| drizzle-kit | 0.31.10 | `drizzle-kit check`: migrations, journal and snapshots agree with the schema |
| TypeScript | 5.9.3 | `tsc --noEmit` as a static suite |
| `scripts/test.mjs` | in the repository | Layers, the guard, the catalogue check, baselines, `reports/summary.json` |
| `scripts/mutation/mutate.py` | in the repository | Mutation checks, by hand |
| `scripts/check-documentation.mjs`, `scripts/check-traceability.mjs`, `scripts/check-test-docs.mjs` | in the repository | The three document checks |

The versions are from `package.json` on 5 October 2026. There is no coverage tool: the repository does not measure which lines the tests execute. [Certain]

## 5. Risk-based priorities

The order below is [Likely] a judgement of the harm if the item broke without notice and of how much of it rests on a single mechanism; the sponsor may change it. It is not the BRD's priority column, which is the sponsor's to set (OQ-16). The cases are in [TEST-CASES.md](TEST-CASES.md).

| Rank | Risk | Requirements | Where it is tested today | What is not tested |
| ---: | --- | --- | --- | --- |
| 1 | APLYD's earnings come to depend on the vendor an owner chooses (D-03) | BR-GOV-02, BR-PROC-05, BR-PROC-06, BR-COM-02 | TC-GOV-02 to TC-GOV-12, TC-PROC-40, TC-DEPL-46: a dearer provider is chosen and the fee tables do not change; one fee for every listing; providers ordered by name only; no query joins an owner's price to the fee | There is no revenue model beyond one flat placeholder fee (OQ-11), so a test of "no revenue path depends on the vendor" (TC-GOV-13, TC-COM-01) cannot be written until one exists |
| 2 | A figure from fewer than five companies reaches anyone (C-04) | BR-GOV-06, BR-PROC-02, BR-OPS-02 | TC-GOV-20 to TC-GOV-34, TC-OPS-02 to TC-OPS-04: the floor at 0 to 4, 5, 9 and 10 companies in unit and API tests, in both directions, in steps of five; counting queries select counts only | Built the cautious way (OQ-14): below five, nobody is shown a number. Differencing at the boundary is possible and is a known limit ([procure VALIDATION.md](../../modules/procure/VALIDATION.md)). Aggregate outcomes (BR-RUN-10) do not exist, so TC-RUN-41 cannot run |
| 3 | One company reads or changes another's record, or the operator reads a company | BR-ID-03, BR-ID-04, BR-ID-05 | TC-ID-19 to TC-ID-68 and TC-ID-115 to TC-ID-135: every module probed across companies, as the operator and as a member, at unit, integration, smoke and browser level; every query on a company table is bound to a company (static) | A single walk over every route with a second company's cookie does not exist (TC-ID-52, designed), so a new route can be added without a probe. The static rules are tripwires, not proofs |
| 4 | A confirmed record, a revision or an audit entry is edited, deleted or replaced | BR-DATA-04, BR-ID-06 | TC-DATA-11 to TC-DATA-18, TC-ID-71, TC-ID-72, TC-ID-136: triggers refuse update, delete and replace on every unique key, one probe per rule; no query in the application changes an append-only table | `DROP TRIGGER` and `DROP TABLE` cannot be stopped inside SQLite. A trigger with the right name and a weaker body than tested would pass the name checks |
| 5 | The owner sees a fee | BR-COM-02 | TC-COM-02, TC-COM-03, TC-GOV-12, TC-PROC-32: no owner page or answer holds the fee, in smoke and in the browser | Pages that exist only after the owner acts are covered only by the paths walked |
| 6 | Sessions, identity and cross-site writes | BR-ID-01, BR-NFR-01, BR-NFR-13 | TC-ID-01 to TC-ID-17, TC-ID-80 to TC-ID-114, TC-ID-137 to TC-ID-145, TC-NFR-05 to TC-NFR-10: signing, expiry to the second, tampering, cookie attributes, the secret, cross-site posts in a real browser | Sign-out clears the cookie but does not revoke the token (TC-ID-13 note); a change with neither Origin nor Sec-Fetch-Site is allowed and a test records it (TC-ID-87); no lockout (TC-NFR-29) |
| 7 | Synthetic only: real data enters | BR-DATA-01, BR-UX-08 | TC-DATA-01 to TC-DATA-08, TC-UX-20 to TC-UX-26, TC-OPS-48: the sign-in works only in a synthetic environment and for synthetic users; the cast carries nothing that looks real; every page carries the banner | A person can still type real data into a free-text box; nothing detects it (RK-10) |
| 8 | The owner's own record is wrong: a lost update, a step out of order, a review on the wrong day | BR-DESC-03, BR-DEPL-03, BR-RUN-02 | TC-DESC-35 to TC-DESC-39, TC-DEPL-16 to TC-DEPL-26, TC-RUN-13 to TC-RUN-22: stale saves refused, the order of events enforced, the delivery cap, the 30, 90 and 180 day clock | Edges of two limits are not tried at the edge (TC-DESC-42, TC-DIAG-16). The clock cannot be moved in a page, so a review is recorded only in integration tests |
| 9 | The hosted demonstration is open to the world | BR-OPS-08 | TC-OPS-30 to TC-OPS-66: refuses to start without a gate, secret or synthetic environment; 401 without the password; the health route open; no password reaches the application | Never run on a real host (section 3) |

No test asserts that the application makes no outbound call or moves no money. [Likely] That is true because no code does either: the money columns are the owner's own records of a price and a payment (TC-DEPL-46), and the platform holds and moves nothing (BRD section 6). A static scan for outbound calls would turn the claim into a check.

## 6. Entry and exit criteria

### 6.1 For a slice (AS BUILT)

Entry: a branch from `main` and a draft pull request; the module's `STATUS.md` and `VALIDATION.md` read; a pull request that touches a protected path (identity, data scope, migrations, money, the rule library's publishing path) carries the label `needs-human-review` ([AGENTS.md](../../AGENTS.md)).

Exit, as the repository's rules and the runner require today:

1. The affected checks have been run, and the result, its date and its limits are written in the module's `VALIDATION.md`. A check that could not run is said not to have run.
2. `node scripts/test.mjs pr --guard` passes on a fresh `pnpm build`, with no baseline lowered except by `--update-baseline --reason`.
3. CI runs on the pull request: `engineering-checks` for a change to code, and only `documentation-checks` for a change that is only Markdown or under `docs/` (section 10). Whether a green run is required before a merge is not known: branch protection was not visible to the reviewer ([platform VALIDATION.md](../../modules/platform/VALIDATION.md), finding L8).
4. The sponsor decides whether and when it merges. A merge without a person reading it is recorded in HANDOVER.md, and the code is not called reviewed.

TO BE, proposed: a change also adds or updates the cases for the requirements it claims in [TEST-CASES.md](TEST-CASES.md), and `node scripts/check-test-docs.mjs` passes. The static test in `modules/docs/tests/static/testdocs.test.ts` already fails a change that renames a test a case cites.

### 6.2 For a release (TO BE)

The repository has no release criteria and has cut no release. [Certain] These are proposals for the sponsor, [Likely] the least that real company data would need:

1. Every Must requirement the BRD calls Built has an automated case, and no case in the traceability matrix says covered-partly without a written reason.
2. No open defect of severity high, and every high defect fixed with a test that fails without the fix (section 9).
3. A named person has read the protected paths and the finding is recorded (BR-NFR-14, OQ-08).
4. An independent security test and a restore drill have been run and their results recorded (BR-NFR-07).
5. The UAT plan's entry criteria are met and its sign-off table is filled by the people it names.
6. OQ-07 (where data is hosted), OQ-09 (reuse of the study) and OQ-13 (how real owners sign in) are settled.

## 7. What "accepted" means

A BRD acceptance criterion is accepted when a named person has witnessed it being met, on a stated date, with the evidence recorded where the [UAT plan](UAT-PLAN.md) says. Nothing else is acceptance: not a passing test, not an agent's review, not a merge. [AGENTS.md](../../AGENTS.md) says that a passing unit check does not promote an acceptance case to passed, and the BRD says the same (its section 1.3). On 5 October 2026 all 116 requirements are pending, and the BRD's sign-off table is unsigned. [Certain]

The words in the [traceability matrix](TRACEABILITY.md) are about tests only. Covered-automated means every case for the requirement that can run today is automated and none is marked partial. It does not mean met, and it does not mean accepted.

## 8. How to run each layer

All commands run from the repository root. `pnpm install --frozen-lockfile` comes first; the smoke and browser layers also need `pnpm build`.

| What | Command | Notes |
| --- | --- | --- |
| Everything, with the guard | `pnpm test` | Same as `node scripts/test.mjs pr --guard`. About 10 and a half to 11 minutes on two cores in the recorded runs |
| One layer | `node scripts/test.mjs static`, `unit`, `integration`, `smoke` or `browser` | `pnpm test:static`, `test:unit`, `test:integration` and `test:smoke` exist; there is no `pnpm` script for the browser layer |
| One suite | `node scripts/test.mjs browser --only journey/browser/journey` | A suite id is `<module>/<layer>/<name>` |
| One file | `node --test modules/<module>/tests/<layer>/<name>.test.ts` | Static, unit and integration need no build |
| List suites | `node scripts/test.mjs --list` | |
| Catalogue check | `node scripts/test.mjs --check-catalogue` | Fails on a test file outside a layer, or a baseline that names a missing suite |
| Change a baseline | `node scripts/test.mjs <layer> --update-baseline --reason "<why>"` | Refuses while a suite fails; writes the counts of the suites it ran |
| Type check | `node node_modules/typescript/bin/tsc --noEmit` | `pnpm typecheck` |
| Migrations | `node node_modules/drizzle-kit/bin.cjs check` | `pnpm db:check` |
| Documents | `node scripts/check-documentation.mjs` | `pnpm docs:check` |
| BRD counts | `node scripts/check-traceability.mjs` | `--write` regenerates the counts |
| Test documents | `node scripts/check-test-docs.mjs` | `--write` regenerates the matrix in TRACEABILITY.md |
| Mutation | `python3 scripts/mutation/mutate.py <copy of the repository> modules/<module>/mutations/<file>.json` | On a copy of the tree, never the tree being edited |
| Reset the local database | `pnpm db:local` | Deletes the local database and applies migrations and seed |

To see what the Worker printed when a browser test fails, set `APLYD_BROWSER_DEBUG=1` (and `WRANGLER_LOG=debug`). Results go to `reports/summary.json`, which Git ignores; CI uploads it as the artifact `test-summary`.

## 9. Defects and severity

AS BUILT: a defect found by a review or a run is written in the module's `VALIDATION.md` with a label, what was wrong, and what was done; "fixed" means a change and a test that fails without it; an open finding stays listed with its limit. The reviews have used the words high, medium and low without a written definition. No issue tracker or severity scale is set down in the repository. [Certain]

TO BE: the scale below is [Likely] a faithful statement of how the reviews already used the words, with examples from the repository.

| Severity | Meaning | Example from the repository | Handling |
| --- | --- | --- | --- |
| High | An invariant is broken, someone can act as another, a confirmed record can be altered or lost, or real data can get in | A second sign-off could replace the first, because `INSERT OR REPLACE` bypassed the delete trigger ([diagnose VALIDATION.md](../../modules/diagnose/VALIDATION.md), H1) | Fix before the next merge, with a test that fails without the fix; on a protected path a person reads the fix |
| Medium | A rule holds in the application but not in the database, a limit is missing, or a refusal leaves the owner stuck | The build carried `APLYD_ENV=local`, so a deployed build would have had the synthetic sign-in on ([platform VALIDATION.md](../../modules/platform/VALIDATION.md), M2) | Fix in the next slice, or record the limit and the reason |
| Low | Wording, a message that is unhelpful, missing hardening with another control in place | A member who is not the owner was told they have no company (diagnose, L6) | Fix when convenient; record if left |

A defect found in acceptance by a person is triaged under the [UAT plan](UAT-PLAN.md), section 8. A defect is closed when a test or a witnessed run shows it gone; an agent's statement that it is fixed does not close one.

## 10. Known gaps, limits and findings from reading the tests

### 10.1 Must requirements that the BRD calls Built or Partial and no test checks

Three: BR-NFR-04 (each module's VALIDATION.md exists and is dated), BR-NFR-05 (the regression guard works), BR-NFR-06 (the seven-day package rule, a bill of materials and an audit). Each has a designed case and is named, with its reason, in the known-gaps block of [TEST-CASES.md](TEST-CASES.md), which the check keeps true. [Certain]

### 10.2 Requirements the code does not build

The [traceability matrix](TRACEABILITY.md) counts requirements whose every case is a "cannot be tested until" row. Those cannot be tested because the feature is not built or the decision is not made (OQ-03, OQ-06, OQ-07, OQ-11, OQ-13 and others). Writing a test for them now would test nothing.

### 10.3 What reading the tests showed (5 October 2026)

| Finding | Where | Effect |
| --- | --- | --- |
| A title claims more than the test checks | `modules/platform/tests/integration/platform-api.test.ts`, "sign-in is audited with the person and company, never the address": it asserts the user and company, not that no address is stored | The claim about the address is untested. Recorded in TC-ID-75 |
| Tests that record today's behaviour although the BRD says it should change | `modules/run/tests/integration/run-api.test.ts`, a form post refused before the person is known is answered with JSON (BR-UX-06); `modules/platform/tests/unit/cross-site.test.ts`, a change with neither Origin nor Sec-Fetch-Site is allowed | When the behaviour is fixed the test must change with it. TC-UX-07 and TC-ID-87 say so |
| Smoke suites whose tests run in order and share state | `modules/deliver/tests/smoke/deliver.test.ts` and `modules/run/tests/smoke/run.test.ts`: the first test, "set-up: ...", creates the provider, the requirement and the engagement the later tests use | Running one later test alone fails; a failure in the set-up test fails the rest for a reason that is not theirs |
| Whole-journey tests that depend on wording and time | The journey test and the demonstration walk name labels on seven pages and take up to 170 seconds; the journey takes the harness's whole allowance on a very slow machine | A change of wording breaks them. Run each alone before calling a failure a regression ([regression pack](REGRESSION-PACK.md)) |
| A test never shown to fail | The journey test ([journey VALIDATION.md](../../modules/journey/VALIDATION.md)) | Its eight assertions are an argument, not a measurement |
| A test that needs a Unix tool | `modules/platform/tests/browser/harness.test.ts` calls `pgrep` | It cannot run where `pgrep` is missing. A Worker can outlive a test process killed with SIGKILL |
| Limits tried on one side only | The 64 KB body edge (TC-DESC-42) and the cap of eight ranked ideas (TC-DIAG-16) | A designed case sits beside each |
| Static rules that are tripwires | The header rule and the scope rule ([diagnose VALIDATION.md](../../modules/diagnose/VALIDATION.md), L3: a query that joins a bound and an unbound table passes) | A new way of writing a query can pass them unseen |
| Tests of the test tooling that no case cites | Nine tests: two in `modules/platform/tests/static/conflict-markers.test.ts`, seven in `modules/platform/tests/browser/harness.test.ts` | They run and count in the baseline; they trace to no requirement |
| Skipped or todo tests | None found in any test file (a search for `.skip(`, `.todo(`, `skip:` and `todo:` on 5 October 2026); the runner counts one as a failure anyway | None |
| The Markdown-only skip | `.github/workflows/ci.yml` ignores `**.md` and `docs/**`, and `.github/workflows/docs.yml` runs only `scripts/check-documentation.mjs` | A pull request that changes only the test documents runs neither the traceability check nor the test-document check, and no test. A later code change fails the static test if the documents have drifted |

### 10.4 Limits stated by the modules

One engine, one viewport, HTTP on loopback; Miniflare, not hosted D1; no concurrency test with two Workers racing; the same agent wrote each module's code, tests and mutations; no person has read any of it; the ranking weights, the library figures, the clusters, the limits (12 milestones, 14 deliveries, 500 versions, 200 decisions) and the review days are placeholders chosen by the builders; the pool floor is a rule about publication, not a privacy guarantee; the questionnaire, the assessment and the pages have not been shown to an owner. Each is in the "What these results do not show" or "Limits" section of the module's VALIDATION.md: [platform](../../modules/platform/VALIDATION.md), [factory](../../modules/factory/VALIDATION.md), [diagnose](../../modules/diagnose/VALIDATION.md), [procure](../../modules/procure/VALIDATION.md), [deliver](../../modules/deliver/VALIDATION.md), [run](../../modules/run/VALIDATION.md), [journey](../../modules/journey/VALIDATION.md), [hosting](../../modules/hosting/VALIDATION.md) and [demonstration](../../modules/demo/VALIDATION.md).

## 11. Roles

| Role | AS BUILT | TO BE |
| --- | --- | --- |
| Sponsor | Decides what merges and when; has accepted nothing | Accepts requirements in the UAT plan; sets the bar for the ten-owner test; settles the open questions that block tests |
| Writing agent | Writes a module's code, tests and mutation breaks, and its VALIDATION.md | Same, but does not mark its own work accepted |
| Reviewing agent | Reads a commit and tries to break it; findings are recorded in VALIDATION.md; its full report is not kept | Same, plus a person for protected paths |
| Named human reviewer | None (OQ-08) | Reads identity, scope, migration and money changes (BR-NFR-14) |
| Operator staff | None | Witness the operator's cases in the UAT plan |
| Owners | None have seen the application | Take part in sessions and the ten-owner test, under codes, outside the repository |
| Independent technical reviewer | None | Runs the security test and reads the test set against the requirements |

## 12. Test data policy

All test data is SYNTHETIC and marked so in its text. Companies, people and providers are invented; addresses end in `.invalid`; no real name, contact, factory, interview content from the study or study figure appears in code, fixtures or documents ([AGENTS.md](../../AGENTS.md); BR-DATA-01; OQ-09). The listing fee of ₹1,500 is a placeholder, appears to the operator only, and no test or fixture may put a fee on an owner's page. No secret, database file or build output is tracked; static tests check this. [TEST-DATA.md](TEST-DATA.md) lists the data sets, how each suite sets up and tears down, and how to reset.

## 13. Metrics available

| Metric | Available | How |
| --- | --- | --- |
| Tests per layer and module | Yes | Baseline files; `node scripts/test.mjs --list` |
| Suites passing and time per suite | Per run | `reports/summary.json`, the CI artifact `test-summary` |
| Requirements by verdict and priority | Yes | [TRACEABILITY.md](TRACEABILITY.md), section 2, regenerated by `node scripts/check-test-docs.mjs --write` |
| Cases by layer, type and automation | Yes | The same section |
| Mutation breaks caught and survived | Per module, by hand | Each module's VALIDATION.md, for example deliver's third set of 12 breaks, 11 caught and 1 survived |
| Line or branch coverage | No | No coverage tool is installed |
| Pass rate over time, flaky tests | No | The summary is overwritten each run and no history is kept; how often the CI runs pass over many runs is not known |
| Defects found and escaped | No | Findings are in prose in VALIDATION.md; no count is kept |

A count of passing tests measures the test suite, not the product, and the traceability verdicts measure the case table, not acceptance. Neither is a completion percentage.
