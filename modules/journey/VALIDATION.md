# Journey module: validation

Status of this document: draft, 5 October 2026. Not reviewed by a person. No review of slice 10's code by a person or by a second agent was reported to the author of this document.

This file has three parts: what was run for slice 10 and by whom, what was run on the documentation branch, and the earlier record for slice 7, kept as it was written with its date and limits.

## Slice 10: the progress logic, the facts reader and the contrast guard

Source of this part: the request that asked for this document, which reported the run. The author did not run these. Their environment (Node and browser versions) was not given.

| What | Result |
| --- | --- |
| Command | `node scripts/test.mjs pr --guard` |
| Branch and date | `slice-10-interface`, 5 October 2026 |
| Suites run | 86 |
| Passed | Every unit, integration, smoke and browser suite, among them `journey/unit/progress` (22 tests), `journey/integration/facts` (3), `journey/unit/contrast` (8) and `journey/browser/journey` (1) |
| Failed | Only documentation checks for documents that had not been written yet (since fixed, or being written on the documentation branches). The checks that cover this branch are re-run below |
| Recorded counts | `tests/baseline.json`, dated 2026-10-05, reason "slice 10: progress logic, its facts reader and the colour contrast check": `browser/journey` 1, `integration/facts` 3, `unit/contrast` 8, `unit/progress` 22. The runner writes a count only when the suite passed ([regression pack](../../docs/test/REGRESSION-PACK.md), RP-13) |

What each of the new tests looks at, read in the files on 5 October 2026:

