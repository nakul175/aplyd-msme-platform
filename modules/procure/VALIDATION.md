# Procure module: validation

Environment for every result below: a Linux container, Node v22.22.0, pnpm 11.25.0, Chromium 141.0.7390.37 through `playwright-core` 1.56.1, 5 October 2026. The agent that wrote the code ran every check here, except the independent review, which another agent ran (below). No person has reviewed this slice.

## Results

Run in the working tree of branch `slice-4-procure`: `pnpm build`, then `node scripts/test.mjs pr --update-baseline --reason "slice 4 procure"`. Three full runs were needed. The first passed every code layer and failed only the documentation check (this module's status page linked to this page before it existed, and to a later slice's page); both were fixed. In the second, slice 2's integration suite printed all 23 tests as passed and then did not exit for 12 minutes (the local database harness, no CPU in use); I killed that process by hand, which made the runner count the suite as failed, so no baseline was written. It passed in 26 seconds in the third run and had passed in the first. I did not find the cause: a hang at the end of a Miniflare test process is a risk of this harness, not something this slice introduced as far as I can show. The third run is the table below: 40 suites, no failures. The pull request's own CI result is recorded below when it can be read.

| Suite | Result |
| --- | --- |
| procure/unit/clusters | 2 passed |
| procure/unit/pool | 5 passed (the floor of five, counting companies not requirements, and the lower bound in steps of five) |
| procure/integration/procure-api | 31 passed after the review fixes (30 at the first run), against a real D1 database through Miniflare |
| procure/static/rules | 10 passed after the review fixes (9 at the first run: queries bound to the company, the two cross-company reads, provider order by name only, the money columns) |
| procure/static/problems | 2 passed (every form outcome has a page message) |
| procure/smoke/procure | 6 passed, the built application in a local Worker |
| procure/browser/procure | 3 passed, a real headless Chromium |
| platform/integration/append-only-keys | 2 passed; reads every unique key of every append-only table from the migrated database and requires a trigger that looks at each |
| platform/unit/guards | 2 passed; checks the union of the append-only and rule triggers against the migrations |
| all other suites | unchanged from slice 3, all passed |
| static/typecheck, static/migrations | pass |

## Independent review

A separate agent (a second Claude instance, read-only, working in a detached copy of commit 9acdf2a; no person) read this slice and tried to break it. Its report: **0 high, 4 medium, 5 low.** It found no leak across companies, no operator bypass and no trigger bypass; it ran the procure unit, static and integration suites (47 of 47 passed) and seven breaks of its own (six caught; the seventh, removing the company match from the sign-off trigger, is equivalent because the composite foreign key already enforces it). What was found and what was done, in the commit after 9acdf2a:

| Finding | What was done |
| --- | --- |
| **M1.** A fifth company that took a pool from four to five was shown "5 companies", so it learned the pool had held exactly four, below the floor. Limit 2 described this too weakly. | The owner is shown "at least 5", "at least 10" and so on (a lower bound in steps of five), never the count; a pool of five and a pool of nine look the same. The joiner still learns the pool held at least four others, which is said in limit 2. Unit, integration and static tests; the page wording is pinned by a static test. |
| **M2.** "One flat fee, the same for every provider" holds only for the fee in force when a provider is listed; the operator can list two providers at different fees by changing the fee between. | The wording now says "one fee at a time", the operator page says when the listed providers pay different fees (browser test), and limit 10 states it and leaves the question of forbidding it to the sponsor (OQ-11). D-03 as written is not broken, because nothing ties a fee to which provider an owner chooses. No rule was added. |
| **M3.** A withdrawn requirement asked for again returned 200 with the withdrawn one's id, a "recorded" message and a cluster that was never stored. | The answer is 409 `previously_withdrawn` (a form: a message); asking again for one that exists says it already exists, with the cluster it was made in (JSON and form). A withdrawn requirement still cannot be made again; limit 9. |
| **M4.** The mutation tables could not be reproduced: `mutate.py` was not in the repository. | `scripts/mutation/mutate.py` and its README are in the repository, and the break lists are in `modules/procure/mutations/` (m7: the 51 first breaks; m7b: the 11 for form redirects; m7c: the breaks for these fixes). After later edits some patterns no longer match and print SKIP. |
| **L1.** The fee in the reply to a listing was read after the batch and could name a later fee than the one stored. The same for setting a new fee. | The reply reads the row just written. Not testable as a race here; tested by mutating the read to the wrong row (caught). |
| **L2.** Operator page said nothing on it reads a company's records, although the pools are counts across companies. | Reworded. |
| **L3.** Provider names (and notes) accepted text-direction override characters. | The shared check (`hasControlCharacters`, in `modules/factory/src/questionnaire.ts`) now also refuses the direction overrides and isolates, zero-width space, word joiner, byte order mark and the Arabic letter mark, and still allows the joiners that Hindi and other Indian scripts and emoji need. This also covers the factory and diagnose notes (finding M2 of the slice 2 review). Unit tests in the factory module. |
| **L4.** A service could be added to a listed provider by a direct insert. | Not fixed in this branch: it needs a trigger, and applied migrations are not edited. It is in the fix branch at the top of the stack (migration 0014); limit 11. |
| **L5.** A visitor's 401 is not audited and an owner's 403 is. | Documented as limit 12. |

