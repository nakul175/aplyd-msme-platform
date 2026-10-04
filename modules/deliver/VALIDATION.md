# Deliver module: validation

Environment for every result below: a Linux container, Node v22.22.0, pnpm 11.25.0, Chromium 141.0.7390.37 through `playwright-core` 1.56.1, 5 October 2026. The agent that wrote the code ran every check here. No separate agent has read this slice yet and no person has; this page is updated when one does, and until then nothing on it is an independent finding.

## Results

First run (before the review): in the working tree of branch `slice-5-deploy` after slice 4's final version was merged into it: `pnpm build`, then `node scripts/test.mjs pr --update-baseline --reason "slice 5 deliver"`. After the review fixes: `pnpm build`, then `node scripts/test.mjs pr --update-baseline --reason "slice 5 review fixes"`: **46 suites, all passed**, 5 October 2026, run on a machine that was also running mutation checks. The pull request's own CI result is not recorded here; it has not been read.

| Suite | First run | After the review fixes |
| --- | --- | --- |
| deliver/unit/state | 6 passed | 7 passed (adds the delivery cap; the trigger-text test renamed to say it reads text) |
| deliver/unit/reads | (new) | 3 passed (the statements of a single read and of the list, on a fake database) |
| deliver/integration/deliver-api | 23 passed, against a real D1 database through Miniflare | 27 passed (adds: what is offered at the cap; every state against every kind, run on the real triggers and rolled back; locked told from closed; a close looked for in its own engagement) |
| deliver/static/rules | 9 passed (queries bound to the company, append-only, the money columns, no fee read together with an engagement, every form message has a place on the page) | 9 passed |
| deliver/smoke/deliver | 7 passed, the built application in a local Worker | 8 passed (adds the page after the 14th rejection) |
| deliver/browser/deliver | 3 passed, a real headless Chromium | 3 passed |
| procure suites | unchanged except that the static rules now allow this module's join, with the shape it may take | unchanged |
| platform/integration/append-only-keys | passed; reads every unique key of every append-only table from the migrated database and requires a trigger that looks at each | passed |
| all other suites | unchanged, all passed | unchanged, all passed |
| static/typecheck, static/documentation, static/migrations | pass | pass |

## Independent review

A separate agent (a fresh Claude session given only the diff and the repository rules, told to try to break the slice and to say what it could not check) read slice 5, commit range `9acdf2a..74277ec`, and wrote its report on 5 October 2026. **Result: 0 HIGH, 3 MEDIUM, 5 LOW.** It found no read or write across companies, no way to attach an event to another engagement's milestone, and no trigger bypass (REPLACE, OR IGNORE, named ids). It could not check the smoke and browser layers, `pnpm build`, the typecheck, true two-Worker races, or the complete fast layers. No person has reviewed this slice. The agent that wrote the slice answered the findings below.

| Finding | What was done |
| --- | --- |
| **M1** The page offered a delivery after the 14th rejection; the database refuses it, and the milestone was stuck | Fixed here. `nextKinds` takes the delivery count and offers nothing for a rejected milestone at the cap; each presented milestone carries `deliveries`; the page says why and that closing is the way out; the "too many deliveries" message no longer says to decide on a last delivery that may already be rejected. Tests: unit (`nextKinds` before, at and after the cap, and the cap leaving the other states alone), integration (what is offered at 13, 14 and rejected-at-14 deliveries), smoke (the page after 14 rejections), and the agreement matrix under M3 |
| **M2** The tables do not hold whole-number amounts, real dates, non-blank titles or note length (direct SQL only) | **Not fixed in this slice.** The handlers refuse all of these. The fix is a set of new triggers in a new migration (applied migrations are not edited), carried by the review-fixes branch; recorded as limit 17 in STATUS. Until it merges, the database does not hold them |
| **M3** STATUS said a test reads the triggers and checks the two agree; it is a text match, not a run, and could not have caught M1. VALIDATION said no event can be refused by more than one rule, which is false for deliveries | Claims corrected (here and in STATUS). The unit test is renamed to say it reads text. A new integration test runs the real triggers, in a transaction that is rolled back, for every kind on seven milestones (planned, delivered, accepted, rejected, paid, rejected at the cap, delivered at the cap) before the plan is agreed, while it runs and after the close, and compares what the database accepts with what the page is offered. The overlap itself is limit 16; making the rules exclusive is in the review-fixes branch's migration |
| **L1** A closed engagement's requirement still counts in the demand pool | Documented (limit 12, OQ-15). Not changed |
| **L2** "Cannot be added" is reported as "plan locked" for a closed engagement with no plan; two triggers can answer an engagement creation | The first fixed here: a closed engagement is reported as closed (tests: closed without a plan; agreed, then closed). The second documented (limit 16); exclusivity in the review-fixes migration |
| **L3** Reads are unbounded across a company | The single read is bound to its engagement (a unit test checks the statements). The list and the unbounded number of engagements per company are documented (limit 15) |
| **L4** A payment is not compared with the agreed price | Deliberate, documented (limit 13) |
| **L5** The page and the API differ on who may view | Documented (limit 14) |

