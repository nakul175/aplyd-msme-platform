# Journey module: validation

Environment: a Linux container, Node v22.22.0, pnpm 11.25.0, Chromium 141 through `playwright-core` 1.56.1, 5 October 2026. The agent that wrote the test ran it. No separate agent has reviewed this slice, and no person has.

## Results

Built with `pnpm build`. The journey test alone, `node scripts/test.mjs browser --only journey/browser/journey`: **1 passed, 27 seconds**, on its first run (a test that passes first time has not yet been shown able to fail: see below).

The full run, `pnpm build` then `node scripts/test.mjs pr --update-baseline` on this tree (the review-fixes branch plus this test): **54 of 54 suites passed**, with the baselines recorded through the runner and no count lower than before. The first full run on the tree failed one suite, `factory/browser/describe` (an empty-draft test that still expected a 400 from a form post the review-fixes branch now answers with a redirect and a message); the test was brought up to date on the review-fixes branch and the whole run was repeated from the start. This test's own counts: `journey/browser/journey` 1 passed (11.9 s in the full run, 27 s alone the first time).

## Can it fail?

It has not been shown to. A mutation of a page needs a rebuild for each break (about two minutes), and none was run for this slice before its pull request. What the test asserts, so what a break would have to change to be seen: a new version saved and confirmed; five ideas decided and a sign-off with a date; the operator's provider named under the requirement; the plan's provider named on the delivery page; the starting number shown after it is recorded; the 30, 90 and 180 day dates after an acceptance, and no review form offered; the fee on none of the owner's pages; no page, console or request error; and none of the first owner's provider, milestone text, number or note on any stage's page for a second company's owner. Each of the eight is a plausible way for one stage to stop handing over to the next. This is an argument, not a measurement: treat the test as unproven against a real break until someone runs the mutations.

## What these results do not show

- One path, one browser, one synthetic company, and the seeded company's description is already confirmed (see STATUS limits 1 and 2). A pass says the stages hand over to each other on that path; it does not say the path is the one a real owner takes, that the pages are understandable, or that the ideas are right.
- The test was written by the agent that wrote the pages' neighbours and then run; nobody else has read it.
- It cannot record a review, because a review opens 30 days after the first acceptance and the pages have no way to move the clock. Reviews are tested in the run module, where the database is given an acceptance dated in the past.
- The test is long and depends on the wording of labels on seven pages; a change of wording fails it. It also takes the harness's whole 170-second allowance on a very slow machine.
- No hosted environment was used: the Worker is local and the database is Miniflare's.

## Next-step rules after the independent reviews (5 October 2026)

The agent that changed the rules ran, on the rebuilt application (`pnpm build`): `npx tsc --noEmit` (no errors); `journey/unit/progress` 36 passed (was 22), `journey/unit/contrast` 8 passed, `diagnose/unit/progress` 7 passed, `diagnose/unit/not-owner` 1 passed; `journey/integration/facts` 7 passed (was 3; new scenarios: baseline before judging a delivery, two milestones to close, a closed engagement, a signed-off company that accepted nothing, a withdrawn request, a request with no listed provider, a newer draft); `diagnose/integration/diagnose-api` 34 passed; browser suites `journey`, `diagnose`, `demo/walk`, `deliver`, `factory/describe`, `platform/pages`, `platform/session-and-scope`, `procure`, `run` all passed; every smoke suite (8) passed. Baselines in `modules/journey/tests/baseline.json` were raised to match. The full `pr --guard` run has not been repeated since this change.

Limits: both reviewers were agents and no person has read the change. The rules were checked against synthetic records only. The unit tests assert the rule order the reviewers described; they do not show that an owner finds the order natural. Two defects found by the logic review sit outside this module and are not fixed (see STATUS).
