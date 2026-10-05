# Test scenarios

Version 0.1. Date 5 October 2026. Status: draft, not reviewed by a person.

A scenario is one end-to-end story: who does what, in what order, starting from what, and what must be true at the end. Where a [test case](TEST-CASES.md) checks one thing at one layer, a scenario follows a person across pages and stages, or follows one rule across every module that must keep it. This document lists twenty-seven scenarios, written from the tests that exist and from the business requirements. Each says which requirements it serves, at what layer it runs, and which test file runs it, or says that nothing runs it and who would. Nothing here says that a requirement is met or accepted. Everything the application holds is SYNTHETIC.

How this relates to the other documents: the [business requirements](../brd/BRD.md) give the requirement IDs; the [test cases](TEST-CASES.md) hold the individual checks that each scenario cites by ID; the [test strategy](TEST-STRATEGY.md) explains the layers; the [regression pack](REGRESSION-PACK.md) says which scenarios run when; the [UAT plan](UAT-PLAN.md) covers the scenarios that need people; the [test data](TEST-DATA.md) names the companies, people and providers used here; the [functional specification](../fsd/FSD.md) will carry the matching use cases.

## 1. How to read a scenario

Each scenario is a heading `SC-NN`, a table of fixed fields, numbered steps and an expected outcome. The fields:

| Field | Meaning |
| --- | --- |
| Goal | What the scenario is for, in one sentence |
| Actors | Who takes part. Owner A and Owner B are the platform's own two synthetic owners; the operator is the synthetic operator ([test data](TEST-DATA.md)) |
| Preconditions | What must be true before step 1 |
| Requirements | BR IDs from the BRD |
| Level run | The test layer, or manual when only people can run it |
| Automated by | The test file that runs it today, or none |
| Cases | The test cases it draws on |

AS BUILT means the steps are those of the test named, read from the test file. TO BE means the scenario describes what the BRD requires and no test runs it. A scenario that is partly one and partly the other says which part is which.

| ID | Scenario | Level run | Automated |
| --- | --- | --- | --- |
| SC-01 | An owner goes from describing the factory to the first review | browser | Yes |
| SC-02 | A second company sees none of it | browser, integration, smoke | Yes |
| SC-03 | The operator sees counts and never a company | integration | Yes |
| SC-04 | The floor of five, both directions | unit, integration, smoke, browser | Yes |
| SC-05 | Vendor neutrality: the dearer provider is chosen and the fee does not change | integration, static | Yes |
| SC-06 | No owner page shows a fee | smoke, browser | Yes |
| SC-07 | Every refusal an owner can meet | integration, smoke, browser | Partly |
| SC-08 | A stale save is refused | integration, smoke, browser | Yes |
| SC-09 | A rejected delivery is delivered again, to the cap | integration, smoke, browser | Yes |
| SC-10 | The order of delivery is enforced and an agreed plan is fixed | integration, unit | Yes |
| SC-11 | The 30, 90 and 180 day reviews open on their days | unit, integration, smoke, browser | Yes |
| SC-12 | The operator lists, unlists and changes the fee | integration, smoke | Yes |
| SC-13 | A member of the company reads and cannot change | integration | Partly |
| SC-14 | An expired session on a form post | integration | Partly |
| SC-15 | A request another website started is refused | unit, integration, smoke, browser | Yes |
| SC-16 | A record cannot be changed after the event | integration, static | Yes |
| SC-17 | Real data cannot get in | integration, smoke, unit | Partly |
| SC-18 | The hosted demonstration gate | unit, integration, smoke | Yes |
| SC-19 | The demonstration is seeded and its script can be followed | unit, static, smoke, browser | Yes |
| SC-20 | An engagement is closed early | integration | Yes |
| SC-21 | The ranking is repeatable and a signed-off assessment is fixed | unit, integration | Yes |
| SC-22 | An owner understands each page | manual | No |
| SC-23 | Ten owners, in sessions | manual | No |
| SC-24 | The pooling price test | manual | No |
| SC-25 | A person on the operator's side lists a provider and reads the pools unaided | manual | No |
| SC-26 | The presenter gives the demonstration | manual | No |
| SC-27 | A real owner signs in | manual | No |

## SC-01 An owner goes from describing the factory to the first review

| Field | Content |
| --- | --- |
| Goal | Show that each stage's page hands over to the next: nothing a page writes is unreadable to the page after it, and each stage's page can be reached from the home page |
| Actors | Owner A; the operator (in a second browser context) |
| Preconditions | The built application (`pnpm build`) in a local Worker with a fresh database and the synthetic seed; headless Chromium; no company has a provider listed |
| Requirements | BR-DESC-01, BR-DIAG-01, BR-PROC-01, BR-DEPL-01, BR-DEPL-03, BR-RUN-01, BR-RUN-02 |
| Level run | browser |
| Automated by | `modules/journey/tests/browser/journey.test.ts` |
| Cases | TC-DESC-53 |

Steps:

1. The operator signs in, opens the providers page, sets the one fee (₹1,500), adds a provider that serves the first idea in the first cluster and lists it.
2. Owner A signs in, opens Describe, changes what the unit makes and presses the confirm button. The page says version 2 is saved and confirmed.
3. Owner A opens the assessment page, makes an assessment from version 2, reads the five ideas, accepts each, and signs off. The page shows the sign-off date.
4. Owner A opens the requirements page, makes a requirement from the first idea in the first cluster, and sees the operator's provider offered.
5. Owner A chooses that provider, adds one milestone with a title, the test they will accept it by, a date and a price, and agrees the plan.
6. Owner A opens Results, sees nothing has been accepted, and records a starting number (42) with how it was counted.
7. Owner A opens Delivery, records that milestone 1 was delivered and accepts it.
8. Owner A opens Results again. The page says when the first acceptance happened and gives the dates 30, 90 and 180 days after it; no review form is offered.
9. Owner B signs in and opens the assessment, requirements, delivery and results pages; none shows Owner A's provider, milestone, number or note.

Expected outcome: every step above succeeds through the pages alone; the listing fee appears on no page Owner A read; no page error, console error or failed request occurred; no request left the application.

