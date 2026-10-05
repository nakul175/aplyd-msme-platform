# Journey module: status

Owner: the journey module. Paths: `modules/journey/` only. It adds no code to the application and no page: it is one browser test and its documents. Last updated 5 October 2026.

This is slice 7, stacked on the review-fixes branch (pull request #8). Each stage of the platform (Describe, Diagnose, Procure, Deploy, Run) has its own browser test, and each of those sets up the stage before it by sending what the forms send. None of them starts from the previous stage's real output. This test does: one owner, in one browser, goes from the home page through every stage using only the pages' own links, fields and buttons, with the operator doing the operator's part on the operator's own page in a second browser context. It fails when a field is renamed on one page and not on the one that reads it, when a stage cannot be reached from the home page, or when what one stage records is not what the next stage offers.

## What the test does

1. The operator signs in, sets one fee, adds a provider that serves the first idea in the first cluster, and lists it.
2. The owner signs in and opens Describe from the home page, saves a new version and confirms it as accurate.
3. From the home page, the owner makes an assessment from that version, accepts each of the five ideas and signs the assessment off.
4. From the home page, the owner makes a requirement for the first idea in the first cluster and sees that the provider the operator listed is offered for it.
5. The owner chooses that provider, adds one milestone with the test they will check it by and a price, and agrees the plan.
6. On the results page, the owner records the starting number before anything is accepted.
7. On the delivery page, the owner records that the milestone was delivered and accepts it; the results page then says when the first accepted milestone was and the days on which the 30, 90 and 180 day reviews open, and offers none of them.
8. Along the way: no page error, console error or failed request; the listing fee is on none of the owner's pages (D-03); and a second company's owner, on every stage's page, sees none of the first owner's provider, plan, number or note.

Everything is SYNTHETIC: the synthetic users, the synthetic library, a placeholder fee, placeholder prices and numbers typed by the test.

## Not built, and limits

1. One path through the stages. It does not cover refusals, withdrawals, rejected deliveries, payments, closing an engagement or a review: those are in each stage's own tests. A review cannot be recorded in this test, because it opens 30 days after the first acceptance, and the real pages offer no way to move the application's clock (the run module's browser test dates an earlier acceptance directly in the database to reach one).
2. The path starts from the seeded company, which already has a confirmed description (version 1), so Describe is a second version, not a first one. The first-description path is in the factory module's own test.
3. The owner accepts every idea. The test does not check that the ranking is sensible or that it changes when the answers change: the diagnose module's tests do.
4. It runs in Chromium only, against a local Worker, with a synthetic sign-in, like every browser test here. It says nothing about a phone, a slow connection, another browser, or a real owner reading the pages. It is not the ten-owner test (docs/ten-owner-test.md), which needs people.
5. It depends on the wording of labels and buttons on seven pages, as every browser test does: a changed label fails it, which is how it is meant to notice a rename, and also what makes it brittle. It takes 10 to 30 seconds on this machine.
6. The timeout is 170 seconds for the journey. On a slow or busy machine it can fail for time and not for a defect; run it again alone before treating it as a regression.

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