Results after the fixes, in the working tree of this branch: typecheck, static and unit layers; `procure/integration/procure-api` (31 passed) and `factory/integration/factory-api`; after `pnpm build`, `procure/smoke/procure` (6) and `procure/browser/procure` (3). A full `pr` run is recorded in the top branch of the stack after the later slices' fixes were merged in, not here. The reviewer did not run the smoke or browser layers, `pnpm build` or the pages in a browser, and did not review how an operator account is issued outside the synthetic seed.

## What the first runs found

- A test I wrote for the operator check passed against code that did not check the role at all (see the mutation table). The cause was that every other failing path in the test also returned 403. Fixed with a test that signs in as an owner and as a company-less account that is not an operator.
- Form posts for a record that does not exist returned a page of JSON. The first slice-3 review had found the same class of defect (L1). The procure and operator handlers had the same gap; they now answer a form post with a redirect and a message, and a static test (`static/problems`) requires every outcome the handlers can return to have a message on the page.

## Mutation checks

Each row is one deliberate break of the code or of a migration trigger, run against the layers that should see it; "caught" means at least one test failed. Run by `mutate.py`, which restores the file after each run and prints one line per break.

First run, 51 breaks: **49 caught, 2 survived.** Each survivor was closed with a test and re-run: both are now caught.

| Break | Result |
| --- | --- |
| Operator check: role not required; company-less not required; cross-site check removed; denial not audited; signed-in check removed | role-not-required survived at first (below); the other four caught |
| Pool: companies not distinct (count and listing); withdrawn requirements counted (count and listing); floor not applied in the listing; cluster not matched; idea not matched; floor off by one (`>` for `>=`); floor lowered to four; whole number not required | caught ×10 |
| Requirement list shows the raw count; withdrawn requirement still shows a pool; list not bound to the company | caught ×3 |
| Create: duplicate guard removed; the one already there looked up without the company; withdraw: exists guard removed; once-only guard removed | caught ×4 |
| Provider list: not the latest terms; fee altered; owners' order by listing time; unlisted providers shown to owners; providers of other clusters shown; oldest version in force; unlisted status read from the first event | caught ×6; "unlisted providers shown to owners" survived at first (below) |
| Trigger dropped: requirements no update; requirement events no delete; provider events no update; listing terms no update; providers no delete | caught ×5 |
| Trigger weakened: requirements no-replace ignores the idea; requirement events no-replace ignores the requirement | caught ×2 |
| Trigger dropped: needs a signed-off assessment; needs an accepted idea; weakened: reads the first decision, not the latest | caught ×3 |
| Trigger dropped: listing carries the fee in force; weakened: fee not compared; any version, not the latest; dropped: list needs a service; dropped: listed and unlisted in turn | caught ×5 |
| Create: cluster not checked; idea not checked against the assessment; provider services not checked against the library | caught ×3 |
| Fee: upper bound removed; whole number not required; string pattern loosened; listing reads a fee from the request | caught ×4 |

The two survivors:

- **Operator check not requiring the operator role.** The tests refused an owner and a visitor, which were refused for other reasons as well. Added: an account with no company and no operator role is refused by every operator endpoint (and writes nothing).
- **Providers never listed, or unlisted since, shown to owners.** No test made a provider that was never listed or had been unlisted and then looked at what an owner sees. Added: three providers (never listed, listed then unlisted, listed); the owner's requirement and the public list show only the listed one, the operator's registry shows all three, and unlisting the last leaves the owner's list empty.

### Mutation checks on the form redirects

Eleven breaks (m7b), all caught: the operator role check again, unlisted providers shown to owners again, and nine for the form redirects (a missing assessment, a missing requirement on withdraw, an overlong requirement id, a missing provider on list and on unlist, an overlong provider id on list and on unlist, answered with JSON; the missing-record message removed from each of `/procure` and `/operator`).