What it does not show: one path, one browser, one synthetic company whose first description is already confirmed. It cannot record a review, because a review opens 30 days after the first acceptance and the pages cannot move the clock (SC-11 covers that elsewhere). It goes back to the home page between stages and clicks the stage's link; it does not read the five steps, the next-step card or the first block of the home page (BR-UX-01, BR-UX-02), does not follow a page's own next-step button, and does not check that anyone can understand the pages (SC-22). It was never shown able to fail by a break in a page ([journey VALIDATION.md](../../modules/journey/VALIDATION.md)).

## SC-02 A second company sees none of it

| Field | Content |
| --- | --- |
| Goal | One company's data is never visible to another company |
| Actors | Owner A, Owner B |
| Preconditions | Owner A has done something at the stage under test (a description, an assessment, a requirement, an engagement, a result) |
| Requirements | BR-ID-03 |
| Level run | integration, smoke, browser, with static rules |
| Automated by | `modules/platform/tests/browser/session-and-scope.test.ts`, `modules/factory/tests/browser/describe.test.ts`, `modules/diagnose/tests/browser/diagnose.test.ts`, `modules/procure/tests/browser/procure.test.ts`, `modules/deliver/tests/browser/deliver.test.ts`, `modules/run/tests/browser/run.test.ts`, and each module's integration and smoke suite |
| Cases | TC-ID-19 to TC-ID-51, TC-ID-115 to TC-ID-135 |

Steps:

1. Owner A creates a record at a stage.
2. Owner B, signed in, asks for Owner A's record by its address and by naming it under Owner B's own company, from the pages and from a script.
3. Owner B also tries to change it: a save, a decision, a requirement, a milestone, a starting number.
4. The same probes are repeated by a visitor who is not signed in and by a user whose cookie was tampered with.

Expected outcome: each read is a 404 identical to the answer for a record that does not exist; each write is refused and writes nothing; each refused attempt by a known person is audited with the person and the company, and at most 64 characters of the asked-for company id are stored; a visitor is asked to sign in and sees no record. Every query on a company's table is bound to a company, and pages and routes do not query those tables themselves (static rules).

Not shown: probes were written module by module, so a new route can be added without one. A single walk over every route with a second company's cookie does not exist (TC-ID-52, designed).

## SC-03 The operator sees counts and never a company

| Field | Content |
| --- | --- |
| Goal | The operator's role does not override a company's scope, and the operator's only aggregate carries no company data |
| Actors | The operator; Owners with requirements |
| Preconditions | Five companies have each made a requirement for one idea in one cluster |
| Requirements | BR-ID-04, BR-GOV-05, BR-OPS-02 |
| Level run | integration, unit |
| Automated by | `modules/platform/tests/integration/platform-api.test.ts`, `modules/platform/tests/unit/scope.test.ts`, `modules/procure/tests/integration/procure-api.test.ts` |
| Cases | TC-ID-53 to TC-ID-64, TC-GOV-17, TC-OPS-02, TC-OPS-04 |

Steps:

1. The operator signs in and asks for a company record, a description, an assessment, a delivery page and a result.
2. The operator reads the list of pools.
3. A user who has a company but the operator role, and a user with neither a company nor the operator role, try the operator's endpoints.

Expected outcome: no company is read by the operator; the operator is told what a missing record says. The list of pools is one row of cluster, idea and the count 5, with no company id, user id, company name or requirement id in its text. An account that belongs to a company is not an operator. Only the operator changes the registry or the fee.

Not shown: the operator's role to see which owners have stopped at a stage (BR-OPS-03) does not exist, and its data-scope decision is open (OQ-08, OQ-18).

## SC-04 The floor of five, both directions

| Field | Content |
| --- | --- |
| Goal | No figure about a pool is shown to anyone from fewer than five companies, and at five the number shown is a lower bound that does not reveal the count |
| Actors | Five owners, the operator |
| Preconditions | Four companies have made requirements for the same idea in the same cluster |
| Requirements | BR-GOV-06, BR-PROC-02, BR-OPS-02 |
| Level run | unit, integration, smoke, browser |
| Automated by | `modules/procure/tests/unit/pool.test.ts`, `modules/procure/tests/integration/procure-api.test.ts`, `modules/procure/tests/smoke/procure.test.ts`, `modules/procure/tests/browser/procure.test.ts`, `modules/demo/tests/smoke/demo.test.ts` |
| Cases | TC-GOV-20 to TC-GOV-34, TC-OPS-03 |

Steps:

1. Each member of the pool and the operator read: no number and no pool is shown to any of them.
2. A fifth company makes a requirement for the same idea in the same cluster. Each member reads again, and so does the operator.
3. One company withdraws. Everyone reads again.
4. A company with several requirements is counted once; requirements of another idea or another cluster do not join the pool.
5. At unit level the pool size is presented for 0 to 4, 5, 9, 10 and a non-integer.

Expected outcome: at four, nothing; at five every member sees "at least 5" and the operator's list holds the pool as the count 5; at nine the member sees the same as at five, so crossing five does not reveal the count; at ten, "at least 10"; after the withdrawal both fall back below the floor. The owner page says why no number is shown. The demonstration is built to show this on purpose: one pool at five, one that stays under five even when the walked company joins.

Not shown: the floor is a rule about what is published, not a privacy guarantee; differencing at the boundary is possible ([procure VALIDATION.md](../../modules/procure/VALIDATION.md)). Whether the floor applies to a pool's own members is open (OQ-14); the build takes the cautious reading.

## SC-05 Vendor neutrality: the dearer provider is chosen and the fee does not change

| Field | Content |
| --- | --- |
| Goal | What APLYD earns does not vary with which provider an owner chooses (D-03) |
| Actors | The operator, Owner A |
| Preconditions | The operator has set a fee and listed one provider |
| Requirements | BR-GOV-02, BR-PROC-05, BR-PROC-06, BR-DEPL-01, BR-DEPL-04 |
| Level run | integration, static |
| Automated by | `modules/deliver/tests/integration/deliver-api.test.ts`, `modules/procure/tests/integration/procure-api.test.ts`, `modules/procure/tests/static/rules.test.ts`, `modules/deliver/tests/static/rules.test.ts` |
| Cases | TC-GOV-02 to TC-GOV-11, TC-PROC-40, TC-DEPL-46 |

Steps:

