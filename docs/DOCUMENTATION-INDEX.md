# Documentation index: APLYD MSME platform

Version 0.2. Date: 5 October 2026. Status: draft, not reviewed by a person.

This index lists every document in the repository: what it is for, who reads it, what it is the record of, and the status and date it gives itself. It gives a reading path for each kind of reader, says which test checks which document, and says what to update when code changes. No person has reviewed it, and the application it indexes is not accepted for use with real data. Every company, person, provider and figure in the application is SYNTHETIC.

How this relates to the other documents: the [glossary](GLOSSARY.md) defines the terms and identifier schemes the documents use, and the [findings register](FINDINGS.md) lists the discrepancies, gaps and limits they record. [AGENTS.md](../AGENTS.md) and [HANDOVER.md](../HANDOVER.md) are still the first things a developer reads. The [FSD](fsd/FSD.md) links to this index. `modules/docs/tests/static/docindex.test.ts` checks that every Markdown file in the repository, and every HTML page under `docs/`, is listed here.

## 1. How to read this index

- **Record, not authority.** "Source of truth for" names what a document is the one place to look for, as the documents say of themselves (for example, the BRD tables are the one copy of the requirements, and the table in the test cases is the one copy of the cases). Where a status page and the code disagree about what the application does, the code is what runs, and the status page is wrong.
- **Status and date** are copied from the document's own opening lines. "Draft, not reviewed by a person" means what it says: no person has reviewed the document. A document that states no date or status is shown as "No date stated".
- **Readers** are four: sponsor (decides direction and merges), developer (changes the code or the documents), tester (runs or designs checks) and operator (runs the hosted demonstration). "All" means all four.
- **What the test checks of a row.** Every document is a link, and the test checks that the file is there, and that each version, date and commit the row gives is in the document (a version must be the one the document's opening lines state). It does not read the purpose, the readers or the source-of-truth column against the document; only a person can.

## 2. Reading paths

Each path is an order, not a requirement. Each starts with what the reader most needs to know before trusting anything else.

### Sponsor

1. [HANDOVER.md](../HANDOVER.md): the current state, and which code was merged without a person reading it.
2. [README.md](../README.md): what the repository is. Its status line is out of date; HANDOVER.md is current.
3. [findings register](FINDINGS.md): read the counts in section 7 first, then section 3 on severity (read "not rated" before "high"), then only the rows you need.
4. [decisions](decisions.md) and [open questions](open-questions.md): what is decided and what waits on the sponsor.
5. [thesis](thesis.md) and [ten-owner test](ten-owner-test.md): the direction and the test that has not been run.
6. [business requirements](brd/BRD.md): what the business needs and how far each requirement is built.
7. [wireframes](design/WIREFRAMES.md): the owner pages as built, and the earlier proposal. The same drawings are in the [HTML page](design/wireframes.html).
8. [security and privacy](design/SECURITY-AND-PRIVACY.md): what is protected, what is not, and the questions for counsel.
9. [UAT plan](test/UAT-PLAN.md): how a person, and not a test, would accept a requirement. It is a proposal.
10. Reference when needed: the [functional specification](fsd/FSD.md), the [test strategy](test/TEST-STRATEGY.md), the [traceability matrix](test/TRACEABILITY.md) and the [study sources](sources.md).

### Developer

1. [AGENTS.md](../AGENTS.md) and [HANDOVER.md](../HANDOVER.md): the working rules and the current state.
2. [glossary](GLOSSARY.md): keep it open; the documents use its words.
3. [development guide](DEVELOPMENT.md): set-up, layout, the test layers and CI.
4. [Saha lessons](saha-lessons.md): why the stack and the test layers are as they are.
5. [high-level design](design/HLD.md): structure, architecture decisions, constraints and risks.
6. [low-level design](design/LLD.md): how the modules are built, below the level of the high-level design.
7. [data dictionary](design/DATA-DICTIONARY.md) and [API reference](design/API-REFERENCE.md): the tables and the operations.
8. [functional specification](fsd/FSD.md): functions, rules, screens and messages, each marked AS BUILT, PARTIAL or TO BE.
9. The status and validation pages of the module you will change, under `modules/<name>/`.
10. [interface guide](design/INTERFACE-GUIDE.md) and [wireframes](design/WIREFRAMES.md): how a page is built and how it is drawn, if you change one.
11. [findings register](FINDINGS.md): what is already known to be wrong.

### Tester

1. [test strategy](test/TEST-STRATEGY.md): the layers, what "accepted" means and the known gaps.
2. [business requirements](brd/BRD.md): the acceptance criteria the cases serve.
3. [test cases](test/TEST-CASES.md) and [test scenarios](test/TEST-SCENARIOS.md): what is checked.
4. [traceability matrix](test/TRACEABILITY.md): which requirement has which case.
5. [development guide](DEVELOPMENT.md): how to run each layer.
6. [test data](test/TEST-DATA.md) and [regression pack](test/REGRESSION-PACK.md): the data sets, the guarded run and CI.
7. [mutation checks](../scripts/mutation/README.md): how the tests are tried by breaking the code on purpose.
8. [UAT plan](test/UAT-PLAN.md): the checks that only a person can make.
9. [findings register](FINDINGS.md): the gaps in the tests are rows in it.

### Operator

1. [HANDOVER.md](../HANDOVER.md) and [README.md](../README.md): what state the work is in, and what the host serves. The README's status line is out of date.
2. [runbook](ops/RUNBOOK.md): run, show, stop and restrict the hosted demonstration, and what is not known about it.
3. [security and privacy](design/SECURITY-AND-PRIVACY.md): the threats the runbook's warnings come from.
4. [high-level design](design/HLD.md), sections 4.5 and 7.3: the demonstration host and the hosted demonstration.
5. [hosting status](../modules/hosting/STATUS.md) and [hosting validation](../modules/hosting/VALIDATION.md): what was run and what was not.
6. [demo status](../modules/demo/STATUS.md): the cast and the script you will show.
7. [findings register](FINDINGS.md): the hosting rows.

## 3. The documents

### 3.1 Start here

| Document | Purpose | Readers | Source of truth for | Status and date |
| --- | --- | --- | --- | --- |
| [README.md](../README.md) | What the repository is and where to start | all | The short statement of what the platform is and who owns it | No date stated. Its status line still describes slice 1 (a walking skeleton on a draft pull request), while HANDOVER.md records later slices |
| [AGENTS.md](../AGENTS.md) | Working rules for every agent and developer: who merges, protected paths, data and safety, claims and numbers, invariants that need a test, verification | developer | The working rules, and which paths are protected | No date stated |
| [HANDOVER.md](../HANDOVER.md) | The current state, the record of each slice, what was merged without review, direct commits to main, next work and what not to do | sponsor, developer | What was merged without a person reading it | Last updated 5 October 2026 |
| [DOCUMENTATION-INDEX.md](DOCUMENTATION-INDEX.md) | This index | all | Where each document is, who reads it and which test checks it | Version 0.2, 5 October 2026. Draft, not reviewed by a person |
| [GLOSSARY.md](GLOSSARY.md) | Plain definitions of the terms, identifier schemes and Indian-context words the documents use | all | The meaning of a term as this repository uses it | Version 0.2, 5 October 2026. Draft, not reviewed by a person |
| [FINDINGS.md](FINDINGS.md) | One table of every discrepancy, gap, review finding and known limit the other documents record, with evidence, source and status | sponsor, developer, tester | The list and the counts of recorded findings. Each finding's own wording stays in its source, except for the 34 rows of section 10, which two agent reviews and a documentation pass recorded first. Section 9 records how the open rows were checked again at commit b741f59 on 6 October 2026 | Version 0.2, 5 October 2026. Draft, not reviewed by a person |

### 3.2 Direction and decisions

| Document | Purpose | Readers | Source of truth for | Status and date |
| --- | --- | --- | --- | --- |
| [docs/thesis.md](thesis.md) | The need in the owner's words, what the study says, the five-stage journey, what software does and what people do, where to start and the risks | sponsor | The direction (marketplace++) and the five stages | Direction set by the sponsor on 4 October 2026 (version 2) |
| [docs/decisions.md](decisions.md) | The decided, carried-forward, dropped and proposed positions | sponsor | D-nn, C-nn and P-nn, and the list of dropped numbers | Last updated 4 October 2026 |
| [docs/open-questions.md](open-questions.md) | The questions that wait for an answer, with who must answer and what each blocks | sponsor | OQ-nn | No date stated |
| [docs/sources.md](sources.md) | The study's documents S1 to S4 with checksums; the files are not stored in the repository | sponsor, developer | The source ids and their SHA-256 checksums | No date stated |
| [docs/ten-owner-test.md](ten-owner-test.md) | The worksheet and the rules for reading the result of a test with ten real owners | sponsor | The worksheet and the proposed bar. The test has not been run | Prepared 5 October 2026 |
| [docs/saha-lessons.md](saha-lessons.md) | What this platform took from the earlier project Saha, and what it did not | developer | The lessons taken, with the reference commit | Reference commit 2adfbde, 4 October 2026 |

### 3.3 Requirements and specification

| Document | Purpose | Readers | Source of truth for | Status and date |
| --- | --- | --- | --- | --- |
| [docs/brd/BRD.md](brd/BRD.md) | The business requirements: context, objectives, stakeholders, scope, rules, requirements by area, assumptions, risks, decisions needed and where each requirement stands | sponsor, tester | The one copy of the requirements: statement, priority, basis, acceptance criterion and status today | Version 0.1, draft for the sponsor's review, 5 October 2026 |
| [docs/fsd/FSD.md](fsd/FSD.md) | The functional specification: functions, use cases, screens, business rules and messages, each marked AS BUILT, PARTIAL or TO BE, with a table that says which functions cover each requirement | developer, tester, sponsor | The functions (FR), use cases (UC), screens (SCR), rules (RULE) and messages (MSG) | Version 0.2, 5 October 2026. Draft, not reviewed by a person |

### 3.4 Design

| Document | Purpose | Readers | Source of truth for | Status and date |
| --- | --- | --- | --- | --- |
| [docs/design/HLD.md](design/HLD.md) | The high-level design: context, structure, hosting, architecture decisions, constraints, risks and technical questions | developer, operator | The architecture decisions (AD-nn), constraints (CN-nn), technical risks (TR-nn) and technical questions (TQ-nn) | Version 0.1, 5 October 2026. Draft, not reviewed by a person |
| [docs/design/LLD.md](design/LLD.md) | The low-level design: how the modules are built | developer | How the modules are built, below the level of the HLD | 5 October 2026. Draft, not reviewed by a person |
| [docs/design/DATA-DICTIONARY.md](design/DATA-DICTIONARY.md) | Every table, column, index and trigger, with the lists the code holds (questionnaire, library, clusters, event kinds, limits) | developer, tester | What each table and column holds. It is compared with the migrated database | Version 0.1, 5 October 2026. Draft, not reviewed by a person |
| [docs/design/API-REFERENCE.md](design/API-REFERENCE.md) | Every operation of the programming interface, with request, responses and error codes | developer, tester | The operations (API-nn). It is compared with the route files | Version 0.1, 5 October 2026. Draft, not reviewed by a person |
| [docs/design/SECURITY-AND-PRIVACY.md](design/SECURITY-AND-PRIVACY.md) | What the platform protects, from whom, by which controls, the threat model, what would be held with real data, and the questions for counsel | sponsor, developer, operator | The threats (TH-nn) and the controls as built on 5 October 2026 | Version 0.1, 5 October 2026. Draft, not reviewed by a person |
| [docs/design/WIREFRAMES.md](design/WIREFRAMES.md) | The owner pages as built in slice 10 and changed by wave 1 (the Decide gap and comparison views, the corrections on Results, the export page), drawn page by page with numbered notes; the earlier interface with its screenshots and the earlier redesign proposal, kept as earlier versions; and what the built interface took from the proposal | sponsor, developer | How the built pages are drawn and where each part sits. The earlier proposal is a proposal and not a requirement | Version 0.2, 5 October 2026. Draft, not reviewed by a person |
| [docs/design/wireframes.html](design/wireframes.html) | The drawings of the wireframes document as one HTML page, as boxes that follow the light or dark setting of the browser | sponsor, developer | The same designs as the wireframes document, in a form that opens in a browser from a file | Version 0.2, 5 October 2026. Draft, not reviewed by a person |
| [docs/design/INTERFACE-GUIDE.md](design/INTERFACE-GUIDE.md) | How the pages are built, so that a new page looks and behaves like the rest | developer | How the existing pages are built. It is a working guide and not a requirement | Last updated 5 October 2026. Nothing in it has been tried by an owner |

### 3.5 Test documents

| Document | Purpose | Readers | Source of truth for | Status and date |
| --- | --- | --- | --- | --- |
| [docs/test/TEST-STRATEGY.md](test/TEST-STRATEGY.md) | The levels of test, environments, tools, risk priorities, entry and exit criteria, what "accepted" means, defects and severity, and the known gaps | tester, developer, sponsor | How the project tests, and the gaps found by reading the tests | Version 0.1, 5 October 2026. Draft, not reviewed by a person |
| [docs/test/TEST-CASES.md](test/TEST-CASES.md) | The cases, each traced to a requirement and to the test that runs it | tester | The one copy of the test cases (TC) | Version 0.1, 5 October 2026. Draft, not reviewed by a person |
| [docs/test/TEST-SCENARIOS.md](test/TEST-SCENARIOS.md) | The scenarios that run several steps | tester | The scenarios (SC) | Version 0.1, 5 October 2026. Draft, not reviewed by a person |
| [docs/test/TRACEABILITY.md](test/TRACEABILITY.md) | Which requirement has which case, and the coverage counts | tester, sponsor | The matrix and its counts. They are generated from the cases and the BRD | Version 0.1, 5 October 2026. Draft, not reviewed by a person |
| [docs/test/TEST-DATA.md](test/TEST-DATA.md) | The sets of test data and the rules on what must never appear | tester, developer | The test data sets (TD) | Version 0.1, 5 October 2026. Draft, not reviewed by a person |
| [docs/test/REGRESSION-PACK.md](test/REGRESSION-PACK.md) | The guarded full run, the layers, mutation checks, what CI runs and what the pack does not run | tester, developer | The regression entries (RP) | Version 0.1, 5 October 2026. Draft, not reviewed by a person |
| [docs/test/UAT-PLAN.md](test/UAT-PLAN.md) | How a person, and not a test, decides that a requirement is met | sponsor, tester | A proposal for acceptance by people. Everything in it is TO BE | Version 0.1, 5 October 2026. Draft, not reviewed by a person |

### 3.6 Operation and development

| Document | Purpose | Readers | Source of truth for | Status and date |
| --- | --- | --- | --- | --- |
| [docs/ops/RUNBOOK.md](ops/RUNBOOK.md) | Running, showing, stopping and restricting the hosted demonstration, and what is not known about it | operator | The steps to run the launcher and the host, and the list of what is not known | Version 0.1, 5 October 2026. Draft, not reviewed by a person |
| [docs/DEVELOPMENT.md](DEVELOPMENT.md) | Set-up, layout, the test layers, the browser layer, adding a module and CI | developer, tester | How to set up and run the checks | Last updated 4 October 2026 |
| [scripts/mutation/README.md](../scripts/mutation/README.md) | How mutation checks are run and what they show | developer, tester | The mutation procedure. Nothing in CI runs it | No date stated |

### 3.7 Module records

Each module under `modules/` has two records. The status page says what works, what is not built and the known limits. The validation page holds the dated results, the reviews and what the results do not show. The `docs` module has neither. No person has reviewed any of the modules' code.

| Document | Purpose | Readers | Source of truth for | Status and date |
| --- | --- | --- | --- | --- |
| [modules/platform/STATUS.md](../modules/platform/STATUS.md) | What the platform module does (sign-in, session, scope rule, audit log, shared checks) and its known limits | developer | The platform module's state and limits, where the code agrees | Last updated 4 October 2026 |
| [modules/platform/VALIDATION.md](../modules/platform/VALIDATION.md) | Results, the independent review of slice 1, the browser layer and the review-fixes branch | developer, tester | The platform module's dated results | Results dated 4 and 5 October 2026 |
| [modules/factory/STATUS.md](../modules/factory/STATUS.md) | What the Describe stage does and its known limits | developer | The factory module's state and limits, where the code agrees | Last updated 5 October 2026 (the page rebuilt, slice 10a) |
| [modules/factory/VALIDATION.md](../modules/factory/VALIDATION.md) | Results, what they do not show, and the slice 10a record for the factory module | developer, tester | The factory module's dated results | Results dated 4 and 5 October 2026 (slice 10a) |
| [modules/diagnose/STATUS.md](../modules/diagnose/STATUS.md) | What the Diagnose stage does and its known limits | developer | The diagnose module's state and limits, where the code agrees | Last updated 5 October 2026 (the page rebuilt, slice 10a) |
| [modules/diagnose/VALIDATION.md](../modules/diagnose/VALIDATION.md) | Results, the independent review, mutation checks and the slice 10a record | developer, tester | The diagnose module's dated results | Results dated 5 October 2026 |
| [modules/procure/STATUS.md](../modules/procure/STATUS.md) | What the Procure stage and the operator pages do and their known limits | developer | The procure module's state and limits, where the code agrees | Last updated 5 October 2026 (the two pages rebuilt, slice 10b) |
| [modules/procure/VALIDATION.md](../modules/procure/VALIDATION.md) | Results, the independent review and mutation checks for the procure module | developer, tester | The procure module's dated results | Results dated 5 October 2026 |
| [modules/deliver/STATUS.md](../modules/deliver/STATUS.md) | What the Deploy stage does (plan, milestones, deliveries, payments recorded) and its known limits | developer | The deliver module's state and limits, where the code agrees | Last updated 5 October 2026 (the page rebuilt, slice 10c) |
| [modules/deliver/VALIDATION.md](../modules/deliver/VALIDATION.md) | Results, the independent review and mutation checks for the deliver module | developer, tester | The deliver module's dated results | Results dated 5 October 2026 |
| [modules/run/STATUS.md](../modules/run/STATUS.md) | What the Run stage does (baseline and reviews) and its known limits | developer | The run module's state and limits, where the code agrees | Last updated 5 October 2026 (the page rebuilt, slice 10c) |
| [modules/run/VALIDATION.md](../modules/run/VALIDATION.md) | Results, the review and mutation checks for the run module | developer, tester | The run module's dated results | Results dated 5 October 2026 |
| [modules/journey/STATUS.md](../modules/journey/STATUS.md) | What the journey module is: the next-step and place-in-the-journey code, one browser test across the stages, and its documents | developer, tester | The journey module's state and limits, where the code agrees | Last updated 5 October 2026 |
| [modules/journey/VALIDATION.md](../modules/journey/VALIDATION.md) | Results for slice 10 and for the documentation branch, and the slice 7 record, with what they do not show | developer, tester | The journey module's dated results | Results dated 5 October 2026 |
| [modules/hosting/STATUS.md](../modules/hosting/STATUS.md) | What the launcher, the gateway and the access gate do, and their known limits | developer, operator | The hosting module's state and limits, where the code agrees | Last updated 5 October 2026 |
| [modules/hosting/VALIDATION.md](../modules/hosting/VALIDATION.md) | What was run locally for the hosting module and what was not | developer, operator | The hosting module's dated results | Results dated 5 October 2026 |
| [modules/demo/STATUS.md](../modules/demo/STATUS.md) | What the demonstration is (cast, seeder and script) and its known limits | developer, operator | The demo module's state and limits, where the code agrees | Last updated 5 October 2026 |
| [modules/demo/VALIDATION.md](../modules/demo/VALIDATION.md) | What was run for the demonstration and what no person has seen | developer, tester | The demo module's dated results | Results dated 5 October 2026 |
| [modules/quality/STATUS.md](../modules/quality/STATUS.md) | What the quality module measures (phone use, BR-UX-05, and the structural part of WCAG 2.1 AA, BR-UX-09), how to run it and what it does not measure | developer, tester | The quality module's state, numbers and limits | Last updated 6 October 2026 |
| [modules/quality/VALIDATION.md](../modules/quality/VALIDATION.md) | What was run, the faults found on each page, and what the results do not show | developer, tester | The quality module's dated results | Results dated 6 October 2026 |
| [modules/portability/STATUS.md](../modules/portability/STATUS.md) | What the export does, what it leaves out and its known limits | developer | The portability module's state and limits | Last updated 6 October 2026 |
| [modules/portability/VALIDATION.md](../modules/portability/VALIDATION.md) | Results and mutation checks for the export | developer, tester | The portability module's dated results | Results dated 6 October 2026 |

## 4. Which test checks which document

Two generated parts exist. The counts block in section 11 of the BRD is regenerated by `node scripts/check-traceability.mjs --write`, and the coverage counts and the matrix in the traceability document are regenerated by `node scripts/check-test-docs.mjs --write`. Every other document is written by hand and checked by the tests below. The counts block in the findings register is copied by hand from the message of its test.

| Check | Documents it checks | What it checks | How to run it |
| --- | --- | --- | --- |
| `scripts/check-documentation.mjs` | Every Markdown file; for conflict markers, every text file | Links and anchors resolve; every D, P, C, OQ and S identifier that is mentioned is defined; each study source has a 64-character SHA-256; no text file of the repository (scripts, code, data and style files as well as Markdown) holds a merge-conflict marker | `node scripts/test.mjs static --only static/documentation` |
| `scripts/check-traceability.mjs` | The BRD and the FSD; every Markdown file for cited identifiers | Requirement rows are well formed; the counts block in BRD section 11 matches the tables; every BR identifier that is mentioned exists; FSD function rows trace to requirements; FSD section 11 says which functions cover each requirement; every FR, UC, SCR, MSG, RULE, AD, SC, TC, RP, TD, TH and API identifier cited in any Markdown file is defined | `node scripts/test.mjs static --only static/traceability` |
| `scripts/check-test-docs.mjs` | The test documents | Case rows are well formed; every case cites a requirement that exists and every requirement is cited; every automated case names a test file that exists and a title that file declares; every Must requirement that the BRD calls Built or Partial has an automated case or is named in the known-gaps block, and the block names nothing else; the traceability counts and matrix match the cases | `node scripts/test.mjs static --only static/test-docs` |
| `modules/docs/tests/static/api-sync.test.ts` | The API reference | Every method a route exports has an entry and every entry has a route; form posts, error codes and counts agree with the source | `node scripts/test.mjs static --only docs/static/api-sync` |
| `modules/docs/tests/static/dictionary-sync.test.ts` | The data dictionary | Tables, columns, indexes and triggers read back from a database built by every migration agree with the document, as do the lists the code holds. It also pins the lines of four module status pages (deliver, diagnose, procure and journey) that section 9 of the dictionary cites | `node scripts/test.mjs static --only docs/static/dictionary-sync` |
| `modules/docs/tests/static/brd.test.ts` | The BRD | Requirements exist in every area with unique identifiers; the counts match; every requirement that any document mentions exists; the requirements on vendor neutrality and the floor of five cannot be lost; a decided or carried requirement cites its decision | `node scripts/test.mjs static --only docs/static/brd` |
| `modules/docs/tests/static/fsd.test.ts` | The FSD | Functions trace to requirements that exist; section 11 covers every requirement; a function is not AS BUILT when every requirement it traces to is Not built in the BRD | `node scripts/test.mjs static --only docs/static/fsd` |
| `modules/docs/tests/static/ids.test.ts` | Every Markdown file | Every function, use case, screen, message, rule, architecture decision (AD), scenario, case, regression entry, test data set, threat, operation and finding that is cited is defined in some document | `node scripts/test.mjs static --only docs/static/ids` |
| `modules/docs/tests/static/testdocs.test.ts` | The test documents | The seven test documents exist with a title, version and status; cases are traced and numbered in order; the other test documents name only cases and paths that exist | `node scripts/test.mjs static --only docs/static/testdocs` |
| `modules/docs/tests/static/wireframes.test.ts` | The wireframes page, `docs/design/wireframes.html` | The page needs nothing from outside (no script, linked file, web address, font or image to fetch); every screen of the FSD has an anchor in it and no id is used twice; every link inside it reaches an id in the page or a file that exists | `node scripts/test.mjs static --only docs/static/wireframes` |
| `modules/docs/tests/static/glossary.test.ts` | The glossary | Rows are well formed (a meaning of at most two sentences) and in order; every term in the BRD and FSD convention tables has an entry; every identifier scheme the documents define has an entry; the paths and links in it exist; every term is used in some other file; the table of the five stages matches the progress strip in `modules/journey/src/progress.ts`; the glossary and this index link to each other | `node scripts/test.mjs static --only docs/static/glossary` |
| `modules/docs/tests/static/docindex.test.ts` | This index | Every Markdown file and every HTML page under `docs/` is listed; every listed file exists; each version, date and commit a row gives is in the document; each reading path leads to listed documents; every check, path and suite the index names exists | `node scripts/test.mjs static --only docs/static/docindex` |
| `modules/docs/tests/static/lld-sync.test.ts` | The low-level design | Every files table row names a file that exists and lists exactly the names the file exports; every repository path in a code span exists, with a slash after a directory; every table, trigger, function, binding and variable it names appears in the code; its own anchors resolve under the rules of GitHub and of `scripts/check-documentation.mjs`; it has the plan's headings and a "Found while writing" list under each module; its diagrams are small. It does not check the prose | `node scripts/test.mjs static --only docs/static/lld-sync` |
| `modules/docs/tests/static/findings.test.ts` | The findings register | Rows are well formed and grouped; every source link reaches a heading that is there, under the rules of GitHub and of `scripts/check-documentation.mjs`; every evidence file and name exists; the counts match the rows; every module status and validation page is the source of a finding | `node scripts/test.mjs static --only docs/static/findings` |

The unit tests in `modules/docs/tests/unit/` test each reader above with faults seeded into text, and are run with `node scripts/test.mjs unit --only docs/unit/<name>`. The ten suites are `docs/unit/api`, `docs/unit/brd`, `docs/unit/dictionary`, `docs/unit/docindex`, `docs/unit/findings`, `docs/unit/fsd`, `docs/unit/glossary`, `docs/unit/ids`, `docs/unit/lld` and `docs/unit/testdocs`.

What runs in CI. `.github/workflows/docs.yml` runs the first three scripts on every pull request. `.github/workflows/ci.yml` runs every layer, which includes the suites under `modules/docs`, but it skips a pull request, and a push to main, that changes only Markdown or `docs/`. So a pull request that changes only documents runs the three scripts and does not run the suites in the lower half of the table above. Run those by hand before such a pull request is published.

## 5. When code changes

Find the first row that describes your change. Update what the second column names, then run the check in the third.

| If you change | Update | Check that fails if you do not | Notes |
| --- | --- | --- | --- |
| A route file under `app/api/`: a method, a path, a parameter or an error code | The API reference: the entry, the summary row, the error index and the counts in its opening paragraph | `docs/static/api-sync` | A page that posts a form must agree with the entry for the operation it posts to |
| A migration, a table, a column, an index or a trigger, or a list the dictionary mirrors (questionnaire, library, clusters, event kinds, audit events, limits) | The data dictionary: the table section, the trigger catalogue and the counts it pins | `docs/static/dictionary-sync` | An applied migration is never edited: a later migration drops and recreates the rule |
| A requirement, its priority, basis or status | The BRD row, then the counts block in BRD section 11, then the FSD function rows and its section 11, then the traceability matrix | `docs/static/brd`, `docs/static/fsd`, `static/traceability`, `docs/static/testdocs` and `static/test-docs` | Regenerate the counts block with `node scripts/check-traceability.mjs --write` and the matrix with `node scripts/check-test-docs.mjs --write` |
| A function, rule, screen or message of the application | The FSD, with its identifier. Identifiers are never reused. A new screen also needs a place in the wireframes page | `docs/static/fsd` and `docs/static/ids`; for a screen, `docs/static/wireframes` | These read only the documents. No check compares the FSD with the code, so a changed rule or message passes every document check: read the FSD row beside the code before you finish. A function is not AS BUILT when every requirement it traces to is Not built |
| The file or title of an automated test that a case cites | The row in the test cases document | `docs/static/testdocs` and `static/test-docs` | Regenerate the traceability counts and matrix with `node scripts/check-test-docs.mjs --write` |
| A suite, or the number of passing tests in one | The file `modules/<name>/tests/baseline.json` of its module, with `--update-baseline` and a stated reason | The guard: `node scripts/test.mjs pr --guard` | Never lower a baseline without saying why |
| What a module does, or its limits | `modules/<name>/STATUS.md` and `modules/<name>/VALIDATION.md`; HANDOVER.md if it was merged without a person reading it | `docs/static/dictionary-sync` pins lines of the deliver, diagnose, procure and journey status pages; `docs/static/findings` and `static/documentation` fail if a heading that a link names is renamed | Nothing else on these pages is checked (FND-229 records that no test reads a VALIDATION.md). Do not write that a check passed unless you ran it |
| A document is added or renamed (a Markdown file, or an HTML page under `docs/`) | A row in section 3 of this index | `docs/static/docindex` | A new Markdown file that is not listed fails the test |
| A new identifier scheme, or a term in the BRD or FSD convention tables | An entry in the glossary | `docs/static/glossary` | Add the scheme to `modules/docs/src/ids.ts` too, so that a citation of an undefined identifier is reported |
| A finding is found, fixed or decided | The row in the findings register and its counts block | `docs/static/findings` | Keep the row and its number. A row whose evidence is gone starts with "evidence changed: re-check" |
| A heading, a link or a source identifier | The links and anchors that name it, including the source links of the findings register | `static/documentation` and `docs/static/findings` | Anchors are made from headings, so renaming a heading breaks the links to it. GitHub and `scripts/check-documentation.mjs` slug a heading with a code span or an underscore differently; link to a heading without either |
| A stage word or the order of the stages in `modules/journey/src/progress.ts` | The table of the five stages, and the entries Next step, Page names and Progress strip, in the glossary | `docs/static/glossary` | The check compares the table with the code. It does not read the other entries |
| A file, a function or a workflow step that a document names as evidence (a path in the glossary, a test file in a case row, an evidence name in the findings register) | The glossary entry, the case row, or the finding's evidence. Renamed evidence makes a finding start with "evidence changed: re-check" | `docs/static/glossary`, `docs/static/testdocs` and `static/test-docs`, `docs/static/findings` | Renaming a file or a workflow step is the usual cause |
