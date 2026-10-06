# UAT plan: APLYD MSME platform

Version 0.1. Date 5 October 2026. Status: draft, not reviewed by a person.

This plan says how a person, and not a test, decides that a business requirement is met: who looks, what they look at, what they write down, where it is kept, and what happens when they find a fault. It covers the work that no automated test can do: owners following the pages, operator staff doing the operator's work, the sponsor taking the decisions that requirements wait on, and an independent technical reviewer reading what no person has read. On 5 October 2026 none of this has been done. No session has been held, no requirement is accepted, and the tables in section 7 are empty. Every company, person and figure in the application is SYNTHETIC.

How this relates to the other documents: the [business requirements](../brd/BRD.md) hold the acceptance criteria this plan puts to people; the [test strategy](TEST-STRATEGY.md) says where acceptance sits among the layers (its section 7) and defines the severity words used in section 8; the [test cases](TEST-CASES.md) hold the 34 cases for people, listed in section 2 here; the [test scenarios](TEST-SCENARIOS.md) hold the people-only journeys SC-22 to SC-27; the [traceability matrix](TRACEABILITY.md) shows which requirements have only such cases; the [regression pack](REGRESSION-PACK.md) says which automated checks to run again after a change; the [test data](TEST-DATA.md) says how to reset the data before a session; the [ten-owner test](../ten-owner-test.md) is the worksheet this plan uses and does not repeat.

AS BUILT and TO BE: the repository has no acceptance procedure, no register and no named reviewer. Everything below that describes a procedure is TO BE, a proposal for the sponsor. Where a rule already exists in another document, this plan says which. [Certain]

## 1. Acceptance by people

### 1.1 What "accepted" means

A requirement is accepted when a named person has witnessed its acceptance criterion being met, on a stated date, and the evidence is kept as section 6 says. The BRD says the same in its section 1.3, and the [test strategy](TEST-STRATEGY.md), section 7, adds that a passing test, an agent's review and a merge are evidence at most. On 5 October 2026 the number accepted is 0 of 116. [Certain]

Two consequences follow. First, an agent never accepts anything, and never fills in the name or the date of a row in section 7. Second, a requirement that the BRD calls Partial, Not built, Open or Unverified cannot be accepted whole. Of the 116, the BRD counts 39 Built and 16 Partial, so at most 55 have something a person could be shown today; the other 61 (49 Not built, 10 Open, 2 Unverified) wait on code, a decision or a measurement. [Certain]

### 1.2 Five ways a person witnesses a criterion

| Route | What the person does | Suits | What is kept |
| --- | --- | --- | --- |
| Witnessed run | Watches named automated tests run on a named commit, reads the case's steps and expected result, and checks that the test does what its title says | Requirements the BRD calls Built or Partial | Commit, command, date, the result line, the summary of the run |
| Session | Watches an owner or a member of staff do the task | Following the pages; the operator's work; the presenter | The session record, kept outside the repository under a code |
| Decision | Reads a written decision by the sponsor or counsel and the documents it points to | Requirements that are decisions: ownership, reuse of the study, the revenue model, hosting | The decision's identifier and date |
| Measurement | Measures on a stated device and writes down the value and the conditions; runs a drill | Targets and the restore drill | The value, the conditions, the date |
| Independent review | A person who did not write the code reads the protected paths and tries to break the scope rule | Identity, data scope, migrations, money | The reviewer's findings and what was read |

A witnessed run is [Likely] the route for most of the 55. It is the only route that needs no one outside the sponsor's circle, and it is also the weakest: the person is shown a test an agent wrote, so the check that the test does what its title says (the [test strategy](TEST-STRATEGY.md), section 10, lists where it does not) is part of the witnessing, not an extra.

### 1.3 Who accepts what

