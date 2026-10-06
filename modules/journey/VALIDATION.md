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

## Corrections after reviews run by agents (5 October 2026, documentation)

Status of this section: draft, 5 October 2026. Not reviewed by a person. It corrects the parts of this file above that the reviews found wrong or out of date, and records what was run in the correction. The text above is kept as it was written.

What the earlier text says and what is so now:

- The first paragraph says no second agent reviewed slice 10. That is out of date. Two agents reviewed the next-step rules (the section above says what they found and what changed), and four agent reviews read the documents of this module. No person has read any of it.
- The record of the run of 86 suites gives `journey/unit/progress` as 22 tests, `journey/integration/facts` as 3 and the baseline reason as "progress logic, its facts reader and the colour contrast check". After commit `f35b835` the counts in `tests/baseline.json` are 36, 7, 8 (`unit/contrast`) and 1 (`browser/journey`), with the reason "slice 10: next-step rules after the independent reviews".
- The description of `tests/unit/progress.test.ts` ("a delivery that waits comes first among the later stages") is incomplete. The rules are now 19 in the order of FR-UX-20 in the functional specification; a waiting delivery comes after the starting number when that can still be recorded. The unit test's header says each rule is tried on the facts of the rule before it; the scratch check in STATUS.md shows the order of rules 9 to 12 is not guarded.
- Slice 7, "Can it fail?" and "What the slice 7 results did not show": the second company's owner is checked on four pages (Decide, Choose, Deliver and Results), not on each stage's page, and the test depends on the wording of labels on eight pages (sign-in, home, operator, Describe, Decide, Choose, Deliver, Results), not seven.
- The documentation check results above (11 of 11 suites, the counts) were true when written. `docs/static/wireframes` still has no entry in `modules/docs/tests/baseline.json`. This breaks the rule in the [regression pack](../../docs/test/REGRESSION-PACK.md) (RP-13, rule 3) that a new suite needs its baseline in the change that adds it, so `--guard` reports "no baseline" for it. The author did not edit that file; the count to record is 3.

What was run in this correction. Same container as above (Linux, 2 cores, Node v22.22.0), on the tree `/home/claude/s9` at `slice-10-interface`, one command at a time, nothing built, no browser, no server, no full suite. Nothing was committed by the author.

| Command | Result |
| --- | --- |
| `node --test modules/docs/tests/static/fsd.test.ts modules/docs/tests/unit/fsd.test.ts modules/docs/tests/static/testdocs.test.ts modules/docs/tests/unit/testdocs.test.ts` | 42 tests, 42 passed |
| `node --test modules/docs/tests/static/wireframes.test.ts` | 3 passed (run on the regenerated `WIREFRAMES.md` and `wireframes.html`) |
| `node --test modules/docs/tests/static/ids.test.ts`, `modules/docs/tests/unit/ids.test.ts` | 1 and 5 passed |
| `node --test modules/docs/tests/static/dictionary-sync.test.ts` | 31 passed (it pins lines 1 to 5 of `STATUS.md`, which were not changed) |
| `node scripts/check-test-docs.mjs` | "623 cases cover 116 requirements, every automated case names a test that exists, the matrix is current" |
| `node --test modules/journey/tests/unit/progress.test.ts`, `modules/journey/tests/unit/contrast.test.ts` | 36 passed and 8 passed |
| `node scripts/check-documentation.mjs` | Failed with 12 problems (7 distinct lines): five links to `LLD.md` (from the functional specification, the high-level design, the API reference, the data dictionary and the test strategy; the file is being written by another agent) and two links in `docs/FINDINGS.md` that have no heading to land on |
| `node --test modules/docs/tests/static/docindex.test.ts`, `modules/docs/tests/static/findings.test.ts` | `docindex`: 7 of 9 passed. Failed: the index row for the functional specification says "Version 0.1" and the document says "Version 0.2"; the table of checks does not name `modules/docs/tests/static/wireframes.test.ts`. `findings`: 6 of 7 passed. Failed: seven findings link to the heading "Not built, and limits" of this module's `STATUS.md` or to "2.2 What the sponsor saw" of `WIREFRAMES.md`, which are now "Not built, and limits of the browser test" and "3.2 What the sponsor saw, in order of importance" |

