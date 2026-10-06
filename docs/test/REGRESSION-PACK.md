# Regression pack

Version 0.1. Date 5 October 2026. Status: draft, not reviewed by a person.

The regression pack says what runs on every change and why, which part to run when only one area changed, what is slow or fragile, and how a baseline is changed. It describes the runner and the CI workflows as they are on 5 October 2026 (AS BUILT); the suite names and the selection rules were brought up to the catalogue of 118 suites at commit 696640e on 6 October 2026, and the new suites were not run for this update and marks proposals (TO BE). The runner has no selection by changed files: it runs layers, or suites named by hand. So the selection rules below are guidance for a person working locally, not something the repository enforces, and every code change meets the full run in CI. Everything the application holds is SYNTHETIC; no change has been reviewed by a person.

How this relates to the other documents: the [test strategy](TEST-STRATEGY.md) explains the layers and how to run them (section 8); the [test cases](TEST-CASES.md) are the checks the pack runs; the [test scenarios](TEST-SCENARIOS.md) are the journeys it protects; the [traceability matrix](TRACEABILITY.md) shows which requirements each check serves; the [test data](TEST-DATA.md) says what data the suites set up and tear down; the [UAT plan](UAT-PLAN.md) covers what cannot be a regression test.

Each entry is a heading `RP-NN`. A "suite id" is `<module>/<layer>/<name>` as `node scripts/test.mjs --list` prints it, and `--only` takes a comma-separated list of them.

## RP-01 The guarded full run

What: `pnpm test`, which is `node scripts/test.mjs pr --guard`: the four command suites (type check, documentation check, BRD traceability check, migrations check) and every test file in the five layers, with the regression guard on.

Why: it is the one run that shows the whole product still agrees with its tests. CI runs it on every pull request and every push to `main` that changes more than Markdown or `docs/` (RP-12).

When: before a pull request is marked ready, and after any change to code, a migration, a page, a script, a dependency or a deployment file.

How: `pnpm install --frozen-lockfile`, `pnpm build`, then `pnpm test`. The smoke and browser layers need the build and a Chromium (strategy, section 3). The recorded runs took about 10 and a half to 11 minutes on two cores ([hosting VALIDATION.md](../../modules/hosting/VALIDATION.md), [demonstration VALIDATION.md](../../modules/demo/VALIDATION.md)).

Result: 0 when every suite passed and the guard is satisfied; 1 when a suite failed or the guard found a problem; 2 for a usage or catalogue error. `reports/summary.json` is written.

## RP-02 The invariant set

What: the suites whose cases guard the six invariants: vendor neutrality (D-03), the floor of five (C-04), the scope rule, append-only records, no fee shown to owners, synthetic only. They are in the full run; this entry names them so they can be run first and by themselves.

Why: a failure here is a high defect ([strategy](TEST-STRATEGY.md), section 9) and should be seen before anything else.

How, without a build:

```text
node scripts/test.mjs static unit integration --only procure/unit/pool,procure/integration/procure-api,procure/static/rules,deliver/integration/deliver-api,deliver/static/rules,run/integration/run-api,run/static/rules,platform/integration/platform-api,platform/integration/append-only-keys,platform/unit/scope,platform/unit/guards,diagnose/integration/diagnose-api,diagnose/static/scope-rules,factory/integration/factory-api,factory/static/scope-rules
```

With a build, add the layers that read the pages: `node scripts/test.mjs smoke browser --only demo/smoke/demo,procure/browser/procure,deliver/smoke/deliver,platform/browser/session-and-scope`.

| Invariant | Cases | Main suites |
| --- | --- | --- |
| Vendor neutrality | TC-GOV-02 to TC-GOV-12, TC-PROC-40, TC-DEPL-46 | `procure/integration/procure-api`, `deliver/integration/deliver-api`, the three `static/rules` suites |
| Floor of five | TC-GOV-20 to TC-GOV-30, TC-OPS-02 to TC-OPS-04 | `procure/unit/pool`, `procure/integration/procure-api`, `procure/static/rules` |
| Scope rule | TC-ID-19 to TC-ID-68, TC-ID-115 to TC-ID-135 | every module's integration suite and static scope or rules suite, `platform/unit/scope` |
| Append-only | TC-DATA-11 to TC-DATA-18, TC-ID-71, TC-ID-72, TC-ID-136 | `platform/integration/append-only-keys`, `platform/unit/guards`, the module integration suites |
| No fee shown to owners | TC-COM-02, TC-COM-03, TC-GOV-12, TC-PROC-32 | `demo/smoke/demo`, `procure/browser/procure`, `deliver/smoke/deliver` |
| Synthetic only | TC-DATA-01 to TC-DATA-08, TC-OPS-48 | `platform/integration/platform-api`, `platform/smoke/built-app`, `hosting/unit/gate`, `demo/unit/cast` |

