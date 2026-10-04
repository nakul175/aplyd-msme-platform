# Run module: status

Owner: the run module. Paths: `modules/run/`, `app/run/`, `app/api/companies/[id]/engagements/[eid]/outcomes/`, and migrations 0012 and 0013 in `drizzle/`. It also adds a "Results" link on the home page and a test-only `exec` helper to `modules/platform/tests/support/worker.ts` (see Known limits). Last updated 5 October 2026.

This is slice 6, Run: once the owner has accepted work (slice 5), they record a baseline (what the thing they were fixing was like before) and look again 30, 90 and 180 days after the first acceptance: the number now, whether it did what the assessment expected, and whether it is still in use. The page also names the next idea in the owner's plan that has no requirement yet. Protected paths touched: data scope (a company's measurements, read and written only by that company's owner) and migrations (one append-only table and eight guard triggers). A separate agent has not yet read this slice; see [VALIDATION.md](VALIDATION.md). No person has read it.

**Nothing here measures anything.** Every number is one the owner types. The provider does not sign in (OQ-13) and sees nothing. The expected range comes from the opportunity library, which is SYNTHETIC: its figures are placeholders, so "did it do what was expected" compares an owner's number with an invented range. Nothing here touches money or the listing fee (D-03).

## What works

- **A baseline.** On `/run`, for each engagement the owner has chosen, one whole number, the state of things before the work, with an optional note. It is recorded once, and only before anything is accepted (a delivered or rejected milestone does not close it; an acceptance does). After that the page says no baseline was taken and offers none.
- **Three reviews.** Review 1, 2 and 3 fall due exactly 30, 90 and 180 days after the first acceptance (assumptions, REVIEW_DAYS in `src/state.ts`; a test keeps the migration's day counts equal to it). Before its day a review is not offered and the page shows the date it opens; from its day it can be recorded, however late. Each is recorded once and they are independent: the last can be recorded before the others. A review is a whole number (0 to 1,000,000,000), whether it did what the assessment expected (met, partly, not met), whether it is still in use, and an optional note (500 characters).
- **The change since the baseline** is the latest review's number less the baseline, in the unit the assessment used. "Latest" is the highest review number recorded. The page does not say whether the change is good or bad: which way is better depends on the measure.
- **What the assessment expected** is shown beside the numbers: the measure, the unit, and the range, copied from the assessment the requirement came from.
- **The next idea.** The first idea the owner accepted in the same assessment that has no requirement yet, in the assessment's order, with a link to `/procure`. Nothing is made for them.
- **The scope rule** is the platform's own. Another company's owner, and the operator, get a 404 identical to a missing record, audited (`outcome.read.denied`, `outcome.write.denied`). A person in the company who is not its owner may read and gets 403 on any change. Every query is bound to the signed-in person's company, and a static test checks every SQL string on the table and that only the data layer touches it.
- **The clock is the application's.** Days are counted from timestamps the application writes, and the database refuses a review whose stamp is before the due time (a trigger), so the page cannot be used to open a review early. Handlers take an optional clock so a test can stand at day 29 and day 30. If either timestamp cannot be read as a time, the review is refused, not let through.
- **Form posts** that cannot be done go back to `/run` with a message, never a page of JSON; another company's engagement gets the message a missing one gets.
- **Append-only, in the database.** `outcome_events` refuses UPDATE, DELETE and any INSERT that would replace a row, on the id and on both partial unique keys (one baseline per engagement; one review per number per engagement). Five rule triggers enforce once-only, before-acceptance, needs-an-acceptance and due-date. Every write also writes an audit entry in the same batch, only when a row was added.
- **D-03.** The table holds the owner's measurements and no fee, share, commission or money column. A static test pins the column list and checks that nothing in the module reads the listing fee, the listing terms or a provider's listing, and that no query aggregates measurements across companies.

## Not built

- **Anything for the provider.** No sign-in, no view of the results, no way to dispute a number.
- **Measuring.** No reading from a machine, a sheet or an app; no check that a number is plausible, current or the same measure as the baseline.
- **Comparing a result with the expected range** as better or worse, or turning the verdict into a score.
- **Reminders.** Nothing tells the owner a review is due; they see it when they open the page.
- **Correcting a number.** A baseline or a review cannot be edited or replaced, by design. A wrong number stays; the only remedy today is a note on a later review.
- **More than three reviews, or a different schedule.** The three day counts are fixed.
- **Aggregates.** No count or average across companies; any such figure would need the five-company floor (C-04) and does not exist.
- **Acting on the next idea.** It is a link.
- English only; no export or print.

## Known limits

1. **The number is the owner's word.** Nothing checks it, and the baseline is taken by the same person whose purchase it judges. A baseline typed after the work is not caught, only a baseline typed after an acceptance is recorded in the application (OQ-08).
2. **The expected range is invented.** It comes from the SYNTHETIC library. A "met" or "not met" against it is not evidence of anything.
3. **Day counts are assumptions** (30, 90 and 180) and are counted from the first accepted milestone, not the last, nor from the date the provider says it finished.
4. **The database trusts the application's time.** The due-date trigger compares the stamp the application wrote with the first acceptance's stamp; anyone who can write to the database with a stamp of their own can open a review early. Only the application writes here, and the Worker's clock is the only clock it uses.
5. **Which unit** a number is in is the assessment's, shown beside the box; the owner can type a number in any other unit and nothing notices.
6. **"First accepted" is final.** An acceptance cannot be undone in slice 5, and its table is append-only, so the date the reviews count from cannot move. If a later slice lets an acceptance be reversed, this slice's day counts have to be looked at again.
7. **The next idea ignores prerequisites and cost.** It is the next accepted idea in the assessment's order; whether it is sensible after what was just done is not looked at.
8. **A test-only database helper.** `exec` on the test Worker harness runs SQL against the throwaway database to add events dated in the past. It is in `tests/support`, not in the application, and a page or a request cannot reach it. The browser tests that use it add the events the application would have written on that earlier day; the database's triggers still apply.
9. The guards test and the health check confirm that triggers exist by name. They do not run them; the integration tests prove behaviour with real SQL, one probe per rule.
10. Two requests racing for the same step are decided by SQLite serialising writers and the triggers. A test sends them one after another inside one process. Two Workers racing were not run.
11. Denied attempts write audit rows without a cap, as everywhere (platform limit 8).
12. The page was run in Chromium only, against a local Worker, with a synthetic sign-in. The inherited platform limits apply.