1. The operator lists a provider, changes the fee to ₹90,000 and lists a second, so the two listings carry different fees.
2. Owner A chooses the second, the dearer. The plan is agreed, delivered, accepted, paid ₹40,000 and closed.
3. The fee tables are read before and after.
4. The operator lists three providers while a request body asks for fee 1 and for fee 5,000; direct inserts of a listing with the wrong fee are tried.
5. Owner A reads the providers offered for a requirement.

Expected outcome: the dearer-listed provider is chosen exactly as the cheaper one could be; the fee tables are identical before and after; every listing carries the one fee in force and the database refuses another; providers are shown in name order, with nothing that depends on listing time or fee. Static rules show that no query joins an owner's price or payment to the listing fee, that the engagement tables hold no fee, share or commission, and that the outcome table holds nothing about money.

Not shown: there is no revenue model beyond one flat placeholder fee (OQ-11), so a test that no revenue path depends on the vendor cannot be written (TC-GOV-13, TC-COM-01). Providers listed at different times pay different fees, a stated limit (TC-PROC-26).

## SC-06 No owner page shows a fee

| Field | Content |
| --- | --- |
| Goal | The listing fee is for the operator only |
| Actors | The operator, owners |
| Preconditions | The operator has set a fee and listed a provider |
| Requirements | BR-COM-02, BR-GOV-02, BR-PROC-06 |
| Level run | smoke, browser |
| Automated by | `modules/demo/tests/smoke/demo.test.ts`, `modules/deliver/tests/smoke/deliver.test.ts`, `modules/procure/tests/browser/procure.test.ts`, `modules/journey/tests/browser/journey.test.ts` |
| Cases | TC-COM-02, TC-COM-03, TC-GOV-12, TC-PROC-32, TC-PROC-27, TC-OPS-01 |

Steps:

1. The operator sets a fee and lists a provider, and reads their own page.
2. An owner opens every page and answer the owner can reach, including the requirement, provider and delivery pages.

Expected outcome: the operator sees one fee and the listed providers; the fee is on none of the owner's pages or answers. Only the operator reads the fee through the programming interface.

Not shown: pages that appear only after an action are covered only by the paths walked.

## SC-07 Every refusal an owner can meet

| Field | Content |
| --- | --- |
| Goal | Each way an owner's action can be refused is refused, writes nothing, and says why in plain words on the page |
| Actors | An owner, mostly through forms |
| Preconditions | The owner is at the stage in the row |
| Requirements | BR-UX-06, BR-DESC-03, BR-DIAG-05, BR-PROC-01, BR-DEPL-02, BR-DEPL-03, BR-RUN-01, BR-RUN-02 |
| Level run | integration, smoke, browser, static |
| Automated by | `modules/factory/tests/integration/factory-api.test.ts`, `modules/diagnose/tests/integration/diagnose-api.test.ts`, `modules/procure/tests/integration/procure-api.test.ts`, `modules/deliver/tests/integration/deliver-api.test.ts`, `modules/run/tests/integration/run-api.test.ts`, with the static message checks in each module |
| Cases | TC-DESC-44, TC-DIAG-65, TC-PROC-13, TC-DEPL-45, TC-RUN-42, TC-UX-06, TC-UX-09, TC-UX-10 |

Steps: for each row, do the action in the second column; the form goes back to the page with the key shown, and the page prints its message.