## RP-03 The critical path

What: the whole-journey test, `journey/browser/journey` ([SC-01](TEST-SCENARIOS.md)), and the demonstration walk, `demo/browser/walk` ([SC-19](TEST-SCENARIOS.md)).

Why: each stage has its own tests, which set the stage up by sending what the forms send. Only these two start from the previous stage's real output, so only they fail when one page's output is not what the next page reads: a field renamed on one side, a link that goes nowhere, a stage that cannot be reached from the home page.

How: `pnpm build`, then `node scripts/test.mjs browser --only journey/browser/journey,demo/browser/walk`. Run each on its own when it fails (RP-11) before calling the failure a regression.

Cases: TC-DESC-53, TC-OPS-11, TC-OPS-12.

## RP-04 The baseline guard

What: `--guard` fails when a suite is missing, has no baseline in `modules/<module>/tests/baseline.json`, or passes fewer tests than its baseline; when a suite in a requested layer is named in a baseline and did not run (unless `--only` was used); and, with or without `--guard`, when a test is skipped, todo or cancelled, or a suite passes no tests.

Why: the code is changed by agents and merged without a person reading it. A deleted or silently skipped test would otherwise leave a green run. The guard counts tests; it does not say what they check.

Limits: a baseline can be lowered by the runner with a reason, or edited by hand in a pull request, and there is no code-owner rule to stop either ([platform VALIDATION.md](../../modules/platform/VALIDATION.md), L7). The guard's own failure paths are not tested (TC-NFR-21, designed). The baseline file holds one reason for the whole module, overwritten at each update; earlier reasons are in Git.

## RP-05 The catalogue check

What: `node scripts/test.mjs --check-catalogue` fails on a test file anywhere in a module but a layer directory (including `support/` and `src/`), on a file in a layer directory that does not end in `.test.ts`, on two suites with one id, and on a baseline that names a suite that no longer exists. CI runs it first, before installing anything.

Why: a test file in the wrong place would never run and nothing would say so.

## RP-06 The document checks

What: three scripts that need no build and no database.

| Script | Checks | Registered in the runner |
| --- | --- | --- |
| `scripts/check-documentation.mjs` | Every relative link and anchor resolves; every decision, proposal, position, open question and source ID mentioned is defined; source checksums; no conflict markers | Yes, `static/documentation`; also its own workflow (RP-12) |
| `scripts/check-traceability.mjs` | The BRD is well formed and its counts are current; every BR ID any document mentions exists | Yes, `static/traceability` |
| `scripts/check-test-docs.mjs` | Every case row is well formed and numbered; every case cites real requirements; every requirement is cited; every automated case names a real test file and a title that file declares; every Must requirement that is Built or Partial has an automated case or is a stated gap; the matrix in [TRACEABILITY.md](TRACEABILITY.md) is current; the other six test documents name only cases, requirements and paths that exist | Not as a command suite on 5 October 2026. Its static test, `docs/static/testdocs`, runs the same checks inside the full run once it has a baseline |

Why: the BRD says its acceptance criteria are decided by the cases ([BRD](../brd/BRD.md), section 1.3). If the cases pointed at tests that were renamed or deleted, the claim would be false without any test failing.

When: after any change to a document under `docs/`, to a test title, or to a requirement. `node scripts/check-test-docs.mjs --write` regenerates the counts and the matrix.

TO BE: register `scripts/check-test-docs.mjs` beside `static/traceability` in `COMMAND_SUITES` in `scripts/test.mjs`, and add it and `scripts/check-traceability.mjs` to the documentation workflow, so that a Markdown-only pull request that edits the test documents is checked. Neither script needs an install.

## RP-07 Type check and migrations check