| Acceptor | Accepts | Cases and scenarios | Does not accept |
| --- | --- | --- | --- |
| Sponsor (APLYD's chief executive) | The decisions the requirements wait on: ownership, reuse of the study, the standard terms, hosting and data rules, the revenue model, the first cluster. The result of the ten-owner test and the pooling test. The witnessed run of each Built requirement. The demonstration as a demonstration | SC-23, SC-24, SC-26; the decision cases in section 2 | What the sponsor has not read. Protected paths need a named human reviewer (BR-NFR-14), and who that is remains an open question (OQ-08) |
| Operator staff (a person on APLYD's operating side who did not write the code) | Whether the operator's work can be done from the page without help: providers, the fee, pools, and what each count and message means | SC-25; TC-OPS-05, TC-OPS-07, TC-DEPL-34, TC-RUN-36 once built | Anything about a company's record, which the operator cannot read |
| Owners | Whether a page can be followed: what it is for, what to do next, what each term means, in their own language. They accept by what they do and say in a session, not by signing | SC-22, SC-23; the usability cases in section 2 | Anything they were not shown. An owner is never named in the repository |
| Independent technical reviewer (none is named; OQ-08) | The protected paths; cross-company read probes (BO-06); that each invariant is held in the code and not only in a test title; the restore drill and the measured targets, with the sponsor | TC-NFR-35, TC-NFR-23, TC-NFR-24, TC-NFR-25; the invariant cases in the [regression pack](REGRESSION-PACK.md) (RP-02) | Product decisions, and the first cluster or the fee |

Where a case says that a person other than the owner checks (TC-DIAG-55, TC-RUN-37), the checker witnesses and the sponsor accepts. The checker role does not exist and who holds it is OQ-18. [Certain]

## 2. The cases only people can run

The [test cases](TEST-CASES.md) hold 34 cases whose automation is `people`; their layer is manual. The table lists each with who witnesses it, the route, and what it waits on. "Waits on" is taken from the case's own text and the open questions. Most of these cases also need the thing they test to be built.

| Case | Requirement | What is witnessed | Witnessed by | Route | Waits on |
| --- | --- | --- | --- | --- | --- |
| TC-GOV-01 | BR-GOV-01 | A written statement of ownership signed by the sponsor, and the organisation that holds the repository | Sponsor | Decision | OQ-01 |
| TC-GOV-35 | BR-GOV-07 | A contact's origin and date recorded from first touch | Sponsor | Session | A contact record; OQ-03 |
| TC-GOV-36 | BR-GOV-08 | The written position on reuse of the study, disclosed to the client | Sponsor, with counsel | Decision | OQ-09 |
| TC-GOV-37 | BR-GOV-09 | The platform's position towards the owner in the contract terms | Sponsor, with counsel | Decision | OQ-12 |
| TC-ID-18 | BR-ID-02 | A real owner signs in by the chosen method | Sponsor and an owner | Session | OQ-13, OQ-07 |
| TC-DESC-46 | BR-DESC-04 | An owner speaks the description and reviews the text | Owner | Session | OQ-17 |
| TC-DESC-48 | BR-DESC-06 | An owner completes Describe in a chosen language without help | Owner | Session | OQ-17 |
| TC-DESC-51 | BR-DESC-08 | The ten-owner test records the questions owners did not follow | Sponsor | Session | OQ-03 |
| TC-DIAG-55 | BR-DIAG-06 | A person other than the owner checks the draft assessment | Checker, sponsor | Session | OQ-18 |
| TC-DIAG-58 | BR-DIAG-08 | An owner reads the gaps without the idea list | Owner | Session | The gap view |
| TC-PROC-34 | BR-PROC-07 | An owner compares two providers' offers | Owner | Session | OQ-19 |
| TC-PROC-35 | BR-PROC-08 | Standard terms shown before a choice, and the acceptance recorded | Sponsor, with counsel; owner | Decision, session | OQ-12 |
| TC-PROC-38 | BR-PROC-11 | The first cluster is named and its body agrees to take part | Sponsor | Decision | OQ-03 |
| TC-DEPL-34 | BR-DEPL-06 | A disputed milestone enters a route with a person responsible and a time limit | Operator staff, sponsor | Session | The route |
| TC-DEPL-36 | BR-DEPL-08 | An owner is shown a good acceptance test, and a vague one is flagged | Owner | Session | The guidance |
| TC-DEPL-42 | BR-DEPL-10 | If the platform ever holds or moves money, the amount never varies with the vendor | Sponsor | Decision | OQ-12; not required now |
| TC-RUN-36 | BR-RUN-05 | After deployment the owner has a route to support, and it reaches the provider | Owner, operator staff | Session | The route; OQ-19 |
| TC-RUN-37 | BR-RUN-06 | A person other than the owner re-checks at each review point | Checker, sponsor | Session | OQ-18 |
| TC-OPS-05 | BR-OPS-03 | An owner who has stopped appears in a queue that respects the scope rule | Operator staff | Session | OQ-08, OQ-18 |
| TC-OPS-07 | BR-OPS-05 | Each playbook is published and used in the ten-owner test | Operator staff | Session | The playbooks |
| TC-UX-01 | BR-UX-01 | An owner says what each page is for and what to do next | Owner | Session | An owner session; the owner pages now state both (functional specification, section 5.1) |
| TC-UX-02 | BR-UX-02 | The home page shows the five stages and one button for the next step | Owner | Session | An owner session; the home page now shows both (functional specification, section 5.2) |
| TC-UX-03 | BR-UX-03 | Every term is plain or explained where it first appears | Owner | Session | A glossary in the interface |
| TC-UX-04 | BR-UX-04 | An owner uses every owner page in a chosen language | Owner | Session | OQ-17 |
| TC-UX-29 | BR-UX-11 | An owner uses a channel they already use | Owner | Session | OQ-17 |
| TC-DATA-09 | BR-DATA-02 | A written decision names the host, the location and the obligations | Sponsor, with counsel | Decision | OQ-07 |
| TC-DATA-19 | BR-DATA-05 | A request to erase personal data has a policy and a procedure | Sponsor, with counsel | Decision | OQ-07 |
| TC-DATA-21 | BR-DATA-07 | A retention period for each kind of record is written and applied | Sponsor, with counsel | Decision | OQ-07 |
| TC-COM-01 | BR-COM-01 | A revenue model that satisfies D-03 is chosen | Sponsor | Decision | OQ-11 |
| TC-COM-05 | BR-COM-03 | The worksheet records minutes and rupees per owner | Sponsor | Session | The ten-owner test |
| TC-NFR-23 | BR-NFR-07 | A restore from backup is run and timed | Reviewer, sponsor | Measurement | Durable data (OQ-07) |
| TC-NFR-24 | BR-NFR-08 | Uptime is measured against a written target | Sponsor, reviewer | Measurement | A target (OQ-16) |
| TC-NFR-25 | BR-NFR-09 | A response time is measured for each owner page on a phone-class device | Reviewer | Measurement | A target (OQ-16) |
| TC-NFR-35 | BR-NFR-14 | Each change to a protected path has a named human reviewer | Reviewer | Independent review | OQ-08 |

Most of these cannot be run on 5 October 2026 because what they test is not built or not decided. [Certain] The automated and designed cases for the same requirements are in the [test cases](TEST-CASES.md), and the people's cases do not replace them.

## 3. Entry criteria

### 3.1 For any session

1. A named commit is under test, and its identifier is written on the session record.
2. On that commit `node scripts/test.mjs pr --guard` passed, and the summary of the run was kept (the artifact `test-summary` in the pipeline, or `reports/summary.json`, which Git ignores). A run that did not pass is not a basis for a session.
3. `node scripts/check-test-docs.mjs` and `node scripts/check-documentation.mjs` pass on the same commit.
4. The environment is SYNTHETIC and was reset to the starting data for the session ([test data](TEST-DATA.md)).
5. The requirement is something that exists. A session does not test an unbuilt page by describing it.
6. No defect of severity high is open on the area the session covers (section 8).
7. Whoever runs the session has the case, the script in section 5 and the recording sheet in hand.

### 3.2 For a session with owners

1. The owners come through a route that satisfies C-05: not met through the study, and the origin of each contact logged from first touch. A contact whose origin cannot be shown is not counted.
2. The first sector and cluster are chosen (OQ-03).
3. The bar for the ten-owner test is filled in before the first conversation, not after the last, as the worksheet requires.
4. The facilitator has read the list of what the demonstration does not show (the `DOES_NOT_SHOW` list in `modules/demo/src/script.ts`) and says it before the owner sees a page.
5. The sponsor has decided whether pages that show ideas from the opportunity library may be shown to an owner (section 5.2). The worksheet says the library must not be shown to a real owner as advice.
6. No address or password of any hosted copy is given to an owner (section 9).

### 3.3 For a session with operator staff

1. The person did not write the code or the cases.
2. They have not seen the script in section 5.3, so that what they do unaided is what they do.
3. A synthetic operator identity exists in the environment; it is in the platform's own seed ([test data](TEST-DATA.md)).

### 3.4 For the independent technical reviewer

1. A named person who is not the sponsor and did not write any of the code (OQ-08).
2. A clean checkout at the commit under test, read access to the repository and a local environment, and no real data.
3. Agreement, before they start, on what they will report and where it is kept (section 6).

### 3.5 For anything involving real data

Nothing in this plan allows it. The conditions the [test strategy](TEST-STRATEGY.md) puts on real company data (its section 6.2) come first, and OQ-07, OQ-09 and OQ-13 are three of them.

## 4. Exit criteria

### 4.1 A session is finished when

1. Every step of the script was run, or is recorded as not run with the reason.
2. What the person said and did is written down in their words before any reading of it is written, as the worksheet requires.
3. Every fault found is written down and triaged (section 8).
4. The record names the commit, the date, the environment reset and the codes of the people present.

### 4.2 A requirement is accepted when

1. A row in section 7.2 is filled by the person who accepts: name, date, commit, outcome and evidence.
2. No defect of severity high is open against the requirement.
3. The case or cases it relies on are named.

### 4.3 The whole round of acceptance is finished when (TO BE)

1. Every Must requirement the BRD calls Built has a row with an outcome. On 5 October 2026 the BRD counts 36 of the 67 Must requirements as Built and 7 as Partial.
2. Every outcome that is not accepted has a defect, a decision or a limit written against it.
3. The release criteria in the [test strategy](TEST-STRATEGY.md), section 6.2, are met, and the sponsor and the reviewer have signed section 7.3.

Not an exit criterion: all tests passing, a merge, an agent saying the work is done, or the end of a week.

## 5. Sessions and scripts

### 5.1 Rules for every session

1. The session runs on the facilitator's own machine, on loopback, with the synthetic seed. Reset first: `pnpm db:local` for the development server, or a restart of the demonstration host, which rebuilds its in-memory database at every start ([test data](TEST-DATA.md)). Record the commit.
2. Nobody types a real company's name, figure, phone number or address into the application. If an owner starts to, the facilitator stops and goes back to the invented company's answers.
3. Two people take part: one speaks and one writes. For a session with operator staff or the sponsor they can be the same person.
4. The facilitator does not explain a page. If the person is stuck, the facilitator gives the smallest hint that lets them go on, and the recorder writes down what the hint was. The time after which a hint is given is fixed before the first session and written on the record; this plan sets none. [Guessing] that a few minutes is a sensible figure.
5. The session is in the person's own language. Whether an interpreter took part, and the time and any cost, go on the record, because BR-COM-03 asks for minutes and rupees per owner.
6. The person is told in plain words that the pages are being tested and not them, that they can stop at any time, and that nothing they say is passed to a provider or another company by name.
7. No audio or video is recorded while OQ-07 is open. [Likely] notes alone are enough for the cases here.

### 5.2 Owner session: can an owner follow the pages

This is a usability session. It is not the ten-owner test: that test does stages 1 and 2 by hand and does not show the application (section 5.6). The cases are TC-UX-01 to TC-UX-04, TC-UX-29, TC-DESC-46, TC-DESC-48, TC-DIAG-58, TC-PROC-34 and TC-DEPL-36; scenario SC-22.

The pages that show ideas from the opportunity library carry placeholder figures. The ten-owner worksheet says not to show the library to a real owner, and records that the diagnose module's status page says it must not be shown to a real owner as advice. The sponsor must decide whether those pages are shown at all. If they are not, the cases that need them stay unrun and the record says so. [Certain] The worksheet's rule; the decision is the sponsor's.

| Step | The facilitator | The recorder writes | Runs today |
| --- | --- | --- | --- |
| 1 | Reads the opening: this is a test of the pages; the company and the figures are invented; you can stop at any time | The time, the language, who is present | Yes |
| 2 | Shows the home page and asks what the owner would do here, and which stage they are at | The words; whether the owner named a stage (TC-UX-02) | Yes. The home page now names a stage as the owner's turn, so the second question has an answer to compare with; no owner has been asked |
| 3 | Shows each owner page in turn: Describe, What to do about it, What you need, Delivery, Results. Asks what the page is for and what they would do next | The answer in the owner's words, then whether it matches (TC-UX-01) | Yes, in English only |
| 4 | Points at each of these words where they appear: assessment, requirement, engagement, listing, baseline. Asks what it means | Whether the owner knew without help (TC-UX-03) | Yes |
| 5 | Asks the owner to find where the company's description is saved and say what a new version means | What they did and said, and any help given (TC-DESC-48) | Yes, in English only |
| 6 | Shows how a milestone's test of acceptance is written; asks the owner to say what they would check (TC-DEPL-36) | Their words | The guidance is not built |
| 7 | Asks what they would want to do next that the pages do not offer | Any request the five stages do not contain | Yes |
| 8 | Closes. Thanks them. Does not say what the result will be | The time | Yes |

The bar for TC-UX-01 in the BRD is 8 of 10 owners for each page. That figure is a [Guessing], and it is not met or missed by one session.

### 5.3 Operator session: can the operator's work be done unaided

Cases: TC-OPS-01 and TC-PROC-15 to TC-PROC-17 (the same steps run by a machine), TC-OPS-05 and TC-OPS-07 once built; scenario SC-25. The scenario's steps are in the [test scenarios](TEST-SCENARIOS.md). The person is a member of operating staff.

| Step | The person is asked to | The recorder writes |
| --- | --- | --- |
| 1 | Sign in as the synthetic operator and say where they would go to list a provider | Where they went; whether they found the link "Providers and the listing fee" |
| 2 | Read the providers page and say what each field is for | Fields they could not explain |
| 3 | Add a provider, naming one service, and list it | Errors, refusals read aloud, time taken |
| 4 | Say what the listing fee is, who pays it, and who sees it | Whether they said that an owner never sees it and that it is one fee for every provider |
| 5 | Read the pools and say what each count means, and why a pool is missing | Whether they said that a pool below five is not shown |
| 6 | Try to find one company's description or plan | What they expected; what they found (nothing: the operator has no company) |

Today the fee is a placeholder (OQ-11) and the providers are invented, so the session shows whether the page can be followed. It does not show that the operator's real work is accepted: that waits on the fee and the first provider list (OQ-11, OQ-03).

### 5.4 Sponsor session: witnessed run and decisions

| Step | What the sponsor does | What is recorded |
| --- | --- | --- |
| 1 | Names the commit under test and reads section 3.1 | The commit; the result lines of the run |
| 2 | Watches a full guarded run (`pnpm test`; about 10 and a half to 11 minutes on two cores in the recorded runs) or reads its kept summary | The suites and counts; that none was skipped |
| 3 | For each Built requirement in turn: reads the BRD's acceptance criterion, then the case in the [test cases](TEST-CASES.md), then watches the named test file run alone (`node --test <file>`), then reads the test | Accepted, not accepted or deferred, and a sentence why |
| 4 | Watches the demonstration's eight steps run, with a second person timing (SC-19, SC-26) | The time; what the audience asked; which "does not show" items were said aloud |
| 5 | Reads the decision cases in section 2 and says which are settled | The decision's identifier and date, or "not settled" |

At 36 Must requirements built, step 3 is a long sitting. [Likely] it is done over several days, area by area, using the selection by area in the [regression pack](REGRESSION-PACK.md) (RP-08). The sponsor may delegate the witnessing of a requirement to a named person; the register then names that person, not the sponsor.

### 5.5 Independent technical reviewer: reading and probing

| Step | What the reviewer does | What is recorded |
| --- | --- | --- |
| 1 | Reads the code on the protected paths named in BR-NFR-14: authentication, data scope, migrations, money, and the rule-library publishing path | What was read, at which commit, and what was not |
| 2 | Reads the findings the test strategy records from reading the tests (its section 10) and the open findings in each module's `VALIDATION.md` | Which they confirm, dispute or find already fixed |
| 3 | Probes by hand: signed in as one owner, asks for the other company's records on every route, and as the operator asks for a company's record (BO-06) | Each route tried; each answer; that a missing record and a forbidden one look identical |
| 4 | Checks each invariant in the code and not in a test title: vendor-neutral earnings, the floor of five, the scope rule, append-only, no fee shown to an owner, no money moves | A line per invariant: held, not held, or could not tell |
| 5 | Runs the mutation checks on a copy of the tree (strategy, section 2.4) | Which breaks survived |
| 6 | When durable data exists, runs and times a restore (TC-NFR-23) | The time, the steps, the result |

The reviewer's report goes to the sponsor in full. Findings go into the relevant module's `VALIDATION.md` in the form that file already uses: a label, what was wrong, what was done. [Certain] that is the existing convention for agent reviews; whether a person's report would follow it is the sponsor's choice.

### 5.6 The ten-owner test and the pooling test

Both are run from [the worksheet](../ten-owner-test.md), by hand, by the sponsor. This plan adds nothing to the steps. It adds one thing: where the result goes (section 6) and what is done with it. The bar is the sponsor's to set before the first conversation. The worksheet proposes the following, and every figure is a [Guessing]:

| Question | Proposed bar | Objective in the BRD |
| --- | --- | --- |
| Owners who act on the plan within 90 days | At least 4 of 10 | BO-01 |
| Owners who would pay, above the cost of serving one | At least 3 of 10 | BO-02 |
| Top three ideas agree between a person's plan and the engine's order | At least 6 of 10 | BO-03 |
| Pooled price against buying alone, two providers, one requirement | A gap of at least 10 percent | BO-04 |
| Anything owners ask for that the five stages do not contain | Any repeated request | none |

A missed bar is not a failed session. It is a result, and the worksheet says what to do for each. The BO-03 measure also says whether the ranking is a fair model of a person's judgement, which no test can say. The result of the pooling test is recorded as in the worksheet. A requirement is not accepted because the bar was met: it is accepted when the sponsor writes the row in section 7.2.

## 6. What is recorded and where

| Record | What it holds | Where | In Git |
| --- | --- | --- | --- |
| Owner session notes | The owner's words, what they did, help given, times, any cost; one record per owner and session | A private place the sponsor names before the first session, under the code O1 to O10 | No |
| Key to the codes | Which owner is which, and how to reach them | A different private place from the notes | No |
| Contact log | How each contact came about, and the date, from first touch (C-05) | The same private place as the key | No |
| Consent | That the owner understood what was explained | The private place | No |
| Operator staff session notes | As for owners, under the code OP1, OP2 and so on | The private place | No |
| Ten-owner worksheet | One row per owner, and the pooling table | The private place | No |
| Result of the ten-owner test | The reading against the bar, in codes, with no company names | A dated heading in [ten-owner-test.md](../ten-owner-test.md), as that file says | Yes |
| Witnessed-run record | Commit, command, date, the result line | The register in section 7.2 | Yes |
| Decision | The question, the answer, who decided, the date | The decision records, with an identifier | Yes |
| Independent reviewer's report | What was read and found | The sponsor holds the report; findings go to the module's `VALIDATION.md` | Findings only |
| Defects | See section 8 | The module's `VALIDATION.md` | Yes |
| Acceptance register and sign-off | Section 7 | This document | Yes |

Rules that apply to all of it:

1. No real company name, contact, figure or interview content from the study goes into Git, in any form. [AGENTS.md](../../AGENTS.md) says so, and BR-DATA-01 requires it.
2. The notes of a session with a real owner are personal data. Until a retention period (BR-DATA-07) and a procedure for erasure (BR-DATA-05) exist, the sponsor decides how long they are kept and destroys them on an owner's request. Neither requirement is built. [Certain]
3. Persons who sign in section 7 are named, with their agreement. Owners are never named in the repository. A row that rests on an owner session cites the codes.
4. Codes are used in the order of the sessions and are not reused. OP and the codes for the reviewer (RV1, RV2) follow the same rule.

The place is not named in this plan. It is for the sponsor to choose, and it must be reachable by the people who need it and by nobody else.

## 7. Marking a criterion accepted

### 7.1 How a row is made

1. Read the BRD's acceptance criterion for the requirement, in the BRD's words, not a paraphrase.
2. Read the case or cases the [traceability matrix](TRACEABILITY.md) lists for it, and what they say will be checked.
3. Collect the evidence for the route (section 1.2): a commit and a result line; a session code and date; a decision's identifier; a measurement; or a reviewer's finding.
4. Decide: accepted; accepted for the part named; not accepted; or deferred. Any outcome other than "accepted" carries a reason.
5. Enter one row, naming the person who decides, the date, the commit, the evidence and any limit.
6. A row is never edited or deleted. If a later finding changes the outcome, a new row says so and points to the old one. This is the same rule the application keeps for its own records: corrections append evidence.
7. An acceptance is of a commit. A change to code that the case exercises means the case is run again; the [regression pack](REGRESSION-PACK.md) (RP-08) says which cases a change touches. Whether the person re-witnesses is theirs to decide, and the decision is written as a new row.
8. The BRD's own status column and sign-off table are changed by whoever owns the BRD, from this register. This plan does not edit the BRD.

"Accepted for the part named" is how a Partial requirement appears. The requirement stays pending in the BRD's count until the whole criterion is met.

### 7.2 Register of accepted requirements

Empty on 5 October 2026. No person has witnessed any criterion.

| Requirement | Commit | Outcome | Accepted by | Date | Evidence | Limit |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

### 7.3 Sign-off of the acceptance round

Empty on 5 October 2026. The sponsor's sign-off of the BRD itself is in the BRD's section 12 and is also unsigned.

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Sponsor | | | |
| Operator staff | | | |
| Independent technical reviewer | | | |

Owners have no row: their evidence is cited by code in section 7.2.

## 8. Defect triage

A defect found in acceptance is any difference between what the person was shown and what the criterion says, and also any difficulty the person had in following it. The [test strategy](TEST-STRATEGY.md), section 9, gives the severity words and says a defect is closed only by a test or a witnessed run, never by an agent's statement.

### 8.1 Classes

| Class | What it is | Who decides what to do | Where it is recorded | Closed when |
| --- | --- | --- | --- | --- |
| Application defect | The application does not do what the criterion says, or a refusal leaves the person stuck | The sponsor, on an agent's proposal | The module's `VALIDATION.md` | A test that fails without the fix passes, and the person re-witnesses the case |
| Usability finding | The person could not follow a page, a word or a step | The sponsor | The module's `VALIDATION.md`, with the owner codes | A later session, with other owners, follows it, or the criterion is changed |
| Case or test defect | A case does not test what its title says, or a test passes when it should fail | The owner of the test | The [test strategy](TEST-STRATEGY.md), section 10.3, and the case | The case or test is corrected and shown able to fail |
| Requirement defect | The criterion is wrong, vague or cannot be met, for example a bar that is a [Guessing] | The sponsor | The BRD, by its owner | The BRD is changed and the case follows |
| Data incident | Real data found in the repository, an environment or a record | The sponsor, at once | See 8.3 step 1 | The sponsor says so |

### 8.2 Severity

Application defects use the strategy's words, high, medium and low, with the meanings and examples given there.

Usability findings use three words, which are [Guessing] and proposed here: stopped (the person could not go on without help), helped (they went on after a hint), slowed (they went on unaided but misread, hesitated or went the wrong way first). A finding that stops or helps two or more of ten owners is written up as a finding about the page; one that happens once is written down and watched.

### 8.3 What happens, in order

1. If real data is involved, stop. Do not copy it or describe it in a message. Tell the sponsor. No procedure exists for this: erasure (BR-DATA-05) is not built and the strategy's test data policy says only that real data must not get in. The sponsor decides. [Certain]
2. The recorder writes what the person did, what the criterion or case expected, what happened, the session code, the commit and the environment. The person's words come first.
3. Someone reproduces it once on the same commit. A fault that cannot be reproduced stays in the record, marked unconfirmed, and is not deleted.
4. The class and the severity are decided. If the finder and the sponsor disagree, the finding stays as the finder wrote it and the sponsor's decision is added under it. It is never rewritten.
5. The sponsor decides one of four things: fix it now; record a limit and the reason; change the requirement; accept the risk, written down.
6. A fix on a protected path is read by a person (strategy, section 9). Every high defect is fixed with a test that fails without the fix.
7. The row in section 7.2 for each affected requirement points to the defect.
8. The defect is closed as the table in 8.1 says.

### 8.4 What a defect does to acceptance

A defect of severity high blocks acceptance of the requirement it touches. A medium defect blocks acceptance unless the sponsor writes the limit into the row and the row says "accepted for the part named". A low defect does not block. [Likely] these are reasonable rules. They are a proposal and nobody has set them.

No time limit for any step is set, and none is given here.

## 9. What cannot start until the open questions are settled

Four open questions hold up the most. Each is a decision for the sponsor, and the BRD (its section 10) names all four among the questions that decide the most requirements.

| Question | What cannot start | What can start meanwhile |
| --- | --- | --- |
| OQ-03: which sector and cluster come first | The ten-owner test and the pooling test (SC-23, SC-24); owner sessions, because the owners come from a chosen cluster (section 3.2); the first provider list for the operator's real work; TC-PROC-38 | The operator session on the synthetic providers (section 5.3); the sponsor's witnessed run |
| OQ-07: where company data is hosted, and the obligations | Any session in which a real company's data is entered; recording of audio or video; the restore drill, which needs durable data; TC-DATA-09, TC-DATA-19, TC-DATA-21; TC-ID-18 and SC-27 | Everything on synthetic data on the facilitator's machine |
| OQ-09: reuse of the study's material | Loading study material into the library; using study contacts as owners (C-05 says not to approach them commercially in any case); TC-GOV-36; SC-27 | Owner sessions with owners found by another route; the library stays SYNTHETIC |
| OQ-13: how real owners sign in | An owner signing in (TC-ID-18, SC-27); any hosted copy that someone outside APLYD's staff can reach; an owner using the pages with their own hands, because "any real user" is what the question blocks | A session in which the facilitator drives and the owner watches and answers. Whether that is allowed is for the sponsor to say, because the question's wording is "any real user" [Guessing] |

Other open questions that hold up cases in this plan:

| Question | What in this plan waits |
| --- | --- |
| OQ-01: which organisation holds the repository | TC-GOV-01 |
| OQ-08: who reviews the protected paths | The independent reviewer; TC-NFR-35; TC-OPS-05 |
| OQ-11: revenue under D-03 | TC-COM-01; the fee in the operator session stays a placeholder |
| OQ-12: principal or agent | TC-GOV-37, TC-PROC-35, TC-DEPL-42 |
| OQ-14: does the floor of five apply to a pool's own members | Acceptance of BR-GOV-06 is of the cautious reading the code takes, and says so |
| OQ-15: a second engagement after one is closed | The owner session should watch what an owner does after a wrong choice; the strict reading is what is built |
| OQ-16: which requirements are Must, Should and Could | The order of the acceptance round; the targets for TC-NFR-24 and TC-NFR-25 |
| OQ-17: languages and channels | TC-DESC-46, TC-DESC-48, TC-UX-04, TC-UX-29 |
| OQ-18: who checks a plan | TC-DIAG-55, TC-RUN-37, TC-OPS-05 |
| OQ-19: whether providers sign in | TC-PROC-34, TC-RUN-36 |

## 10. What this plan does not do

1. It does not set the bar for the ten-owner test. The worksheet proposes one and the sponsor sets it.
2. It does not run the ten-owner test or the pooling test. Only the sponsor can.
3. It does not replace an accessibility audit, a load test or an independent security test. The [test strategy](TEST-STRATEGY.md), section 2.5, records that none exists. The reviewer in section 5.5 is a first step, not that.
4. It does not make the hosted demonstration fit for anyone outside APLYD's staff. The BRD records, as risk RK-10, that it has one shared password, an in-memory database and plain HTTP behind the platform's proxy.
5. It does not say who the sponsor's delegates are, who the reviewer is, or where the private records are kept. Those are for the sponsor.
6. It does not accept anything.