| Stage | Refusal (the key in the address) | What triggers it |
| --- | --- | --- |
| Any | Not signed in | A page opened with no session shows a link to sign in and no record |
| Any owner page | The page is for the owner | A member who is not the owner, or the operator, opens an owner page (TC-ID-69, TC-DESC-17) |
| Describe | `invalid`, `note`, `request`, `too_many` | An answer breaks the questionnaire; a note over 500 characters; an incomplete request; a company at 500 saved versions |
| Describe | stale, missing | The page was out of date when saved (SC-08); confirming without the five required answers saves a draft and lists what is missing |
| Describe | an empty draft | Pressing save with nothing filled in writes nothing |
| Diagnose | no confirmed description | Making an assessment before a description is confirmed sends the owner to Describe (409 through the interface) |
| Diagnose | `decision`, `note`, `signed`, `undecided`, `changed`, `too_many`, `no_items`, `missing` | A decision that is not one of three answers; a long note; a change after sign-off; a sign-off with an idea undecided; a decision that landed while signing; 200 decisions reached; no ideas to sign off; an assessment that is not there |
| Procure | `request`, `not_signed_off`, `not_accepted`, `already_made`, `previously_withdrawn`, `note`, `withdrawn`, `missing` | A cluster not chosen; an assessment not signed off; an idea not accepted; the same requirement asked twice; a requirement asked again after being withdrawn; and so on |
| Procure | `engaged`, `engage`, `provider_unavailable`, `already_engaged` | Withdrawing a requirement that has a provider; no provider chosen; a provider unlisted since; a second provider for the same requirement |
| Deliver | `invalid`, `plan_locked`, `too_many`, `closed`, `already_agreed`, `no_milestones`, `not_agreed`, `wrong_state`, `too_many_deliveries`, `missing` | A bad milestone or date; a milestone added after agreement; a thirteenth milestone; any change after closing; agreeing twice; agreeing an empty plan; recording before agreeing; recording out of order; a fifteenth delivery; an engagement or milestone that is not there |
| Run | `invalid`, `baseline_exists`, `baseline_too_late`, `review_exists`, `nothing_accepted`, `not_due`, `missing` | A number that is not a whole number from 0 to 1,00,00,00,000 (a count or figure of the owner's own, not rupees), or a review with no verdict; a second starting number; a starting number after the first acceptance; a second record of one review; a review before anything is accepted; a review before its day; an engagement that is not there |
| Operator | `provider`, `fee`, `note`, `fee_undecided`, `no_service`, `already_listed`, `not_listed`, `missing` | A provider with no name, idea or cluster; a fee that is not a whole number of rupees from 1 to ₹1,00,00,000; listing before any fee is set; listing a provider that serves nothing; listing a listed provider; unlisting one that is not listed |

Expected outcome: in each row nothing is written; the owner is returned to the page with a message in plain words, never to a document of JSON. After the person is known, every refusal of a form goes back to the page.

Not shown: before the person is known (no session, an expired one, another website, an oversize body) a form is answered with JSON today (SC-14). The message texts are the product's own words and have not been read by an owner (SC-22).

## SC-08 A stale save is refused

| Field | Content |
| --- | --- |
| Goal | Two saves from the same starting version cannot both win, and the loser is told |
| Actors | One owner with two tabs, or two people in one company |
| Preconditions | A company with a confirmed description at version 1 |
| Requirements | BR-DESC-03, BR-DESC-02, BR-UX-06, BR-DIAG-05 |
| Level run | integration, smoke, browser |
| Automated by | `modules/factory/tests/integration/factory-api.test.ts`, `modules/factory/tests/smoke/describe.test.ts`, `modules/factory/tests/browser/describe.test.ts`, `modules/diagnose/tests/integration/diagnose-api.test.ts` |
| Cases | TC-DESC-34 to TC-DESC-37, TC-DESC-39, TC-DIAG-40, TC-DIAG-41 |

Steps:

1. The owner opens Describe in two tabs, both based on version 1.
2. The owner saves in the first tab: version 2 is written.
3. The owner saves in the second: it is based on version 1.
4. Separately: a decision is added to an assessment between the moment a sign-off reads the decisions and the moment it signs; two sign-offs are sent at once.

Expected outcome: the second save is not written, the page says someone saved a newer version while the owner was typing, shows the newest version and asks the owner to make the changes again; a write that fails for another reason is not called stale. A sign-off never covers a decision it did not read: the sign-off fails with `changed`, and only one of two simultaneous sign-offs succeeds.

Not shown: requests racing inside two Workers were not run; the guarantee rests on one SQL statement and a unique key, and SQLite serialises writers.

## SC-09 A rejected delivery is delivered again, to the cap

| Field | Content |
| --- | --- |
| Goal | An owner who rejects a delivery lets the provider deliver again, up to a fixed number of times, and then only closing is left |
| Actors | Owner A |
| Preconditions | An engagement with an agreed plan of at least one milestone |
| Requirements | BR-DEPL-03, BR-UX-06 |
| Level run | integration, smoke, browser, unit |
| Automated by | `modules/deliver/tests/integration/deliver-api.test.ts`, `modules/deliver/tests/smoke/deliver.test.ts`, `modules/deliver/tests/browser/deliver.test.ts`, `modules/deliver/tests/unit/state.test.ts` |
| Cases | TC-DEPL-16, TC-DEPL-20 to TC-DEPL-23, TC-DEPL-26, TC-DEPL-44, TC-DEPL-47 |

Steps:

1. Record that milestone 1 was delivered; reject it; record that it was delivered again; accept it; record a payment; close the engagement.
2. On another milestone, deliver and reject 14 times, then try a 15th delivery.
3. On a third, use 13 deliveries and accept the 14th.
4. At the cap, open the page.

Expected outcome: each state, next step and total is right at each step. The 15th delivery is refused (`too_many_deliveries`), nothing is written, and the other milestones are unaffected. At the cap the page stops offering a delivery and says why: if the last delivery is still waiting the owner decides on it, and once it is rejected only closing the engagement is left. A delivery awaiting a decision and one refused for the cap are refused for their own reasons.

Not shown: 14 is a number chosen by the builders, not found with owners (BRD assumptions).

## SC-10 The order of delivery is enforced and an agreed plan is fixed

| Field | Content |
| --- | --- |
| Goal | Nothing is delivered, accepted or paid out of order, and a plan cannot be changed once agreed |
| Actors | Owner A |
| Preconditions | An engagement with a provider chosen |
| Requirements | BR-DEPL-02, BR-DEPL-03, BR-DEPL-04 |
| Level run | integration, unit, smoke |
| Automated by | `modules/deliver/tests/integration/deliver-api.test.ts`, `modules/deliver/tests/unit/state.test.ts`, `modules/deliver/tests/smoke/deliver.test.ts` |
| Cases | TC-DEPL-06 to TC-DEPL-11, TC-DEPL-17, TC-DEPL-18, TC-DEPL-24, TC-DEPL-25, TC-DEPL-29 to TC-DEPL-31 |

Steps:

1. Add milestones one at a time with a title, a test, a real calendar date and a whole-number price; try the thirteenth, a bad date and an empty title.
2. Try to agree an empty plan; agree a plan; agree again; add another milestone.
3. Before agreement try to deliver, accept, reject or pay.
4. After agreement try to accept, reject or pay a milestone not yet delivered; deliver twice; pay before acceptance; pay a fractional or non-numeric amount.
5. Try each by direct SQL as the database would see it.

Expected outcome: a plan holds at most 12 milestones; agreeing needs a milestone and happens once; after agreement no milestone can be added or replaced; before agreement everything is refused with `not_agreed`, and each skip afterwards with `wrong_state`; a payment is accepted only on an accepted milestone and in whole rupees. What the page offers next is exactly what the database would accept, and the state table in the code says what the migration's trigger says. A locked plan and a closed engagement are told apart.

Not shown: that the amount paid matches the agreed price is not checked (TC-DEPL-32, cannot be tested until it is a rule); the platform holds and moves no money, and the payment is the owner's own record.

## SC-11 The 30, 90 and 180 day reviews open on their days

| Field | Content |
| --- | --- |
| Goal | A review can be recorded only from its day, is timed from the first acceptance, and is recorded once |
| Actors | Owner A |
| Preconditions | An engagement with a milestone accepted. The application's clock cannot be moved, so the tests give the database an acceptance dated in the past |
| Requirements | BR-RUN-02, BR-RUN-01, BR-RUN-03, BR-RUN-04 |
| Level run | unit, integration, smoke, browser |
| Automated by | `modules/run/tests/unit/state.test.ts`, `modules/run/tests/integration/run-api.test.ts`, `modules/run/tests/smoke/run.test.ts`, `modules/run/tests/browser/run.test.ts` |
| Cases | TC-RUN-01 to TC-RUN-04, TC-RUN-12 to TC-RUN-26, TC-RUN-31 |

Steps:

1. Before any acceptance: the page waits and offers the starting number; record it once; a second is refused.
2. Accept a milestone. A starting number can no longer be taken.
3. Record reviews 1, 2 and 3 a millisecond before and exactly at 30, 90 and 180 days after the first acceptance.
4. Accept further milestones at other times, record a review late, record the reviews in either order, record one twice.
5. Read the change since the baseline and the next idea.

Expected outcome: a review is refused before its instant and accepted at it, to the millisecond; the days are counted from the first acceptance and not the latest; a late review is recorded; reviews do not depend on one another and each is recorded once; the change shown is the latest review less the baseline, and with no baseline there is no change to show; the next idea is the first accepted idea with no requirement, and never one the owner did not accept. The page shows the date each review opens and offers none before then.

Not shown: through the pages alone no review can be recorded, because the application's clock cannot be moved. The Run browser test adds an acceptance dated in the past directly to its throwaway database, as the application would have added it on an earlier day, and the journey test checks the three dates as dates. The number is the owner's own word and the expected range is an invented figure; nothing here says a review is useful to an owner.

## SC-12 The operator lists, unlists and changes the fee

| Field | Content |
| --- | --- |
| Goal | The operator keeps the provider registry and the one fee, and owners see only providers listed now |
| Actors | The operator, an owner |
| Preconditions | No fee is set and no provider exists |
| Requirements | BR-PROC-04, BR-PROC-05, BR-PROC-06, BR-OPS-01 |
| Level run | integration, smoke |
| Automated by | `modules/procure/tests/integration/procure-api.test.ts`, `modules/procure/tests/smoke/procure.test.ts`, `modules/procure/tests/browser/procure.test.ts` |
| Cases | TC-PROC-15 to TC-PROC-32 |

Steps:

1. The operator adds a provider with a name, a one-line summary and the ideas and clusters it serves, and tries to list it before a fee exists.
2. The operator sets a fee, lists the provider, lists it again, unlists it, unlists it again, changes the fee, and lists it once more.
3. At each stage an owner reads the providers offered for a requirement and the operator reads the registry.
4. The operator tries fees of 0, -5, 1.5, abc, empty, ₹1,00,00,001 and a note of 501 characters; then 42 and ₹1,00,00,000.

Expected outcome: listing is refused while no fee is set (the page says so); until listed a provider is shown to no owner; listing a listed provider and unlisting an unlisted one are refused; an unlisted provider leaves the owners' views; listing again records the fee then in force; every provider, what it serves, whether it is listed and the fee it was listed at are in the operator's registry. Fees that are not whole rupees from 1 to ₹1,00,00,000 are refused and write nothing; what a provider serves is fixed from its first listing; the registry and the fee are append-only. A new fee is a new version, and earlier listings keep theirs.

Not shown: the fee of 1 is not asserted at the edge. A provider does not sign in and does not see its listing (OQ-19).

## SC-13 A member of the company reads and cannot change

| Field | Content |
| --- | --- |
| Goal | A person who works at the owner's company, but is not the owner, can read the company's record through the interface and cannot change it |
| Actors | A member of Owner A's company |
| Preconditions | A user in the company that has a record whose role is not owner (the tests insert one with the role `viewer`; the BRD calls such a person a member) |
| Requirements | BR-ID-05 |
| Level run | integration, unit |
| Automated by | `modules/factory/tests/integration/factory-api.test.ts`, `modules/diagnose/tests/integration/diagnose-api.test.ts`, `modules/deliver/tests/integration/deliver-api.test.ts`, `modules/run/tests/integration/run-api.test.ts`, `modules/diagnose/tests/unit/not-owner.test.ts` |
| Cases | TC-ID-65 to TC-ID-70 |

Steps:

1. The member reads the company's description, assessment, delivery and results through the interface.
2. The member tries each write: a save, an assessment, a decision, a sign-off, a milestone, a delivery, a starting number.
3. The member opens an owner page.

Expected outcome (AS BUILT): through the interface every read succeeds (200) and every write is refused with 403 and the answer `forbidden`, with nothing written; the Diagnose test also finds three denied-write audit entries. Through the pages the member is told the page is for the owner, which is a different sentence from the one for a person with no company. Not met (TO BE): the member should see the record read-only on the pages, and does not (TC-ID-70, designed). The requirement is Partial for this reason.

Not shown: the member cases are marked Partly in the case table because each test checks the interface and the message, not a read-only view on the pages.

## SC-14 An expired session on a form post

| Field | Content |
| --- | --- |
| Goal | A person whose session has ended, and who sends a form, is told in plain words and sent to sign in again |
| Actors | Owner A |
| Preconditions | A session older than eight hours (28,800 seconds), or a cleared cookie |
| Requirements | BR-UX-06, BR-ID-01 |
| Level run | integration (AS BUILT); browser (TO BE) |
| Automated by | `modules/platform/tests/integration/platform-api.test.ts` (expiry to the second), `modules/run/tests/integration/run-api.test.ts` (the answer), no test of the page |
| Cases | TC-ID-03, TC-UX-07, TC-UX-08 |

Steps:

1. The owner signs in; the session is read 28,799 seconds later and at 28,800.
2. The owner, with no valid session, posts a form to a Run endpoint.
3. The same is repeated for another company's owner naming this company, for the operator, from another website and with a body over the limit.

Expected outcome (AS BUILT): the session is accepted at 28,799 seconds and refused at 28,800. A form refused before the person is known is answered with JSON: 401 with no session, 404 for another company's owner and for the operator, 403 for another website, 413 for an oversize body; nothing is written. After the person is known, every refusal goes back to the page.

Expected outcome (TO BE): the person is sent back to the page with a message in plain words and a way to sign in again (TC-UX-08, designed). Today the person gets JSON, and BR-UX-06 is not met in this case. The test records today's behaviour on purpose: when the behaviour is fixed the test and its case change together.

## SC-15 A request another website started is refused

| Field | Content |
| --- | --- |
| Goal | A page on another website cannot make a signed-in owner's browser change anything |
| Actors | Owner A; a page on another website |
| Preconditions | Owner A is signed in |
| Requirements | BR-ID-01, BR-NFR-13 (the BRD has no requirement that names this refusal; these are the nearest) |
| Level run | unit, integration, smoke, browser |
| Automated by | `modules/platform/tests/unit/cross-site.test.ts`, `modules/platform/tests/integration/platform-api.test.ts`, `modules/platform/tests/smoke/built-app.test.ts`, `modules/platform/tests/browser/cross-origin.test.ts`, and each module's integration suite |
| Cases | TC-ID-80 to TC-ID-97, TC-ID-137 to TC-ID-145 |

Steps:

1. In a browser, post the sign-in form with a foreign Origin; then from the application's own origin; then with Origin `null` and with an origin that only begins like the application's.
2. Open another website that posts a form to the application, with Owner A signed in; try sign-out with a foreign Origin.
3. Send a changing request to each module's endpoints with a foreign Origin.
4. Through the hosting gateway, send an Origin that is this site's own and one that is foreign.

Expected outcome: the foreign Origin is refused and sets no cookie; the application's own is accepted, so the refusal is not a broken request; `null` and the look-alike are refused; a foreign Origin cannot sign Owner A out; every module's changing endpoints refuse and write nothing; reading requests are never refused on origin; a request refused as cross-site has its body read, so the connection is left clean and the next request still works. The gateway rewrites an Origin that is the site's own, and leaves a foreign one for the application.

Not shown: a changing request with neither Origin nor Sec-Fetch-Site is allowed, and a test records that as a limit (TC-ID-87). The other website is simulated inside the browser by a test route; other browsers were not tried.

## SC-16 A record cannot be changed after the event

| Field | Content |
| --- | --- |
| Goal | Confirmed records, revisions, audit entries, sign-offs, events and applied migrations are never edited, deleted or replaced |
| Actors | None: direct SQL against the database, as a defect or an attacker through the application would |
| Preconditions | A database with the migrations and seed applied and rows in each append-only table |
| Requirements | BR-DATA-04, BR-ID-06, BR-NFR-02, BR-DIAG-05 |
| Level run | integration, unit, static |
| Automated by | `modules/platform/tests/integration/append-only-keys.test.ts`, `modules/platform/tests/integration/platform-api.test.ts`, `modules/platform/tests/unit/guards.test.ts`, `modules/diagnose/tests/integration/diagnose-api.test.ts`, `modules/deliver/tests/integration/deliver-api.test.ts`, `modules/run/tests/integration/run-api.test.ts`, `modules/factory/tests/integration/factory-api.test.ts`, `modules/procure/tests/integration/procure-api.test.ts` and each module's static rules |
| Cases | TC-DATA-11 to TC-DATA-18, TC-ID-71, TC-ID-72, TC-ID-136, TC-DESC-22, TC-DIAG-42, TC-DIAG-43, TC-PROC-19, TC-NFR-11 to TC-NFR-13, TC-NFR-37 |

Steps:

1. For each append-only table, try UPDATE, DELETE, `INSERT OR REPLACE` and `REPLACE INTO` on its id and on each unique key; try a second sign-off by a plain insert, a replace and an upsert.
2. Read every append-only table's unique keys and its triggers; feed the checker a plain key, a composite key and a partial index with no trigger.
3. Remove a trigger and read the health check.
4. Scan every query in the application for a statement that changes, deletes or replaces a row of those tables.

Expected outcome: each attempt is refused and the earlier rows are as they were; every unique key has a before-insert trigger, so a replace cannot delete a row through it; the key checker reports each unguarded key it is fed; the health check reports degraded when a guard is missing, including a trigger of the right name on the wrong table; no query in the application changes an append-only table. The sign-off's digest is recomputed on every read, so a change made outside the application shows as a mismatch.

Not shown: `DROP TRIGGER`, `DROP TABLE` and `ALTER TABLE` cannot be stopped inside SQLite. Triggers are exercised one probe per rule, so a trigger with the right name and a weaker body would pass the name checks. The digest detects a change; it does not prevent one.

## SC-17 Real data cannot get in

| Field | Content |
| --- | --- |
| Goal | The application takes only synthetic data and refuses to run as anything else |
| Actors | Anyone trying to sign in; the operator of the host |
| Preconditions | Varies by step |
| Requirements | BR-DATA-01, BR-UX-08, BR-ID-01 |
| Level run | unit, integration, smoke |
| Automated by | `modules/platform/tests/integration/platform-api.test.ts`, `modules/platform/tests/smoke/built-app.test.ts`, `modules/platform/tests/unit/secret.test.ts`, `modules/hosting/tests/unit/gate.test.ts`, `modules/demo/tests/unit/cast.test.ts`, `modules/diagnose/tests/unit/engine.test.ts`, `modules/platform/tests/static/source-rules.test.ts` |
| Cases | TC-ID-09 to TC-ID-11, TC-DATA-01 to TC-DATA-08, TC-OPS-48, TC-UX-20 to TC-UX-25 |

Steps:

1. Sign in as a user who is not marked synthetic.
2. Configure an environment that is not local, synthetic or test, or no secret; sign in.
3. Run the built application with a good secret and no environment name.
4. Start the hosting launcher for `production`, for a typo and for a different case of an allowed name.
5. Read the cast, the library and the pages for text that looks like a real address, phone number, web address or person; read the tracked files for secrets, databases and build output.

Expected outcome: each sign-in is refused and the page says so; the built application has no synthetic sign-in; the launcher refuses each non-synthetic environment; no text in the cast looks real, every cast member and cluster and assessment says SYNTHETIC, every page carries the banner; no tracked file is a secret, a database, build output or a source document.

Not shown: a person can still type real data into a free-text box, and nothing detects it (BRD risk RK-10). Every page carrying the banner is designed, not run (TC-UX-26).

## SC-18 The hosted demonstration gate

| Field | Content |
| --- | --- |
| Goal | The hosted demonstration is reachable only with the shared password, refuses to start unsafely, and keeps its health route open |
| Actors | The host operator, a visitor with and without the password |
| Preconditions | The built application and the launcher `scripts/serve.mjs`; no real host is involved, the tests run on loopback |
| Requirements | BR-OPS-08, BR-OPS-06, BR-NFR-01, BR-NFR-03, BR-DATA-01 |
| Level run | unit, integration, smoke, static |
| Automated by | `modules/hosting/tests/unit/gate.test.ts`, `modules/hosting/tests/integration/gateway.test.ts`, `modules/hosting/tests/smoke/serve.test.ts`, `modules/hosting/tests/static/deploy-files.test.ts` |
| Cases | TC-OPS-30 to TC-OPS-66, TC-OPS-10 |

Steps:

1. Start the launcher with a real environment name, a weak secret and no gate; each time read the output.
2. Start it with a gate. Request a page with no password, a wrong one and the right one; request the health route with none; request a neighbour of the health path.
3. Start it with open access asked for, and without; stop it with SIGTERM.
4. Post a foreign Origin, then a normal request; post a body over the limit, declared and streamed.
5. While the application is still starting, then with it down, request pages and the health route.
6. Read the Dockerfile, the app spec and the ignore file.

Expected outcome: the launcher refuses to start (exit code 2) for each unsafe configuration, naming every problem and never printing the secret; without the password a page is 401 and never reaches the application; the health route alone is open and says only ok or not; the password is not handed to the application; open access works only when asked for; the next request after a refused one still works; an oversize body is 413 before the application reads it; during start-up every other request is 503 after the gate, and with the application down the gateway says 502 and its health route 503. The deployment files hold no secret and the container runs as a non-root user.

Not shown: the Dockerfile and the app spec were never built or applied; the gate is one shared password with no per-person accounts and no lockout; nothing was run on a real host ([hosting VALIDATION.md](../../modules/hosting/VALIDATION.md)).

## SC-19 The demonstration is seeded and its script can be followed

| Field | Content |
| --- | --- |
| Goal | A presenter can start the demonstration, sign in as each person of the cast, and follow the eight steps of the script as written |
| Actors | The presenter (played by a browser), the cast of five synthetic companies, three synthetic providers, the operator |
| Preconditions | The built application and the launcher with `APLYD_DEMO=true`; a database built at start |
| Requirements | BR-OPS-07, BR-GOV-06, BR-DATA-01 |
| Level run | unit, static, smoke, browser |
| Automated by | `modules/demo/tests/unit/cast.test.ts`, `modules/demo/tests/unit/script.test.ts`, `modules/demo/tests/unit/seed-checks.test.ts`, `modules/demo/tests/static/script-labels.test.ts`, `modules/demo/tests/smoke/demo.test.ts`, `modules/demo/tests/browser/walk.test.ts` |
| Cases | TC-OPS-11 to TC-OPS-29, TC-OPS-67 to TC-OPS-70, TC-GOV-33, TC-GOV-34, TC-DIAG-26 |

Steps:

1. Start the launcher in demonstration mode; read what it reports it added.
2. Sign in as each person of the cast; read each company's stage.
3. Open `/demo` with and without demonstration mode.
4. A browser follows the eight steps in order: the operator's fee and providers; describe the factory; make and sign off an assessment; ask for the two ideas in two clusters; choose a provider and agree a plan; record the starting number, a delivery and an acceptance; read a company that is further on; sign in as the second company and find none of it.
5. Check the script against the data: every person and label it names exists, the cluster and fee statements match the cast, and it never claims what the application does not do.

Expected outcome: the seeder adds five companies, three providers and their requests through the application's own requests; the finished example has a starting number, one milestone accepted and paid and one delivered and waiting; the walked company has its confirmed description and nothing else; the other company has nothing; the first pool says "at least 5" and the second says nothing; the script page exists only in demonstration mode and says it is synthetic; the steps allot 10 to 20 minutes together; each step can be followed with no page error; the same first and second idea are ranked for every company.

Not shown: nobody has watched the demonstration presented, and the walk follows the script mechanically (SC-26). The cast is five similar garment units, on purpose, so the ranking is the same.

## SC-20 An engagement is closed early

| Field | Content |
| --- | --- |
| Goal | An owner can end an engagement at any point and the record says it ended early |
| Actors | Owner A |
| Preconditions | An engagement with a provider chosen, with or without a plan |
| Requirements | BR-DEPL-09, BR-DEPL-01 |
| Level run | integration, unit |
| Automated by | `modules/deliver/tests/integration/deliver-api.test.ts`, `modules/deliver/tests/unit/state.test.ts` |
| Cases | TC-DEPL-03, TC-DEPL-37 to TC-DEPL-41 |

Steps:

1. Close an engagement with a milestone not accepted.
2. Close an engagement before any plan was agreed, then try to add a milestone.
3. Close an engagement of one company and read another's.
4. Try to withdraw a requirement that has a provider; unlist the provider after the choice.

Expected outcome: status is "ended early" in both closed cases and "complete" only if every milestone was accepted; nothing can be added after closing; a close is looked for in the engagement asked about; a requirement with a provider cannot be withdrawn, and unlisting a provider does not end the engagement.

Not shown: the strict reading of one engagement per requirement (OQ-15): a wrong click or a failed provider is permanent for that requirement. A second engagement for the same requirement (BR-PROC-10) is not built and cannot be tested.

## SC-21 The ranking is repeatable and a signed-off assessment is fixed

| Field | Content |
| --- | --- |
| Goal | The same answers always give the same ranked list, and once the owner signs off, the assessment cannot change |
| Actors | Owner A |
| Preconditions | A confirmed description |
| Requirements | BR-DIAG-01, BR-DIAG-02, BR-DIAG-03, BR-DIAG-04, BR-DIAG-05 |
| Level run | unit, integration |
| Automated by | `modules/diagnose/tests/unit/engine.test.ts`, `modules/diagnose/tests/unit/pins.test.ts`, `modules/diagnose/tests/unit/digest.test.ts`, `modules/diagnose/tests/integration/diagnose-api.test.ts` |
| Cases | TC-DIAG-01 to TC-DIAG-15, TC-DIAG-24, TC-DIAG-27 to TC-DIAG-39 |

Steps:

1. Make an assessment; ask again for the same version; confirm a newer description and read the old assessment.
2. Run the engine for fixed golden descriptions, including an empty result, a full one and ties.
3. Turn every idea's kind around (AI and not AI).
4. Decide on each idea, change a decision, sign off, try another decision, and change a decision directly in the database.

Expected outcome: asking again returns the one assessment already there, with one row and one audit entry; a later change in the description does not change a stored assessment; the golden results equal those recorded for the engine and library versions, so a change without a version bump fails; turning every idea's kind around changes no score and no order, so an AI idea gets no advantage for being AI; the list is in score order with ties broken by id, and at most eight ideas are shown; a signed-off assessment records who and when with a matching digest, and the digest is recomputed on every read.

Not shown: the ranking weights and every library figure are placeholders chosen by the builders; the tests show the engine does what its rules say, not that the rules suit a real factory. The edge of the cap of eight (exactly 8 and exactly 9 applicable ideas) is not tried (TC-DIAG-16, designed).

## SC-22 An owner understands each page

| Field | Content |
| --- | --- |
| Goal | An owner can say what each page is for, what to do next, and what each term means, without help |
| Actors | An owner; a person from APLYD who observes and records |
| Preconditions | Pages that state their purpose and one next step (built for the owner pages, never tried with an owner); a glossary shown in the interface (not built); owners found through a route that satisfies C-05 |
| Requirements | BR-UX-01, BR-UX-02, BR-UX-03 |
| Level run | manual |
| Automated by | None |
| Cases | TC-UX-01, TC-UX-02, TC-UX-03 |

Steps:

1. Show the owner each page in turn, in the owner's own language where one is chosen.
2. Ask what the page is for and what they would do next; record the answer in their words.
3. Ask what a term means (assessment, requirement, engagement, listing, baseline); record whether they knew without help.
4. Open the home page at each stage and ask which stage they are at.

Expected outcome (TO BE): eight of ten owners can answer for each page (a [Guessing] bar from the BRD). Steps 1, 2 and 4 can be run now, on the owner pages. Step 3 can also be run, and would find that "assessment", "requirement" and "engagement" are used and explained only in part; "baseline" is now "starting number" on the owner pages. The record is kept outside the repository, under codes ([UAT plan](UAT-PLAN.md)).

## SC-23 Ten owners, in sessions

| Field | Content |
| --- | --- |
| Goal | Find out whether owners act on a plan, would pay, agree with the ranking, and ask for something the five stages do not contain |
| Actors | The sponsor, ten owners in one cluster |
| Preconditions | The first sector and cluster chosen (OQ-03); contacts whose origin is logged from first touch (C-05); the bar filled in before the first conversation |
| Requirements | BR-DESC-08, BR-COM-03, BR-GOV-07, BR-DIAG-08 |
| Level run | manual |
| Automated by | None |
| Cases | TC-DESC-51, TC-COM-05, TC-GOV-35 |

Steps: run the worksheet in [ten-owner-test.md](../ten-owner-test.md), stages 1 and 2 by hand, one row per owner, and read the result against the bar written before the test. This document does not repeat the worksheet.

Expected outcome: a filled worksheet outside the repository and a dated result written into the worksheet file under codes. The test is the sponsor's to run; nothing in the repository can run it.

## SC-24 The pooling price test

| Field | Content |
| --- | --- |
| Goal | Find out whether buying together lowers the price a small buyer pays |
| Actors | The sponsor, three or more owners with the same requirement, two providers |
| Preconditions | Three or more owners in one cluster with the same requirement |
| Requirements | BR-PROC-03, BR-PROC-07 |
| Level run | manual |
| Automated by | None |
| Cases | TC-PROC-33, TC-PROC-34 |

Steps: ask two providers for a quote for the pooled purchase and for each owner buying alone; record the quotes and the dates; work out the gap, pooled against the sum of the individual prices (the table in [ten-owner-test.md](../ten-owner-test.md)).

Expected outcome: a recorded gap in rupees and as a share, from two providers on one requirement. The proposed bar is a [Guessing]; the thesis assumes the gap matters and no source gives its size. Nothing in the application can run this: a pool is only a count today, and providers cannot quote.

## SC-25 A person on the operator's side lists a provider and reads the pools unaided

| Field | Content |
| --- | --- |
| Goal | Operator staff can do the operator's work from the page, without help and without reading a company's record |
| Actors | A member of APLYD's operating staff who did not write the code |
| Preconditions | A person on the operator's side who did not write the code. For acceptance as the operator's real work, also a fee decision (OQ-11) and a first provider list (OQ-03); the page can be tried before that, on the synthetic providers |
| Requirements | BR-OPS-01, BR-OPS-02, BR-PROC-04, BR-PROC-05 |
| Level run | manual |
| Automated by | None |
| Cases | TC-OPS-01, TC-PROC-15 to TC-PROC-17 (the same steps run by a machine) |

Steps: the person signs in as the operator, reads the providers page, adds a provider and lists it, reads the pools, and says what each number and message means.

Expected outcome (TO BE): the person completes each step and can say why a pool is not shown. Observations are recorded as in the UAT plan. SC-12 and SC-03 show the same steps work; this scenario is whether a person can follow them.

## SC-26 The presenter gives the demonstration

| Field | Content |
| --- | --- |
| Goal | A person presents the eight steps in about fifteen minutes and an audience understands what is and is not built |
| Actors | A presenter, the sponsor or a guest |
| Preconditions | The demonstration running (SC-19) |
| Requirements | BR-OPS-07 |
| Level run | manual |
| Automated by | None |
| Cases | TC-OPS-12, TC-OPS-13 |

Steps: the presenter signs in as the first person on the script, follows each step, and says what the script says. A second person times it and records what the audience asked.

Expected outcome (TO BE): the steps are followed as written inside the time; each "does not show" item is said aloud. The script's minutes add up to 15 by its own data and the test accepts 10 to 20; nobody has yet presented it ([demonstration VALIDATION.md](../../modules/demo/VALIDATION.md)).

## SC-27 A real owner signs in

| Field | Content |
| --- | --- |
| Goal | A real owner signs in by a method that suits them and reaches only their own company |
| Actors | A real owner |
| Preconditions | OQ-13 settled (how real owners sign in), OQ-07 settled (where data is hosted), OQ-09 settled (reuse of the study) |
| Requirements | BR-ID-02, BR-DATA-02 |
| Level run | manual |
| Automated by | None |
| Cases | TC-ID-18, TC-DATA-09 |

Steps: not written, because the method is not chosen. The candidates are a mobile number with a one-time code, an email link, or an access layer in front of the application; whether every owner has a usable work email is an assumption to test in the ten-owner sessions.

Expected outcome (TO BE): not defined. This scenario cannot start. The synthetic sign-in has no password and works only in a synthetic environment (SC-17), and the application is not accepted for real company data.
