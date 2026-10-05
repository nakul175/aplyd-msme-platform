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