## What the first runs found

- **A cap that could block a payment.** The first design capped the events on a milestone at 30, which could stop an owner recording the payment for work they had accepted. Replaced by a cap on deliveries (14, an assumption), from which at most 29 events follow; a test fills the cap, accepts the last delivery and records the payment.
- **A trigger that depended on firing order.** SQLite does not define the order triggers run in; two triggers could refuse the same event with different messages. Most rules were rewritten so they do not overlap, and the tests match on the message. The independent review showed this was not finished for deliveries (a 15th delivery while the 14th awaits a decision matches two rules) and for creating an engagement; see limit 16 in STATUS.
- **A page with two labels the same.** The accept and reject forms each had a note field with the same label, which the browser test (strict locators) refused. Merged into one form with one note and two submit buttons.
- **Static tests that matched too much or too little.** A table-name match found an import path; a fragment named in capitals was missed; a regular expression stopped at a semicolon inside a type. Each was corrected in the test.
- **The procure module's static rules broke** because this module reads the procure tables by join. The rule now names the exception and the shape it may take.

## Mutation checks

Each row is one deliberate break of the code or of a migration trigger, run against the layers that should see it; "caught" means at least one test failed. Run by `mutate.py` on a copy of the tree, which restores the file after each run. Two runs: 90 breaks (the first set, written for the first version) and 10 more written for the delivery cap and for what the first run's survivors showed.

First set, 90 breaks: **83 caught on the first run, 6 survived and one could not be applied (its pattern did not match the code).** Every survivor except two equivalent ones was closed with a test and run again.

| Break | Result |
| --- | --- |
| Every one of the 22 triggers that existed at the time neutered, one at a time (the nine no-update, no-delete and no-replace, and thirteen rules) | caught ×22 |
| Triggers weakened: delivery allowed after anything but a rejection; a decision after a decision; a payment after a delivery; a payment twice; milestone limit 13; a listed provider need not serve the idea or the cluster; the provider need not be listed now; a withdrawn requirement may be engaged; work without an agreed plan; no-replace on milestones and engagements ignoring a unique key | caught ×12 |
| Milestone limit counting every engagement, not one | survived at first: no test had a second engagement with milestones. Added; caught |
| Data layer: list and single read not bound to the company; duplicate guard removed; another provider treated as the same choice; "created" flag always true; each refusal not mapped (withdrawn, unlisted, plan locked, too many, closed, already agreed, empty plan, not agreed, wrong state) | caught |
| Data layer: requirement not checked against the company on create; the existing engagement looked up without the company | survived at first. The handler and the composite foreign key hide the data layer's own check, so no test could see it go. Added a test that calls the data layer directly with another company's id; both caught |
| Handlers: read, create, add and event with no scope check, or only a read check; audit action the same for every kind; form post answered with JSON on success, on refusal and on a missing record | caught |
| Input: amount lower and upper bound; text control characters, length and emptiness; date not checked as a real date; unknown kind; milestone missing or present where it should not be; payment without an amount; an amount where none is allowed; note not checked | caught |
| Amount: decimals read as whole numbers | survived at first (the tests sent `abc`, never `1.0`). Test cases for text amounts (`1.0`, `2.`, `.5`, `1e3`, signs, a hex number, a comma, a space, a non-ASCII digit), a fractional number and a number over the limit added; caught |
| Presentation: next steps offered after the close; the paid total counts every milestone; the plan total counts one per milestone; the payment shown is the agreed price | caught |
| Presentation: next steps offered before the plan is agreed | survived at first. Added a test of what is offered before the plan, after it and after the close; caught |
| State: each transition of the state machine altered; complete when any milestone was accepted; closed with nothing planned counted as complete; a year before 2000 is a date | caught |
| State: the day of the month not compared with the one asked for | survived, **equivalent**: for a day that does not exist in the month the date rolls into the next month, so the month comparison already fails it. The clause is redundant, not missing. Left in |
| Milestone: engagement not checked against the company (first pattern) | could not be applied; applied by the second set |