- `tests/unit/progress.test.ts` builds facts by hand and checks `nextStep`, `stageStatuses` and `stageLine`: the first rule that fits wins; earlier stages come before work in progress; a delivery that waits comes first among the later stages; a review that is due is the owner's turn; exactly one stage is the owner's turn unless the owner is up to date; a strip word never contains the name of a page's link. It does not draw a page.
- `tests/integration/facts.test.ts` reads the facts from a real local database (Miniflare's D1, the real migrations, the synthetic seed) after an owner has taken each step through the real handlers, from a confirmed description to an accepted milestone. It checks that the next step follows the records, that another company's facts are its own, and that a newer unsigned assessment does not hide an older signed-off one. It does not draw a page.
- `tests/unit/contrast.test.ts` reads the colour tokens from `app/globals.css` and measures 34 text-on-ground pairs at 4.5 to 1 and 6 border and state-mark pairs at 3 to 1, in the light set and in both dark sets, and checks the two dark sets agree. It measures the pairs written in the test, no others.
- `tests/browser/journey.test.ts` is the slice 7 test (below), updated for the redesigned pages.

## What was run on the documentation branch

Branch `docs-10-screens`, 5 October 2026, in a Linux container with 2 cores and about 8 GB of memory, Node v22.22.0. Nothing was built, no browser was started, and the full suite was not run: these are documentation checks only, one command at a time.

| Command | Result |
| --- | --- |
| `node scripts/test.mjs static unit --only docs/static/fsd,docs/unit/fsd,docs/static/api-sync,docs/static/testdocs,docs/unit/testdocs,docs/static/dictionary-sync,docs/static/ids,docs/unit/ids,static/traceability,static/test-docs,docs/static/wireframes` | 11 of 11 suites passed. Tests passed: `docs/static/api-sync` 21, `docs/static/dictionary-sync` 31, `docs/static/fsd` 3, `docs/static/ids` 1, `docs/static/testdocs` 14, `docs/static/wireframes` 3, `docs/unit/fsd` 4, `docs/unit/ids` 4, `docs/unit/testdocs` 21. `static/traceability` and `static/test-docs` are command suites and pass or fail without a count |
| `node scripts/test.mjs static --only static/documentation` | Failed, with 14 problems (12 lines are printed, because the checker prints a repeated problem once). Every one is a link, from a document on this branch, to `docs/design/LLD.md`, `docs/GLOSSARY.md` or `docs/DOCUMENTATION-INDEX.md`. Other agents are writing those three files, and they are not on this branch. No other problem was reported |
| `node scripts/test.mjs --check-catalogue` | "Test catalogue clean: 87 suites in 5 layers" |
| `node scripts/check-test-docs.mjs` | "623 cases cover 116 requirements, every automated case names a test that exists, the matrix is current" |

The suite `docs/static/wireframes` (file `modules/docs/tests/static/wireframes.test.ts`, 3 tests) is new on this branch. It checks that `docs/design/wireframes.html` needs nothing from outside, has an anchor for every screen the functional specification defines, and that every link inside it lands. It was shown able to fail: a script element added to the page failed one test, the anchor `scr-06` renamed failed two, and the file was put back (`git status` shows no change to it). Its count is not yet in `modules/docs/tests/baseline.json`, which this work did not edit, so `--guard` will report "no baseline" for it until 3 is recorded.

The documents changed on this branch were read against the code, not run: the screens, the messages, the next-step rules and the wireframes were checked by reading the pages' source and a capture of the pages' structure and text that someone else made on 5 October 2026 from the running application on synthetic data. The author looked at no page on a screen. That is reading. It is not a test of the application.

## What these results do not show

- No owner of a factory has used the interface. A pass of any test here says nothing about whether a page is clear or plain, whether an owner finds the next step, or whether the ideas are right.
- No screen reader, no real phone and no browser other than desktop Chromium have been used. The author of this documentation looked at no page at a phone width, so nothing here says how a page looks on a phone.
- The progress rules are tested against facts built by hand and, in three tests, against a local database. The two disagreements with the pages recorded in [STATUS.md](STATUS.md) were found by reading the code and have no test.
- No test reads the five-step strip, the card "Your next step" or the first block of the home page. The journey test clicks the stage's link on the home page and nothing else there.
- The journey test name says "no stage's page is a dead end". It does not follow a page's own next-step button, so it does not check that.
- The contrast guard cannot see a colour that is not a six-digit hex value in `app/globals.css`, and cannot see a new pairing of text and ground until someone adds it to the list.
- Whether the tests can fail has not been shown for slice 10: no break was run (see the slice 7 record, "Can it fail?").
- No hosted environment was used: the Worker is local and the database is Miniflare's.

## Earlier record: slice 7 (the browser test as first written)

Kept as written on 5 October 2026 when the test was added. The pages have since been redesigned, and the test was updated to follow them; this record describes the first version.

Environment: a Linux container, Node v22.22.0, pnpm 11.25.0, Chromium 141 through `playwright-core` 1.56.1, 5 October 2026. The agent that wrote the test ran it. No separate agent has reviewed this slice, and no person has.

### Results

Built with `pnpm build`. The journey test alone, `node scripts/test.mjs browser --only journey/browser/journey`: **1 passed, 27 seconds**, on its first run (a test that passes first time has not yet been shown able to fail: see below).

The full run, `pnpm build` then `node scripts/test.mjs pr --update-baseline` on this tree (the review-fixes branch plus this test): **54 of 54 suites passed**, with the baselines recorded through the runner and no count lower than before. The first full run on the tree failed one suite, `factory/browser/describe` (an empty-draft test that still expected a 400 from a form post the review-fixes branch now answers with a redirect and a message); the test was brought up to date on the review-fixes branch and the whole run was repeated from the start. This test's own counts: `journey/browser/journey` 1 passed (11.9 s in the full run, 27 s alone the first time).

### Can it fail?

It has not been shown to. A mutation of a page needs a rebuild for each break (about two minutes), and none was run for this slice before its pull request. What the test asserts, so what a break would have to change to be seen: a new version saved and confirmed; five ideas decided and a sign-off with a date; the operator's provider named under the requirement; the plan's provider named on the delivery page; the starting number shown after it is recorded; the 30, 90 and 180 day dates after an acceptance, and no review form offered; the fee on none of the owner's pages; no page, console or request error; and none of the first owner's provider, milestone text, number or note on any stage's page for a second company's owner. Each of the eight is a plausible way for one stage to stop handing over to the next. This is an argument, not a measurement: treat the test as unproven against a real break until someone runs the mutations.

### What the slice 7 results did not show

- One path, one browser, one synthetic company, and the seeded company's description is already confirmed (see STATUS limits 1 and 2). A pass says the stages hand over to each other on that path; it does not say the path is the one a real owner takes, that the pages are understandable, or that the ideas are right.
- The test was written by the agent that wrote the pages' neighbours and then run; nobody else has read it.
- It cannot record a review, because a review opens 30 days after the first acceptance and the pages have no way to move the clock. Reviews are tested in the run module, where the database is given an acceptance dated in the past.
- The test is long and depends on the wording of labels on seven pages; a change of wording fails it. It also takes the harness's whole 170-second allowance on a very slow machine.
- No hosted environment was used: the Worker is local and the database is Miniflare's.

## Next-step rules after the independent reviews (5 October 2026)

The agent that changed the rules ran, on the rebuilt application (`pnpm build`): `npx tsc --noEmit` (no errors); `journey/unit/progress` 36 passed (was 22), `journey/unit/contrast` 8 passed, `diagnose/unit/progress` 7 passed, `diagnose/unit/not-owner` 1 passed; `journey/integration/facts` 7 passed (was 3; new scenarios: baseline before judging a delivery, two milestones to close, a closed engagement, a signed-off company that accepted nothing, a withdrawn request, a request with no listed provider, a newer draft); `diagnose/integration/diagnose-api` 34 passed; browser suites `journey`, `diagnose`, `demo/walk`, `deliver`, `factory/describe`, `platform/pages`, `platform/session-and-scope`, `procure`, `run` all passed; every smoke suite (8) passed. Baselines in `modules/journey/tests/baseline.json` were raised to match. The full `pr --guard` run has not been repeated since this change.

Limits: both reviewers were agents and no person has read the change. The rules were checked against synthetic records only. The unit tests assert the rule order the reviewers described; they do not show that an owner finds the order natural. Two defects found by the logic review sit outside this module and are not fixed (see STATUS).