Who owns those failures. The two documents named in the last row, `docs/DOCUMENTATION-INDEX.md` and `docs/FINDINGS.md`, are written by another agent and were not edited. The two broken links in `FINDINGS.md` point at headings that the author of these documents renamed in commit `6b32db9` (the wireframes were restructured so that the built screens are section 2, and the heading of the module's limits was lengthened); the repair is to change the two links in `FINDINGS.md`, or to give the headings their old names. The five links to `LLD.md` are intended and resolve when that file is added.

The documents changed by this correction (the functional specification, the wireframes and their page, the interface guide, the regression pack, the traceability document and these two files) were read against the code of commit `f35b835` and the four reviews, not run. The wireframes page was regenerated from a script kept outside the repository; the author looked at no page on a screen.

## Property tests of the next-step rules (6 October 2026)

Status of this section: draft, 6 October 2026. Not reviewed by a person. Written and run by one agent (S2 in a ten-agent push) in a Linux container with 2 cores shared with nine other agents, Node v22.22.0, on branch `journey-11-properties` from commit `b741f59`. It changes no source file and no other document.

### What was added

| File | What it is | Tests |
| --- | --- | --- |
| `tests/support/model.ts` | Not a test. The 19 rules of `nextStep` as data in their documented order (`RULES`), the own test of each stage, three seeded generators of facts, the small world for exhaustive checks, and a model of the platform that can only add progress (`WORLD_EVENTS`) | none |
| `tests/unit/properties.test.ts` | Properties on generated facts, on walks and on an owner who follows each step | 27 |
| `tests/unit/properties-exhaustive.test.ts` | The same checks on every combination of a short list of values for each field | 5 |

The recorded counts are in `tests/baseline.json` (`unit/properties` 27, `unit/properties-exhaustive` 5), set with `node scripts/test.mjs unit --only journey/unit/properties,journey/unit/properties-exhaustive --update-baseline --reason ...`. The 36 tests of `progress.test.ts` and the other three suites are unchanged.

How the reference was written: `RULES` and the own tests of the stages are copied from the table in `docs/design/LLD.md` section 4.7, not from `progress.ts`, so that a reordering or a changed condition in the source is a difference between the two. The table was itself written by reading the code (the LLD says so), so a mistake that the code and the table share is not found by these tests. They check the code against the documented rules. They do not check that the documented rules are right for an owner.

### The cases

- Three seeded tiers, 40,000 cases in all: `coherent` (facts the records could produce: counts add up, an engagement needs a signed-off assessment, a milestone is accepted only after a plan, a requirement with an engagement is not withdrawn), seed 20261005, 20,000 cases; `odd` (any combination of the fields, including ones the records cannot make), seed 20261006, 15,000; `wild` (negative and very large counts, up to 40 engagements, readable times from year -271821 to year 9999), seed 20261007, 5,000. A failing property prints the tier, the seed, the index, the time and the facts.
- The generator puts first-acceptance times on the 30, 90 and 180 day edges and one millisecond either side, and moves the clock in 30 per cent of cases.
- The small world: 360 prefixes (4 version states, 5 assessments, 3 values of ideas to ask for, 6 sets of counts) with no engagement and with two kinds, and 18 prefixes with a signed-off assessment tried with each of 1,080 single engagements, each ordered pair of 24 chosen ones and each ordered triple of 8: 40,122 states, all compared with the reference.
- Walks: 1,500 walks of 70 events each (106,500 states). An event is one of 17 things that add progress (save, confirm, make an assessment, decide, sign off, make a request, list a provider, choose one, agree a plan, write down the number, record a delivery, accept, reject, record a payment, record a review, close, let days pass). The model was written from reading the deliver, run and procure modules' rules, not from their pages.
- Button-following: 400 runs in which the owner does what each step asks, providers deliver, the operator lists, and days pass, until the step is `caught_up` with every review recorded, or `new_assessment` or `no_ideas`.
- One canonical chain of 19 facts from nothing to a closed engagement, with the expected key at each step.

### The properties

Totality and the documented key set, stage and page; determinism, with the input frozen so a change of it throws; time enters only through reviews, and a review that is open stays open; the rule that fires is the first whose own condition holds (every rule is reached at least 25 times, and every pair of rules that can hold together is reached, except 20 pairs that no facts can make hold together, listed in the test); `isOwnersTurn` is false for exactly three keys; a closed engagement is never offered a delivery, a plan, closing or "work under way"; a provider is offered only when one is listed; the quiet steps and `caught_up` only when nothing above applies; counts and plurals in titles and lines, and the phrase of each line by the documented order of conditions; the date in "work under way" is the earliest review still to come (a day either way is allowed); all five stages in order, at most one current, current only when it is the owner's turn, never a finished stage after one not started, and the statuses equal to the documented own tests; no raw key, stage id, `undefined`, `null` or `NaN` in any words; the stage never goes back except by the steps the test names; every step that asks something asks for what the platform lets the owner do; following the steps always ends, and never goes round in a circle.

### What was run

| Command | Result |
| --- | --- |
| `node scripts/test.mjs unit --only journey/unit/progress,journey/unit/contrast,journey/unit/properties,journey/unit/properties-exhaustive --guard` | 4 of 4 suites passed: 36, 8, 27 and 5 tests. About 4 and 9 seconds for the two new suites on this machine |
| `TZ=Asia/Kolkata`, `TZ=America/Los_Angeles` and `TZ=Pacific/Kiritimati` with `node --test` on the two new files | 32 passed each |
| `node scripts/test.mjs static --only <every static suite except static/typecheck>` (run again after the last change) | 27 of 27 passed, `static/migrations` among them |
| `/home/claude/bin/heavy node node_modules/typescript/bin/tsc --noEmit` | exit 0, no output, on the tree with the last test change (a first run found one implicit `any` in `tests/support/model.ts`, fixed) |
| `node scripts/test.mjs --check-catalogue` | clean, 97 suites |
| `node scripts/check-documentation.mjs` | passed (49 Markdown files) |

Not run: the integration and browser suites of this module (not touched), a build, the whole guard (the integrator runs it).

### The mutation check

A script kept outside the repository (`mutate.mjs` in the scratch area of the agent, not committed) copies `progress.ts` to a scratch tree, applies one hand-written mutant at a time (swap two rules, drop or flip a guard, `some` for `every`, a comparison turned round, a plural, a status test, a slice length, the wall clock for the given time), and runs the three unit files.

| | Mutants | Killed by the new properties | Killed by the 36 example tests |
| --- | --- | --- | --- |
| Real changes of behaviour | 52 | 52 | 36 |
| Expected to be equivalent | 3 | 0 (survived, as expected) | 0 |

The 16 real mutants that the 36 example tests let through and the properties caught: swapping rules 9 and 10, 10 and 11, 11 and 12 (as the STATUS file said), 12 and the block of rules 13 and 14; `allAccepted` accepting an engagement with no milestone; the own test of Choose forgetting requests without a provider; the own test of Measure wanting two reviews, or counting a closed engagement as reviewed whatever was accepted; the own test of Deliver satisfied by one closed engagement; the line under Deliver counting only `accepted` and not `paid`; "work under way" judging a first acceptance on the raw time; the clock read from the wall and not from the argument; `judge_delivery` needing every engagement and not some; the own test of Describe asking for a saved version and not a confirmed one; the line under Measure forgetting that a closed engagement has no number recorded; the line under Deliver saying "closed before a plan" when only one engagement is closed.

The three that survive are equivalent: for an open engagement `statusOf` is `in_progress` exactly when it is not `planning`; a closed engagement is never `in_progress`, so the `!g.closed` filter before it changes nothing; and the list of due reviews is never empty where its length is compared with 1.

Limits of this check: the mutants were chosen by the same agent that wrote the properties, so the rate is not an independent measure. Only `progress.ts` was changed, not `run/src/state.ts` or `deliver/src/state.ts`. The swap of rules 12 and 13 is caught only by facts that records cannot produce (a request with a listed provider and no request at all), by the `odd` tier; on facts `loadFacts` can build, those two rules never hold together.

### Open findings

1. A first-acceptance time that can be read but lies within 180 days of the last moment a JavaScript date can hold makes `nextStep`, `stageStatuses` and `stageLine("run", ...)` throw `RangeError: Invalid time value`. `readable` in `progress.ts` accepts the time; `reviewSlots` in `modules/run/src/state.ts` (line 35) then calls `toISOString()` on the invalid date. The comment on `readable` says one bad value cannot stop every page. Reproduction, run on 6 October 2026:

   ```
   const g = { planAgreed: true, closed: false, milestones: ["accepted"], baselineRecorded: true, firstAcceptedAt: "+275760-09-12T00:00:00.000Z", reviewsRecorded: [] };
   const facts = { ...NO_FACTS, factory: { latestRevision: 1, confirmedRevision: 1 }, assessment: { items: 1, decided: 1, signedOff: true }, engagements: [g] };
   nextStep(facts, new Date("2026-10-05T10:00:00Z")); // RangeError: Invalid time value
   ```

   Times up to `9999-12-31T23:59:59.999Z`, and as early as `-271821-04-20T00:00:00.000Z`, do not throw. The engagement events are written by the server with `new Date().toISOString()` (`modules/deliver/src/db/engagements.ts`), so a time like this can only come from a changed row. Not fixed, and not in the suite: the `wild` generator uses extreme times that work, and says why in `tests/support/model.ts`. When it is fixed, the extreme time can move into that list. [Likely low severity.]

### Observations that are not failures

- The wording "no `done` stage follows a not-done stage" holds when "not done" means `todo`, which is what the suite asserts. It does not hold when `current` counts as not done: in 3,006 of 20,000 `coherent` cases a finished stage stands after the stage that is the owner's turn, and all of them are `new_assessment` (2,842 cases: Describe current, Decide done) or `ask_for_more` (164 cases: Choose current, Deliver done). The LLD says the current test comes first, and the comment above `done` in `stageStatuses` ("the strip never shows a finished step after one that is not") reads more strongly than the code. The suite asserts exactly those two keys.
- `keep_going` hides `ask_for_more` and `waiting_for_listing` hides it too (LLD 9.9, already recorded). In the 20,000 `coherent` cases, 130 of the 208 that end in `keep_going` have an accepted idea not yet asked for. The share is that of the generator, not a frequency in use.
- Read, not run: the facts carry no count of deliveries, and `nextKinds` in `modules/deliver/src/state.ts` says a milestone rejected at `MAX_DELIVERIES` can only be followed by closing the engagement. `nextStep` has no way to offer that: such an engagement gets `keep_going`, "Nothing needs you today". [Likely, low.] The model of the platform in the tests has no cap, so no property sees it.
- Rules 9 to 12 are now guarded: the swaps of 9 and 10, 10 and 11, 11 and 12 that STATUS.md reports as unguarded are killed by `unit/properties` and `unit/properties-exhaustive`.

### What these results do not show

- No property failed on the real code except the one in finding 1, which is kept out of the suite. A pass says the code agrees with the documented rules on these facts; it does not say the rules suit an owner, and it promotes no acceptance case of the BRD.
- The generators and the model of the platform are the agent's, from reading code. Sampling can miss a combination; the small world is small (it fixes the version numbers, the assessment sizes and the counts to a few values).
- The clock is fixed in 70 per cent of the cases. `reviewSlots` of the run module is used as it is; its edges are tested in the run module, and the generator only puts first acceptances on them.
- No database, page or browser is involved, so nothing here tests `loadFacts` or what a page draws.
- Everything is SYNTHETIC input.

## Wave 2, slice 12c: what was run on the journey rules (6 October 2026)

Branch `slice-12c-decide-journey`, run by the agent that wrote it, on 6 October 2026, on a shared two-core machine. Not reviewed by a person. The rule changes are described in [STATUS.md](STATUS.md), "Wave 2, slice 12c".

### Run, with results

- `node --test modules/journey/tests/unit/progress.test.ts`: 41 passed, 0 failed (36 before; five tests added for S3-01, S3-07, S3-08, S5-07 and the extreme time).
- `node --test modules/journey/tests/unit/properties.test.ts`: 27 passed, 0 failed.
- `node --test modules/journey/tests/unit/properties-exhaustive.test.ts`: 5 passed, 0 failed (the small world is now 504 prefixes; the early world 1,512 states).
- `node --test modules/journey/tests/unit/contrast.test.ts`: 8 passed, 0 failed, with `--muted-tint` on `--brand-tint` (text, 4.5 to 1) and `--edge-tint` on `--brand-tint` (edge, 3 to 1) added to the pairs in the three colour sets.
- `node scripts/test.mjs integration --only journey/integration/facts` (through the shared queue): 9 passed (7 before). A first run failed one test, "a company reads only its own facts", because `loadFacts` returned `requirementsWithdrawn: 0` and `NO_FACTS` did not have it; `NO_FACTS` now has it, and the second run passed. The two S3-01 tests build the real state through the real handlers and assert the step the owner is shown: after "No idea is left to ask for" (`new_assessment`, `/factory`), after a draft newer version (still `new_assessment`), after the newer version is confirmed (`diagnose`, "Get your ranked ideas", `/diagnose`, Decide current), after the newer assessment is made (`decide`, the newer assessment counted, `newerVersion` false), during the decisions (`decide`, then `sign_off`) and after the sign-off (`make_requirement`, Decide done). The old test "with a newer assessment not yet signed off..." built no work in progress; it now builds an open request from the signed-off assessment and asserts that the owner is shown `waiting_for_listing` and that the signed-off assessment counts.
- `node scripts/test.mjs browser --only journey/browser/journey` (with the diagnose browser suites, after `pnpm build`): 1 passed. Its sign-off date pattern now reads "6 October 2026" (`formatDate` on the Decide page).
- `pnpm typecheck`: exit 0.

### The extreme-date finding (finding 1 above) is fixed

`readable()` in `src/progress.ts` treats a first-acceptance time later than 8.64e15 ms less 180 days as unreadable. `+275760-09-12T00:00:00.000Z` and the edge `+275760-03-17T00:00:00.000Z` (still readable: its last review date is the last moment a date can hold) are in `EXTREME_TIMES`, so the `wild` tier now uses them, and a unit test calls `nextStep`, `stageStatuses` and `stageLine("run")` on two such times. `modules/run` is unchanged.

### The mutation check, again

The wave-1 script (`mutate.mjs`, kept outside the repository) was copied and pointed at this branch, with three changes: the line-number swaps find their blocks by their anchor text (the code moved), four mutants whose text this slice changed were rewritten to the same mutation of the new text (M05, M15, M36, M51), and six mutants of the new code were added (W01 to W06). To spare the shared machine it ran `progress.test.ts` and `properties.test.ts` for each mutant but not `properties-exhaustive.test.ts`, so the kill rate below is a lower bound for the property tests.

- 58 real mutants. 57 are killed by `properties.test.ts`; the one that survives it, W06 ("waiting for a listing" always says there is nothing to do), changes only words, and `progress.test.ts` kills it. Every one of the 58 is killed by at least one of the two files. The three expected-equivalent mutants (E1 to E3) survive, as in wave 1.
- Not run: the exhaustive file on each mutant.

### What these results do not show

- The rules were changed by an agent from two review findings and a walkthrough. No owner has seen the new steps, and the wider rule 3 has not been read by a person.
- `stageProgress` is not used by any page yet (the pages that draw the strip and the home list are not this slice's), so S5-07 is not visible on a page.
- No acceptance case of the BRD is promoted. Everything is SYNTHETIC input.
