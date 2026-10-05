# Factory module: validation

Environment for every result below: a Linux container, Node v22.22.0, pnpm 11.25.0, Chromium 141.0.7390.37 through `playwright-core` 1.56.1, 4 October 2026. The agent that wrote the code ran every check here. No separate reviewer has read this slice yet and no person has.

## Results

Run in the working tree of branch `slice-2-describe`: `pnpm build`, then `node scripts/test.mjs pr --update-baseline` (every layer passed, then the baselines were recorded through the runner).

| Suite | Result |
| --- | --- |
| factory/unit/questionnaire | 11 passed |
| factory/integration/factory-api | 23 passed, against a real D1 database through Miniflare |
| factory/static/scope-rules | 3 passed |
| factory/smoke/describe | 11 passed, the built application in a local Worker |
| factory/browser/describe | 9 passed, a real headless Chromium |
| platform/unit/guards | 2 passed (new) |
| all other platform suites | unchanged from slice 1, all passed |
| static/typecheck, static/documentation, static/migrations | pass |

## What the first runs found

Recorded because a table of passes hides what the checks were for.

- Typecheck failed after the tests passed. The helper that sets an answer on an object was typed so that it could not take the answer type. Node strips types without checking them, so the unit and integration suites never saw it. Fixed; the lesson is that the typecheck suite is not optional.
- The smoke and browser tests failed on their own mistakes: server-rendered React places comment markers between text and values, so a text match on raw HTML failed (the tests now strip them); a radio named "One" also matched "We have none" (exact match now). Neither was an application defect.

## Mutation checks

Each row is one deliberate break of the code, run against the named layers; "caught" means at least one test failed. Run by `mutate.py`, which restores the file after each run.

| Break | Result |
| --- | --- |
| Read: scope check removed | caught |
| Write: scope check removed | caught |
| Write: owner-role check removed (in the handler, and separately inside `canWriteOwnCompany`) | caught, caught |
| Write: cross-site check removed | caught |
| Query widened with `OR 1 = 1` on the latest-version read | caught |
| Query unbound from the company in the history read, and in the single-version read | caught, caught |
| Stale check removed from the insert | caught |
| Audit entry written even when the insert did nothing | caught |
| Denied write not audited; denied read not audited | caught, caught |
| Confirm allowed without the required answers (form, and JSON) | caught, caught |
| Body size cap removed | caught |
| Content-type check removed | survived at first: the later "unsupported" return gave the same answer. A test now sends an oversized body with an unsupported type and expects 415, not 413, so the body is shown not to be read. Caught after the test was added |
| More than three problems not enforced | caught |
| `no_replace` trigger dropped; `no_replace` ignoring the (company, version) key; `no_update` trigger dropped | caught, caught, caught |
| Seed inserts even when a version exists | caught |
| Page: old versions editable | caught |
| Page: company taken from the URL query | survived at first (no test named another company in the address); a browser test now does so with five parameter names. Caught after the test was added |
| Page: missing-answers notice hidden; stale notice hidden; hidden `based_on` always 0 | caught, caught, caught |

26 breaks, 2 survivors at first, both closed by a test added in response. These show the tests are sensitive to these breaks. They do not show the code is free of defects the author did not think to break.

## After the review-fixes branch

On the review-fixes branch (pull request #8) the factory module has a bounded body reader, a limit of 500 versions per company, form messages for the new refusals, a history capped at 100 versions with a count, and sorted field keys, and migration 0014 makes the table refuse answers that are not a JSON object, a revision number that skips one, a 501st version and a note over 500 characters. A later review of that branch found two holes in the table's rules, both fixed with a test: SQLite's `length()` stops at a NUL, so the note trigger also bounds the note in bytes; and the bytes of `{}` stored as a BLOB passed `json_valid()`, so the answers rule now requires the stored type to be text. The mutation results for these fixes, and a second agent's review of them, are in [modules/platform/VALIDATION.md](../platform/VALIDATION.md) (section "Review-fixes branch").
## What these results do not show

- No independent review has happened. Slice 1's review found a high finding that its author's own mutation table missed; assume the same is possible here, in the append-only triggers and the scope handling in particular.
- Concurrency was tested with a stale `basedOn`, once at a time. Two requests racing inside the Worker were not run in parallel; the guarantee rests on one SQL statement plus a unique key, and SQLite serialises writers.
- The page was run in Chromium only, against a local Worker over plain HTTP, with a synthetic sign-in.
- Accessibility was not checked beyond the browser tests finding fields by their labels. No screen reader was used.
- The questionnaire has not been shown to an owner.