What: `static/typecheck` runs `tsc --noEmit`; `static/migrations` runs `drizzle-kit check`, which fails when the migrations, the journal and the snapshots disagree with the schema. The unit suite `platform/unit/migrations` checks that migrations are applied in the order of the journal and that every SQL file is in it (TC-DATA-11).

Why: an applied migration is never edited. A schema change must arrive as a new migration, and a custom migration for triggers must be generated, not written by hand into an old file.

When: any change to a `schema.ts`, `drizzle/`, a trigger, or a type shared across modules.

## RP-08 Selection by area changed

The rows below are [Likely] sound and are not enforced. When in doubt, run RP-01. A change to a protected path (identity, anything that decides which company's data a person can read, migrations, anything that records money, the rule library's publishing path) always gets the full run and RP-10.

| Area changed | Run at least |
| --- | --- |
| `modules/platform/src/identity`, session, secret, cross-site, body, headers | `platform/unit/*`, `platform/integration/platform-api`, `platform/smoke/built-app`, `platform/browser/session-and-scope`, `platform/browser/cross-origin`, then RP-01 |
| `modules/platform/src/db` (companies, audit, guards, migrate), `drizzle/` | RP-07, `platform/integration/append-only-keys`, `platform/unit/guards`, `platform/unit/migrations`, every module's integration suite, then RP-01 |
| `modules/factory` | the `factory/*` suites, `journey/unit/progress`, `journey/integration/facts`, `journey/browser/journey` |
| `modules/diagnose` (engine, library, digest, gaps, compare) | the `diagnose/*` suites (including `diagnose/unit/gaps`, `diagnose/unit/compare` and `diagnose/browser/gaps`), `demo/unit/cast` (it pins the ranking the demonstration relies on), `journey/unit/progress`, `journey/integration/facts`, `journey/browser/journey` |
| `modules/procure` (pool, providers, fee, clusters) | the `procure/*` suites, `deliver/integration/deliver-api`, `journey/unit/progress`, `journey/integration/facts`, `demo/smoke/demo`, RP-02 |
| `modules/deliver` | the `deliver/*` suites (including `deliver/unit/test-quality` and `deliver/unit/summary`), `run/integration/run-api`, `journey/unit/progress`, `journey/integration/facts`, `journey/browser/journey`, RP-02 |
| `modules/run` (baseline, reviews, corrections, migration 0015) | the `run/*` suites, `platform/unit/guards`, `platform/integration/append-only-keys`, `journey/unit/progress`, `journey/integration/facts`, `journey/browser/journey` |
| `modules/journey` (which step is the owner's turn) | `journey/unit/progress`, `journey/unit/properties`, `journey/unit/properties-exhaustive`, `journey/integration/facts`, `journey/browser/journey` |
| `modules/portability`, `app/export/`, `app/api/companies/[id]/export/` | the `portability/*` suites (`portability/static/scope` holds the scope rules), `platform/smoke/built-app`, `docs/static/api-sync`, then RP-02 (the file must hold nothing of another company) |
| `modules/quality` (measurements of phone, accessibility, slow connection, scripts off) | the `quality/*` suites; a page change that adds or removes a fault must also change the known-offenders file the suite reads, or the suite fails |
| `app/` pages and `app/api/` routes | the owning module's smoke and browser suites, `platform/static/page-lookups`, `platform/static/source-rules`, `demo/static/script-labels` (it fails when a label on a page changes and the demonstration script does not), `journey/browser/journey`; for `app/globals.css`, `journey/unit/contrast` and `demo/unit/ui-contrast` (they read the colours and the fallbacks from that file); for the page titles, empty states and the date format, `demo/smoke/interface` and `demo/unit/dates`; for a change that may widen a page, `demo/browser/phone` and `quality/browser/phone`; for the session ending at a form, `platform/smoke/session-expiry` and `platform/browser/session-expired` |
| `worker/` | `platform/smoke/built-app`, `platform/unit/security-headers`, `platform/static/source-rules` |
| `modules/hosting`, `scripts/serve.mjs`, `Dockerfile`, `.do/app.yaml` | the `hosting/*` suites (`hosting/static/deploy-files` reads the `APLYD_COMMIT` lines), `demo/smoke/demo` |
| `modules/demo` | the `demo/*` suites, `platform/static/source-rules` (its import-following exemption), `hosting/smoke/serve` |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | `pnpm install --frozen-lockfile`, `pnpm build`, RP-01; check by eye that the seven-day rule and the build-script allow-list are unchanged (BR-NFR-06 has no test) |
| A test file only | that suite, then its baseline (RP-13) |
| A test title cited by a case | RP-06 |
| `docs/` or Markdown only | RP-06; CI runs only the documentation workflow (RP-12) |

## RP-09 The quick subset before pushing

What: `node scripts/test.mjs static unit` for the whole of the two layers that need no database, build or browser; then the integration suite of the module changed, for example `node scripts/test.mjs integration --only deliver/integration/deliver-api`.

Why: it shows most mistakes in the area before the long run. It is not a substitute for RP-01. The time it takes was not measured for this document.

## RP-10 Mutation checks

What: break the code in one small way and run the tests that should notice (`scripts/mutation/mutate.py`; break lists in `modules/platform/mutations/`, `modules/procure/mutations/`, `modules/deliver/mutations/` and `modules/run/mutations/`).

Why: a passing suite shows the code agrees with the tests, not that the tests would notice a mistake. Slice 1's reviewer found a high defect that its author's own break table had missed, and a second review found holes (a NUL byte, a BLOB) that no break covered.

When (AS BUILT): by the author, by hand, on a copy of the working tree, after a change to a protected path or to an invariant; recorded in the module's `VALIDATION.md`. Nothing in CI runs it, because a run takes tens of minutes on the layers that start a Worker. A run killed hard can leave a source file broken; run it in the background and name the suites it needs ([diagnose VALIDATION.md](../../modules/diagnose/VALIDATION.md)). A "skip" line means the code changed since the list was written: update the list rather than ignore it.

TO BE: re-run the module's list after a change to the code it breaks, and add a break for each defect found, in the same pull request as the fix.

## RP-11 Known slow and fragile suites

No test is recorded as flaky, and how often any suite passes over many runs is not known. These are the suites that have cost time or that a reader should run alone before believing a failure.

| Suite or step | Why it needs care |
| --- | --- |
| `journey/browser/journey` | One long test over seven pages, allowed 170 seconds; the first run took 27 seconds alone and 11.9 seconds in a full run, and it takes the whole allowance on a very slow machine. It depends on the wording of labels, so a wording change fails it. It has never been shown able to fail ([journey VALIDATION.md](../../modules/journey/VALIDATION.md)). Run it alone: `node scripts/test.mjs browser --only journey/browser/journey` |
| `demo/browser/walk` | Allowed 170 seconds plus 10; about 12 seconds when measured once. Also wording-dependent |
| `quality/browser/*` | Each of the five browser suites starts its own application and walks every person over every page (the accessibility, no-script and phone suites over nine people and the pages in `modules/quality/tests/support/matrix.ts`), so they are the longest browser suites. How long they take on the CI machine is not known. They fail on a fault that is not in the known-offenders file and on a listed fault that has gone ([quality VALIDATION.md](../../modules/quality/VALIDATION.md)) |
| `demo/browser/phone` | One test over every person and page, allowed 175 seconds in its source. Fails when a page scrolls sideways at 390 pixels wide |
| `journey/unit/properties`, `journey/unit/properties-exhaustive` | Generated cases from fixed seeds (at least 5,000) and an exhaustive small world; unit suites, but longer than the other unit suites. A failure prints the case that broke a rule |
| `deliver/smoke/deliver`, `run/smoke/run` | The first test, "set-up: ...", creates the data the later tests use. A later test run alone fails; a failed set-up fails the rest for a reason that is not theirs |
| `platform/browser/harness` | One test calls `pgrep`, so it needs a Unix with it. A Worker can outlive a test process killed with SIGKILL, which no handler can catch |
| `platform/browser/cross-origin` | A request refused before its body is read can make the local development proxy lose the next request. The body is now read, and the suite keeps a workaround and prints how often it was needed |
| `hosting/smoke/serve`, `demo/smoke/demo` | Start the launcher five and two times; about 12 and 6 seconds when measured once |
| Any smoke or browser suite | Starts a Worker with wrangler; `CLOUDFLARE_CF_FETCH_ENABLED=false` is set because otherwise wrangler fetches request data from the network and may restart the Worker, giving 503 or a hang in the first seconds |
| Mutation runs | On a two-core machine overlapped with other runs, "caught" can mean a timeout, so a survivor is a stronger statement than a catch ([deliver VALIDATION.md](../../modules/deliver/VALIDATION.md)) |

Rule: a failure in a browser or smoke suite is not called a regression until the suite has been run alone, on a rebuilt `dist/`, with `APLYD_BROWSER_DEBUG=1` if it is a browser suite, and has failed again.

## RP-12 What CI runs

| Workflow | Runs on | Does | Limit |
| --- | --- | --- | --- |
| `engineering-checks` (`.github/workflows/ci.yml`) | Every pull request and every push to `main` that changes a file other than `**.md` or under `docs/`; also by hand | `node scripts/test.mjs --check-catalogue`; install with `pnpm install --frozen-lockfile`; `pnpm build`; shows the Chrome version; `node scripts/test.mjs pr --guard`; uploads `reports/summary.json` as `test-summary` even on failure | 30 minutes (raised from 20 by commit a6579a0 on 5 October 2026: the guard took 600 to 672 seconds of a 633 to 704 second job with 67 suites, and every suite added since lengthens it). A new push to the same pull request cancels the run in progress. No secrets, no hosted database, no deployment |
| `documentation-checks` (`.github/workflows/docs.yml`) | Every pull request; also by hand | `node scripts/check-documentation.mjs` | 5 minutes. Needs no install |

A pull request that changes only Markdown or `docs/` runs only `documentation-checks`: no test, no traceability check and no test-document check. A pull request that changes code and a document runs both. Whether a green run is required before a merge is not known (branch protection was not visible, [platform VALIDATION.md](../../modules/platform/VALIDATION.md), L8). The sponsor merges, and has merged without a green run being the stated reason or any person reading the code (HANDOVER.md).

## RP-13 Changing a baseline, and why it needs a reason

Command: `node scripts/test.mjs <layers> --update-baseline --reason "<why>"`. It runs the suites, refuses if any fails, and writes the count each suite passed into that module's `tests/baseline.json` with the date and the reason.

Why a reason is required: the command can lower a count as easily as raise it, and a lower count means fewer tests are guarded. The reason is the only place that says whether tests were removed on purpose (a feature was dropped) or by mistake. A reason that names a slice and a change ("review fixes, migration 0014 hardening") is a record; "update" is not.

Rules:

1. A count goes up when tests are added in the same change. State the added tests.
2. A count goes down only when the tests it counted no longer apply, and the reason says which and why. The case table is updated in the same change: a case cites a test that has gone, and the static test `docs/static/testdocs` fails until it is changed.
3. A new suite needs a baseline in the change that adds it, or `--guard` reports it.
4. A baseline is never edited by hand. If it is, the pull request says so and a person looks at the diff; there is no automatic check.
5. Run the layers whose suites changed, so that every suite that ran has its count recorded together.

## RP-14 When a test title or a requirement changes

A case in [TEST-CASES.md](TEST-CASES.md) cites a test by file and exact title. Renaming a test, moving it to another file or layer, or deleting it makes `docs/static/testdocs` and `scripts/check-test-docs.mjs` fail with the case ID. Change the Automation cell to match, or, if the test no longer exists, change the case to `designed` and say so in its expected result. A change to the BRD's requirement table (an added, removed or re-statused requirement) fails the same checks until a case cites the new requirement and the counts in TRACEABILITY.md are regenerated with `node scripts/check-test-docs.mjs --write`.

## RP-15 Before a demonstration

Run `node scripts/test.mjs smoke browser --only demo/smoke/demo,demo/browser/walk` on a fresh build, and read `/demo` once as the presenter. The demonstration database is rebuilt at every start, so a restart is the way to return to the starting point; the tables are append-only and nothing entered during a presentation can be put back ([SC-19](TEST-SCENARIOS.md), [test data](TEST-DATA.md)).

## RP-16 What the pack does not run

Accessibility, performance, load and concurrency, other browsers and phones, HTTPS on a real host, a hosted environment, the Dockerfile and the app spec, backup and restore, independent security testing, any test with a person ([strategy](TEST-STRATEGY.md), section 2.5). A green pack says none of these was tried. Mutation checks are run by hand (RP-10). The three Must requirements with no automated case (BR-NFR-04, BR-NFR-05, BR-NFR-06) have no regression test at all: the record of evidence, the guard itself and the seven-day package rule can each be lost without a test failing.