Second set, 10 breaks: **9 caught, 1 survived.**

| Break | Result |
| --- | --- |
| Delivery-limit trigger neutered; limit 15; limit 13; counting every milestone's deliveries; counting events of every kind | caught ×5 |
| Milestone: engagement not checked against the company (applied correctly this time) | caught |
| "Too many deliveries" not mapped to its message; next steps offered before the plan is agreed; next steps offered after the close | caught ×3 |
| Milestone number counted without the company in its sub-select | survived, **equivalent**: the engagement id is unique and is already checked against the company in the same statement, so the second filter is redundant. Left in |

Third set, 12 breaks written for the review fixes (`modules/deliver/mutations/review-fixes.json`, run by `scripts/mutation/mutate.py` against the unit and integration suites): **11 caught, 1 survived.**

| Break | Result |
| --- | --- |
| The delivery cap ignored; cap off by one in either direction; a planned milestone offered nothing | caught ×4 |
| The count of deliveries taken over every milestone of the engagement; counting events of every kind; the count not passed on | caught ×3 |
| A closed engagement not told apart from a locked plan; the two swapped | caught ×2 |
| The close looked for in the whole company, not the engagement asked about | survived at first: every test had one engagement. A test with a closed engagement and a second one with an agreed plan was added; caught |
| The single read not narrowed to the engagement; `loadEngagement` not passing the engagement on | caught ×2 (by the new unit test of the statements; the results are the same either way, so only a test of the statements can see them) |

These runs overlapped with other test runs on the same two-core machine, so a "caught" means at least one test failed, which under load can include a timeout; a survivor is a stronger statement than a catch. Page-level breaks (the browser and smoke layers' view of what the page shows and hides, including the new cap message) were not run for this slice: the layers need a rebuild after each break, which the mutation tool does not do. The smoke test of the cap checks the message, the missing form and the way out, and has not been checked against deliberate breaks of the page.

## What these results do not show

- **Not independent.** The same agent wrote the code, the tests and the mutations. A mutation set is only as good as the breaks its author thought of; it says nothing about the ones that were not thought of.
- **The page's own mutations were not run.** Whether the browser tests would notice a button shown in the wrong state is untested beyond the paths they walk.
- **Triggers are exercised one probe per rule.** A trigger with the right name and a weaker body than tested would pass the name checks (the guards test and the health check). The integration tests run real SQL for each rule.
- **Two Workers racing were not run.** Concurrency is tested one request after another inside one process; SQLite serialises writers.
- **Chromium only**, against a local Worker with a synthetic sign-in.
- **Nothing here is evidence that an owner would use it.** The plan, the test and the price are the owner's own words about a provider the operator entered by hand. The ten-owner worksheet ([docs/ten-owner-test.md](../../docs/ten-owner-test.md)) exists because this slice was built before that test was run.
- **The pull request's CI result** was not read when this page was written.
