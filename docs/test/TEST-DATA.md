# Test data: APLYD MSME platform

Version 0.1. Date 5 October 2026. Status: draft, not reviewed by a person.

This document lists the data the tests and the demonstration use, where each set lives, what each is for, which cases rely on it, how each kind of suite sets it up and tears it down, how to put it back to its starting state, and what must never appear in it. Every company, person, provider, figure and idea named here is invented and marked SYNTHETIC. Nothing in this repository is real company data, and nothing here may become so.

How this relates to the other documents: the [test strategy](TEST-STRATEGY.md) sets the policy in its section 12 and the environments in its section 3; the [test cases](TEST-CASES.md) say which data a case needs in its steps; the [test scenarios](TEST-SCENARIOS.md) name the companies and people their actors are; the [regression pack](REGRESSION-PACK.md) says which suites are slow, which share state, and how a failure is checked; the [UAT plan](UAT-PLAN.md) says how the data is reset before a session with people and where records of real sessions are kept, which is not here; the [traceability matrix](TRACEABILITY.md) joins the cases to the requirements in the [business requirements](../brd/BRD.md).

## 1. How to read this document

Each data set has a heading `TD-NN`. AS BUILT means the set exists in the repository and the file named holds it. TO BE, and the gaps in TD-16, are proposals or findings and are marked as such. The tags [Certain], [Likely] and [Guessing] have their usual meaning: certain is read from a file or run; likely is read from a test title or a comment and not checked further; a guess is a guess.

| ID | Data set | Where | Used by |
| --- | --- | --- | --- |
| TD-01 | The platform seed: two companies, two owners, one operator | `modules/platform/db/seed-synthetic.sql` | Nearly every integration, smoke and browser suite |
| TD-02 | The factory seed: one confirmed description for company A, none for B | `modules/factory/db/seed-synthetic.sql` | Describe, diagnose and the scope-rule cases |
| TD-03 | People and records that a test adds for itself | Inside the test files | Role, scope and refusal cases |
| TD-04 | The demonstration cast: five more companies | `modules/demo/src/cast.ts`, `identities.ts` | The demonstration, the floor of five |
| TD-05 | The demonstration's providers and the placeholder fee | `modules/demo/src/cast.ts` | The demonstration; the fee cases |
| TD-06 | The presenter's script and what the tests pin about it | `modules/demo/src/script.ts` | SC-19, SC-26 |
| TD-07 | The three clusters | `modules/procure/src/clusters.ts` | Pools, requirements |
| TD-08 | The opportunity library and the ranking pins | `modules/diagnose/src/library.ts` | Diagnose, the demonstration |
| TD-09 | Questionnaire answers: complete, draft, golden, invalid | `modules/factory/src/questionnaire.ts` and the tests | Describe, diagnose |
| TD-10 | Boundary data for each limit | The limits in `modules/*/src` | The boundary cases |
| TD-11 | Time: fixed instants, the clock and past dates | Inside the tests | Reviews, sessions, plans |
| TD-12 | How each layer sets up and tears down | `modules/platform/tests/support`, `modules/hosting/tests/support` | All suites |
| TD-13 | Resetting the data | `scripts/local-db.mjs`, `scripts/serve.mjs` | Development, the demonstration, sessions |
| TD-14 | Which data to use for a session with people | The demonstration and the seeds | The UAT plan |
| TD-15 | What must never appear, and what polices it | Tests named in the entry | BR-DATA-01 |
| TD-16 | Gaps in the test data | None | The test strategy |

## TD-01 The platform seed

Where: `modules/platform/db/seed-synthetic.sql`. It adds rows with `INSERT OR IGNORE`, so adding it twice changes nothing, and it is never applied outside a synthetic environment.

| Id | Name or address | Kind | Company |
| --- | --- | --- | --- |
| company-synthetic-a | SYNTHETIC Company A | company | |
| company-synthetic-b | SYNTHETIC Company B | company | |
| user-synthetic-owner-a | SYNTHETIC Owner A, owner-a@synthetic.invalid | owner | company A |
| user-synthetic-owner-b | SYNTHETIC Owner B, owner-b@synthetic.invalid | owner | company B |
| user-synthetic-operator | SYNTHETIC Operator, operator@synthetic.invalid | operator | none |

