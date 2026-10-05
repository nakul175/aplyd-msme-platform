# Glossary: APLYD MSME platform

Version 0.1. Date: 5 October 2026. Status: draft, not reviewed by a person.

This glossary defines the terms a reader meets in the other documents of this repository: the business words, the technical words, the identifier schemes and the words that belong to the Indian setting. Each entry gives a plain definition, a note on what the term is not to be confused with, and where it is defined or enforced. Nothing in it has been reviewed by a person, and every company, person, provider and figure in the application is SYNTHETIC.

How this relates to the other documents: the [documentation index](DOCUMENTATION-INDEX.md) says where each document sits and which test checks it. The [BRD](brd/BRD.md) (its section 1.2) and the [FSD](fsd/FSD.md) (its section 1.3) each keep a short table of conventions, and every term in those two tables has an entry here. The [findings register](FINDINGS.md) uses the words defined here. `modules/docs/tests/static/glossary.test.ts` checks the form of this glossary and that it covers those two tables and every identifier scheme the documents define.

## How to read this glossary

- **It is for readers of the documents. It is not the glossary the BRD asks for.** BR-UX-03 asks that every term on an owner's page is plain or is explained on that page. That is Not built, and nothing in the application explains these terms to an owner.
- **Definitions are as the repository uses the words.** No outside source was read for this glossary. Where the repository uses a word without defining it (MSME, MeitY, NISG), the entry says so and does not add a meaning.
- **A term with two meanings has two entries,** each with its qualifier in brackets, such as Baseline (outcome) and Baseline (test suite). The same word in capitals and in lower case can be two terms: PARTIAL is the FSD's label for a function and Partial is the BRD's status of a requirement.
- **Where defined or enforced.** A path in code is a file or directory from the repository root and, as in the FSD, is not a link. A document is a link. An identifier such as RULE-17 is in the document named beside it. Section numbers are given only for documents whose sections are stable.
- **Order.** Alphabetical, ignoring capitals and any bracket or symbol before the first letter.

## The five stages and the words the owner pages use

The thesis and the BRD name the stages Describe, Diagnose, Procure, Deploy and Run. The owner pages use other words for four of them, and the page for each has a name of its own. The words below are in `modules/journey/src/progress.ts`; the module and the area code are where the stage is built and specified.

| Stage (thesis, BRD) | Step name on the owner pages | Page name | Module | BRD area |
| --- | --- | --- | --- | --- |
| Describe | Describe | Describe your factory | `modules/factory/` | DESC |
| Diagnose | Decide | What to do about it | `modules/diagnose/` | DIAG |
| Procure | Choose | What you need | `modules/procure/` | PROC |
| Deploy | Deliver | Delivery | `modules/deliver/` | DEPL |
| Run | Measure | Results | `modules/run/` | RUN |

## Identifier schemes

Each identifier below is defined where the document named beside it holds the list. The glossary has an entry for each scheme.

- Decisions and sources: D-nn, P-nn and C-nn in the [decision register](decisions.md); OQ-nn in the [open questions](open-questions.md); S1 to S4 in the [source register](sources.md).
- Business requirements document: BR-AREA-NN, BO-nn, AS-nn, DP-nn and RK-nn in the [BRD](brd/BRD.md).
- Functional specification: FR-AREA-NN, UC-AREA-NN, SCR-NN, RULE-NN and MSG-NN in the [FSD](fsd/FSD.md).
- Design: AD-nn, CN-nn, TR-nn and TQ-nn in the [HLD](design/HLD.md); API-nn in the [API reference](design/API-REFERENCE.md); TH-nn in the [security and privacy document](design/SECURITY-AND-PRIVACY.md); W-nn in the [wireframes](design/WIREFRAMES.md).
- Tests: TC-AREA-NN in the [test cases](test/TEST-CASES.md), SC-nn in the [test scenarios](test/TEST-SCENARIOS.md), TD-nn in the [test data](test/TEST-DATA.md) and RP-nn in the [regression pack](test/REGRESSION-PACK.md).
- Findings: FND-nnn in the [findings register](FINDINGS.md).

## Terms

## A

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Acceptance** | The owner's recorded decision that a delivered milestone passed their own check (accept) or did not (reject). The platform does not judge the work. | The BRD's acceptance criterion, which is about a requirement, and the sponsor's acceptance of the software, which no one has given. | `modules/deliver/src/state.ts`; RULE-36 in [FSD](fsd/FSD.md) |
| **Acceptance criterion** | The BRD column that says what a person would check to say a requirement is met. It is written so that a test or a witnessed session can decide it. | Acceptance test (the owner's check of one milestone) and Acceptance (the owner's decision on a delivery). | [BRD](brd/BRD.md), section 1.2 |
| **Acceptance test** | A sentence the owner writes for each milestone, before work starts, saying how they will check it. Nothing checks that it is measurable. | A test in the test suites, which checks the software and not a provider's work. | `modules/deliver/src/state.ts` (`MAX_TEST_LENGTH`); RULE-35 in [FSD](fsd/FSD.md); [findings register](FINDINGS.md) |
| **AD-nn** | An architecture decision in the HLD, with the choice, the reason and what it costs. | D-nn, a decision of the sponsor. | [HLD](design/HLD.md), section 9 |
| **Advisor** | A person other than the owner who would check the software's draft before the owner relies on it, with the owner's permission. The role does not exist in the application. | Operator (APLYD staff) and Provider (a company that does the work). | BR-ID-08 and BR-DIAG-06 in [BRD](brd/BRD.md); OQ-18 in [open questions](open-questions.md) |
| **Affordability (of an idea)** | How the idea's first-year cost range compares with the owner's yearly budget band: within, stretch, over or unknown. It adds to or takes from the idea's score. | Readiness, which is about prerequisites and not money. | `modules/diagnose/src/engine.ts`; RULE-17 and RULE-18 in [FSD](fsd/FSD.md) |
| **API-nn** | An operation of the programming interface in the API reference: its method, path, who may call it and what it answers. | SCR-NN: an operation is not a page. | [API reference](design/API-REFERENCE.md) |
| **APLYD** | The organisation that owns the platform (D-02). Its earnings never vary with which vendor a customer chooses (D-03). | The sponsor, who is a person, and the platform, which is software. | [decisions](decisions.md); [BRD](brd/BRD.md), section 4 |
| **APLYD_DEMO** | A setting that turns the demonstration on. It is on only when it is exactly the text `true`. | APLYD_ENV (which environment this is) and DEMO_ACCESS (the gate). | `scripts/serve.mjs`; `app/demo/page.tsx`; RULE-46 in [FSD](fsd/FSD.md) |
| **APLYD_ENV** | The setting that names the environment: `local`, `synthetic` or `test`. Synthetic sign-in works only for those three names. | Synthetic environment (the idea), and the name a deployment is given, which nothing technical checks. | `modules/platform/src/env.ts`; RULE-10 in [FSD](fsd/FSD.md) |
| **APLYD_PUBLIC_HOSTS** | An optional list of host names that the gateway treats as the site's own, for a platform whose front door rewrites the Host header. It lets the cross-site check compare like with like. | The address of the live app, which is not in the repository. | `modules/hosting/src/gate.ts`; [runbook](ops/RUNBOOK.md) |
| **Append-only** | A table whose rows are never updated, deleted or replaced; a correction is a new row. Fourteen tables are append-only, and each has three guard triggers. | A log file. The rule is held in the database, and a person with database access is not bound by it. | `modules/platform/src/db/guards.ts`; `drizzle/0001_audit_append_only.sql`; BR-DATA-04 in [BRD](brd/BRD.md) |
| **AS BUILT** | The label for what the code does today, read in the source. It is the opposite of TO BE. | PARTIAL (part of it is built) and the BRD's Built (a requirement the application meets and a test shows). | Conventions in [FSD](fsd/FSD.md), section 1.3; [documentation index](DOCUMENTATION-INDEX.md) |
| **AS-nn** | An assumption in the BRD, tagged [Guessing] until it is tested. | AS BUILT, the label for code that exists. | [BRD](brd/BRD.md), section 8 |
| **Assessment** | A stored, ranked list of ideas made from one confirmed version of the factory description. It records the description version, the library version and the engine version, and it never changes when the library does. | Gap assessment (a view of gaps, not built) and the study's diagnostic. | `modules/diagnose/src/db/assessments.ts`; RULE-16 in [FSD](fsd/FSD.md); BR-DIAG-04 in [BRD](brd/BRD.md) |
| **Assessment event** | A row of `assessment_events`: the owner's decision on one idea, or the sign-off. The state of an assessment is read from these rows and is not stored. | Audit event (a row of the audit log). | `modules/diagnose/src/db/assessments.ts`; [data dictionary](design/DATA-DICTIONARY.md) |
| **Athena Infonomics** | One of the four parties the BRD names as the study's client and authors. The thesis says APLYD was created by Athena and that a commercial platform built on the study needs the client's agreement and disclosure. | The sponsor's organisation, APLYD. | [thesis](thesis.md), section 5; [BRD](brd/BRD.md), section 4; OQ-09 in [open questions](open-questions.md) |
| **Audit event** | One row of the audit log: when, what (a dotted name such as `company.read.denied`), which person and company, and a small detail. It never holds a record's contents or a secret. | Assessment event and the events of an engagement, which are records of the owner's work. | `modules/platform/src/db/audit.ts`; [data dictionary](design/DATA-DICTIONARY.md), section 5.8 |
| **Audit log** | The append-only table `audit_events`: one row for each sign-in, sign-out, change and refused attempt by a known person. It has no hash chain, and no page or endpoint reads it today. | A log stream or server log, which is not stored in the database. | `modules/platform/src/db/audit.ts`; BR-ID-06 and BR-OPS-06 in [BRD](brd/BRD.md); [findings register](FINDINGS.md) |
| **authorizeCompanyRead** | One of four shared checks in `modules/platform/src/api/authorize.ts`, with `authorizeCompanyWrite`, `authorizeSignedIn` and `authorizeOperator`, that each company-scoped or operator endpoint calls first. They apply the scope rule to a request and answer the refusal. | The scope rule itself, which is the rule they apply. | `modules/platform/src/api/authorize.ts` |

