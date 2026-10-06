# Journey module: status

Owner: the journey module. Paths: `modules/journey/` only. It adds no code to the application and no page: it is one browser test and its documents. Last updated 5 October 2026.

This is slice 7, stacked on the review-fixes branch (pull request #8). Each stage of the platform (Describe, Diagnose, Procure, Deploy, Run) has its own browser test, and each of those sets up the stage before it by sending what the forms send. None of them starts from the previous stage's real output. This test does: one owner, in one browser, goes from the home page through every stage using only the pages' own links, fields and buttons, with the operator doing the operator's part on the operator's own page in a second browser context. It fails when a field is renamed on one page and not on the one that reads it, when a stage cannot be reached from the home page, or when what one stage records is not what the next stage offers.

Status of this document: draft, 5 October 2026. Not reviewed by a person. Lines 1 to 5 above are slice 7 as it was first written. A documentation test pins them (`docs/static/dictionary-sync`), so they are not changed here, and they are no longer the whole story: slice 10 gave this module code of its own. Read from here on for what the module holds now.

## What the module holds now

The module still has no page. The pages in `app/` use it: `app/page.tsx` (the home page), `app/_ui/parts.tsx` (the five-step strip and the "Your next step" card) and `app/diagnose/page.tsx` (the step named after a sign-off). Nothing it works out is stored: each page works it out again from the company's records.

| File | What it is | Tests |
| --- | --- | --- |
| `src/progress.ts` (199 lines) | Pure functions. `nextStep` names the one step that is the owner's turn, by 13 rules taken in a fixed order. `stageStatuses` marks each of the five stages done, your turn or not yet. `stageLine` gives the line under each stage. `STAGES` holds the five stages, with the one word for the strip (Describe, Decide, Choose, Deliver, Measure) and the page's own name | `tests/unit/progress.test.ts`: 22 |
| `src/facts.ts` (53 lines) | `loadFacts(db, companyId)` reads the facts `progress.ts` needs by calling the other modules' own read functions, for the company id of the signed-in owner. It writes nothing and holds no query of its own | `tests/integration/facts.test.ts`: 3 |
| The contrast guard, `tests/unit/contrast.test.ts` | Reads the colour tokens in `app/globals.css` and measures them: 34 text-on-ground pairs at 4.5 to 1 and 6 border and state-mark pairs at 3 to 1, each in three sets of tokens (light, dark chosen by the person, dark chosen by the system), and checks that the two dark sets are the same colours | 8 (four test blocks; one loop runs three times) |
| `tests/browser/journey.test.ts` | The slice 7 browser test, kept and brought up to date with the redesigned pages (below) | 1 |

The counts are the ones in `tests/baseline.json`, dated 2026-10-05, reason "slice 10: progress logic, its facts reader and the colour contrast check". The rules are written out, one by one, under FR-UX-20 in the [functional specification](../../docs/fsd/FSD.md).

## What the browser test does

1. The operator signs in, sets one fee, adds a provider that serves the first idea in the first cluster, and lists it, on the operator's page in a second browser context.
2. The owner signs in and opens Describe from the home page, saves a new version and confirms it as accurate.
3. Going back to the home page between stages and clicking the stage's link there, the owner makes an assessment from that version, accepts each of the five ideas and signs the assessment off.
4. The owner makes a requirement for the first idea in the first cluster and sees the provider the operator listed offered for it.
5. The owner chooses that provider, adds one milestone with the test they will check it by and a price, and agrees the plan.
6. On Results, the owner records the starting number before anything is accepted.
7. On Delivery, the owner records that the milestone was delivered and accepts it. Results then says when the first accepted milestone was and the days on which the 30, 90 and 180 day reviews open, and offers none of them.
8. Along the way: no page error, console error or failed request; the listing fee is on none of the owner's pages (D-03); and a second company's owner, on each stage's page, sees none of the first owner's provider, plan, number or note.

Everything is SYNTHETIC. The test does not follow a page's own next-step button, and it does not read the five-step strip or the "Your next step" card. Its name says "no stage's page is a dead end"; it checks less than that.

## What is verified

Everything here is dated 5 October 2026. The first item was reported to the author of this document by the agent that ran it. The author did not run it. The second item is what this documentation branch ran.

- The full run `node scripts/test.mjs pr --guard` on the branch `slice-10-interface` ran 86 suites. All the unit, integration, smoke and browser suites passed, among them the 22, 3, 8 and 1 tests above. The only failures were documentation checks for documents that had not been written yet (since fixed, or being written on the documentation branches). [VALIDATION.md](VALIDATION.md) has the detail and the limits.
- A fault found along the way: the data-dictionary check pins lines of the module STATUS files by number, and the numbers had moved when three of those files were edited (the deliver, diagnose and procure files). The pins were corrected in commit 21fd329. The pin on line 5 of this file is the reason lines 1 to 5 stay as they are.
- The documentation checks run on the documentation branch are in [VALIDATION.md](VALIDATION.md).

## What is not verified

- No owner of a factory has used the interface. No claim that it is clear, plain or easy has been tested. The eight-in-ten bar in the BRD (BR-UX-01) is untried.
- No screen reader has been used on it. No real phone or other device has been used. The only automated browser is desktop Chromium. The documentation written on 5 October 2026 (the [wireframes](../../docs/design/WIREFRAMES.md) and the functional specification) was made from a capture of each page's structure and text and from the source; its author looked at no page on a screen, at a phone width or any other.
- No font file is shipped. The text uses the system stack named in `--font` in `app/globals.css`, which names "Noto Sans Devanagari" but depends on the device having it. The interface has no Hindi text (BR-UX-04).
- The design is a first version. Whether the strip, the next-step card and the home page help an owner find their way is not known.
- The contrast guard measures only the pairs it lists. A new pairing on a page is not found by it. The page-local style files hold no hex, `rgb(` or `hsl(` colour of their own (a search of `app/*/*.css` on 5 October 2026 found none), so what they colour comes from the tokens; the guard's list of pairs is written by hand, and it does not read which pairs the page files make.
- The test was never shown able to fail. A break needs a rebuild, and no break was run for slice 10.

## Known follow-ups

These are in the code today, read on 5 October 2026. None changes what a person sees.

1. The vertical list of steps with a line between them is written twice, as `.dl-steps` in `app/deliver/deliver.css` and `.ru-reviews` in `app/run/run.css`. The figure tile is written twice, as `.ru-stat` in `app/run/run.css` and `.op-stat` in `app/operator/operator.css`. A shared rule in `app/globals.css` would replace each pair.
2. `.question + .question` is given a margin in `app/globals.css` and set back to 0 in four page files (`app/deliver/deliver.css`, `app/factory/factory.css`, `app/operator/operator.css`, `app/run/run.css`).
3. A date that must not break over two lines has its own class on six pages (`.op-nw`, `.pr-nw`, `.ru-nw`, `.fc-date`, `.dg-date`, `.dl-when`). One shared class would do.
4. Each page has its own style file, `app/<page>/<page>.css`, for what `app/globals.css` does not hold. Items 1 to 3 are the parts of those files that repeat one another.

## Things this module's rules do that disagree with a page

Found by reading the code on 5 October 2026, not by running it. They are in the functional specification (section 12, items 25 and 26). Both were corrected the same day in `progress.ts` (see "Next-step rules after the independent reviews" below): an assessment with no ideas now gives the rule `no_ideas`, and a closed engagement no longer counts as a delivery waiting. The two lines below say what the code did before that correction, and are kept so the functional specification's items can be traced.

- An assessment with no ideas counts as fully decided, so the rule `sign_off` fires and the home page offers "Sign off", while the Diagnose page disables the button and refuses the sign-off.
- The rule `judge_delivery` looks at every engagement, closed or not. The Delivery page counts only open ones. A closed engagement with a delivered milestone that nobody decided would make the home page say a delivery is waiting when the Delivery page has nothing to decide.

## Not built, and limits of the browser test

1. One path through the stages. It does not cover refusals, withdrawals, rejected deliveries, payments, closing an engagement or a review: those are in each stage's own tests. A review cannot be recorded in this test, because it opens 30 days after the first acceptance, and the real pages offer no way to move the application's clock (the run module's browser test dates an earlier acceptance directly in the database to reach one).
2. The path starts from the seeded company, which already has a confirmed description (version 1), so Describe is a second version, not a first one. The first-description path is in the factory module's own test.
3. The owner accepts every idea. The test does not check that the ranking is sensible or that it changes when the answers change: the diagnose module's tests do.
4. It runs in Chromium only, against a local Worker, with a synthetic sign-in, like every browser test here. It is not the ten-owner test (docs/ten-owner-test.md), which needs people.
5. It depends on the wording of labels and buttons on seven pages: a changed label fails it, which is how it notices a rename, and also what makes it brittle.
6. Its timeout is 170 seconds. On a slow or busy machine it can fail for time and not for a defect; run it alone before treating a failure as a regression.

## Next-step rules after the independent reviews (5 October 2026)

Two agent reviewers (an interface review and a logic review of the rule order) found defects in `nextStep` and `stageStatuses` in `modules/journey/src/progress.ts`; this change fixes them. What changed, in the order the rules now run:

1. `describe`, `confirm`, `diagnose` as before; `no_ideas` is new (a description for which the fixed rules suggest nothing is sent back to Describe, not to sign-off).
2. `decide` and `sign_off` as before.
3. `record_baseline` is asked for before `judge_delivery` when a delivery is waiting and the starting number is not written down, because accepting first loses the number for good. Closed engagements no longer count as a delivery waiting, nor as one that can still take a starting number.
4. `judge_delivery`, `review_due`, `agree_plan`, `record_baseline`, `choose_provider` (only when at least one provider is listed), `make_requirement` (only when an accepted idea has no request; otherwise `new_assessment`), `close_engagement` (new), `keep_going`, `waiting_for_listing` (new), `ask_for_more` (new), `caught_up`.
5. `keep_going`, `waiting_for_listing` and `caught_up` are not the owner's turn (`isOwnersTurn`): no stage is marked current for them and pages other than their own do not repeat them.
6. A stage is shown as done only when every stage before it is (`stageStatuses`), and the lines under the stages no longer contradict the records (a newer draft, a closed engagement, plural forms).

`Facts` gained `confirmedRevision`, `ideasToAsk` and `requirementsToChoose`; `facts.ts` reads them through the diagnose and procure modules' own reads.

Not fixed here, recorded as follow-up: the Run page (`modules/run`, outside this module) still offers a starting number for a closed engagement; the Deliver page does not warn beside "Accept" that accepting ends the chance to record a starting number.

## Corrections to this file after reviews run by agents (5 October 2026, documentation)

Status of this section: draft, 5 October 2026. Not reviewed by a person. Four reviews run by agents (a fact-check of the functional specification, a review of the wireframes, the interface guide and this module's documents, an interface review and a logic review of the next-step rules) were read by the author of these documents, who then corrected them against the code of commit `f35b835`. The text above is kept as it was written. Where it disagrees with this section, this section is right for that commit, and the section just above it is the code author's own account of the rule changes.

| What the earlier text says | What is so now |
| --- | --- |
| `src/progress.ts` is 199 lines and `nextStep` has 13 rules; `tests/unit/progress.test.ts` holds 22 tests | `progress.ts` is 270 lines (`wc -l`). `nextStep` has 19 rules and 18 keys (`record_baseline` is two rules: one before a waiting delivery is judged, one after). The unit test holds 36 tests; the author ran that file on 5 October 2026 and 36 passed |
| `src/facts.ts` is 53 lines; `tests/integration/facts.test.ts` holds 3 tests | `facts.ts` is 70 lines. The integration test holds 7 tests (`tests/baseline.json`); the author did not run that suite |
| Step 8 of the browser test: a second company's owner is checked "on each stage's page" | The test visits four pages as the second owner: Decide, Choose, Deliver and Results. Describe is not one of them. It looks for the provider's name, the milestone text, the note and "Starting number: 42" |
| Limit 5: the test depends on the wording of labels and buttons "on seven pages" | Eight pages: sign-in, home, operator, Describe, Decide, Choose, Deliver and Results |
| The strip and the home page mark one stage as the owner's turn | Not always. For `keep_going`, `waiting_for_listing` and `caught_up` the step says nothing is needed from the owner, so no stage is marked, and a page other than the home page does not repeat the step. A stage is done only when every stage before it is done |
| "Things this module's rules do that disagree with a page" (two items) | Both are corrected in `progress.ts`; the functional specification marks items 25 and 26 of its section 12.1 as corrected on 5 October 2026 |

The header of `tests/unit/progress.test.ts` says each rule is also tried on the facts of the rule before it, so that a change of order fails. That is not so for every pair. On scratch copies of `progress.ts` outside the repository, one pair of neighbouring rules was swapped at a time for rules 7 to 19 and the 36 tests were run on each copy. Swapping rules 7 and 8, 8 and 9, 15 and 16, 16 and 17, 17 and 18, or 18 and 19 made one test fail. Swapping rules 9 and 10, 10 and 11, or 11 and 12 left all 36 passing, and each of those swaps can change the answer. The swaps of rule 12 with rules 13 and 14, and of rules 13 and 14 with rule 15, left all 36 passing because no facts make both rules fire. Swaps among rules 1 to 6 were not tried. So the order of rules 9 to 12 is not guarded by any test.

Open, read from the code on 5 October 2026 and recorded in the functional specification, section 12.1, items 27 to 41. None is fixed here:

- The Results page offers the starting-number form for an engagement with no agreed plan, or one closed before anything was accepted, while the home page no longer asks for the number then (item 27, in `modules/run`).
- Beside "Accept milestone N" the Delivery page does not say that accepting the first milestone ends the chance to record a starting number (item 28). Its help line says "it can then be delivered again" even after the last delivery that can be recorded (item 30).
- Procure keeps saying "The next step is the plan, on the delivery page." after the plan is agreed (item 29), and its bar counts a withdrawn request as asked for (item 31).
- The home page's "The next review opens on (date)" gives the UTC date, which can be a day early for a reader in India (item 32).
- The edge of a control on a tinted card in the dark colours is 2.54 to 1 by calculation, and the contrast guard does not list that pair (item 33). `color-mix` has no plain value before it in most places (item 34).
- The mark of a notice is generated text that a screen reader may read (item 35). The operator's table on a phone may lose its table meaning (item 36). Every idea's decision group has the same legend (item 37).
- The home page reads the facts with no guard, so a failure stops it, while `Page` opens a stage page without the strip (item 38). In the strip "your turn" is a colour and a ring, with words only for a screen reader (item 39).
- The check in the demonstration walk that another company's data is on none of a person's pages is case-sensitive, and a label drawn in capitals would escape it (item 40).
- Every page has the same browser title (item 12). A crafted `?saved=` value makes Describe say a version was saved (item 5). "Review N is open" does not name the engagement, and the home page's line for Decide names the counted assessment, not the newest (item 41).

What was run for this correction is in [VALIDATION.md](VALIDATION.md). The author looked at no page on a screen.

## Wave 2, slice 12c: the journey rules after the wave-1 reviews (6 October 2026)

Author: an agent (branch `slice-12c-decide-journey`). No person has reviewed it. Code changed: `src/facts.ts`, `src/progress.ts`; tests: `tests/support/model.ts`, the unit, property and integration tests. No page of this module, no migration, no package.

- **S3-01, fixed.** `loadFacts` used to count the newest signed-off assessment whenever one existed, so after "No idea is left to ask for" the home page kept saying "Update your description" even once a newer version was confirmed and a newer assessment was being decided on. Now the newest assessment counts unless an older one is signed off and some work is still open (a requirement with no provider chosen, or an engagement not closed); then the signed-off one counts, as before. "Open" is any open requirement or engagement of the company, not only those of the signed-off assessment: stricter than the review's suggestion, so a delivery waiting is never hidden behind decisions on a newer assessment. `Facts.assessment.newerVersion` (optional, absent counts as false) is true when a newer confirmed version exists than the one the counted assessment was made from. Rule 3 (`diagnose`, "Get your ranked ideas") now also fires when `newerVersion` is true and the assessment either has no idea (the old rule 4, `no_ideas`) or is signed off with nothing left from it (the old rule 14, `new_assessment`). The rule numbers and their order did not change; rule 3's condition is wider. The diagnose module's `afterSignOff` already returns nothing for a Diagnose step, so the signed-off page then shows its own "Make an assessment from version N" form.
- **S5-07, partly.** `stageProgress(facts, now)` (new, exported with the type `StageProgress`) returns the statuses of `stageStatuses` except that Measure is `"started"` in place of `"todo"` once a starting number or a review is recorded. `stageStatuses` and `StageStatus` are unchanged, because `app/_ui/parts.tsx` and `app/page.tsx` hold a `Record<StageStatus, ...>` that a new value would break; those pages are not this slice's. Until they call `stageProgress` and give "started" a word, the strip still says "not started" (see "Needs another owner" in the slice report).
- **S3-07, fixed.** `waiting_for_listing` says "While you wait, you can ask for N more ideas you said yes to." when `ideasToAsk > 0`, and "There is nothing for you to do until then." only when it is 0. The rule order is unchanged.
- **S3-08, fixed.** `Facts.requirementsWithdrawn` (optional, absent counts as zero) carries the number of withdrawn requirements. The line under Choose says "Nothing asked for now. N request(s) was/were taken back." when nothing is open and some were withdrawn.
- **Extreme first-acceptance time, fixed.** `readable()` treats a time later than the last moment a JavaScript date can hold, less the last review day (180), as unreadable, so `nextStep`, `stageStatuses` and `stageLine("run")` no longer throw on it. `modules/run` was not changed. The time and one on the edge are now in `EXTREME_TIMES`.
- **The documented rules changed with the code**, in the same commit: `RULES` rule 3 and the line pattern under Choose in `tests/support/model.ts`, the model's `readableTime`, the generators (they now produce `newerVersion` and `requirementsWithdrawn`), the small world (504 prefixes instead of 360: two assessments made from an older version were added; the late prefixes stay 18), and the list of rule pairs no facts make true together ("3/4" and "3/6" left it). docs/design/LLD.md 4.7 still states the old rule 3, waiting_for_listing and stageLine texts; the slice report lists the change for its owner.
