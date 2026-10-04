# Procure module: validation

Environment for every result below: a Linux container, Node v22.22.0, pnpm 11.25.0, Chromium 141.0.7390.37 through `playwright-core` 1.56.1, 5 October 2026. The agent that wrote the code ran every check here. No separate agent has read this slice yet and no person has; this page is updated when one does, and until then nothing on it is an independent finding.

## Results

Run in the working tree of branch `slice-4-procure`: `pnpm build`, then `node scripts/test.mjs pr --update-baseline --reason "slice 4 procure"`. Three full runs were needed. The first passed every code layer and failed only the documentation check (this module's status page linked to this page before it existed, and to a later slice's page); both were fixed. In the second, slice 2's integration suite printed all 23 tests as passed and then did not exit for 12 minutes (the local database harness, no CPU in use); I killed that process by hand, which made the runner count the suite as failed, so no baseline was written. It passed in 26 seconds in the third run and had passed in the first. I did not find the cause: a hang at the end of a Miniflare test process is a risk of this harness, not something this slice introduced as far as I can show. The third run is the table below: 40 suites, no failures. The pull request's own CI result is recorded below when it can be read.

| Suite | Result |
| --- | --- |
| procure/unit/clusters | 2 passed |
| procure/unit/pool | 4 passed (the floor of five, counting companies not requirements) |
| procure/integration/procure-api | 30 passed, against a real D1 database through Miniflare |
| procure/static/rules | 9 passed (queries bound to the company, the two cross-company reads, provider order by name only, the money columns) |
| procure/static/problems | 2 passed (every form outcome has a page message) |
| procure/smoke/procure | 6 passed, the built application in a local Worker |
| procure/browser/procure | 3 passed, a real headless Chromium |
| platform/integration/append-only-keys | 2 passed; reads every unique key of every append-only table from the migrated database and requires a trigger that looks at each |
| platform/unit/guards | 2 passed; checks the union of the append-only and rule triggers against the migrations |
| all other suites | unchanged from slice 3, all passed |
| static/typecheck, static/migrations | pass |

## Independent review

None yet. A separate agent will be asked to read this slice and try to break it; its findings and what was done about them will be recorded here. No person has reviewed this slice.

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

## What these results do not show

- **Not independent.** The same agent wrote the code, the tests and the mutations. A mutation set is only as good as the breaks its author thought of; it says nothing about the ones that were not thought of.
- **Triggers are exercised one probe per rule.** A trigger with the right name and a weaker body than tested would pass the name checks (the guards test and the health check). The integration tests run real SQL for each rule, once.
- **Two Workers racing were not run.** Concurrency is tested one request after another inside one process; SQLite serialises writers, and the statements are single statements.
- **Chromium only**, against a local Worker with a synthetic sign-in; no mobile viewport, no screen reader, no other browser.
- **The pool floor is a rule about publication, not a privacy guarantee.** Differencing at the boundary is possible and is limit 2 in the status page.
- **Every figure on the pages is a placeholder**: three invented clusters, no real provider, no real fee. Nothing here is evidence about whether owners or providers want this (see the ten-owner worksheet).
- **The pull request's CI result** was not read when this page was written.