## B

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Baseline (outcome)** | One whole number, from 0 to 1,000,000,000, for the state of things before the work. It is recorded once for an engagement, and only before any milestone is accepted. | Baseline (test suite) and baseline.json, which are about tests. | `modules/run/src/state.ts`; RULE-40 in [FSD](fsd/FSD.md); BR-RUN-01 in [BRD](brd/BRD.md) |
| **Baseline (test suite)** | The fewest passing tests the runner will accept from one suite. Adding or lowering one needs `--update-baseline` with a stated reason. | Baseline (outcome), the owner's starting number. | `scripts/test.mjs`; [development guide](DEVELOPMENT.md) |
| **Baseline guard** | The `--guard` option of the test runner, also called the regression guard. It fails when a suite is missing, has no baseline or passes fewer tests than its baseline, and a skipped, todo or cancelled test counts as a failure. | The baseline of an outcome, and a branch protection rule, which the repository does not show. | `scripts/test.mjs`; BR-NFR-05 in [BRD](brd/BRD.md); AD-23 in [HLD](design/HLD.md) |
| **baseline.json** | The file `modules/<module>/tests/baseline.json`. It holds the baseline of each suite of that module, by suite id. | A lock file or a snapshot of results: it holds counts only. | `scripts/test.mjs`; `modules/docs/tests/baseline.json`; [development guide](DEVELOPMENT.md) |
| **Basis** | The BRD column that says where a requirement comes from: Decided, Carried, Thesis, Study, Rule, Built or Proposed. | Status today (how far the requirement is built). | [BRD](brd/BRD.md), section 1.2 |
| **Batch (database batch)** | A group of statements sent to the database together so that a record and its audit row succeed or fail as one. The audit row is written only when the statement before it changed a row. | A batch of work or of requests to a provider. | `modules/platform/src/db/audit.ts` (`auditIfChanged`); AD-06 in [HLD](design/HLD.md) |
| **BO-nn** | A business objective in the BRD, with how it would be measured and a target. | BR-nn, a requirement, and the sponsor's objectives in the thesis. | [BRD](brd/BRD.md), section 3 |
| **BR-AREA-NN** | A business requirement in the BRD: BR, an area code and a number, such as BR-ID-01. Numbers are never reused, and there are 116. | FR-AREA-NN (a function of the FSD that serves one) and TC-AREA-NN (a test case for one). | [BRD](brd/BRD.md), section 7; [FSD](fsd/FSD.md), section 1.3 |
| **BRD** | The business requirements document: what the business needs, as 116 numbered requirements, each with a priority, a basis, an acceptance criterion and a status today. | The FSD, which says what the application does about them. | [BRD](brd/BRD.md) |
| **Browser layer** | The test layer in which the built application runs in a local Worker and is walked in headless Chromium through `playwright-core`. Nothing downloads a browser. | The demonstration and a real browser on a phone: this layer covers one browser engine only. | [development guide](DEVELOPMENT.md); `modules/platform/tests/support/browser.ts` |
| **Built (as a Basis)** | A requirement that a slice delivers with no one having asked for it as such. | Built as a Status today, which says a test shows the application does it. | [BRD](brd/BRD.md), section 1.2 |
| **Built (as a Status today)** | The synthetic application does the requirement and a test shows it. It does not mean the requirement is accepted. | AS BUILT (the FSD's label for a function) and Built as a Basis. | [BRD](brd/BRD.md), sections 1.2 and 1.3 |
| **Business requirement** | A numbered statement in the BRD of what the business needs, with an acceptance criterion and a status today. | A functional requirement (FR) and a requirement in the product (a request an owner makes of providers). | [BRD](brd/BRD.md), section 7 |

## C

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **C-nn** | A position from the 13 September session that the sponsor has not restated since. C-01 to C-05 are consistent with D-02 and D-03 and are to be reconfirmed. | D-nn (a decision the sponsor made) and CN-nn (a constraint in the HLD). | [decisions](decisions.md) |
| **Carried** | A Basis for a requirement: it rests on a C-nn position from the 13 September session that the sponsor has not restated. | Decided, which rests on a sponsor decision (D-nn). | [BRD](brd/BRD.md), section 1.2 |
| **Cast** | The seeded set of invented companies and owners of the demonstration, at different points of the journey, with the operator. Companies A and B come from the platform's seed and C to G from the demonstration. | A cast of real customers: every one is SYNTHETIC. | `modules/demo/src/cast.ts`; [runbook](ops/RUNBOOK.md) |
| **Catalogue (test)** | The list of test suites the runner discovers. `--check-catalogue` fails when a test file sits anywhere but in a layer directory, or a baseline names a suite that no longer exists. | A product catalogue or a list of providers. | `scripts/test.mjs`; [development guide](DEVELOPMENT.md) |
| **[Certain], [Likely], [Guessing]** | The evidence tags. Certain means read in code or in a cited source, Likely is a strong inference, and Guessing fills a gap and needs testing. | A confidence score: the tags are written by the author of a document and have not been checked by a person. | Conventions in [FSD](fsd/FSD.md), section 1.3; [thesis](thesis.md) |
| **Choose** | The owner pages' one-word name for the Procure step, on the page What you need. | Procure, the name of the stage in the thesis and the BRD. | `modules/journey/src/progress.ts` |
| **CI** | The automated checks that run on a pull request: `.github/workflows/ci.yml` runs the engineering checks and `.github/workflows/docs.yml` runs three document checks. A pull request that changes only Markdown or `docs/` skips the first. | A review by a person. | `.github/workflows/ci.yml`; `.github/workflows/docs.yml`; [regression pack](test/REGRESSION-PACK.md) |
| **Closed (engagement)** | An engagement the owner has ended. It is complete only if it was closed with every milestone accepted, and otherwise it ended early. | Complete and Ended early, which say how it was closed. | `modules/deliver/src/state.ts`; RULE-39 in [FSD](fsd/FSD.md); BR-DEPL-09 in [BRD](brd/BRD.md) |
| **Cluster** | A named place or association in which pools form. Today it is one of three SYNTHETIC text labels, and a real cluster is a requirement not yet met. | A cluster of servers, and a pool (the count of companies that asked for the same idea in one cluster). | `modules/procure/src/clusters.ts`; BR-PROC-11 in [BRD](brd/BRD.md); OQ-03 in [open questions](open-questions.md) |
| **CN-nn** | A constraint on the design, listed in the HLD. | C-nn, a carried-forward position, and the constraints of the BRD's business rules. | [HLD](design/HLD.md), section 11.1 |
| **COM** | The area code for the commercial requirements, BR-COM-nn: the revenue model and the one listing fee. | A company. | [BRD](brd/BRD.md), section 7.11 |
| **Command suite** | A test-runner suite that is one process which passes or fails, with no count of tests: the type check, the documentation check, the migrations check, and the traceability and test-document checks. | A suite of test files, which has a count and a baseline. | `scripts/test.mjs`; [development guide](DEVELOPMENT.md) |
| **Company** | The unit of the scope rule: the one company a person belongs to, a row of `companies`. Every company is SYNTHETIC, and no endpoint creates one. | The organisation APLYD, and a provider (a company that does the work). | `modules/platform/src/db/schema.ts`; [data dictionary](design/DATA-DICTIONARY.md) |
| **Confirmed (description)** | A version of the factory description that the owner has marked accurate. It needs five answers: sector, products, employees, processes and problems. | Signed off (an assessment) and Accepted (a delivery). | `modules/factory/src/`; RULE-13 in [FSD](fsd/FSD.md) |
| **Content-Security-Policy** | A response header that limits what a page may load or run. The application sets only some of its parts (frame-ancestors, base-uri, form-action) and has no script restrictions. | The header-read rule, which is about headers the code reads. | `modules/platform/src/api/security-headers.ts`; [findings register](FINDINGS.md) |
| **Cross-site refusal** | The refusal of a request that changes something when another website sent it: the Origin differs from the request's own origin or is not a URL, or, with no Origin, Sec-Fetch-Site is `cross-site`. The answer is 403 `cross_site_refused`. | A login refusal (401) and a scope refusal (404). | `modules/platform/src/identity/cross-site.ts`; RULE-06 in [FSD](fsd/FSD.md) |
| **Custodian** | The named body or person who would maintain any rule or compliance content shown to users and answer for it. None exists, so all such content is SYNTHETIC. | The sponsor, and the operator. | OQ-04 in [open questions](open-questions.md); BR-GOV-10 and BR-DIAG-07 in [BRD](brd/BRD.md) |

## D

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **D-nn** | A decision made by the sponsor, in the decision register. D-01 to D-06 are decided, and the register also lists dropped numbers and mechanisms, which are not requirements. | D1 (the database service) and Decided (the BRD Basis that cites a D-nn). | [decisions](decisions.md) |
| **D1** | Cloudflare's SQLite-based database service, which the application is written for (D-06). Locally and in the launcher the tests use Miniflare's D1, and no hosted D1 has been used. | A decision numbered D-nn, and a drive. | `vite.config.ts`; `scripts/serve.mjs`; [HLD](design/HLD.md), section 7.4 |
| **DATA** | The area code for data and privacy requirements, BR-DATA-nn. | The data layer and the data dictionary, which describe tables. | [BRD](brd/BRD.md), section 7.10 |
| **Data layer** | The only code that touches a module's tables: the files under `modules/<name>/src/db/`. A static test fails if a page, a route or another module queries the tables directly. | The database itself. | `modules/<name>/src/db/`; AD-24 in [HLD](design/HLD.md) |
| **Decide** | The owner pages' one-word name for the Diagnose step, on the page What to do about it. | Decision (on an idea), the owner's yes, not yet or no. | `modules/journey/src/progress.ts` |
| **Decided** | A Basis for a requirement: a sponsor decision, D-nn. | Carried (a C-nn position not yet restated) and Proposed (not yet confirmed). | [BRD](brd/BRD.md), section 1.2; [decisions](decisions.md) |
| **Decision (on an idea)** | One of three choices an owner can record on a ranked idea, each with an optional note: accept, defer or reject. A later decision on the same idea replaces the earlier in effect, and the earlier row stays. | D-nn (the sponsor's decisions) and the accept or reject of a delivery. | `modules/diagnose/src/api/diagnose.ts`; RULE-22 in [FSD](fsd/FSD.md) |
| **Degraded** | The health status when a guard trigger is missing or the database is unavailable. `GET /api/health` then answers 503 with `status` set to `degraded`. | Slow or partly working: the check looks only at trigger names and tables. | `modules/platform/src/api/health.ts`; [API reference](design/API-REFERENCE.md) |
| **Deliver** | The owner pages' one-word name for the Deploy step, on the page Delivery. It is also the name of the module `modules/deliver`, which holds that stage. | Delivery, a single recorded event on a milestone. | `modules/journey/src/progress.ts`; `modules/deliver/` |
| **Delivery** | The owner's note that a provider says a milestone is finished (the `delivered` event). A milestone can be delivered again after a rejection, up to 14 deliveries. | Deploy (stage 4 of the journey) and the delivery of software to a server. | `modules/deliver/src/state.ts`; RULE-36 and RULE-37 in [FSD](fsd/FSD.md) |
| **DEMO_ACCESS** | The setting `DEMO_ACCESS=open`, which leaves the hosted address without a gate. The launcher starts open only when told so in so many words. | APLYD_DEMO, which turns the demonstration cast on. | `modules/hosting/src/gate.ts`; [runbook](ops/RUNBOOK.md) |
| **Demonstration** | The presenter-led walk of what the platform does today: a cast, a seeder and a script at `/demo` with eight steps. It exists only when `APLYD_DEMO` is `true`. | The hosted demonstration (where it runs) and a trial with owners. | `modules/demo/`; `app/demo/page.tsx`; BR-OPS-07 and RULE-46 |
| **DEPL** | The area code for requirements of the Deploy stage, BR-DEPL-nn. | The runbook's deployment of the application to a host. | [BRD](brd/BRD.md), section 7.6 |
| **Deploy** | Stage 4 of the journey: the owner agrees a milestone plan with a chosen provider, and records deliveries, acceptances and payments made elsewhere. It does not mean deploying a site, and the platform moves no money and does not contact the provider. | Deploying the application to a host (the runbook). The owner pages call this stage Deliver. | `modules/deliver/`; `modules/journey/src/progress.ts` |
| **Derived state** | A status worked out from the events on every read and never stored: an engagement's status, a milestone's state, whether a review is due. | A cached or computed column: nothing is stored. | `modules/deliver/src/state.ts`; RULE-39 in [FSD](fsd/FSD.md); [data dictionary](design/DATA-DICTIONARY.md), section 6 |
| **DESC** | The area code for requirements of the Describe stage, BR-DESC-nn. | Description, the answers themselves. | [BRD](brd/BRD.md), section 7.3 |
| **Describe** | Stage 1 of the journey: the owner answers a structured description of the factory, and every save is a new version. The owner pages call the page Describe your factory. | The factory description itself, and the questionnaire it is made from. | `modules/factory/`; `modules/journey/src/progress.ts`; BR-DESC-01 to BR-DESC-03 in [BRD](brd/BRD.md) |
| **DIAG** | The area code for requirements of the Diagnose stage, BR-DIAG-nn. | Diagnosis in the study's AI readiness material. | [BRD](brd/BRD.md), section 7.4 |
| **Diagnose** | Stage 2 of the journey: from the confirmed description, a ranked list of ideas, the owner's decision on each, and a sign-off. The owner pages call this step Decide, on the page What to do about it. | Diagnosis in the study, and the health check. | `modules/diagnose/`; `modules/journey/src/progress.ts` |
| **Differencing** | Learning a hidden number by comparing what is shown before and after something changes, for example when a company joins a pool. It is the weakness of the floor of five at its boundary. | Differences between two document versions. | TH-13 in [security and privacy](design/SECURITY-AND-PRIVACY.md); OQ-14 in [open questions](open-questions.md) |
| **Digest** | A SHA-256 code computed over content. The sign-off stores one, which the page calls the fingerprint, and the source register holds one for each study document. | A summary or a digest of a document: nothing here is shortened for a reader. | `modules/diagnose/src/digest.ts`; [sources](sources.md) |
| **Digital Personal Data Protection Act** | The Indian Act of 2023 that the security and privacy document names as a thing for counsel to ask about. The document states no legal rule and does not say what the Act requires. | DP-nn, a dependency in the BRD. | [security and privacy](design/SECURITY-AND-PRIVACY.md), section 7.2 |
| **DigitalOcean App Platform** | The container host of the live demonstration. It builds the `Dockerfile` from GitHub and runs the launcher. | A production site: the live host is for the SYNTHETIC demonstration only. | `.do/app.yaml`; [runbook](ops/RUNBOOK.md), section 5 |
| **Dockerfile** | The file that builds the container image of the launcher for the hosted demonstration. The hosting status page records that it has never been built or run. | The application's build: the build is `pnpm build`. | `Dockerfile`; [runbook](ops/RUNBOOK.md); [findings register](FINDINGS.md) |
| **Documentation wave 1** | The commit 472b8e3, titled "Docs WIP: FSD, HLD, data dictionary, API reference, test documents and their sync checks (wave 1)". The findings register uses the name for what that commit changed. | A release of the application. | [findings register](FINDINGS.md) |
| **DP-nn** | A dependency in the BRD: a decision or fact that blocks real data, real content or real users. | The Digital Personal Data Protection Act, which the security document names as a question for counsel. | [BRD](brd/BRD.md), section 8 |
| **Draft (description)** | A saved version of the factory description that is not confirmed. A draft needs at least one answer. | A draft document or a draft pull request. | `modules/factory/src/`; RULE-13 in [FSD](fsd/FSD.md) |
| **Drizzle** | The layer that declares the tables (drizzle-orm 0.45.2) and its migration tool, Drizzle Kit 0.31.10. The queries are hand-written SQL. | An ORM that writes the queries. | `drizzle/`; `package.json`; AD-02 in [HLD](design/HLD.md) |

## E

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Engagement** | The owner's choice of one listed provider for one requirement. There is one engagement per requirement, and it holds the plan and its events. | A contract: the platform records the choice and does not contact the provider. | `modules/deliver/`; AD-15 in [HLD](design/HLD.md); OQ-15 in [open questions](open-questions.md) |
| **Engine** | The rules that score and order ideas. It is not an AI model, and equal scores are ordered by idea id so the same answers give the same order. | A model, or the library of ideas it ranks. | `modules/diagnose/src/engine.ts`; RULE-17 and RULE-21 in [FSD](fsd/FSD.md); AD-03 in [HLD](design/HLD.md) |
| **Export council** | A kind of body the open question OQ-04 names as a possible custodian of rule or compliance content. No export council is named or involved in the repository. | A provider or a cluster body. | OQ-04 in [open questions](open-questions.md) |

## F

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Fingerprint** | A SHA-256 digest over canonical JSON of the assessment id, the whole result and the decision standing on each ranked idea with its note. It is stored with the sign-off and recomputed on the page, and it does not cover who decided or when. | A person's fingerprint, or a proof that nobody changed the database: it is not chained or anchored. | `modules/diagnose/src/digest.ts`; RULE-24 in [FSD](fsd/FSD.md); AD-14 in [HLD](design/HLD.md) |
| **Floor of five** | The position that no figure is published from fewer than five companies (C-04). A pool below five is shown to nobody, and from five a member sees "at least 5", "at least 10" and so on. | A minimum price or a minimum order. | `modules/procure/src/pool.ts` (`AGGREGATE_FLOOR`); RULE-28 and RULE-29 in [FSD](fsd/FSD.md); BR-GOV-06 in [BRD](brd/BRD.md) |
| **FND-nnn** | An identifier of the findings register. A finding keeps its number, and a row is never deleted. | A finding in a review, whose labels (H1, M2) are local to one module. | [findings register](FINDINGS.md) |
| **Foreign key** | A database rule that a row must point to a row that exists. It is why a user who has saved a version cannot be deleted. | A key for encryption. | [data dictionary](design/DATA-DICTIONARY.md); [findings register](FINDINGS.md) |
| **Form post** | A request from an HTML form on a page. | A program, which is any other client that sends JSON. | [FSD](fsd/FSD.md), section 1.3 |
| **FR-AREA-NN** | A functional requirement of the FSD. Numbers are contiguous within an area and never reused. | BR-AREA-NN (a business requirement) and UC-AREA-NN (a use case). | [FSD](fsd/FSD.md), section 1.3 |
| **FSD** | The functional specification document: functions, use cases, screens, rules and messages, each marked AS BUILT, PARTIAL or TO BE. | The BRD, which says what is needed, and the HLD, which says how it is built. | [FSD](fsd/FSD.md) |

## G

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Gap** | In the engine, the condition an idea would close. The engine judges from the owner's answers whether it exists, and an idea whose gap is known to be absent is left out. | A gap in the code or in the documents, which is a finding. | `modules/diagnose/src/engine.ts` |
| **Gap assessment** | A view of where the unit stands on data, people, systems, money and quality, and what stands between it and each idea. It is not built: readiness feeds the score and there is no gap view. | The assessment (the ranked list of ideas). | BR-DIAG-08 in [BRD](brd/BRD.md) |
| **Gate** | The HTTP Basic user name and password the gateway demands in front of the hosted demonstration. One shared pair serves every viewer, and `/healthz` is the one route open without it. | The application's sign-in, which has no password. | `modules/hosting/src/gate.ts` (`passesGate`); [runbook](ops/RUNBOOK.md) |
| **Gateway** | The Node process in the launcher that holds the gate, answers `/healthz`, caps a request body at 256 KiB, removes the Authorization header and forwards everything else to the Worker. | The hosting platform's ingress. | `modules/hosting/src/gateway.ts`; RULE-44 in [FSD](fsd/FSD.md); AD-20 in [HLD](design/HLD.md) |
| **GOV** | The area code for governance and constraint requirements, BR-GOV-nn. | The government, whose rules the repository does not state. | [BRD](brd/BRD.md), section 7.1 |
| **Guard trigger** | A database trigger that enforces a rule in the database as well as in the application: refusing an update, delete or replace on an append-only table, or an event out of order. 91 must exist, and the health check reports `degraded` when one is missing. | A trigger in a business sense. The check reads names and tables only and does not run the triggers. | `modules/platform/src/db/guards.ts`; `drizzle/`; RULE-09 in [FSD](fsd/FSD.md); AD-05 in [HLD](design/HLD.md) |

## H

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Handover** | The file `HANDOVER.md`: the state of the work, the record of each slice, "Merged without review" and "Direct to main". | A handover to another team: the repository has no such process. | [HANDOVER.md](../HANDOVER.md) |
| **Header-read rule** | A static test that fails if code reads a request header outside an allow-list of five: `cookie`, `origin`, `sec-fetch-site`, `content-type` and `content-length`. Three host-process files are exempt, and it is a tripwire and not a proof. | The security headers the application sends on its responses. | `modules/platform/tests/static/source-rules.test.ts`; BR-NFR-01 in [BRD](brd/BRD.md); AD-10 in [HLD](design/HLD.md) |
| **Health check** | Two routes: `/api/health` in the application (three status words, public) and `/healthz` in the gateway (`ok`, or 503). | A test of the application's quality. | `modules/platform/src/api/health.ts`; `modules/hosting/src/gateway.ts` |
| **HLD** | The high-level design: the structure of the application, the architecture decisions (AD-nn), the constraints and risks. | The LLD, which goes down to files and functions. | [HLD](design/HLD.md) |
| **HMAC-SHA256** | The method that signs the session token with the session secret. A token with a wrong signature is refused. | Encryption: the token is signed and not hidden. | `modules/platform/src/identity/session.ts`; RULE-01 in [FSD](fsd/FSD.md) |
| **Hosted demonstration** | The launcher running in a container on DigitalOcean App Platform behind a shared password, with an in-memory database. It is SYNTHETIC, and a restart resets it. | A production site, and a trial with owners. | [runbook](ops/RUNBOOK.md); BR-OPS-08 in [BRD](brd/BRD.md); AD-19 in [HLD](design/HLD.md) |

## I

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **ID** | The area code for identity, access and audit requirements, BR-ID-nn. | The ID column of the BRD and an identifier of any kind. | [BRD](brd/BRD.md), section 7.2 |
| **Idea** | One entry of the library as an owner meets it: something the owner could do about a named problem, AI or not, with benefit range, costs, prerequisites, risk and source. The code and the API call it an opportunity. | A ranked idea (an idea chosen for one assessment) and a requirement (an idea an owner asked for). | `modules/diagnose/src/library.ts`; BR-DIAG-02 in [BRD](brd/BRD.md) |
| **Idempotent** | Doing it twice has the same effect as doing it once. The API reference says for each operation whether it is, and says that signing in, saving a description and deciding on an idea are not. | Safe to retry: an uncertain write is never retried blindly. | [API reference](design/API-REFERENCE.md) |
| **Identity** | Who the person is: user id, company id, role and display name, read from `users` on every request using only the user id in the verified session. | A passport or other ID: the platform holds no government identity number. | `modules/platform/src/identity/resolve.ts`; RULE-02 in [FSD](fsd/FSD.md) |
| **In-memory database** | The SQLite database of the launcher, held in memory and rebuilt from the migrations and the seed at every start. Nothing in it is durable. | D1 hosted by Cloudflare. | `scripts/serve.mjs`; [runbook](ops/RUNBOOK.md) |
| **IndiaAI Mission** | One of the four parties the BRD names as the study's client and authors, with MeitY, NISG and Athena Infonomics. Reuse of the study's material is unsettled. | The platform's own sponsor, APLYD. | [BRD](brd/BRD.md), section 4; [sources](sources.md); [thesis](thesis.md); OQ-09 in [open questions](open-questions.md) |
| **Indian grouping** | Money is whole rupees, written with Indian digit grouping: ₹1,00,000 is one lakh and ₹1,500 is fifteen hundred. The money columns end in `_inr`. | A decimal amount: the application holds no paise. | `modules/deliver/src/state.ts` (`MAX_AMOUNT_INR`); [FSD](fsd/FSD.md), section 1.3; [data dictionary](design/DATA-DICTIONARY.md) |
| **Ingress** | The hosting platform's front door, which ends HTTPS and passes plain HTTP to the container. The gate password and the session cookie cross that last hop in clear. | The gateway, which is inside the container. | `.do/app.yaml`; [HLD](design/HLD.md), section 7.3; [security and privacy](design/SECURITY-AND-PRIVACY.md) |
| **Integration layer** | The test layer in which request handlers run against a real database (SQLite through Miniflare) with the migrations and the seed applied. | The integration of a provider's work into a factory, which is a stage of the journey. | [development guide](DEVELOPMENT.md); `modules/*/tests/integration/` |

## J

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Journey** | The five stages as one path: Describe, Diagnose, Procure, Deploy and Run. It is also the name of a module whose one browser test walks the stages. | A user's journey in a design sense: the stages are fixed. | [thesis](thesis.md); `modules/journey/` |

## L

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Lakh** | A unit of 100,000 rupees as the questionnaire's budget bands use it: under 1 lakh is ₹1,00,000 and 5 to 25 lakh has a ceiling of ₹25,00,000. | A currency. | `modules/diagnose/src/library.ts`; [data dictionary](design/DATA-DICTIONARY.md), budget band; RULE-18 in [FSD](fsd/FSD.md) |
| **Launcher** | `scripts/serve.mjs`: it runs the built Worker in workerd through Miniflare behind the gateway, rebuilds the in-memory database at each start and optionally seeds the demonstration. It refuses to start on an invalid configuration. | The deployment of a product. | `scripts/serve.mjs`; `modules/hosting/`; RULE-43 in [FSD](fsd/FSD.md) |
| **Left out (idea)** | An idea that addresses a problem the owner named but whose gap is known to be absent. It is not ranked, and it is listed with the owner's own answer. | A rejected idea, which an owner decides. | `modules/diagnose/src/engine.ts`; RULE-20 in [FSD](fsd/FSD.md) |
| **Library** | The versioned list of ideas in the repository that the engine ranks from. It is SYNTHETIC until the study's material may be reused, a custodian exists and the first sector is chosen. | The study's material, and the provider registry. | `modules/diagnose/src/library.ts`; OQ-03, OQ-04 and OQ-09 in [open questions](open-questions.md) |
| **Listing** | The operator's act of making a provider visible to owners: a `list` event that copies the fee in force. Unlisting is the opposite, and the two alternate. | A check of the provider: a listing says nothing about vetting. | `modules/procure/src/db/providers.ts`; RULE-31 in [FSD](fsd/FSD.md) |
| **Listing fee** | The one flat fee a listed provider pays, set by the operator and copied into the listing. No fee is decided (OQ-11): the ₹1,500 the demonstration seeds is a placeholder, and no owner sees the fee. | A commission on a deal, which D-03 rules out, and any decided price. | `modules/procure/src/db/providers.ts`; `modules/demo/src/cast.ts` (`PLACEHOLDER_FEE_INR`); D-03 in [decisions](decisions.md); OQ-11 in [open questions](open-questions.md); BR-PROC-05 in [BRD](brd/BRD.md) |
| **Listing terms** | The versions of the one fee, in `listing_terms`. The newest is in force, and nothing can be listed while none exists. | The terms of a contract between APLYD and a provider. | `modules/procure/src/`; RULE-32 in [FSD](fsd/FSD.md) |
| **LLD** | The low-level design: how the modules are built, below the level of the HLD. Its file, docs/design/LLD.md, is added with this set of documents. | The HLD, which stays at the level of structure and decisions. | [documentation index](DOCUMENTATION-INDEX.md) |

## M

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Marketplace++** | The product direction (D-05): a marketplace of providers, plus the consulting, delivery and operations help an owner would otherwise have to hire, as one journey from describing the factory to running what was bought. It covers AI and other technology. | A listing site: today the platform keeps a registry and records choices, and it sells nothing. | [decisions](decisions.md) (D-05); [thesis](thesis.md); [README](../README.md) |
| **Measure** | The owner pages' one-word name for the Run step, on the page Results. | Measure in the test sense: the platform measures nothing, and the owner writes the numbers. | `modules/journey/src/progress.ts` |
| **MeitY** | One of the four parties the BRD names as the study's client and authors. The repository does not spell out the letters or say what the body does. | The sponsor, APLYD. | [BRD](brd/BRD.md), section 4; [sources](sources.md); [thesis](thesis.md) |
| **Member** | A person in a company who is not its owner. A member may read the company's records and is refused any change with 403. | Owner, and a user of another company. No member is seeded, so none exists today. | `modules/platform/src/identity/scope.ts`; BR-ID-05 in [BRD](brd/BRD.md); [findings register](FINDINGS.md) |
| **Merged without review** | The section of HANDOVER.md that records the pull requests merged into `main` with no person reading the code: #1 to #9, merged on 5 October 2026 at the sponsor's instruction. | A reviewed merge: no person has read the code. | [HANDOVER.md](../HANDOVER.md); Needs-human-review in [AGENTS.md](../AGENTS.md) |
| **Migration** | A numbered SQL file in `drizzle/`, 0000 to 0014. An applied migration is never edited, and a defect in a rule is fixed by a later migration that drops and recreates the trigger. | A data migration between systems. | `drizzle/`; `modules/platform/src/db/migrate.ts`; [data dictionary](design/DATA-DICTIONARY.md) |
| **Milestone** | One step of a plan: a title, the test the owner will check it by, a due date and a price in whole rupees that the owner records. A plan holds 1 to 12, and a milestone is delivered, then accepted or rejected, and an accepted one is paid once. | A date on a project plan alone: a milestone here also carries the owner's check and price. | `modules/deliver/`; RULE-35 to RULE-38 in [FSD](fsd/FSD.md) |
| **Miniflare** | Cloudflare's local simulator of Workers (4.20260515.0 in `package.json`). The tests and the launcher run the Worker and its database in it. | Hosted D1: Miniflare's SQLite is not Cloudflare's database. | `package.json`; `scripts/serve.mjs`; [findings register](FINDINGS.md) |
| **Module** | One directory `modules/<name>/` with `src`, `tests`, `STATUS.md` and `VALIDATION.md`, owned by one writing agent. The modules are platform, factory, diagnose, procure, deliver, run, hosting, demo, journey and docs. | A software module in general: these are directories with an owner. | [development guide](DEVELOPMENT.md); [AGENTS.md](../AGENTS.md) |
| **MSG-NN** | A message a person can see, listed in the FSD with its text and where it appears. | A message in the audit log, which is not shown to a person. | [FSD](fsd/FSD.md), section 1.3 |
| **MSME** | The kind of company the platform is for: a small manufacturing unit run by its owner. The documents use the word without spelling it out or setting a size limit. | A legal size category: the application applies no size test beyond the questionnaire's employee band. | [thesis](thesis.md), section 1; [BRD](brd/BRD.md), section 4 |
| **Mutation check** | Breaking the code on purpose, one small change at a time, and seeing whether the tests fail. The authors run it by hand with `scripts/mutation/mutate.py`, and nothing in CI runs it. | A code review: a mutation check tests the tests, not the code. | [mutation README](../scripts/mutation/README.md); `modules/<name>/VALIDATION.md` |

## N

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Needs-human-review** | The label for a pull request that touches a protected path. A merge with no person reading it is recorded in HANDOVER.md. | Review by an agent, which has happened and is not human review. | [AGENTS.md](../AGENTS.md); BR-NFR-14 in [BRD](brd/BRD.md) |
| **Next step** | The one step that is the owner's turn, worked out from facts about the company and never stored. The home page names it and says where to do it. | A task the platform does for the owner. | `modules/journey/src/progress.ts` |
| **Next.js** | The web framework the pages are written in. The application runs it on Cloudflare Workers through vinext. | The Worker itself. | `package.json`; D-06 in [decisions](decisions.md) |
| **NFR** | The area code for non-functional requirements, BR-NFR-nn: for example the header-read rule, the regression guard and the review of protected paths. | A requirement about functions, which is FR. | [BRD](brd/BRD.md), section 7.12 |
| **NISG** | One of the four parties the BRD names as the study's client and authors. The repository does not spell out the letters or say what the body does. | The sponsor, APLYD. | [BRD](brd/BRD.md), section 4; [sources](sources.md); [thesis](thesis.md) |
| **Not built** | A Status today: nothing does it. | Open (it waits on a decision, not on code) and Partial. | [BRD](brd/BRD.md), section 1.2 |
| **Not shown** | What a pool below five companies says: that the number is not shown, to everyone including the pool's own members. | Zero: a hidden number is not zero. | `modules/procure/src/pool.ts` (`presentPool`); RULE-28 in [FSD](fsd/FSD.md) |

## O

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Open** | A Status today: the requirement waits on a decision, not on code. | An open finding, which is a finding with no fix recorded, and an open question. | [BRD](brd/BRD.md), section 1.2 |
| **Operator** | The role `operator`, with no company: APLYD staff who keep the provider registry and the one fee, and who see pools of five or more as counts. The operator reads no company's records, and the role does not override the scope rule. | A provider and an owner. | `modules/platform/src/api/authorize.ts`; BR-ID-04 and RULE-05 |
| **Opportunity** | The code's and the API's word for an idea: `opportunityId` and the opportunity library. | A business opportunity or a commercial lead. | `modules/diagnose/src/library.ts`; [API reference](design/API-REFERENCE.md) |
| **OPS** | The area code for operator and operations requirements, BR-OPS-nn, including the demonstration and the hosted host. | The operator role, which is one part of it. | [BRD](brd/BRD.md), section 7.8 |
| **OQ-nn** | An open question in the register, with who must answer and what it blocks. | A technical question TQ-nn in the HLD. | [open questions](open-questions.md) |
| **Outcome** | What the owner measures for an engagement: one baseline and up to three reviews, each a number the owner writes. The platform measures nothing itself. | Result in the plain-language wording of the wireframes. | `modules/run/`; BR-RUN-01 to BR-RUN-04 in [BRD](brd/BRD.md) |
| **outcome_events** | The append-only table `outcome_events`: one baseline and up to three reviews for each engagement. | Engagement events and audit events, which are other tables. | `modules/run/src/db/outcomes.ts`; [data dictionary](design/DATA-DICTIONARY.md) |
| **Owner** | The role `owner`: the person who writes a company's records and reads only their own company's. The word also means the MSME owner, who is the user. | Sponsor (who decides direction) and Operator. | `modules/platform/src/identity/scope.ts`; BR-ID-01 and RULE-04 |

## P

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **P-nn** | A proposal in the decision register that the sponsor has not yet decided. P-01 and P-02 are the two. | D-nn (decided) and PARTIAL (a label for code). | [decisions](decisions.md) |
| **Page names** | The names of the five stage pages as they appear on the page and in the home page's link: Describe your factory, What to do about it, What you need, Delivery and Results. | The one-word step names of the progress strip, which are Describe, Decide, Choose, Deliver and Measure. | `modules/journey/src/progress.ts` |
| **PARTIAL** | The FSD's label for a function of which part is built. The row says which part is missing. | Partial as a Status today in the BRD, which says the same of a requirement. | [FSD](fsd/FSD.md), section 1.3 |
| **Partial** | A Status today: some of the requirement is built, and the entry says what is missing. | PARTIAL, the FSD's label for a function. | [BRD](brd/BRD.md), section 1.2 |
| **payment_recorded** | The `payment_recorded` event: the owner's note that they paid an amount outside the platform for an accepted milestone, once. The platform moves no money and compares the amount with nothing. | A payment made through the platform: there is none, and no receipt. | `modules/deliver/src/state.ts`; RULE-38 in [FSD](fsd/FSD.md) |
| **Plan** | The milestones agreed for an engagement, recorded once. Nothing is delivered, accepted, rejected or paid before it is agreed. | A project plan outside the platform. | `modules/deliver/`; RULE-36 in [FSD](fsd/FSD.md) |
| **Platform (module)** | The module that holds sign-in, the session, the scope rule, the audit log, the shared checks and the test support. The word also means the whole product. | The hosting platform (DigitalOcean) and the platform of providers. | `modules/platform/` |
| **Playbook** | A written procedure for the human work: vetting providers, judging unusual cases and settling disputes. None exists. | The test documents' regression pack. | BR-OPS-05 in [BRD](brd/BRD.md) |
| **pnpm** | The package manager. `pnpm-workspace.yaml` sets a rule that holds back a package released in the last seven days. | npm, which the repository does not use. | `pnpm-workspace.yaml`; [development guide](DEVELOPMENT.md) |
| **Pool** | The companies that have a requirement for the same idea in the same cluster and have not withdrawn it. Companies are counted, not requirements. | A pool of money or a shared purchase: nothing is bought together yet. | `modules/procure/src/pool.ts`; RULE-27 in [FSD](fsd/FSD.md) |
| **Prerequisite** | A condition on an idea: an answer the owner gave, or another idea whose gap must be closed first. It sets the idea's readiness. | A prerequisite of a milestone, which the platform does not model. | `modules/diagnose/src/library.ts`; RULE-19 in [FSD](fsd/FSD.md) |
| **Principal or agent** | Two possible positions of the platform towards an owner: the single counterparty with back-to-back contracts to providers, or an agent who only introduces. It is undecided. | An agent in AGENTS.md, which is a program or a person that works on the repository. | OQ-12 in [open questions](open-questions.md); BR-GOV-09 in [BRD](brd/BRD.md) |
| **Priority** | Must, Should or Could, given to each business requirement. Every priority is a proposal until the sponsor ranks them. | Priority in a ranking of ideas, which is the score. | [BRD](brd/BRD.md), section 1.2; OQ-16 in [open questions](open-questions.md) |
| **PROC** | The area code for requirements of the Procure stage, BR-PROC-nn. | Procurement in the purchasing sense. | [BRD](brd/BRD.md), section 7.5 |
| **Procure** | Stage 3 of the journey: an accepted idea becomes a standard requirement in a cluster, pools count companies, the operator keeps a registry with one flat fee, and the owner sees the listed providers. The owner pages call this step Choose, on the page What you need. | Buying: the platform records requests and contacts no provider. | `modules/procure/`; `modules/journey/src/progress.ts`; BR-PROC-01 to BR-PROC-06 in [BRD](brd/BRD.md) |
| **Program** | Any client that sends JSON and is not a form on a page. | A computer program in general. | [FSD](fsd/FSD.md), section 1.3 |
| **Progress strip** | The strip of five one-word steps on the owner pages: Describe, Decide, Choose, Deliver and Measure. The pages keep their own names so that a strip link never answers to a page link's name. | The journey, which is the five stages themselves. | `modules/journey/src/progress.ts` |
| **Proposed** | A Basis for a requirement: the BRD author's proposal for the sponsor to confirm or strike. | P-nn, a proposal in the decision register. | [BRD](brd/BRD.md), section 1.2 |
| **Protected path** | A kind of code that needs a named human reviewer: authentication and identity, anything that decides which company's data a person can read, migrations, anything that moves or records money, and the rule-library publishing path. | A file path in a URL. | [AGENTS.md](../AGENTS.md); BR-NFR-14 in [BRD](brd/BRD.md); OQ-08 in [open questions](open-questions.md) |
| **Provider** | A vendor, integrator or consultant that serves an idea in a cluster. Today it is a registry entry the operator keeps, and providers do not sign in or see anything. | A provider in a cloud sense (Cloudflare, DigitalOcean). | `modules/procure/`; OQ-19 in [open questions](open-questions.md) |
| **Provider registry** | The operator's list of providers: a name of up to 100 characters, a summary of up to 300 and one to 20 services, each an idea in a cluster. The platform builds no product listed in it. | A certification: a listed provider has not been vetted. | `modules/procure/src/db/providers.ts`; RULE-30 in [FSD](fsd/FSD.md); C-02 in [decisions](decisions.md) |
| **Pull request** | A branch proposed for merging into `main`. Agents open it as a draft, and the sponsor decides when it merges. | A merge: a pull request can be merged with no person reading it, which HANDOVER.md records. | [AGENTS.md](../AGENTS.md); [HANDOVER.md](../HANDOVER.md) |

## Q

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Questionnaire** | The 25 questions of Describe, in five sections, versioned in the repository. | The study's questionnaire and the owner interview. | `modules/factory/src/questionnaire.ts`; AD-18 in [HLD](design/HLD.md) |

## R

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **Ranked idea** | An idea that addresses at least one problem the owner named and whose gap is not known to be absent. It is scored and listed from the highest score, at most 8. | Left out (idea), which is not ranked. | `modules/diagnose/src/engine.ts`; RULE-17 and RULE-21 in [FSD](fsd/FSD.md) |
| **Rate limit** | A cap on how often something may be done. The application has none on sign-in, and the hosting layer has none. | The 256 KiB cap on a request body, which limits size and not frequency. | [findings register](FINDINGS.md); [security and privacy](design/SECURITY-AND-PRIVACY.md) |
| **Readiness (of an idea)** | Worked out from the idea's prerequisites as `ready`, `check` or `needs first`. It is not the owner's own answer to the readiness question, which is shown and not scored. | Affordability, which is about money. | `modules/diagnose/src/engine.ts`; RULE-19 in [FSD](fsd/FSD.md) |
| **Receipt** | Not something the platform produces. The deliver status page lists "receipt" among what is not built, with payment, escrow, invoice, refund and tax. | payment_recorded (the owner's own note of an amount) and an audit event. | `modules/deliver/STATUS.md` |
| **Requirement (in the product)** | One per company, assessment and idea: an idea the owner accepted, asked for in a cluster. It may be withdrawn once. | A business requirement (a BR statement in the BRD). | `modules/procure/`; RULE-25 and RULE-26 in [FSD](fsd/FSD.md) |
| **Review (of code)** | Agent review: a separate agent reads a slice and reports defects, recorded in `VALIDATION.md`. Human review is a person reading protected-path code, which has not happened. | Review (outcome), the owner's check-up of a result. | [HANDOVER.md](../HANDOVER.md); `modules/<name>/VALIDATION.md`; OQ-08 in [open questions](open-questions.md) |
| **Review (outcome)** | One of three reviews numbered 1 to 3, due 30, 90 and 180 days after the first accepted milestone. Each holds a number, whether the work did what was expected, and whether it is still in use. | Review (of code). | `modules/run/src/state.ts`; RULE-41 in [FSD](fsd/FSD.md); BR-RUN-02 in [BRD](brd/BRD.md) |
| **Revision** | A saved version of the factory description, a row of `factory_revisions`. Every save is a new revision, and a stale save is refused. | A revision of a document. | `modules/factory/src/db/revisions.ts`; RULE-14 in [FSD](fsd/FSD.md); AD-16 in [HLD](design/HLD.md) |
| **RK-nn** | A risk in the BRD, with its likelihood and effect. | TR-nn, a technical risk in the HLD. | [BRD](brd/BRD.md), section 9 |
| **Role** | `owner` or `operator` in the seeds. Any other value on a person with a company is read-only, and the column is free text with no check. | A job title or a stage. | `modules/platform/src/identity/scope.ts`; [data dictionary](design/DATA-DICTIONARY.md), section 5.6 |
| **RP-nn** | An entry of the regression pack: what the guarded full run, the baseline or a layer does. | RULE-NN, a business rule. | [regression pack](test/REGRESSION-PACK.md) |
| **Rule (as a Basis)** | A Basis for a requirement: a rule in AGENTS.md. | RULE-NN (a business rule in the FSD) and the scope rule. | [BRD](brd/BRD.md), section 1.2; [AGENTS.md](../AGENTS.md) |
| **RULE-NN** | A business rule in the FSD. Numbers are never reused. | The Rule Basis in the BRD, and the scope rule, which is one rule among them. | [FSD](fsd/FSD.md), section 1.3 |
| **RUN** | The area code for requirements of the Run stage, BR-RUN-nn. | The runbook, which is about hosting. | [BRD](brd/BRD.md), section 7.7 |
| **Run** | Stage 5 of the journey: record the starting number, then reviews at 30, 90 and 180 days, see the change since the baseline, and be offered the next accepted idea. The owner pages call this step Measure, on the page Results. | Running the application, which the runbook covers. | `modules/run/`; `modules/journey/src/progress.ts`; BR-RUN-01 to BR-RUN-04 in [BRD](brd/BRD.md) |

## S

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **S-numbers** | The ids S1 to S4 of the study's documents in the source register, each with a SHA-256 checksum. The files themselves are not stored in the repository. | SC-nn, a test scenario. | [sources](sources.md) |
| **Saha** | The earlier project whose stack, test layers and lessons this platform copies. Saha's hosting-platform layer is not reused. | Any current product: it is a source of lessons. | D-04 and D-06 in [decisions](decisions.md); [Saha lessons](saha-lessons.md) |
| **SameSite** | A cookie attribute. The session cookie is `SameSite=Lax`, the first defence against cross-site requests, and the Origin check is the second. | The Origin check itself, and a same-origin policy. | `modules/platform/src/identity/session.ts`; AD-13 in [HLD](design/HLD.md) |
| **SC-nn** | A test scenario: a journey of several steps that the test documents list with the layer that runs it. | SCR-NN (a screen) and TC-AREA-NN (a single test case). | [test scenarios](test/TEST-SCENARIOS.md) |
| **Scope rule** | A person reads only their own company's records: `canReadCompany` and `canWriteOwnCompany`. Another company's id answers 404 exactly as a missing one does, and neither owner authority nor the operator role overrides it. | A rule about the scope of a project. | `modules/platform/src/identity/scope.ts`; `modules/platform/src/api/authorize.ts`; BR-ID-03, RULE-03 in [FSD](fsd/FSD.md); AD-07 in [HLD](design/HLD.md) |
| **SCR-NN** | A screen of the application in the FSD, with its route and the file that draws it. | A screenshot or a wireframe: a wireframe is a design drawing. | [FSD](fsd/FSD.md), section 1.3 |
| **Security headers** | The response headers the Worker adds to every response it produces, such as frame, content-type and referrer controls and a partial Content-Security-Policy. Static assets served by the assets layer carry none of them. | The header-read rule. | `modules/platform/src/api/security-headers.ts`; `worker/index.ts`; [findings register](FINDINGS.md) |
| **Seed (SYNTHETIC seed)** | SQL in `modules/*/db/seed-synthetic.sql` that adds synthetic companies, users and one description. It is safe to run twice, and `pnpm db:local` and the launcher apply it. | Seeder (the demonstration code that signs in over HTTP). | `modules/platform/db/seed-synthetic.sql`; `scripts/local-db.mjs`; [test data](test/TEST-DATA.md) |
| **Seeder (demonstration)** | The code that signs in over HTTP as the operator and each owner and does what they would do on the pages, so every check the pages meet is met. It cannot be run twice on one database. | Seed (SQL that inserts rows directly). | `modules/demo/src/seed.ts`; AD-21 in [HLD](design/HLD.md) |
| **Session** | The signed cookie `aplyd_session`, holding the user id and an expiry. It lasts 8 hours, with no session store and no revocation. | An owner's work session, or a session of the demonstration. | `modules/platform/src/identity/session.ts`; RULE-01 in [FSD](fsd/FSD.md); AD-11 in [HLD](design/HLD.md) |
| **Session secret** | `SESSION_SECRET`, the key that signs the session. It must be at least 32 bytes and not one repeated character, and changing it ends every session. | A password: there is no password. | `modules/platform/src/env.ts` (`getSessionSecret`) |
| **Sign-off** | The owner's one-time confirmation of an assessment after deciding on every ranked idea. It stores a fingerprint and makes the assessment fixed. | The sign-off of the BRD itself, which is unsigned (BRD section 12). | `modules/diagnose/`; RULE-23 in [FSD](fsd/FSD.md); BR-DIAG-05 in [BRD](brd/BRD.md) |
| **Slice** | One reviewable piece of work published as a branch and a pull request. HANDOVER.md records slices 1 (the walking skeleton) to 9 (the demonstration), and later work is on branches named slice-10 and so on. | A part of a plan or of a delivery. | [HANDOVER.md](../HANDOVER.md); [AGENTS.md](../AGENTS.md) |
| **Smoke layer** | The test layer in which the built application runs in a local Worker and is walked over HTTP. It needs `pnpm build` first. | A smoke test in a general sense: the layer is a full pass over the built application. | [development guide](DEVELOPMENT.md); `modules/*/tests/smoke/` |
| **Source register** | `docs/sources.md`: the study's documents S1 to S4 with their SHA-256 checksums. | The security document's list of threats. | [sources](sources.md); OQ-09 in [open questions](open-questions.md) |
| **Sponsor** | APLYD's chief executive. The sponsor decides direction, sign-off and when a pull request merges. | The client of the study, and the operator. | [BRD](brd/BRD.md), section 4; [AGENTS.md](../AGENTS.md) |
| **SQLite** | The database engine underneath D1 and Miniflare. The guard triggers and the code that reads their messages are specific to it. | D1 and Miniflare, a service and a simulator that use it. | CN-01 in [HLD](design/HLD.md); `modules/platform/src/db/guards.ts` |
| **Stage** | One of the five stages of the journey. It is not the point a demonstration company has reached (requirements, provider chosen, plan agreed or running). | A deployment stage such as staging. | [thesis](thesis.md); `modules/journey/src/progress.ts`; `modules/demo/src/cast.ts` |
| **Stale save** | A save whose starting version is not the newest. It is refused with 409 `stale`, and nothing typed is lost. | A save that fails for another reason. | `modules/factory/src/api/factory.ts`; RULE-14 in [FSD](fsd/FSD.md); AD-16 in [HLD](design/HLD.md) |
| **Static layer** | The test layer that needs no server: the type check, the documentation check, the migrations check and the source rules (header rule, secrets, scope rules read from source). | A static site. | [development guide](DEVELOPMENT.md); `modules/*/tests/static/` |
| **Status code** | 401 means no one is signed in, 403 means the request is refused, 404 means not found (also the answer for another company's record), and 409 means the request conflicts with the current state (for example a stale save). | A page's refusal: a page answers 200 with a sentence and never a status code (FSD, section 2.2). | [API reference](design/API-REFERENCE.md); RULE-03 and RULE-14 in [FSD](fsd/FSD.md) |
| **Status today** | The BRD column that says how a requirement stands: Built, Partial, Not built, Open or Unverified. Built means the synthetic application does it and a test shows it, and does not mean accepted. | The status of an engagement or a milestone, which is worked out from events. | [BRD](brd/BRD.md), sections 1.2 and 1.3 |
| **STATUS.md** | A module's record of what works, what is not built and the known limits. It can be stale, and where it differs from the code, the code wins. | The status of a requirement (Status today). | `modules/<name>/STATUS.md`; BR-NFR-04 in [BRD](brd/BRD.md) |
| **Study (as a Basis)** | A Basis for a requirement: a finding in the study, with its source id. | The study itself. | [BRD](brd/BRD.md), section 1.2 |
| **Study (the AI MSME study)** | The study by the IndiaAI Mission, MeitY, NISG and Athena Infonomics on which the thesis draws, kept as sources S1 to S4. Reuse of its material is unsettled. | Study (as a Basis), a requirement that rests on a finding of the study. | [sources](sources.md); [thesis](thesis.md); OQ-09 in [open questions](open-questions.md) |
| **Suite** | A test file `modules/<module>/tests/<layer>/<name>.test.ts` run with `node --test`, or a command suite. | A test case: a suite holds many. | `scripts/test.mjs`; [development guide](DEVELOPMENT.md) |
| **Suite id** | The name of a suite in the form `<module>/<layer>/<name>`, such as `docs/unit/ids`. The test runner's `--only` option and the baseline files use it, and the layers are static, unit, integration, smoke and browser. | A test case id (TC-AREA-NN) or a scenario id (SC-nn). | `scripts/test.mjs`; `modules/docs/tests/baseline.json`; [development guide](DEVELOPMENT.md) |
| **SYNTHETIC** | The mark on every invented company, person, provider, rule and figure, shown as a banner and a tag. `is_synthetic` is 1 on companies and users, and it is the only data the platform holds today. | A simulation of a real company: nothing here comes from a real one. | `app/layout.tsx`; [test data](test/TEST-DATA.md); BR-DATA-01, BR-UX-08 and MSG-01 |
| **Synthetic environment** | A deployment where `APLYD_ENV` is local, synthetic or test, so that synthetic sign-in works and the SYNTHETIC banner shows. Nothing technical stops real data being put into one, and the only barrier is the gate. | A staging or test environment in the ordinary sense, and a production site. | `modules/platform/src/env.ts`; TH-04 in [security and privacy](design/SECURITY-AND-PRIVACY.md) |
| **Synthetic sign-in** | A sign-in with no password, in which a person chooses one of the synthetic users. It works only where `APLYD_ENV` is local, synthetic or test. | The gate's user name and password. | `modules/platform/src/api/session.ts`; `app/sign-in/page.tsx`; RULE-10 in [FSD](fsd/FSD.md); OQ-13 in [open questions](open-questions.md) |

## T

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **TC-AREA-NN** | A test case in the test cases document, traced to one business requirement. | TD-nn (test data) and SC-nn (a test scenario). | [test cases](test/TEST-CASES.md) |
| **TD-nn** | A set of test data in the test data document, such as the platform seed. | The data dictionary. | [test data](test/TEST-DATA.md) |
| **Ten-owner test** | A test with ten real MSME owners, with a worksheet and a proposed bar, which the thesis calls for before the design is trusted. It has not been run. | The tests of the software, which have been. | `docs/ten-owner-test.md`; OQ-02 in [open questions](open-questions.md); [findings register](FINDINGS.md) |
| **TH-nn** | A threat in the security and privacy document, with its type, what it attacks, what holds it and its status. | A test-case id or a thesis section. | [security and privacy](design/SECURITY-AND-PRIVACY.md), section 6 |
| **Thesis** | The file `docs/thesis.md`, version 2: the marketplace++ direction, its five stages and the ten-owner test. | Thesis (as a Basis), a requirement that rests on a statement of the thesis. | [thesis](thesis.md) |
| **Thesis (as a Basis)** | A Basis for a requirement: a statement in the thesis. | The thesis itself. | [BRD](brd/BRD.md), section 1.2 |
| **TO BE** | The label for what the BRD requires or a document proposes and the code does not do. | AS BUILT, and PARTIAL. | [FSD](fsd/FSD.md), section 1.3 |
| **TQ-nn** | A technical question in the HLD that the register of open questions does not yet ask. | OQ-nn, a question for the sponsor. | [HLD](design/HLD.md), section 11.3 |
| **TR-nn** | A technical risk in the HLD, with where it is described and what would catch it. | RK-nn (a risk in the BRD) and TH-nn (a threat). | [HLD](design/HLD.md), section 11.2 |
| **Tripwire** | A test that fails loudly when a rule is broken in an obvious way but does not prove the rule holds everywhere. The header-read rule and the money-column test are examples. | A proof of the rule. | `modules/platform/tests/static/source-rules.test.ts`; `modules/procure/tests/static/rules.test.ts` |

## U

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **UAT plan** | The plan for how a person, and not a test, decides that a business requirement is met. Everything in it is TO BE: the repository has no acceptance procedure, register or named reviewer. | An acceptance test (the owner's check of a milestone). | [UAT plan](test/UAT-PLAN.md) |
| **UC-AREA-NN** | A use case in the FSD, with its actors and steps. | A test scenario (SC-nn) and a function (FR-AREA-NN). | [FSD](fsd/FSD.md), section 1.3 |
| **Unit tests** | The test layer for pure functions with no database, in the files under `modules/*/tests/unit/`. | An integration test, which runs request handlers against a real database. | [development guide](DEVELOPMENT.md); `modules/*/tests/unit/` |
| **Unverified** | A Status today: something exists but nobody has measured it (a browser, a standard, a speed). | Not built, and Partial. | [BRD](brd/BRD.md), section 1.2 |
| **Uses AI** | One of the two tags on an idea in the library, "Uses AI" or "No AI needed", set from the idea's `kind` (`ai` or `non_ai`). The engine gives an idea no score for either. | A claim that an idea works, or that a model is used: the engine is rules, not a model. | `app/diagnose/page.tsx`; `modules/diagnose/src/library.ts` (`kind`); RULE-17 in [FSD](fsd/FSD.md) |
| **UX** | The area code for user-experience requirements, BR-UX-nn, including plain words and the SYNTHETIC banner. | The wireframes, which are a design drawing. | [BRD](brd/BRD.md), section 7.9 |

## V

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **VALIDATION.md** | A module's record of dated results, reviews and what the results do not show. It can be stale, and where it differs from the code, the code wins. | A validation by a person: no person has read the modules' code. | `modules/<name>/VALIDATION.md`; BR-NFR-04 in [BRD](brd/BRD.md) |
| **Vendor neutrality** | The rule that APLYD's earnings never vary with which vendor a customer chooses (D-03). No ranking, ordering or display depends on a fee, and tests check it in the source and through the pages. | A claim that no vendor is favoured by any other means: listing is not vetting. | `modules/procure/tests/static/rules.test.ts`; D-03 in [decisions](decisions.md); BR-GOV-02 in [BRD](brd/BRD.md) |
| **Vetting** | The operator's application of published criteria before a provider is listed. The criteria must not depend on the fee, and it is not built. | Listing, which is only making a provider visible. | BR-PROC-09 and BR-OPS-04 in [BRD](brd/BRD.md) |
| **vinext** | The build and server layer between Next.js and the Worker that the platform runs on (D-06). It is version 1.0.0-beta.5, which is a beta. | Next.js itself. | `package.json`; `worker/index.ts`; [HLD](design/HLD.md), section 11.1 |

## W

| Term | Meaning | Do not confuse with | Where defined or enforced |
| --- | --- | --- | --- |
| **W-nn** | A numbered state of the owner's home page in the wireframes: what the strip and the one button show. | SCR-NN, which names the screens of the application. | [wireframes](design/WIREFRAMES.md) |
| **Walking skeleton** | Slice 1: synthetic sign-in, one company record, the scope rule, an audit log and the test pipeline. | The demonstration (slice 9) and the later pages. | `modules/platform/STATUS.md`; [HANDOVER.md](../HANDOVER.md) |
| **WCAG** | The accessibility standard the BRD names for owner pages: level AA of version 2.1. It is Unverified, because nothing measures it. | A statement that the pages are accessible. | BR-UX-09 in [BRD](brd/BRD.md); TC-UX-27 in [test cases](test/TEST-CASES.md) |
| **Wireframes** | The design document that draws the owner pages as captured, proposes a redesign and a plain-wording map, and has an HTML version. It is a design and has not been tested with owners. | The application's screens, which the FSD lists as SCR-NN. | [wireframes](design/WIREFRAMES.md) |
| **Withdraw** | An owner may withdraw a requirement once: it stays on record, leaves its pool, and cannot be asked for again or be given a provider. | Delete: nothing is deleted. | `modules/procure/`; RULE-26 in [FSD](fsd/FSD.md); OQ-15 in [open questions](open-questions.md) |
| **Worker** | A Cloudflare Worker: the unit the application is built as. Its entry adds the security headers to every response the application produces. | A worker process: the runtime has no background work or queue (CN-02). | `worker/index.ts`; [HLD](design/HLD.md) |
| **workerd** | The open-source runtime that Workers run on. The launcher runs the Worker in it through Miniflare. | Miniflare, the simulator that starts it. | `scripts/serve.mjs` |
| **Wrangler** | Cloudflare's command-line tool (4.92.0 in `package.json`). `pnpm db:local` uses it to apply the local database. | Miniflare, which the tests use instead. | `package.json`; `scripts/local-db.mjs` |