Each row is marked as synthetic in its own column (`is_synthetic` is 1), and the names say so in words. The two companies exist so that one can be shown not to see the other (SC-02). The operator has no company, because the operator has no company record to read (SC-03). Owner A is the person almost every test signs in as; owner B is the witness; the operator signs in for the fee, the providers and the pools.

How it is loaded: every module's `db/seed-synthetic.sql` is applied after the migrations, the platform's first and the others in name order (`seedFiles()` in `modules/platform/src/db/migrate.ts`). The seed is split at a semicolon that ends a line, so no seed text may hold one inside a value. Only the platform and the factory have a seed file on 5 October 2026; the other modules start empty. [Certain]

## TD-02 The factory seed

Where: `modules/factory/db/seed-synthetic.sql`. Company A has one confirmed description, version 1, saved by owner A, from questionnaire version 1, with the note "SYNTHETIC first description"; the products are "SYNTHETIC school uniforms and cotton shirts", in the textiles and garments sector, and the district and state are SYNTHETIC too. Company B has none, so an empty record can be shown (SC-01, SC-02).

The statement is `INSERT ... SELECT ... WHERE NOT EXISTS`, not `INSERT OR IGNORE`, because the append-only trigger refuses an insert that collides with a row and would stop the seed. That trigger is why a second run is safe only by that guard. [Certain]

## TD-03 People and records that a test adds for itself

Some cases need a person the seed does not hold. The test inserts the row inside its own throw-away database; none of these is in a seed file.

| Person | Role and company | Added by | For |
| --- | --- | --- | --- |
| viewer-a@synthetic.invalid | viewer, company A | The factory, diagnose, procure and deliver integration tests | A member of the company who reads and cannot change (SC-13) |
| odd@synthetic.invalid | operator role, company A | The procure integration test | An operator account that belongs to a company is refused like an owner |
| stray@synthetic.invalid | owner, no company | The procure integration test | An account with no company that is not an operator is refused |
| real@example.invalid | owner, company A, not marked synthetic | The platform integration test | A person not marked synthetic cannot sign in (TC-ID-09, SC-17) |

The role word used is `viewer` in the tests, while the BRD speaks of a member, and the comment on the role column in `modules/platform/src/db/schema.ts` lists only owner and operator, so the roles are not written down in one place. [Certain]

Providers, fees, assessments, requirements, engagements and events are not seeded either: each test creates what it needs through the application's own handlers, or by a direct insert when it needs a state the application would not let it make (for example a 499th version, TD-10).

## TD-04 The demonstration cast

Where: `modules/demo/src/cast.ts` holds the data; `identities.ts` turns it into `INSERT OR IGNORE` rows for companies and owners (the only thing the seeder does not do through a request); `seed.ts` then signs in as each person and does what they would do through the application's own requests. Everything is SYNTHETIC; addresses end in `synthetic.invalid`.

| Company | Owner and address | Stage | Asks for the second idea | Provider chosen |
| --- | --- | --- | --- | --- |
| SYNTHETIC Company C | SYNTHETIC Owner C, owner-c@synthetic.invalid | Running: described, assessed, signed off, asked, chose a provider, agreed a plan, recorded a starting number, accepted one milestone and recorded a payment; the second milestone is delivered and waiting | No | Provider 1 |
| SYNTHETIC Company D | SYNTHETIC Owner D, owner-d@synthetic.invalid | Plan agreed, waiting for the first delivery | Yes | Provider 2 |
| SYNTHETIC Company E | SYNTHETIC Owner E, owner-e@synthetic.invalid | Provider chosen, no plan | Yes | Provider 1 |
| SYNTHETIC Company F | SYNTHETIC Owner F, owner-f@synthetic.invalid | Requirements only | Yes | None |
| SYNTHETIC Company G | SYNTHETIC Owner G, owner-g@synthetic.invalid | Requirements only | No | None |