### Mutation checks on the review fixes

Sixteen breaks (m7c): **13 caught on the first run, 3 survived.** One survivor is equivalent; two were closed with tests and are now caught.

| Break | Result |
| --- | --- |
| The pool shows the exact count again; steps of two; the floor lowered to four | caught ×3 |
| A withdrawn requirement returned as if made; the stored cluster not echoed; JSON answers 201 for an existing one; a form says "made" for an existing one | caught ×4 |
| The hidden-character check: direction overrides, isolates, zero-width space and byte order mark allowed again; the joiners refused (which would break Indian scripts) | caught ×5 |
| A listing's reported fee read from the wrong row | caught |
| The page prints a pool without "At least" | survived at first (nothing pinned the page's wording); a static test now does; caught |
| A new fee's reply read from the wrong row | survived at first (the test never read the reply); asserted now; caught |
| The withdrawn lookup without the company in its sub-select | survived, **equivalent**: `requirement_events` has a composite foreign key to the requirement and its company, so the second filter is redundant. Left in |

Five further breaks, of the registry trigger, were run against an earlier form of the fix and are re-run in the top branch where the trigger now lives.

## After the review-fixes branch

The review's L4 (a service could be added to a listed provider by a direct insert) is fixed on the review-fixes branch (pull request #8, migration 0014): a trigger refuses it, with tests for a listed provider, an unlisted one and one never listed. The same migration holds a fee to a whole number of rupees and a note to 500 characters in the three tables that have one in the buying path; a later review of that branch found that a NUL character hid a long note from `length()`, so each note trigger also bounds the note in bytes, and the test for the three tables pins it. The mutation results for these fixes, and a second agent's review of them, are in [modules/platform/VALIDATION.md](../platform/VALIDATION.md) (section "Review-fixes branch").
## What these results do not show

- **Not independent.** The same agent wrote the code, the tests and the mutations. A mutation set is only as good as the breaks its author thought of; it says nothing about the ones that were not thought of.
- **Triggers are exercised one probe per rule.** A trigger with the right name and a weaker body than tested would pass the name checks (the guards test and the health check). The integration tests run real SQL for each rule, once.
- **Two Workers racing were not run.** Concurrency is tested one request after another inside one process; SQLite serialises writers, and the statements are single statements.
- **Chromium only**, against a local Worker with a synthetic sign-in; no mobile viewport, no screen reader, no other browser.
- **The pool floor is a rule about publication, not a privacy guarantee.** Differencing at the boundary is possible and is limit 2 in the status page.
- **Every figure on the pages is a placeholder**: three invented clusters, no real provider, no real fee. Nothing here is evidence about whether owners or providers want this (see the ten-owner worksheet).
- **The pull request's CI result** was not read when this page was written.

## Slice 10b: the two pages rebuilt on the shared interface (5 October 2026)

`/procure` and `/operator` were rebuilt on the design system of slice 10 (see [the status page](STATUS.md), "The two pages after the interface rebuild"). The change is to presentation, structure and wording; the API, the data layer and the migrations were not touched. The author is an agent; no person has read it, and no owner or operator has used the pages.

### What was run (real results, on the branch `slice-10b-procure-operator`, after `pnpm build`)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `procure/unit/view` (new: 15 tests of the state sentences, tags, counts, the operator's summary, fee count, service grouping) | 15 passed |
| `procure/unit/clusters`, `procure/unit/pool` | 2 passed, 5 passed |
| `procure/static/problems`, `procure/static/rules` | 2 passed, 10 passed (the second pins that the page prints a pool only as a lower bound) |
| `platform/static/page-lookups` (every message looked up with `Object.hasOwn`) | 2 passed |
| `journey/unit/contrast`, `journey/unit/progress` (the colour pairs and the step wording the pages are built from) | 8 passed, 22 passed |
| `procure/browser/procure` | 3 passed (43.6 s) |
| `procure/smoke/procure` | 6 passed (12.4 s) |
| Other suites that walk these two pages: `deliver/smoke/deliver`, `platform/smoke/built-app`, `demo/smoke/demo`, `deliver/browser/deliver`, `journey/browser/journey`, `demo/browser/walk` | 8, 12, 10, 3, 1 and 2 passed |
| The whole static layer | 21 of 23 suites passed; the two failures are not from this slice: `docs/static/api-sync` ("section 5 lists page /, which posts no form", the home page of the foundation commit) and `static/documentation` (links to documents not written yet) |
| `node scripts/test.mjs --check-catalogue` | clean, 82 suites |

No existing test was changed: every assertion of the three procure browser tests and six smoke tests passes as it was written. The integration suite (`procure/integration/procure-api`, 34 tests) was not run, because nothing it covers was touched.

### What was looked at

Both pages were opened in Chromium at 390 and 1280 pixels wide, in the light and the dark scheme, as the demonstration's owners A (described only, so the first visit), C (the finished example, a provider chosen), D (a provider chosen and a second requirement with no provider yet), F (two requirements, none with a provider chosen), G (four ideas ready to ask for, one requirement with providers to choose from) and as the operator, with a fee set, with none and no providers (a server without the demonstration), after adding a provider (the Not listed row), and with `?problem=` and `?listed=1`. The script that took them reported no horizontal scroll on any page. Things found by looking and fixed: the cluster explanation repeated on every idea card (now once, above them); a "turn" colour on ideas that were only optional once a requirement existed (`readyTone`); two primary buttons to the same page on a requirement with a provider chosen (the one in the card is now plain); the List and Unlist buttons wrapping over three lines (now one word, with the provider's name as the accessible name); a date breaking at its hyphen on a phone; a cluster name breaking onto a new line; a lede ending in a one-word line.

