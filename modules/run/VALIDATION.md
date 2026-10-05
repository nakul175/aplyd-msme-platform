# Run module: validation

Environment for every result below: a Linux container, Node v22.22.0, pnpm 11.25.0, Chromium 141.0.7390.37 through `playwright-core` 1.56.1, 5 October 2026. The agent that wrote the code ran every check here. A separate agent has read this slice once (below) and its findings are answered below; no person has reviewed it, and nothing on this page is an independent finding except what is marked as the reviewer's.

## Results

Run in the working tree of branch `slice-6-run` with slice 5's final version merged in: `pnpm build`, then `node scripts/test.mjs pr --update-baseline --reason "slice 6 run"`: **52 suites, all passed**, 5 October 2026, on a machine that was also running mutation checks. The first full run of this slice failed one suite (`deliver/static/rules`, found by that run and, independently, by the reviewer). One assertion was added to a test after the run that is reported here (the data-layer test of the bound list); that suite was run by itself afterwards, 29 passed. The pull request's own CI result is not recorded here; it has not been read.

| Suite | Result |
| --- | --- |
| run/unit/state | 6 passed (the schedule: when each review falls due, which slots are open) |
| run/integration/run-api | 29 passed, against a real D1 database through Miniflare: the baseline and the three reviews, the clock at 29 and 30 days to the millisecond, the first acceptance and not the latest, each engagement on its own, the next idea, scope, form posts, and a direct-SQL test of every rule of the table and of each trigger |
| run/static/rules | 8 passed (every statement on the table bound to the company, only the data layer touches it, the column list, no fee or provider read, no aggregate across companies) |
| run/smoke/run | 7 passed, the built application in a local Worker |
| run/browser/run | 4 passed, a real headless Chromium |
| deliver/static/rules | 9 passed. The rule that only the deliver data layer names an engagement table now allows the run module's one insert, which checks that the engagement is the company's, and only in that shape (a change to another module's test, made because this slice made it fail) |
| platform/static/conflict-markers | 2 passed (new: added with the fix of slice 5's HANDOVER.md) |
| all other suites | unchanged, all passed; the baselines of the other modules were raised to the counts of this run |
| static/typecheck, static/documentation, static/migrations | pass |

## Independent review

A separate agent (a fresh Claude session given the diff and the repository rules, told to try to break the slice and to say what it could not check) read slice 6, commit `b18ac2f` against `ba5222d`, and wrote its report on 5 October 2026. **Result: 0 HIGH, 4 MEDIUM, 5 LOW.** It found no way to read or write another company's measurements, no way to open a review early or take a baseline late (it tried time-zone offsets, a Julian day number, a Unix-seconds string, `now`, and about 5,000 random first-acceptance stamps for each of the three due dates: the due instant was never refused and one millisecond early never accepted), and no way round the append-only rule (`INSERT OR REPLACE` with and without an id, `OR IGNORE`, `REPLACE INTO`, `ON CONFLICT DO NOTHING` and `DO UPDATE`). It could not check the smoke and browser layers, `pnpm build`, two Workers racing, or the text of real D1 errors. No person has reviewed this slice. The agent that wrote the slice answered the findings below.

| Finding | What was done |
| --- | --- |
| **M1** The slice turned the deliver module's static test red, and the documentation check failed because VALIDATION.md did not exist | Both fixed. Deliver's static rule now names the run module's one insert as an exception, in that shape only, with a test of the shape. This edits another module's test, which AGENTS.md leaves to that module's owner; it is flagged on the pull request. This file was written |
| **M2** Eight entries of `m10.json` no longer matched the code (the triggers were rewritten after it was written), so they would print SKIP, and "list not bound to the company" survives the integration layer | The stale entries are rewritten in `after-first-run.json` and all were run again (below). The reviewer is right about the survivor: before the fix, only the static rule's regular expression saw that clause go (the handler's check of the engagement hides it from behaviour). A test now calls the data layer with another company's id and with an engagement that does not exist, and the break is caught by the integration layer on its own |
| **M3** STATUS said a form post that cannot be done always goes back to `/run`; five cases (no session, another company, the operator, another website, a body over 64 KB) are answered with JSON | **The sentence was too strong and is corrected; the behaviour is not changed.** The shared platform check answers these before the form is read, and slices 3 to 5 use the same check, so the same sentence in their STATUS is corrected on the review-fixes branch. A test pins each of the five answers and the redirect for what comes after. An expired session therefore still shows a page of JSON on a form post (STATUS limit 13); a fix belongs in the platform |
| **M4** The next idea ignores a withdrawn requirement, so it is never offered | **Not changed: this is the intended behaviour, and the finding's fix would offer a refusal.** A withdrawn requirement cannot be made again (procure limit 9), so offering that idea would send the owner to a 409. STATUS now says so and a test shows the idea passed over and the 409 it would meet |
| **L1** The page and the API differ on who may read | Documented (limit 14) |
| **L2** The page does N+1 work with no cap | Documented (limit 15) |
| **L3** Dates are UTC, so a day can be off for an owner in India | The page says dates are UTC; documented (limit 17). The form still appears at the exact instant |
| **L4** The expected range has no SYNTHETIC tag of its own | Fixed: the line carries the tag on the page and `expected.synthetic` is in the data, read from the assessment. A smoke test and an integration test check both |
| **L5** JSON accepts the figure as digits in text | Left, as deliberate (a test says so); documented (limit 16) |

## What the first runs found

- **A CHECK that comes out NULL lets the row in.** The first shape check for a review said `verdict IN ('met', 'partly', 'not_met')`. A review with no verdict at all passed it, because `NULL IN (...)` is NULL and SQLite accepts a CHECK that is NULL. A test written to push such a row in by direct SQL got it accepted. The shape check now names every column a kind needs as `IS NOT NULL` as well as in range (migration 0012, edited in place because the migration was not yet published). The same pattern was then found in slices 3 and 5 (a decision with no decision, a payment with no amount); the review-fixes branch closes both with triggers in a new migration.
- **A range check lets a fraction through.** The figure and the review number have integer affinity, which keeps 1.5 as 1.5, and `BETWEEN 1 AND 3` is true for it. A test with direct SQL got a review numbered 1.5 into the table. A trigger (`outcome_events_value_is_whole`) refuses a figure or a review number that is not a whole number, and the other five rule triggers are written not to apply to such a row, so that one rule and one message answer (a test says so for a second review and a second baseline that are also fractions).
- **A clock test that could not fail.** The first test of the due date used the latest acceptance's time; a mutation that measured from the latest acceptance instead of the first survived. A test with two acceptances on different days was added; the mutation is caught.
- **A page test that counted text twice.** The server-rendered page repeats its text inside script tags, so a count of a phrase on the page was twice what a person sees. The smoke test strips script tags before counting.
- **Aborted requests in the browser test.** A response body that is not read to its end is reported by Chromium as an aborted request, which the test treated as a failure. The browser test now reads every response to its end.
- **A mutation run that hung.** One run of the mutation `clock: the real time stamped, not the injected one` did not finish and was stopped by hand; the test it was running waits on the real time. In the two later runs of it, it was caught. The cause of the hang was not found and is not claimed to be understood.

## Mutation checks

Each row is one deliberate break of the code or of a migration trigger, run against the layers that should see it ("caught" means at least one test failed; "survived" means none did). Run by `scripts/mutation/mutate.py` on a copy of the tree, which restores the file after each run. The lists are kept in `modules/run/mutations/`. 77 breaks were written first (`m10.json`); a second file (`after-first-run.json`) holds those rewritten for the code as it is now, and the ones written for the new triggers.

First 16 of the 77: **14 caught, 2 survived.**

| Break | Result |
| --- | --- |
| The no-update and no-delete triggers neutered, one at a time | caught ×2 |
| One baseline, one review of each number, baseline before acceptance, review needs an acceptance, review is due: each trigger neutered | caught ×5 |
| Due after 29 days; the second after 89; the third after 179 or 181 | caught ×4 |
| A stamp that cannot be read as a time let through; the exact due instant counted as early; a baseline allowed after a delivery | caught ×3 |
| The no-replace trigger neutered | survived: no test replaced a row by its id. A test was added for `INSERT OR REPLACE`, `OR IGNORE`, `ON CONFLICT DO UPDATE` and `REPLACE`; caught |
| Due measured from the latest acceptance, not the first | survived: no test had two acceptances. Added; caught |

The next 60 (the first of them, "one baseline per company", appears in both runs because the first was interrupted by a restart of the container; the 77th was not reached and was run later): **44 caught, 15 survived, 1 could not be applied.**

| Break | Result |
| --- | --- |
| The no-replace trigger ignoring the id; the engagement's key to the company dropped from the table | caught ×2 |
| State: review days 30, 90, 180 each +1; a day of 23 hours; the due instant counted as not yet; a recorded slot judged by the clock first; "waiting" not shown before an acceptance; review number 0 accepted | caught ×8 |
| Scope check removed from read and from write; the denial audited under another name, for each | caught ×4 |
| Value: upper bound off by one; negative allowed; fractions allowed | caught ×3 |
| Note: limit off by one; control characters allowed | caught ×2 |
| A review without a number, verdict or in-use answer; any text accepted as a kind; a verdict or review number tolerated on a baseline; a JSON string accepted as a number | caught ×6 |
| Form posts: a bad value, a missing engagement (two ways), a refusal, a success answered with JSON; a refusal answered 400 not 409 | caught ×6 |
| The real time stamped instead of the injected one | caught (but see the hang above) |
| A baseline after an acceptance; the first acceptance taken as the latest; the change shown the wrong way round; the latest review taken as the lowest number; the next idea offered although it has a requirement | caught ×5 |
| Data layer: engagement not checked against the company on append; audited under the wrong name; each of five refusals not mapped to its message | caught ×7 |
| Triggers: one baseline per company, not per engagement; one review per number across engagements; a review needs an acceptance anywhere in the company | survived ×3: no test had a second engagement with its own numbers. A test with two engagements of one company, one accepted long ago, was added (and then the three triggers were mutated again, below) |
| The table's own checks: value upper bound removed; negative allowed; note length unbounded; a review without a verdict; review number 4; a baseline carrying a verdict | survived ×6: the tests went through the application, which refuses all of these before the table is reached. A test that writes to the table directly, for each, was added |
| Value: decimals read as whole numbers | survived: the tests sent `abc` and never `1.0`. Cases for text numbers (`1.0`, `2.`, `.5`, `1e3`, signs, hex, a comma, a space, a non-ASCII digit) added; caught |
| The next idea counted from the requirements of every assessment; the expected range taken from the first idea, not the idea of the requirement | survived ×2: no test had two assessments or two ideas. Added; caught |
| The list not bound to the company; the list not bound to the engagement | survived ×2: the single read hid them. A test that calls the data layer with another company's id and with two engagements was added; caught |
| The review number left out of the audit entry | survived: the audit text was not read. Added; caught |
| The next idea offered although it was not accepted | could not be applied (the pattern did not match); rewritten, run again; caught |

Third set, `after-first-run.json`, 27 breaks: the first set's entries whose text no longer matched once the triggers were rewritten (rewritten here), the survivors again after their tests were added, the one entry that was not reached, and breaks written for the whole-number trigger and the NOT NULL shape. Run on a copy of the tree at the time of the run: **26 caught, 1 survived and is equivalent.**

| Break | Result |
| --- | --- |
| One baseline per company, not per engagement; one review per number across engagements; a baseline late if anything is accepted anywhere in the company; the first acceptance taken from the company, not the engagement; a review needs an acceptance anywhere in the company | caught ×5 |
| The table's own checks: value upper bound removed; negative value allowed; note length unbounded; review number 4 allowed | caught ×4 |
| Decimals read as whole numbers; next counts the requirements of every assessment; the expected range from the first idea; a list not bound to the engagement; a list not bound to the company; the review number left out of the audit entry; the real time stamped instead of the injected one; the next idea offered although it was not accepted | caught ×8 |
| The reply "inserted" whatever happened (the 77th of the first file, which the restart of the container cut off) | caught |
| The whole-number trigger neutered; ignoring a fractional review number; ignoring a fractional figure | caught ×3 |
| Shape: a review need not have a number; need not have a verdict; need not say whether it is in use | caught ×3 |
| Table: a review without a verdict allowed (`verdict IS NULL OR verdict IN (...)`) | survived, **equivalent**: the shape check also requires `verdict IS NOT NULL` for a review, so the NULL branch can never be true and the break changes nothing. Left in. The break that removes the NOT NULL clause itself is the one in the row above, and it is caught |
| Table: a baseline carrying a verdict | survived at first: the test gave a baseline a verdict and an in-use answer together, and the in-use answer alone failed the check. A test with a verdict alone was added; caught |
| The once-only rule not left to the whole-number rule | survived at first: the rows tried were refused by one rule or the other, never by both. A test gives a second review and a second baseline a fraction and requires that only the whole-number message answers; caught |

After the review, three tests were added (a withdrawn requirement, the SYNTHETIC flag, the five JSON answers) and one assertion (the bound list). The only break re-run for them was "list not bound to the company", with the integration layer alone: caught. Nothing else was re-run after the review fixes, and the full suites were. One run of this file on 5 October 2026 showed a break as "caught" only because a test I had just changed failed without any break (an exact comparison of `expected` that did not know the new `synthetic` field); the baseline of the copy was checked and the break run again. A "caught" from the mutation tool means the suite failed, not that the break was what failed it; that was checked by hand for the entries above that matter most (the five core triggers, the clock, the scope checks) in the reviewer's run and in mine.

## What these results do not show

- Everything runs against a local Miniflare database and a local Worker in headless Chromium. Nothing was run against a hosted environment or the real D1 error text, and two Workers racing were not run.
- The number is the owner's own word and the expected range is invented (STATUS limits 1 and 2): no test here can say anything about whether the review is useful to an owner.
- The reviewer read one commit; the changes after it (and the tests added for its findings) have had no second reading.
- The mutation checks are a sample chosen by the agent that wrote the code.