Companies A and B from TD-01 are used too: A is the one the presenter walks, with a confirmed description and nothing else, and B is the one that must see none of it.

The shape is chosen to show the floor of five on purpose. Five companies (C to G) ask for the first idea in the first cluster, so that pool shows "at least 5". Three (D, E and F) ask for the second idea in the second cluster, so it stays hidden; company A joining it as the fourth leaves it hidden. The seeder checks both after it has run (`checkPools`), and the ranking it relies on (`checkRanking`), and stops with a message if either is not as the script says. [Certain]

Company C's plan: milestone 1, "Job log set up on the shop floor", agreed at ₹1,25,000, due 30 days after the seed ran, accepted and paid by the owner outside the platform; milestone 2, "Every shift enters its jobs for a week", ₹75,000, due 60 days after, delivered and not yet accepted; a starting number of 42 orders delivered late, counted from paper sheets. A number of orders is not money. Company D's plan holds milestone 1 only, at ₹1,25,000.

Cases: TC-UX-25 (every person and company is marked SYNTHETIC), TC-DATA-01 (no text looks like a real address, number, web address or personal name field), TC-DATA-02 (every company's answers are complete enough to confirm, and every free-text answer says it is synthetic), TC-GOV-34 (one pool over the floor and one under), TC-OPS-26 (the people are added once each, with quotes escaped).

## TD-05 The demonstration's providers and the placeholder fee

Three invented providers, named SYNTHETIC Provider 1, 2 and 3. Together they serve the two ideas in the two clusters, so a company in either cluster is offered a choice.

| Provider | Serves |
| --- | --- |
| SYNTHETIC Provider 1 | The first idea in clusters 1 and 2; the second idea in cluster 2 |
| SYNTHETIC Provider 2 | The first idea in cluster 1 |
| SYNTHETIC Provider 3 | The second idea in clusters 1 and 2 |

The first idea is `digital_job_log` and the second is `inspection_checklist_and_gauges`. The listing fee is a placeholder of ₹1,500, one number for every provider (D-03). No fee is decided (OQ-11). It is for the operator's page only: no owner page, answer or form may show it, and the cases that police that are TC-GOV-12, TC-PROC-27, TC-PROC-32, TC-COM-02 and TC-COM-03.

The tests that run on a plain seed use other invented names. "Alpha Works" and "Beta Works" are the providers the procure, deliver and run tests and the journey test create; the fee in the journey is 1500 and the refusal cases use values such as 5, 0 and 10,000,001. [Certain]

## TD-06 The presenter's script and what the tests pin about it

Where: `modules/demo/src/script.ts`. Eight steps: the operator's fee and pools; Describe; What to do about it; What you need and the floor of five; choose a provider and agree a plan; Results; a company a month in (C); another company sees none of it (B). Their minutes are 2, 2, 3, 2, 2, 2, 1 and 1, which add up to 15, and the test accepts 10 to 20 (TC-OPS-13). The script holds seven "does not show" items, such as that no real owner has read the pages, and a note on resetting.

What is pinned: every person the script signs in as exists in the cast; every label it names (a button, a link, a field) is found in the pages' own text, so a label changed on a page and not here fails a static test; and every claim about the seeded state is checked against the seeder. The script is shown at `/demo` only when `APLYD_DEMO=true`.

## TD-07 The three clusters

Where: `modules/procure/src/clusters.ts`. Three invented places: `synthetic-cluster-1`, `synthetic-cluster-2` and `synthetic-cluster-3`, labelled "SYNTHETIC cluster 1", "SYNTHETIC cluster 2" and "SYNTHETIC cluster 3". The first sector and cluster are not chosen (OQ-03). A requirement is pooled only with others for the same idea in the same cluster. The demonstration uses clusters 1 and 2; cluster 3 is used by the procure integration test. A cluster id not in the list is refused.

## TD-08 The opportunity library and the ranking pins

Where: `modules/diagnose/src/library.ts`. 17 ideas, 4 of them AI. Every idea's source is marked "assumption": the benefit ranges and the costs (one-time, yearly and hidden) are placeholders written to exercise the engine, and each idea carries a risk.

| Kind | Ideas |
| --- | --- |
| Not AI (13) | digital_job_log, inspection_checklist_and_gauges, preventive_maintenance_plan, stock_register_min_max, energy_review_and_tariff_check, receivables_follow_up, accounting_software, skills_training_plan, safety_walkthrough, marketplace_listing, paperwork_organiser, financing_options_review, supplier_quotes_comparison |
| AI (4) | camera_inspection_ai, predictive_maintenance_ai, demand_forecast_ai, ai_job_scheduling |

The budget band an owner picks stands for a yearly ceiling in rupees: under ₹1,00,000, up to ₹5,00,000, up to ₹25,00,000 and above ₹25,00,000 with no ceiling (`BUDGET_CEILING`). The answer `not_sure` has no entry in that table. The ranking shows at most 8 ideas.

What is pinned: the library, the ceilings, the points and the cap are hashed (SHA-256) and the hash is recorded against LIBRARY_VERSION 1; the engine's output for eight fixed "golden" descriptions (including an empty result, a full one and ties) is hashed against ENGINE_VERSION 1. A change to either content without a new version fails the test; the rule written in the test is to bump the version and add a line, and never to edit an earlier one. [Certain] Only one version of each exists, so the rule has not been exercised on a second one. [Likely]

Cases: TC-DIAG-57 and TC-DATA-03 (no entry names a company, a person or a real product). The library must not be shown to a real owner as advice ([ten-owner worksheet](../ten-owner-test.md)).

## TD-09 Questionnaire answers

The questionnaire has five sections (about, work, systems, problems, limits) and version 1. A description can be confirmed only when it holds a sector, the products, the number of employees, the processes and the problems; a draft needs one answer. Sets in use:

| Set | Where | What it is for |
| --- | --- | --- |
| The demonstration's common answers with each company's own words | `modules/demo/src/cast.ts` | Five complete, confirmable descriptions; each free-text answer says it is synthetic (TC-DATA-02) |
| Company A's seeded description | TD-02 | The one confirmed version in a fresh environment |
| `complete` | `modules/factory/tests/unit/questionnaire.test.ts` | Validation, one option at a time (TC-DESC-04) |
| `base` | `modules/diagnose/tests/unit/engine.test.ts` | The engine: the same answers give the same result |
| The eight golden descriptions | `modules/diagnose/tests/unit/pins.test.ts` | The ranking pin (TD-08) |
| Bad answers: an option that is not one, a control character, text over its length, a note of 501 characters, a body over the limit | Inside the factory integration and unit tests | TC-DESC-11, TC-DESC-43, TC-DESC-40 |

## TD-10 Boundary data for each limit

A boundary case needs three values: just inside, at, and just outside. The table gives the limit, where the code holds it, and the data used. "Edge not asserted" means the case in the [test cases](TEST-CASES.md) says no test sits on the exact edge.

| Limit | Value | Data to use | Cases |
| --- | --- | --- | --- |
| Milestones in a plan | 12 (`MAX_MILESTONES`) | Add 12, then a 13th; add one to another engagement of the same company | TC-DEPL-07 |
| Deliveries of one milestone | 14 (`MAX_DELIVERIES`) | Deliver and reject 14 times, then a 15th; on another milestone use 13 and accept the 14th | TC-DEPL-20, TC-DEPL-21, TC-DEPL-22, TC-DEPL-44 |
| A price or a payment | Whole rupees, 1 to ₹10,00,00,000 (`MAX_AMOUNT_INR`) | 0, 10.5, 100,000,001 and words refused; the table's own check tried at 100,000,000 and 100,000,001 by a direct insert. The accepted edges are not asserted through the application | TC-DEPL-06, TC-DEPL-31 |
| A milestone title and its test of acceptance | 120 and 500 characters | 121 and 501 refused; the accepted edges not asserted | TC-DEPL-06 |
| A note | 500 characters, counted as characters | 500 passes and 501 is refused; the factory case tries both the handler and the table | TC-DESC-43, TC-PROC-10, TC-DIAG-49, TC-DEPL-47 |
| A request body | 64 KB, which is 65,536 characters counted after decoding, four bytes to a character | 70,000 characters in JSON and about 140,000 in a form refused with 413. The exact edge, 65,536 and 65,537, is designed only | TC-DESC-40, TC-DESC-41, TC-DESC-42, TC-DESC-62, TC-DESC-63 |
| The launcher's body limit | A configured number of bytes; the test uses 1,000 | 1,001 declared, 1,000, and two chunks of 600 with no length | TC-OPS-35, TC-OPS-44, TC-OPS-60, TC-OPS-62 |
| Versions of a description | 500 per company; the history lists the newest 100 | Insert 499 directly, save the 500th, then a 501st by the API, by the form and by direct insert; more than 100 for the history | TC-DESC-25, TC-DESC-26 |
| Decisions in one assessment | 200 (`MAX_DECISIONS`) | 200 recorded, a 201st refused, and a decision in another assessment | TC-DIAG-45, TC-DIAG-74 |
| Ideas shown | 8 (`MAX_ITEMS`) | Exactly 8 and exactly 9 applicable ideas: designed only | TC-DIAG-15, TC-DIAG-16 |
| The listing fee | Whole rupees, 1 to ₹1,00,00,000 (`MAX_FEE_INR`) | 0, -5, 1.5, words, an object, an Arabic digit and 10,000,001 refused; 42, written with spaces, and 10,000,000 accepted; the value 1 is not asserted | TC-PROC-24; TC-COM-04 reads only the demonstration's placeholder |
| A result number | A whole number from 0 to 1,00,00,00,000, which is not rupees (`MAX_VALUE` in the run module) | -1, 1,000,000,001, 1.5, text and empty refused | TC-RUN-05 |
| Review days | 30, 90 and 180 days from the first acceptance | A millisecond before and at each day | TC-RUN-13, TC-RUN-14, TC-RUN-15, TC-RUN-20, TC-RUN-21 |
| A session | 8 hours, 28,800 seconds | 28,799 seconds accepted; 28,800 and after refused | TC-ID-03 |
| A company id in a request | Refused if empty or over 64 characters; only 64 characters of a refused one are stored | A 5,000-character id; empty and null-like ids; near-miss ids | TC-ID-21, TC-ID-22, TC-ID-23, TC-ID-119, TC-ID-120, TC-ID-133 |
| The session secret | At least 32 bytes, counted in bytes, and not one repeated character | Undefined, empty, a space, one character, 31 characters, 64 repeated characters, 40 NUL characters and a number | TC-NFR-09, TC-NFR-10 |
| The floor of five | Below 5 hidden; 5 to 9 "at least 5"; 10 "at least 10" | Pools of 0 to 4, 5, 9 and 10; a company counts once | TC-GOV-20, TC-GOV-21, TC-GOV-22, TC-GOV-23, TC-GOV-26, TC-GOV-27, TC-OPS-03 |
| The demonstration's length | 10 to 20 minutes | The script's own minutes, which are 15 | TC-OPS-13 |

The limits themselves (12 milestones, 14 deliveries, 500 versions, 200 decisions, the review days) are placeholders chosen by the builders, not findings. [Certain]

## TD-11 Time

Unit tests pass a fixed instant to the function, so a review is due exactly 30, 90 and 180 days after the first acceptance, and a slot opens at that instant and not a moment before. The run integration tests pass a clock into the handler (`now`), so a test can move forward 400 days or a millisecond. A smoke or browser test cannot do this, because the built application stamps events with its own clock; those tests add rows for an earlier day through the Worker's `exec` helper, which runs SQL against that Worker's own throw-away database (the triggers still apply). The demonstration's clock cannot be moved, so the three reviews are shown as dates only. [Certain]

Dates in the data: the platform's companies and the factory's seeded description carry 4 October 2026, and the demonstration's companies 5 October 2026, as the day they were created; the demonstration's plan dates are 30 and 60 days after the moment it was seeded, so they differ from one start to the next. A calendar date in a request must be a real day written YYYY-MM-DD: 2026-02-30 and 15/12/2026 are refused.

## TD-12 How each layer sets up and tears down

| Layer | Set-up | Data | Tear-down |
| --- | --- | --- | --- |
| Static | None: reads and parses files | The real files of the repository | None |
| Unit | None: inline fixtures, injected clock | No database | None |
| Integration | `beforeEach`: `createTestEnvironment()` starts a Miniflare database, applies the migrations in `drizzle/` in the order of its journal and then every seed (TD-01, TD-02); the environment is `APLYD_ENV=test` with a test secret of 43 characters that says in its text that it is not real (a comment in the file says 44) | A fresh database for each test | `afterEach`: `dispose()` stops Miniflare; the database is gone |
| Integration (hosting) | `before`: starts the gateway and a stub once per file | The gateway's own config | `after` |
| Smoke | `startBuiltApp()`: makes a temporary directory (`aplyd-smoke-` in the system's temporary folder), writes the migrations and the seed to a file, loads it with `wrangler d1 execute --local`, picks a free port on 127.0.0.1 and starts `wrangler dev --local` with `APLYD_ENV=test` and a random session secret | One empty database per file with the seed applied | `stop()` ends the Worker's process group (first SIGTERM, then SIGKILL) and removes the directory; `killNow()` does the same from an exit or signal handler |
| Browser | `useBrowserHarness` or `withBrowserHarness`: the same Worker plus Chromium, found through `APLYD_CHROMIUM_PATH`, then `/opt/pw-browsers/chromium`, then Google Chrome. One browser context for each person, so two people never share a session; limits of 60 s for a test, 180 s for set-up and 60 s for tear-down | The seed, plus whatever the test makes through the pages | Contexts, the browser and the Worker are closed; each page's console errors and failed requests are watched during the run |
| Launcher (hosting and demo smoke) | `launchServe()` runs `scripts/serve.mjs` with a password made fresh for the run, and waits up to 90 seconds for the health check to answer; `APLYD_DEMO=true` adds the demonstration (TD-04) | An in-memory database rebuilt at each start | `stopAllLaunched` |
| Documentation checks | None: the checks read the real documents; their unit tests break inline copies | No files written | None |

Two cautions. First, the deliver and run smoke suites take their data from their own first test ("set-up"); a later test run alone fails, and a failed set-up fails the rest for a reason that is not theirs ([regression pack](REGRESSION-PACK.md), RP-11). Second, a Worker can outlive a test process that was killed with SIGKILL, which no handler can catch, and it can leave its temporary directory behind. [Likely] for the directory; [Certain] for the Worker, as RP-11 records.

## TD-13 Resetting the data

| What | How | What it does |
| --- | --- | --- |
| The local development database | `pnpm db:local`, which runs `scripts/local-db.mjs` | Deletes the local database in `.wrangler/state`, applies the migrations and the seed, and prints that the local database is ready. `pnpm dev` then reads it. Nothing else is touched |
| The demonstration host | Stop and start `scripts/serve.mjs` | The in-memory database is rebuilt from the migrations and the seed at every start, and with `APLYD_DEMO=true` the demonstration is added; anything entered during a presentation is gone. Needs `pnpm build` first and a session secret of at least 32 bytes |
| A test database | Nothing to do | Made and removed by the suite (TD-12) |
| The run summary | Run the suite again | `reports/summary.json` is overwritten, and Git ignores it |

Rows cannot be deleted to go back: the tables are append-only, and a trigger refuses the delete. The demonstration's seeder cannot run twice on one database, because the tables cannot be put back; on a database that already holds the demonstration it stops at the first refusal and says which. The way back is always a new database. [Certain]

Before a session with people the data is reset, the commit is recorded, and the people are told the data is invented ([UAT plan](UAT-PLAN.md), section 5.1).

## TD-14 Which data to use for a session with people

| The session needs | Use | Why |
| --- | --- | --- |
| An owner who has described a factory | Owner A of company A | A confirmed description exists (TD-02) |
| An owner with an empty record, to start Describe | Owner B of company B | No description exists |
| An owner a long way through the journey | Owner C of company C, in the demonstration | Plan, payment, delivery and starting number exist (TD-04) |
| The operator's work | The synthetic operator, with the demonstration seeded | Three providers, one fee and the pools exist; the first pool is shown and the second hidden |
| The scope rule shown | Owner B, after the presenter has walked company A | Company B sees none of company A's data |
| The presenter's walk | The demonstration host with the script at `/demo` | See TD-06 |

Nobody types a real name, figure, phone number or address. If an owner starts to, the facilitator goes back to the invented company's answers. The notes of a real session are not test data, are not kept here, and follow the [UAT plan](UAT-PLAN.md), section 6.

## TD-15 What must never appear, and what polices it

| Must never appear | Why | What polices it today | Cases |
| --- | --- | --- | --- |
| A real company's name, a real person's name, a phone number, a web address, a postal address | BR-DATA-01 | A check on the cast for text that looks like one; the `.invalid` address and the SYNTHETIC mark on every person and company; every free-text answer says it is synthetic | TC-DATA-01, TC-DATA-02, TC-UX-25 |
| A name of a company, a person or a real product in the library | BR-DATA-01 | A check on the library | TC-DIAG-57, TC-DATA-03 |
| A user who is not marked synthetic signing in | BR-DATA-01 | The synthetic sign-in refuses a person not marked synthetic, and refuses outside a synthetic environment | TC-ID-09, TC-DATA-07, TC-DATA-06 |
| A secret, a database file, build output or a source document of the study in Git | BR-DATA-01, OQ-09 | A static check of the tracked files; the environment template holds names only; the ignore file | TC-DATA-04, TC-DATA-05 |
| An environment name in the build output | BR-DATA-01 | A smoke check of the built application | TC-DATA-08 |
| Interview content from the study, its contacts or its figures | OQ-09, C-05 | Only the check on tracked file kinds above; nothing reads the text | none |
| A fee on any page, answer or form an owner reaches | D-03 | Smoke and browser checks on the owner's pages and the operator-only reads | TC-GOV-12, TC-PROC-27, TC-PROC-32, TC-COM-02, TC-COM-03 |
| A figure from the library presented to a real owner as advice | The ten-owner worksheet | Nothing in code; a rule for the person running a session | none |

[Certain] about what the named checks read. [Likely] that nothing else polices the text: this was judged from the test titles and the files, not from a search of every file. Where the table says none, the protection is a person's care.

## TD-16 Gaps in the test data

1. No generator or fixture for a company with many versions, many milestones or many pools. The tests that reach a limit insert rows directly (499 versions, for example), which skips every check except the triggers.
2. No data for the roles that do not exist: a provider who signs in, a checker, a second operator who approves a listing (BR-OPS-04).
3. No data in any language but English; the questionnaire and the pages are English only.
4. No data to measure performance or load: the largest pool in any test is a few companies, and there is no fixture of a thousand.
5. No durable data and no backup to restore, so the restore drill (BR-NFR-07) has nothing to run on.
6. Only one library version and one engine version, so the rule that an earlier pin is never edited has never been tested against a second.
7. The demonstration cannot be seeded twice and no copy of the seeded database is kept to compare against, so a difference is caught only by the seeder's own two checks at the time it runs.
8. No search of the whole repository's text for real names, numbers or study content (TD-15).
9. Some data depends on the day: the demonstration's plan dates are relative to the start, and the review dates cannot be moved there.
10. The tests, the seed and the demonstration cast were written by the same agents that wrote the code, and no person has read any of them. A synthetic company that a person would find implausible has not been looked for. [Certain]