### What this does not show

- **No keyboard-only or screen-reader walk.** The forms are plain HTML with real labels, and the browser tests click and fill them; nobody tabbed through the pages or listened to them.
- **Chromium only**, with the synthetic sign-in. No other browser, no real phone, no slow connection.
- **Not independent**, and **no mutation checks** were run for this slice: the pages' wording is pinned by the existing tests and by the unit test of `src/view.ts`, which is a small set.
- **The wording is unproven with owners.** The sentences were written for a person who has never seen the service, but nobody who owns a factory has read them (the ten-owner test is where that is checked).
- **Two sentences were added** next to buttons (the provider cannot be changed afterwards; the cluster cannot be changed after a requirement is made). Each restates a limit already in this module's and the deliver module's status pages; neither is checked by a test of its own.

## Slice 11d: polish (6 October 2026, branch `slice-11d-polish`)

The author is an agent; no person has read this. Real results, after `pnpm build` of the tree that commit cbfd34f holds.

| Check | Result |
| --- | --- |
| `procure/unit/view` | 17 passed (2 more than the baseline of 15: the counts and words with a withdrawn requirement, and the sentence when nothing is left to ask for; the older tests were given the new field `withdrawnAsked` and are otherwise as they were) |
| `procure/unit/clusters`, `procure/unit/pool` | 2 and 5 passed |
| `procure/static/rules`, `procure/static/problems` | 10 and 2 passed |
| `procure/integration/procure-api` | 34 passed, unchanged |
| `procure/smoke/procure` | 6 passed (one assertion changed, see below) |
| `procure/browser/procure` | 3 passed (the test that withdraws a requirement now also checks that the bar reads "0 of N accepted ideas asked for. 1 withdrawn, which is not made again.", that the withdrawn idea is listed as withdrawn, and that there is no "Already asked for" list when nothing is open) |
| `demo/smoke/interface` | 5 passed: the operator with no fee, no provider and no pool reads "... Set it below, and listing opens.", "None yet. Add one in the form below, then list it so owners can choose it." and "No pool has reached five companies yet. A pool shows here once five or more companies ask for the same idea in the same cluster."; owner B's Choose page says why it is empty and where to go; a visitor is given a "Sign in" link |
| `demo/browser/phone` | 2 passed: `/procure` and `/operator` at 390 px do not scroll sideways for any person of the cast or a visitor; the providers table keeps `table`, `table-header-group`, `table-row` and `table-cell` display, is wider than the box, and scrolling the box does not move the page |

**One existing assertion was changed, and why.** `procure/smoke/procure` matched the assessment date as ISO text; the page now writes "4 October 2026" and the assertion matches that. Nothing was weakened: it still names the same date.

**Mutation checks (the unit tests only).** `asked` counting a withdrawn requirement, `ready` counting it as ready, and the label never saying "withdrawn" each made `procure/unit/view` fail; restored afterwards. The browser and smoke tests were not mutated. A measurement script, not a test, found the 109 px page overflow of the first version of the table box (see STATUS): the page was 499 px wide on a 390 px screen. The phone test measures the page width and should catch it, but it was written after the fix and was not run against the broken build.

**What this does not show.** Chromium only; 390 px only; no real phone, no screen reader, no keyboard walk of the table box. The owner's wording ("1 withdrawn, which is not made again") has not been read by an owner. The date is the UTC date.
