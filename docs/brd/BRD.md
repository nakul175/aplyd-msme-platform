# Business Requirements Document: APLYD MSME platform

Version 0.1, draft for the sponsor's review. 5 October 2026. Application baseline: `main` plus slices 8 and 9 (pull requests #10 and #11).

This is the first business requirements document for the platform. The earlier PRD (v0.2, 12 September 2026) could not be recovered and was not used (D-01). Nobody has signed this document, and no requirement in it has been accepted by a person.

## 1. How to read this document

### 1.1 Who wrote it and what that means

- [Certain] Claude wrote this on 5 October 2026 from four places: the product thesis ([thesis.md](../thesis.md)), the decisions and open questions ([decisions.md](../decisions.md), [open-questions.md](../open-questions.md)), the status page of each module, and the code. No MSME owner, provider, advisor or APLYD staff member contributed to it.
- [Certain] The sponsor's own statement of the owner's need (thesis section 1) is one voice, spoken in character. It is a lead, not measured demand (OQ-02).
- [Likely] Priorities (Must, Should, Could) are proposals. The sponsor has not ranked these requirements. OQ-16 asks for that ranking.

### 1.2 Columns used in the requirement tables

| Column | Meaning |
| --- | --- |
| ID | `BR-<area>-<number>`. IDs are never reused. A withdrawn requirement keeps its row, marked withdrawn. |
| Priority | Must, Should or Could, by the usual meaning. A proposal unless the Basis says Decided. |
| Basis | Where the requirement comes from: **Decided** (a sponsor decision, D-xx), **Carried** (a position from the 13 September session, C-xx, not yet restated by the sponsor), **Thesis** (a statement in thesis.md), **Study** (a finding in the study, with its source ID), **Rule** (a rule in [AGENTS.md](../../AGENTS.md)), **Built** (what a slice does, with no one having asked for it as such) or **Proposed** (Claude's proposal for the sponsor to confirm or strike). |
| Acceptance criterion | What a person would check to say the requirement is met. Written so a test or a witnessed session can decide it. |
| Status today | **Built**: the synthetic application does it and a test shows it. **Partial**: some of it is built; the entry says what is missing. **Not built**: nothing does it. **Open**: it waits on a decision, not on code. **Unverified**: something exists but nobody has measured it (a browser, a standard, a speed). |

### 1.3 What "built" does and does not mean

- "Built" means the behaviour exists in the application on synthetic data and a test of the repository exercises it. It does not mean accepted.
- Every requirement's formal acceptance is **pending**. An agent wrote the code and ran the tests, and agents reviewed some of it. No person has read the code or witnessed an acceptance (see [HANDOVER.md](../../HANDOVER.md), "Merged without review").
- A passing unit or integration test does not promote an acceptance criterion to passed ([AGENTS.md](../../AGENTS.md)). The acceptance criteria here are decided by the cases in [the test documents](../test/TEST-STRATEGY.md) and, where they need people, by the [ten-owner test](../ten-owner-test.md).

## 2. Business context

### 2.1 The problem, in the owner's words

Speaking as the owner of a small manufacturing unit, the sponsor put the need this way (thesis section 1):

- I do not know how to use AI in my factory.
- I do not know how to carry out a gap assessment.
- I do not know how to integrate and deploy, or how to procure.
- Economies of scale do not work for me when I buy, because I am small.
- There are many places where AI, or technology in general, could help me.
- I wish I had a strategy consulting team, a technology consulting team, a technology team that could do everything, and an operations team.

### 2.2 What the study says about the same need

- [Certain] Adoption stalls less from lack of interest than from a mismatch between how AI solutions are sold and what a small firm can bear: high upfront capital, unclear ownership of data and models, recurring costs that are hard to forecast, and no financing that fits (S1, pp. 36-37).
- [Certain] Of 645 pain points recorded, 369 (57.2 percent) were judged not to be AI problems (S4, slide 4). The scope is therefore AI and technology in general (D-05).
- [Certain] The application layer has to be separable from the data layer, so a factory can change applications without losing what its data has built up (S1, p. 36).
- [Certain] The study's own procurement and financing toolkit, integration blueprint and ecosystem roadmap were still ahead on 30 September (S4, slide 43). The study has not produced the answers this platform depends on.

### 2.3 The product, in one paragraph

The platform is a marketplace++ owned by APLYD (D-02, D-05): one journey that takes a small manufacturer through five stages. **Describe** the factory. **Diagnose** it, with a ranked list of things to do, AI and not. **Procure** what the owner chose, pooled with similar owners where that lowers the price. **Deploy** it with a named provider against milestones the owner accepts. **Run** it, with reviews of whether it did what was expected. A plain marketplace covers Procure only; the other four stages are the strategy, technology, delivery and operations teams the owner asked for (thesis section 3).

### 2.4 Where the product stands against that paragraph

| Stage | What the thesis promises | What the application does today | The distance |
| --- | --- | --- | --- |
| Describe | Voice, photos and a few questions, in the owner's own language | A typed English questionnaire of 25 questions; every save is a version | Voice, photos, language and AI structuring are not built (BR-DESC-04 to 07) |
| Diagnose | A gap assessment and ranked AI and non-AI opportunities with benefit, total cost, prerequisites, risk; AI drafts, a person checks | A rules-based ranking of 17 SYNTHETIC library entries; the owner decides on each and signs off | No real content (OQ-03, OQ-04, OQ-09), no second person who checks (OQ-08), no distinct gap view |
| Procure | A standard requirement, pooled, offers compared on total cost and financing, standard contract terms | A requirement, a pool counted by companies with a floor of five, an operator's provider list in name order | Nothing is pooled into a joint request; no offers, no price comparison, no contract terms |
| Deploy | A named integrator, milestones, acceptance tests, payment tied to acceptance, platform arbitrates | The owner picks a listed provider, writes milestones with a test and a price, and records delivery, acceptance and payments | The provider takes no part (does not sign in); no money moves; no dispute route |
| Run | Support, monitoring, review points where a person re-checks, outcome tracking, the next item | A baseline and three reviews at 30, 90 and 180 days, typed by the owner, and a link to the next idea | Nothing is measured by the platform; no reminder; no person re-checks |
| Whole journey | One platform the owner can follow | Five stage pages. For an owner the home page opens with the next step and a button to it, then lists the five steps with where each stands, and each stage page shows the same five steps above its title. Written in slice 10 and not tried with an owner | Nobody has tried it with an owner (BR-UX-01 to 03). No step is named on the sign-in, operator and demonstration pages. The platform's own terms (assessment, requirement, engagement, milestone) are still on the pages. No page has been viewed at phone width and no accessibility audit has been run (BR-UX-05, 09) |

[Certain] This table is derived from the status pages of the modules ([factory](../../modules/factory/STATUS.md), [diagnose](../../modules/diagnose/STATUS.md), [procure](../../modules/procure/STATUS.md), [deliver](../../modules/deliver/STATUS.md), [run](../../modules/run/STATUS.md)) and the pages in `app/`.

## 3. Business objectives and how each would be measured

None of the targets below is a finding. They are the proposed bars in the [ten-owner test worksheet](../ten-owner-test.md), written before any owner has been met, for the sponsor to change. Every number is a [Guessing].

| ID | Objective | Measure | Proposed bar | Measured by |
| --- | --- | --- | --- | --- |
| BO-01 | An owner who does not know what to do gets a plan they understand and act on | Owners who act on the plan within 90 days | At least 4 of 10 | Ten-owner test |
| BO-02 | The plan is worth paying for | Owners who would pay, at more than the cost of serving one | At least 3 of 10 | Ten-owner test; OQ-06 |
| BO-03 | The ranked ideas match what a person would advise | Agreement of the top three ideas between a person's plan and the engine's order | At least 6 of 10 | Ten-owner test |
| BO-04 | Pooling lowers what a small buyer pays | Price gap, pooled against the sum of buying alone, two providers, one requirement | At least 10 percent | Pooling test |
| BO-05 | The platform's earnings do not depend on which vendor is chosen (D-03) | Tests that fail if any revenue path depends on the provider chosen; a revenue model chosen from lines that satisfy D-03 | All such tests pass; OQ-11 settled | Test suite; sponsor decision |
| BO-06 | One company's data is never visible to another company or to the operator | Cross-company read probes | None succeeds | Test suite; independent review |
| BO-07 | The platform makes APLYD more than a services organisation (D-02) | A recurring line of income not tied to hours | To be set by the sponsor | Sponsor |

## 4. Stakeholders and users

| Who | What they want from the platform | What they can do today |
| --- | --- | --- |
| MSME owner (the user) | The five stages in one place, in plain words and their own language | Sign in with a synthetic identity; describe, diagnose, ask for ideas, choose a provider, plan, record deliveries and reviews; all in English, on separate pages |
| Person in the owner's company who is not the owner | To see what the owner sees | Can read through the programming interface; the pages say "not linked to a company" or "This page is for the owner" |
| Platform operator (APLYD staff) | To keep the provider list and the one fee, and to see pooled demand | Add and list providers, set the fee, see pools of five or more companies as counts. Cannot read any company's record |
| Provider (vendor, integrator, consultant) | To be found by owners with a real requirement and to be paid for delivery | Nothing. Providers do not sign in (OQ-13) |
| Advisor or checker (a person who checks the AI's draft) | To review a plan before the owner relies on it | Nothing. The role does not exist (OQ-08, OQ-18) |
| Cluster or association body | To bring owners together and carry trust | Nothing. A cluster is a text label |
| The study's client and authors (IndiaAI Mission, MeitY, NISG, Athena Infonomics) | That a commercial platform built on the study is disclosed and agreed | Not informed (OQ-09) |
| The sponsor (APLYD's CEO) | Direction, decisions and sign-off | Merges, and reads the status pages |

## 5. Scope

### 5.1 In scope

- The five-stage journey for a small manufacturer, for AI and for technology in general (D-05).
- A provider registry kept by the operator, one flat listing fee (D-03), and demand pooling with a floor of five companies (C-04).
- The owner's own record of a plan, deliveries, acceptances, payments and reviews.
- A hosted synthetic demonstration, behind an access gate, with a presenter's script.

### 5.2 Out of scope

- Certifying a factory or a product (C-01). Building products that appear in a registry the platform runs (C-02). Selling company data (C-03).
- Holding, moving or escrowing money. [Likely] Whether the platform ever does so is part of whether it is principal or agent (OQ-12); the September escrow idea was dropped ([decisions.md](../decisions.md), "Dropped").
- Any real company, person, provider, rule or figure, until the data position is settled (OQ-07, OQ-09). Everything in the application is SYNTHETIC.
- A percentage commission on deals, which on a plain reading D-03 rules out (OQ-11).

### 5.3 Phasing proposed

[Likely] Start with stages 1 and 2 for one sector in one cluster, run stages 3 to 5 by hand behind them, and test with ten owners before building pooling software (P-01, thesis section 6). This is a proposal the sponsor has not accepted. The application was built ahead of it, at the sponsor's request, on 4 October 2026 (see [HANDOVER.md](../../HANDOVER.md)).

## 6. Business rules and constraints

| Rule | Statement | Source |
| --- | --- | --- |
| Ownership | The platform belongs to APLYD, not to the study's client or the Mission | D-02 |
| Vendor neutrality | APLYD's earnings never vary with which vendor a customer chooses | D-03 |
| Stack | Next.js on vinext, Cloudflare Workers, D1 and Drizzle, pnpm, Node 22; Cloudflare for synthetic data only; hosting of real data open | D-06, OQ-07 |
| No certification | APLYD does not certify a factory or product | C-01 |
| No own products in the registry | APLYD does not build AI products listed in a registry it runs | C-02 |
| No data sale | APLYD does not sell company data | C-03 |
| Floor of five | No aggregate figure is published from fewer than five companies | C-04 |
| Study contacts | Factories introduced through a client engagement are not approached commercially; the origin of every contact is logged from first touch | C-05 |
| Server-side authority | Authorisation lives on the server; identity comes only from the trusted provider; the operator's role does not override a company's scope | [AGENTS.md](../../AGENTS.md) |
| Append-only | Confirmed records, revisions, audit entries and applied migrations are never edited or deleted; corrections append | [AGENTS.md](../../AGENTS.md) |
| Synthetic data | Synthetic data only, marked SYNTHETIC, until OQ-09 and a data agreement | [AGENTS.md](../../AGENTS.md) |
| Sourced claims | Every figure, requirement or rule in the interface or a document names a source in [sources.md](../sources.md) or says it is an assumption | [AGENTS.md](../../AGENTS.md) |

## 7. Business requirements

Each area opens with a line on how far it has got. Evidence for a Built or Partial status is in the module's `STATUS.md` and `VALIDATION.md`; the cases that would decide acceptance are in [the traceability matrix](../test/TRACEABILITY.md).

### 7.1 Governance and constraints (GOV)

Mostly constraints that must hold in every stage. The code enforces vendor neutrality and the floor of five where it has code to enforce them; the rest are decisions and commitments with no code behind them.

| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |
| --- | --- | --- | --- | --- | --- |
| BR-GOV-01 | **APLYD owns the platform.** The product, its repository and its data belong to APLYD, not to the study's client or the Mission. | Must | Decided D-02 | The repository sits in an APLYD-controlled organisation, and a written statement of ownership is signed by the sponsor. | Open. The repository is under a personal account (OQ-01) |
| BR-GOV-02 | **Vendor-neutral earnings.** No amount APLYD earns varies with which vendor, consultant or product an owner picks. No ranking, ordering or display depends on a fee. | Must | Decided D-03 | Every code path that computes or records revenue has a test that fails if the amount depends on the chosen provider; providers are ordered by name alone; no owner page shows a fee. | Built for the code that exists (the listing fee, the engagement record). No revenue model exists yet (BR-COM-01) |
| BR-GOV-03 | **No certification.** The platform does not certify, rate or approve a factory or a product. | Must | Carried C-01 | No page, interface or record issues a certificate, rating or approval; a test scans the interface for such terms. | Partial. Nothing issues one; no dedicated test |
| BR-GOV-04 | **No own products in the registry.** APLYD does not build AI products that appear in a registry it runs. | Must | Carried C-02 | The provider registry holds no entry owned or built by APLYD, and an operator control refuses to list one. | Not built. No code or test; today it is true by absence |
| BR-GOV-05 | **No data sale.** The platform does not sell company data and gives none to a provider without the owner's consent (BR-DATA-06). | Must | Carried C-03 | No interface exports a company's data to anyone but its owner; a test fails if a provider-facing read of a company's record exists. | Partial. True by absence; no test |
| BR-GOV-06 | **Floor of five.** No aggregate figure is published from fewer than five companies. | Must | Carried C-04 | A pool of fewer than five companies is shown to nobody, and the operator's list holds only pools of five or more, as counts; a company counts once. | Built for pools (the cautious reading, OQ-14). No other aggregate exists |
| BR-GOV-07 | **Origin of every contact.** The origin of every contact is logged from first touch, and factories introduced through the study are not approached commercially. | Must | Carried C-05 | A contact record carries its origin and date from creation; a contact with no origin cannot be saved; no outreach is possible to a study-introduced contact. | Not built. The ten-owner worksheet logs origin by hand |
| BR-GOV-08 | **Right to reuse the study's material.** Study material (pain points, solution mappings, scoring) enters the product only after the right to reuse it, with disclosure to the client and MeitY, is settled. | Must | Study S4 cover; Thesis section 5 | A written position from the client and counsel is on file before any study-derived content is loaded; the library names its sources. | Open (OQ-09). The library is SYNTHETIC |
| BR-GOV-09 | **Accountability position.** The platform's position towards the owner (single counterparty, or introducer) is decided and reflected in the contract terms before any real engagement. | Must | Thesis section 5 | A decision is recorded and the standard contract terms (BR-PROC-08) state it. | Open (OQ-12) |
| BR-GOV-10 | **Custodian of rule content.** Any rule or compliance content shown to a user carries the official document, the date read and a named custodian. | Must | Rule | Every such item shows the three; an item without them cannot be published. | Open (OQ-04). All content is SYNTHETIC |

### 7.2 Identity, access and audit (ID)

The scope rule and the audit log are built and well tested on synthetic users. Real sign-in, the second person and the provider are not built.

| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |
| --- | --- | --- | --- | --- | --- |
| BR-ID-01 | **Sign in as a named person with a role.** A person signs in and is an owner, a member of a company, or the operator. | Must | Built | Sign-in sets a signed cookie holding only the user and an expiry; role and company are read from the database on every request. | Partial. Synthetic sign-in with no password (OQ-13) |
| BR-ID-02 | **Real owners can sign in safely.** Owners prove who they are by a method that suits them (a mobile number with a one-time code, an email link, or an access layer). | Must | Proposed | The method is chosen (OQ-13), a real owner signs in with it, and an attempt as another person fails. | Not built. Open (OQ-13) |
| BR-ID-03 | **One company never sees another.** An owner reads and writes only their own company's records. A request for another company's record answers exactly as a missing record does. | Must | Rule | Cross-company probes on every endpoint return 404 identical to a missing record and are audited. | Built, with tests in every module |
| BR-ID-04 | **The operator does not override scope.** The operator is a role with no company and reads no company's record. | Must | Rule | The operator gets 404 on every company endpoint; operator endpoints refuse an owner, an operator with a company, and a visitor. | Built |
| BR-ID-05 | **Members read, owners write.** A person in a company who is not its owner may read and may not change. | Should | Built | A member gets 403 on every change and succeeds on a read through the interface. | Partial. The pages say "This page is for the owner" instead of showing the member the record |
| BR-ID-06 | **An audit trail that cannot be rewritten.** Every write, and every refused attempt once the person is known, is recorded in an append-only log. | Must | Rule | The log refuses update, delete and replace; a missing guard shows as degraded in the health check. | Built. No hash chain: tampering with the database itself would not be seen |
| BR-ID-07 | **Session control.** A session can be ended everywhere, and sign-in attempts are limited. | Should | Proposed | Revoking a user ends their sessions; repeated failed attempts are refused for a period. | Not built |
| BR-ID-08 | **A second person who checks.** With the owner's permission, a named advisor can read a company's record and plan to check what the software drafted. | Should | Thesis section 3 | The owner grants and revokes access; the advisor reads only that company; each read is audited; the grant expires. | Not built. A data-scope change (OQ-08, OQ-18) |
| BR-ID-09 | **Providers take part.** A provider signs in and sees only the requirements and plans addressed to it. | Should | Thesis section 3 | A provider reads nothing about any company that has not chosen it or asked it for an offer. | Not built (OQ-13, OQ-19) |

### 7.3 Describe (DESC)

A typed questionnaire exists. Everything the thesis says makes Describe easy for an owner (voice, photo, own language, AI structuring) is missing; it is where the slice is most likely wrong about how owners describe a factory ([factory status](../../modules/factory/STATUS.md), "Not built").

| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |
| --- | --- | --- | --- | --- | --- |
| BR-DESC-01 | **Answer a structured description.** The owner answers questions about the unit (sector, products, size, processes, systems in use, problems, budget, readiness) and saves them. | Must | Thesis stage 1 | An owner opens the page, fills the 25 questions, saves, and sees the saved version. | Built (25 questions, English). The options are assumptions (OQ-03) |
| BR-DESC-02 | **Every save is a version.** Nothing is edited or deleted; earlier versions open read-only. | Must | Rule | A save adds a version; an update or delete of a version is refused by the database. | Built |
| BR-DESC-03 | **Draft, then confirm.** A draft needs one answer; confirming needs sector, products, employees, processes and problems; a stale save is refused and nothing typed is lost. | Must | Built | A confirm without the five answers is saved as a draft and the page names what is missing; two saves from the same version cannot both succeed. | Partial. A stale save is refused and nothing is overwritten (409 for a program, `stale=1` for the form), but what the person typed is not kept: the page opens on the newest version and asks them to make the changes again (`app/factory/page.tsx`; the redirect in `modules/factory/src/api/factory.ts`; FND-268 in the findings register). A confirm without the five answers is saved as a draft, so those answers are kept |
| BR-DESC-04 | **Describe by voice.** The owner can speak the description. | Must | Thesis stage 1 | An owner speaks in a supported language, reviews what was heard, and saves it as the answer. | Not built |
| BR-DESC-05 | **Describe with photos.** The owner can attach photographs of the factory floor, products or paperwork. | Should | Thesis stage 1 | A photo attaches to a version and is shown with it; only that company can read it. | Not built |
| BR-DESC-06 | **In the owner's own language.** The description can be given in an Indian language the owner chooses. | Must | Thesis stage 1 | An owner completes Describe in a chosen language without help. Which languages: OQ-17. | Not built |
| BR-DESC-07 | **AI structures what was said.** Free text, speech and photos are turned into structured answers that the owner confirms. | Should | Thesis stage 1 | The owner sees every machine-filled answer, can change it, and nothing is saved as confirmed until they confirm. | Not built. Nothing calls a model |
| BR-DESC-08 | **Questions come from owners.** The questionnaire's questions and options are tested with real owners before the first sector is fixed. | Should | Proposed | The ten-owner test records which questions owners did not follow or wanted added; changes are a new questionnaire version. | Partial. Versioned; never tested with an owner |
| BR-DESC-09 | **Assisted entry.** A person from APLYD can complete the description with the owner on a visit, recorded as assisted. | Could | Proposed | The version records who entered it and that the owner confirmed it. | Not built. The ten-owner test does this by hand |

### 7.4 Diagnose (DIAG)

A deterministic, rules-based assessment works end to end on a SYNTHETIC library. The content is not real, nobody but the owner checks it, and there is no separate gap view.

| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |
| --- | --- | --- | --- | --- | --- |
| BR-DIAG-01 | **A ranked list of ideas from the confirmed description.** The platform ranks what the owner could do about the problems they named, AI and not. | Must | Thesis stage 2 | An owner makes an assessment from a confirmed version and sees up to eight ranked ideas and the ideas left out with the answer that excluded them. | Built (rules, not a model; 17 SYNTHETIC entries) |
| BR-DIAG-02 | **Each idea shows what the owner needs to judge it.** Whether it is AI, why it is there, the benefit range and its measure, one-time, yearly and hidden cost, prerequisites, risk and the source. | Must | Thesis stage 2 | Every idea carries all of these or says it is an assumption. | Partial. "What to do first" stands in for prerequisites; no figure has a source |
| BR-DIAG-03 | **Non-AI ideas count equally.** The ranking has no term for AI. | Must | Study S4 slide 4 | A test turns every idea's kind around and no score or position moves. | Built |
| BR-DIAG-04 | **Reproducible.** The same description, library and engine give the same assessment, and a stored assessment never changes when the library does. | Must | Built | Asking again returns the one already there (200); the assessment keeps a copy of every library fact it used. | Built |
| BR-DIAG-05 | **The owner decides on each idea and signs off.** Accept, later or no, with a note; the sign-off needs a decision on every idea and carries a fingerprint. | Must | Thesis stage 2 | A sign-off with an undecided idea is refused; a second sign-off is refused; the fingerprint is recomputed on every read. | Built. The fingerprint does not cover who decided or when |
| BR-DIAG-06 | **A person checks the draft.** Someone other than the owner reviews an assessment before the owner relies on it as advice. | Must | Thesis stage 2 | The assessment records its checker and the date; an unchecked assessment is labelled so. | Not built (OQ-08, OQ-18) |
| BR-DIAG-07 | **Real, sourced content.** The library is real, each entry names its source and a named custodian maintains it. | Must | Rule; Study | Each library entry cites a source from the register or says it is an assumption, and shows the custodian. | Not built. SYNTHETIC (OQ-03, OQ-04, OQ-09) |
| BR-DIAG-08 | **A gap assessment the owner can read.** A view of where the unit stands (data, people, systems, money, quality) and what stands between it and each idea. | Should | Thesis stage 2 | An owner can read the gaps in plain words without the idea list. | Partial. Readiness feeds the score; there is no gap view |
| BR-DIAG-09 | **The ranking is explained.** The page says how ideas were ranked and what drafted them. | Should | Built | The page states the rules and "by a set of rules, not by an AI model". | Built |
| BR-DIAG-10 | **Financing options in the cost.** Total cost can be read under each financing model (purchase, subscription or pay-per-use, outcome-linked). | Should | Study S1 p. 37 | The idea shows its cost under each model, with the source. | Not built |
| BR-DIAG-11 | **Compare or redo.** After the description changes, the owner can make a new assessment and compare it with the earlier one. | Should | Proposed | A new confirmed version gives a new assessment; a side-by-side shows what moved. | Partial. New assessments work; no comparison |
| BR-DIAG-12 | **Sector content.** The library and ranking differ by sector. | Could | Study S4 (four sectors) | A textile unit and an electronics unit with the same answers elsewhere get different libraries. | Not built (OQ-03) |

### 7.5 Procure (PROC)

A requirement, a pool count and an operator's list work. Nothing acts on a pool, no price is compared, and no contract terms exist.

| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |
| --- | --- | --- | --- | --- | --- |
| BR-PROC-01 | **An accepted idea becomes a standard requirement in a cluster.** | Must | Thesis stage 3 | The owner makes one requirement per company, assessment and idea; asking again returns the one already there; the database refuses one from an unsigned assessment or an unaccepted idea. | Built. Three SYNTHETIC clusters (OQ-03) |
| BR-PROC-02 | **Pools count companies.** Open requirements of one idea in one cluster form a pool, counted by company. Below five the number is shown to nobody; from five a member sees "at least 5", "at least 10". | Must | Carried C-04 | A pool of four shows no number to its members or the operator; a company counts once; a withdrawn requirement leaves the pool. | Built (OQ-14). A closed engagement's requirement still counts |
| BR-PROC-03 | **A pool acts.** Pooled requirements become a joint request to providers, and owners in the pool are told what was asked for and by how many. | Must | Thesis stage 3 | A pool of five or more produces one request to listed providers; each member keeps their own record. | Not built. A pool is a count |
| BR-PROC-04 | **A provider registry kept by the operator.** The operator adds a provider with a name, a summary and what it serves, and lists or unlists it. | Must | Thesis stage 3 | A provider that serves nothing cannot be listed; nothing is edited or deleted; listing and unlisting alternate. | Built. The operator types every entry |
| BR-PROC-05 | **One flat listing fee.** Every provider listed under the terms in force pays the same fee, copied from the terms by the database, and no owner sees it. | Must | Decided D-03 | A caller cannot supply a fee; a new fee is a new version; no owner page contains the fee. | Built. No fee is decided (OQ-11); ₹1,500 is a placeholder |
| BR-PROC-06 | **Owners see the providers that serve their requirement.** In name order, without fee, listing time or demand. | Must | Thesis stage 3 | A provider never listed or since unlisted is shown to no owner; a query that orders providers orders by name alone. | Built |
| BR-PROC-07 | **Offers compared on total cost and financing.** An owner sees offers from vetted providers side by side on one-time, recurring and hidden cost and the financing model. | Must | Thesis stage 3; Study S1 p. 37 | Two offers for one requirement can be compared on all four and the owner chooses on that basis. | Not built. Providers do not quote |
| BR-PROC-08 | **Standard contract terms.** Data ownership, exit and separation of the application from the data are covered in terms the owner accepts. | Must | Thesis stage 3; Study S1 p. 36 | The terms are shown before a choice is made; the owner's acceptance is recorded. | Not built (OQ-12) |
| BR-PROC-09 | **Vetting.** The operator applies published criteria before listing a provider, and the criteria do not depend on the fee. | Should | Proposed | The criteria are published; a listing records which were met; a test shows the fee plays no part. | Not built |
| BR-PROC-10 | **Recover from a withdrawn or wrong requirement.** An owner who withdrew, or chose the wrong provider, can ask again. | Should | Proposed | A new requirement for the same idea can be made after a withdrawal; the engagement route is decided (OQ-15). | Not built. Permanent today (OQ-15) |
| BR-PROC-11 | **Real clusters.** Clusters are real places or associations. | Should | Study S4 (scale runs through cluster bodies) | The first cluster is named and its body has agreed to take part. | Open (OQ-03) |

### 7.6 Deploy (DEPL)

The owner's own record of a plan and its deliveries works. The provider is absent and no money moves.

| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |
| --- | --- | --- | --- | --- | --- |
| BR-DEPL-01 | **Choose a named provider.** The owner chooses one provider listed for the requirement; the choice is recorded once. | Must | Thesis stage 4 | Choosing the same provider again returns the engagement already there; a different one is refused; a provider not listed or not serving the idea in that cluster is refused. | Built |
| BR-DEPL-02 | **A milestone plan with the owner's test and price.** Up to 12 milestones, each with a name, the test the owner will check it by, a due date and a price; agreed once. | Must | Thesis stage 4 | The plan cannot be agreed with no milestone, and no milestone can be added after. | Built. The limits are assumptions |
| BR-DEPL-03 | **A fixed order of events.** Delivered, then accepted or rejected; rejected can be delivered again; accepted is paid once; nothing after the close. | Must | Thesis stage 4 | The database refuses every out-of-order event; the page offers only the forms that can work. | Built |
| BR-DEPL-04 | **Payment tied to acceptance.** A payment can be recorded only for an accepted milestone. | Must | Thesis stage 4 | A payment for a milestone not accepted is refused by the database. | Partial. The owner types a number about a payment made outside the platform; nothing compares it with the price |
| BR-DEPL-05 | **The provider takes part.** The provider sees the plan, says what it delivered and responds to a rejection. | Must | Thesis stage 4 | A provider's statement is recorded as the provider's, not as the owner's record of it. | Not built (OQ-13, OQ-19) |
| BR-DEPL-06 | **Dispute and arbitration.** When owner and provider disagree about acceptance, the platform helps settle it. | Should | Thesis stage 4 | A disputed milestone enters a defined route with a person responsible and a time limit. | Not built (OQ-12) |
| BR-DEPL-07 | **Change an agreed plan.** Milestones can be changed, extended or split by agreement, with the history kept. | Should | Proposed | A change is a new record naming both sides; the old plan stays. | Not built |
| BR-DEPL-08 | **A measurable acceptance test.** The page helps the owner write a test someone else could apply. | Should | Proposed | The owner is shown what a good test looks like; an empty or vague test is flagged, not blocked. | Not built. Any sentence passes |
| BR-DEPL-09 | **Close the engagement honestly.** An engagement is complete only if closed with every milestone accepted; otherwise it ended early. | Must | Built | The state is worked out from the events on every read and never stored. | Built |
| BR-DEPL-10 | **Money.** If the platform ever holds or moves money, it does so only under a decision on its role and with a test that the amount never varies with the vendor. | Could | Thesis stage 4 (payment tied to acceptance); D-03 | Not required now. Revisit with OQ-12. | Open (OQ-12) |

### 7.7 Run (RUN)

A baseline and three owner-typed reviews work. Nothing is measured, reminded or checked by anyone else.

| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |
| --- | --- | --- | --- | --- | --- |
| BR-RUN-01 | **A baseline before the work.** The owner records one number for the state of things before the first acceptance. | Must | Thesis stage 5 | A baseline is accepted once, only before any acceptance. | Built |
| BR-RUN-02 | **Reviews at 30, 90 and 180 days.** From the first acceptance, three reviews each hold the number, whether it did what was expected, and whether it is still in use. | Must | Thesis stage 5 | A review is offered from its day and recorded once; the database refuses one stamped before its due time. | Built. The day counts are assumptions |
| BR-RUN-03 | **The change since the baseline.** The page shows the latest review less the baseline, in the unit the assessment used, without calling it good or bad. | Must | Thesis stage 5 | The difference is shown with the unit and the expected range. | Built. The range is SYNTHETIC |
| BR-RUN-04 | **The next idea.** The owner is offered the next accepted idea that has no requirement. | Must | Thesis stage 5 | The link leads to the Procure page; a withdrawn idea is passed over. | Built |
| BR-RUN-05 | **Support and monitoring.** After deployment the owner has a route to support and the provider's system is monitored. | Should | Thesis stage 5 | A support request reaches the provider and is tracked to closure. | Not built |
| BR-RUN-06 | **A person re-checks.** At each review point a person other than the owner re-checks the result. | Should | Thesis stage 5 | The review records who checked and what they found. | Not built (OQ-18) |
| BR-RUN-07 | **Reminders.** The owner is told when a review is due. | Should | Proposed | A message reaches the owner on the day, by the channel they chose (OQ-17). | Not built |
| BR-RUN-08 | **Measured, not typed.** Outcomes are read from the source (a sheet, a machine, an app) where one exists. | Could | Thesis stage 5 | A number is shown with where it came from. | Not built |
| BR-RUN-09 | **Correct a number.** A wrong baseline or review is corrected by appending a correction with its reason. | Should | Rule | The correction is a new record that names the one it corrects; both stay visible. | Not built. A note on a later review is the only remedy |
| BR-RUN-10 | **Outcomes across companies.** Aggregate outcomes are shown only from five or more companies. | Could | Carried C-04 | An aggregate over fewer than five companies is never shown. | Not built; none exists |

### 7.8 Operator (OPS)

| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |
| --- | --- | --- | --- | --- | --- |
| BR-OPS-01 | **The operator keeps the registry and the one fee.** | Must | Built | See BR-PROC-04 and BR-PROC-05. | Built |
| BR-OPS-02 | **The operator sees pooled demand without seeing companies.** | Must | Carried C-04 | The list holds pools of five or more as counts with no company, user or requirement id. | Built |
| BR-OPS-03 | **A work queue for the people who help owners.** The operator sees which owners are stuck and where. | Should | Thesis section 4 (people do the checking) | An owner who has stopped at a stage appears in a queue that respects the scope rule, once a scoped route exists. | Not built. Needs a data-scope decision (OQ-08) |
| BR-OPS-04 | **Separation of duties.** A second person approves a provider before it is listed. | Should | Proposed | A listing needs two named people. | Not built (OQ-08) |
| BR-OPS-05 | **Playbooks for the human work.** Vetting providers, judging unusual cases and settling disputes have written playbooks. | Should | Thesis section 4 | Each playbook is published and used in the ten-owner test. | Not built |
| BR-OPS-06 | **A way to see the system's health and its audit trail.** | Should | Proposed | The operator can read the health check and search the audit log within the scope rule. | Partial. A health endpoint exists; no audit viewer |
| BR-OPS-07 | **A presenter can show the journey in about 15 minutes.** A seeded cast and a script. | Should | Built | `/demo` lists eight steps; a browser test follows them all. | Built (slice 9). Exists only with `APLYD_DEMO=true` |
| BR-OPS-08 | **A hosted synthetic demonstration behind an access gate.** | Should | Built | The launcher refuses to start without a gate or an explicit open setting; `/healthz` is open; the rest answers 401 without the gate. | Built (slice 8). Live on DigitalOcean since 5 October 2026. Not production |

### 7.9 User experience (UX)

[Certain] The sponsor's reaction to the application on 5 October 2026 was "i dont under stand the ui ux at all. what does this app dp". At that date the home page was five links and the page names (What you need, Delivery, Results) did not say what they were for. Slice 10 later added a home page with a next step, a strip of the five steps and a sentence under each page title; no owner has used it. The requirements below are Claude's proposals to fix that, from the thesis's picture of the owner. None was asked for before. They are to be tested with owners (OQ-16, OQ-17).

| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |
| --- | --- | --- | --- | --- | --- |
| BR-UX-01 | **Every page says what it is for and what to do next.** In one or two plain sentences at the top, and one clear next step. | Must | Proposed | In a session with an owner, 8 of 10 can say what the page is for and what they would do next, unaided. (The 8 of 10 is a [Guessing].) | Unverified. Built for the five owner pages in slice 10 and not tried with owners (TC-UX-01 is a manual case). Each opens with "Step N of 5", the title and one sentence of purpose (`PageHead` in `app/_ui/parts.tsx`; the sentences are the `lede` of each `page.tsx`). An owner's page ends with a "Your next step" card and one button when the next step is on another stage and needs the owner (`NextUp` and `nextStep` in `modules/journey/src/progress.ts`). The card is not drawn when the next step is on the page itself, when the work waits on someone else or when nothing is needed; those pages say where things stand in a status card instead. Missing: a named next step on the sign-in, operator and demonstration pages, and the session with owners. The signed-out and not-an-owner views have a title, a sentence and a link only |
| BR-UX-02 | **One view of the journey.** The home page shows the five stages, which are done, which is current, and one button for the next step. | Must | Proposed | An owner opening the home page can say which stage they are at and press one button to continue. | Unverified. Built in slice 10 and not tried with owners (TC-UX-02 is a manual case). For an owner the home page opens with the next step and one button, then "Your five steps": a number or tick, the words Done, Your turn or Not yet, and one line of where each stands (`Home` in `app/page.tsx`; `stageStatuses` and `stageLine` in `modules/journey/src/progress.ts`). A visitor sees the five steps described, without where they stand; a person who is not an owner sees none. The rules that choose the next step have unit tests (`modules/journey/tests/unit/progress.test.ts`); no browser test reads the home page's step or the strip. Missing: on a stage page the strip says "your turn" in text for a screen reader only, so a sighted person has only a colour for it |
| BR-UX-03 | **Plain words.** The interface avoids the platform's own terms (assessment, requirement, engagement, listing, baseline) or explains each where it first appears. | Must | Proposed | A [glossary](../GLOSSARY.md) exists and every term on a page is either plain or explained there and on the page. | Unverified. Partly built; nobody has read each page against the glossary (TC-UX-03 is a manual case). The five steps have one-word names and a sentence each (`STAGES` in `modules/journey/src/progress.ts`); the baseline is called "the starting number" on the owner pages; the [glossary](../GLOSSARY.md) lists the terms. Missing: the owner pages still say assessment, requirement, engagement and milestone, and a page does not explain each where it first appears; each step has a one-word name in the strip and a different page name (for example Decide and What to do about it), so an owner meets two names for one step; the glossary is not linked from the pages |
| BR-UX-04 | **The interface in the owner's language.** | Must | Thesis stage 1 | An owner can use every owner page in a chosen language. Which: OQ-17. | Not built. English only |
| BR-UX-05 | **Works on a phone.** The pages are usable on a small screen and a slow connection. | Should | Proposed | Each owner page is walked on a phone-sized viewport and a throttled connection with no horizontal scrolling and no unreachable control. | Unverified. Only desktop Chromium has been run, at Playwright's default window size (`newContext` in `modules/platform/tests/support/browser.ts`). Built: the page asks for the device width (`viewport` in `app/layout.tsx`) and the style sheets in `app/` change the layout at widths between 28 and 62 rem. No page has been looked at at phone width or on a slow connection, and no test measures horizontal scrolling |
| BR-UX-06 | **A refusal says what to do.** Every refusal, to a person or a form, gives a message in plain words and a way forward, never a page of JSON. | Must | Built | Every refused form post goes back to its page with a message. | Partial. An expired session on a form post now goes to the sign-in page with a message (slice 11d, `notSignedIn`); a form refused for another company's path (404), the operator (404), a request another site started (403) or a body over 64 KB (413) still shows JSON |
| BR-UX-07 | **Empty and waiting states explain themselves.** A page with nothing on it says what will appear and what causes it. | Should | Proposed | Each empty state is checked in a browser test. | Partial. Each owner page has a written empty state, and browser tests read several of them (for example "No engagement yet" in `modules/deliver/tests/browser/deliver.test.ts` and "Nothing saved yet" in `modules/factory/tests/browser/describe.test.ts`). The acceptance asks for each one to be checked: nobody has listed them all and matched each to a test, and the Diagnose page ignores an unknown `?a=` without a message |
| BR-UX-08 | **Mark what is not real.** Every synthetic page carries the SYNTHETIC banner and tag. | Must | Rule | The banner appears on every page; every figure from the library is tagged. | Built. The banner is drawn by the root layout, so every page has it when the environment is local, synthetic or test (`app/layout.tsx`, `isSyntheticEnvironment`). The browser test checks it on the home and sign-in pages only (`modules/platform/tests/browser/pages.test.ts`). The tag SYNTHETIC is set by hand on each owner page, the operator page and the home page's company card, and beside library figures such as a benefit range; no test checks that every figure has one |
| BR-UX-09 | **Accessible.** The owner pages meet WCAG 2.1 level AA. | Should | Proposed (the standard is published by the W3C) | An accessibility audit of each page shows no failure at level AA. | Unverified. Not measured. Built: `lang` on the page, a skip link, one `main`, named landmarks, a label or group legend on each field, a role on most notices, a visible focus outline and reduced motion. A unit test measures the colour pairs in the light and dark sets (4.5 to 1 for text, 3 to 1 for the edge of a control; `modules/journey/tests/unit/contrast.test.ts`). No audit has been run and no screen reader has been used |
| BR-UX-10 | **Take it away.** An owner can print or export their plan to show a family member or a bank. | Could | Proposed | A plan exports to a document with its figures and the SYNTHETIC marks. | Not built |
| BR-UX-11 | **The channel the owner uses.** The owner can use the platform by the channel they already use (a phone call, WhatsApp, the web). | Could | Proposed | The channels are chosen from what owners say (OQ-17). | Open (OQ-17) |

### 7.10 Data and privacy (DATA)

| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |
| --- | --- | --- | --- | --- | --- |
| BR-DATA-01 | **Synthetic only until the data position is settled.** | Must | Rule | No real company data in the repository, fixtures or the hosted demonstration; every synthetic record is marked. | Built |
| BR-DATA-02 | **Where real data lives is decided.** The hosting location and the obligations that apply to a pilot are decided before any real company data. | Must | Proposed | A written decision names the host, the location and the obligations, with counsel's sign-off. | Open (OQ-07). Cloudflare is for synthetic data only (D-06) |
| BR-DATA-03 | **The owner can take their data and leave.** The application is separable from the data. | Must | Study S1 p. 36 | An owner can export all of their company's records in a documented form and the platform can stop serving them. | Not built |
| BR-DATA-04 | **Records are permanent; corrections append.** | Must | Rule | Confirmed records, revisions, audit entries and applied migrations cannot be edited or deleted. | Built |
| BR-DATA-05 | **A request to erase personal data has an answer.** | Should | Proposed | A policy and a procedure exist and reconcile permanent versions with erasure. | Open. Versions are permanent by design (OQ-07) |
| BR-DATA-06 | **A provider sees only what the owner shares.** | Must | Carried C-03 | A provider reads nothing about a company that the owner has not shared with that provider; each share is recorded. | Not built. True today because providers see nothing |
| BR-DATA-07 | **Retention is defined.** | Should | Proposed | A retention period for each kind of record is written down and applied. | Not built |

### 7.11 Commercial (COM)

| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |
| --- | --- | --- | --- | --- | --- |
| BR-COM-01 | **A revenue model that satisfies D-03.** A choice from lines that do not vary with the vendor (owner subscription or flat project fee, one identical listing fee for providers, programme-funded diagnosis, association membership). | Must | Decided D-03; OQ-11 | A decision names the lines; each has a test that fails if its amount depends on the chosen vendor. | Open (OQ-06, OQ-11) |
| BR-COM-02 | **No fee is shown to an owner until one is decided.** | Must | Built | No owner page contains a fee; the placeholder is shown to the operator only. | Built |
| BR-COM-03 | **Cost to serve one owner is known.** The time and money spent on one owner's Describe and Diagnose are recorded. | Should | Thesis section 7 | The ten-owner worksheet records minutes and rupees per owner. | Not built. Needs the test |
| BR-COM-04 | **APLYD can bill for what it charges.** | Could | Proposed | Invoices exist for each decided revenue line. | Not built. Nothing is charged |

### 7.12 Non-functional requirements (NFR)

No performance, availability or capacity figure has been set by anyone, and none is invented here. Where a number is needed the requirement says it is to be set, and the sponsor sets it (OQ-16).

| ID | Requirement | Priority | Basis | Acceptance criterion | Status today |
| --- | --- | --- | --- | --- | --- |
| BR-NFR-01 | **Authority on the server.** Identity comes only from the signed session; company and role are read from the database on every request; no header a client can set is trusted. | Must | Rule | A static rule over every source file allows only the named header reads; cross-company probes fail. | Built. The rule is a tripwire, not a proof (platform limit 4) |
| BR-NFR-02 | **Integrity in the database, not only the application.** Append-only tables, once-only and ordering rules are enforced by triggers; a missing guard shows as degraded. | Must | Rule | Every unique key of every append-only table has a trigger that looks at it; the health check names a missing guard. | Built. The checks confirm triggers by name; tests run one probe per rule |
| BR-NFR-03 | **Nothing secret or real in git.** Secrets, real company data, databases, build output and dependencies stay out of the repository. | Must | Rule | A static test fails on a tracked secret or build output. | Built |
| BR-NFR-04 | **Evidence for every change.** Test results, with date and limits, are recorded in the module's `VALIDATION.md`. | Must | Rule | Each module has one with dated results and what was not checked. | Built |
| BR-NFR-05 | **Regression protection.** No suite is removed or weakened unnoticed. | Must | Built | A suite that is missing, has no baseline or passes fewer tests than its baseline fails the run. | Built. The baseline can be edited in a pull request (platform limit 9) |
| BR-NFR-06 | **Supply-chain control.** Dependencies are checked before they are installed and listed in a bill of materials. | Must | Proposed | An install refuses very new packages; a bill of materials and an audit run in CI. | Partial. The seven-day rule exists; no bill of materials, no audit |
| BR-NFR-07 | **Backup and recovery.** Durable data can be restored, and the restore has been practised. | Must | Proposed | A restore from backup is run and timed; the result is recorded. | Not built. The hosted demonstration is in memory and resets on restart |
| BR-NFR-08 | **Availability.** A target for a hosted pilot is set and measured. | Should | Proposed | A target is written; uptime is measured against it. | Not built. No target set |
| BR-NFR-09 | **Performance.** A response-time target for each owner page, set and measured on a phone-class device. | Should | Proposed | A target is written; a measured result is recorded with its conditions. | Not built. One start-up and memory measurement only |
| BR-NFR-10 | **Observability.** Logs carry no secret, header, body or personal data; an operator is alerted when the system is unhealthy. | Should | Proposed | A log review finds none of the first; an alert fires in a drill. | Partial. The gateway logs one line per refusal; nothing alerts |
| BR-NFR-11 | **Browsers and devices.** A supported list is stated and each is tested. | Should | Proposed | The list is written; each browser on the list passes the browser layer. | Partial. Chromium on desktop Linux only |
| BR-NFR-12 | **Abuse protection.** Rate limits on sign-in and writes; a cap on what a person can write to the audit log. | Should | Proposed | Repeated attempts are refused; the audit log cannot be flooded by one person. | Not built (platform limits 2 and 8) |
| BR-NFR-13 | **Browser security headers.** A full content-security policy and a host-bound session cookie. | Should | Proposed | Every response carries a policy that restricts scripts; the cookie uses a `__Host-` prefix. | Partial. Frame, form, base, referrer and nosniff headers only |
| BR-NFR-14 | **A person reviews changes to protected paths.** Authentication, data scope, migrations, money and the rule-library publishing path. | Should | Rule | Each change to a protected path has a named human reviewer. | Not built. No person has read any of it (OQ-08) |
| BR-NFR-15 | **More than one instance.** The platform can run on more than one instance with a durable database. | Could | Proposed | Two instances serve one durable database without disagreement. | Not built. The demonstration host runs one instance with an in-memory database |

## 8. Assumptions and dependencies

| ID | Statement | Basis | How it would be tested |
| --- | --- | --- | --- |
| AS-01 | [Guessing] An MSME owner will describe the factory more readily by voice and photo, in their own language, than by a typed English form. | Thesis stage 1 | Ten-owner test, Describe sessions |
| AS-02 | [Guessing] Owners have a phone and a connection good enough for a web page. | Proposed | Ten-owner test; BR-UX-05 |
| AS-03 | [Guessing] A usable work email is not held by every owner, so email-link sign-in may not work. | OQ-13 | Ten-owner test |
| AS-04 | [Guessing] Pooling gives a price gap large enough to matter, and no source gives its size. | Thesis section 7 | Pooling test (BO-04) |
| AS-05 | [Guessing] Cluster and association bodies will take part and carry trust with owners. | Study S4 (pattern in six scale-up routes) | First-cluster conversation (OQ-03) |
| AS-06 | [Guessing] Owners will pay for the plan, or someone will pay for them. | Thesis section 8 | Ten-owner test; OQ-06 |
| AS-07 | [Likely] The limits in the code (12 milestones, 14 deliveries, 500 versions, 100,000,000 rupees, text lengths, 30/90/180 days) are placeholders chosen by the builders. | Module status pages | Review with owners and operators |
| DP-01 | The first sector and cluster are chosen. Blocks the real library, the first provider list and the ten-owner test. | OQ-03 | Sponsor decision |
| DP-02 | The right to reuse study material, with disclosure, is settled. Blocks real library content. | OQ-09 | Sponsor with counsel |
| DP-03 | A sign-in method for real owners is chosen. Blocks any real user. | OQ-13 | Sponsor decision |
| DP-04 | Where real data is hosted and what obligations apply is decided. Blocks any real company data. | OQ-07 | Sponsor with counsel |
| DP-05 | The revenue model is chosen under D-03. Blocks pricing and packaging. | OQ-06, OQ-11 | Sponsor decision |

## 9. Risks

| ID | Risk | Likelihood and effect | What reduces it |
| --- | --- | --- | --- |
| RK-01 | The application was built before the ten-owner test, so slices 3 to 5 may rest on a picture of the owner's problem the test would have corrected. | [Likely] High effect: rework | Run the test and read [the bar](../ten-owner-test.md) before building further |
| RK-02 | Owners will not come without providers and providers will not come without owners. | [Likely] High | A first cluster; stages 3 to 5 run by hand (P-01) |
| RK-03 | Small tickets make the cost to serve one owner the central problem; the diagnosis cannot be priced like consulting. | [Likely] High | Measure minutes and rupees per owner (BR-COM-03) |
| RK-04 | Pooling works only for items that can be standardised (software seats, cameras, sensors, standard integrations), not bespoke integration. | [Likely] Medium | Pool only standard requirements; test with two providers (BO-04) |
| RK-05 | The platform is built on a study by an affiliate of a study author, without the client's agreement. | [Likely] High: conflict of interest | Settle OQ-09 before study content is used |
| RK-06 | Acting as the owner's single counterparty carries liability. | [Likely] High | Decide OQ-12 with counsel before a real engagement |
| RK-07 | No person has read the code on protected paths: identity, data scope, migrations, money. | [Certain] that it is unread; the effect is unknown | A named human reviewer (BR-NFR-14, OQ-08) |
| RK-08 | Without a revenue model that satisfies D-03 the marketplace cannot pay for the consulting and operations functions. | [Likely] High | Settle OQ-11 |
| RK-09 | Owners cannot follow the pages, which is what the sponsor reported on 5 October 2026. | [Certain] for the sponsor; unknown for owners | Section 7.9; owner sessions |
| RK-10 | The hosted demonstration has one shared password, an in-memory database and plain HTTP behind the platform's proxy. A real person's data entered there would be lost or exposed. | [Certain] | Never enter real data; BR-DATA-01 |
| RK-11 | Willingness to pay is not evidenced in any source. | [Guessing] | Ten-owner test |

## 10. Decisions this document needs from the sponsor

Four new open questions come from writing this document (OQ-16 to OQ-19, in [open-questions.md](../open-questions.md)). The existing questions that decide the most requirements are OQ-03 (sector and cluster), OQ-06 and OQ-11 (who pays; revenue under D-03), OQ-07 (where real data lives), OQ-09 (reuse of the study), OQ-12 (principal or agent), OQ-13 (sign-in) and OQ-15 (second engagement).

| Question | Decides |
| --- | --- |
| OQ-16: Which of these requirements are Must, Should and Could, and in what order are they built? | Every priority above; the plan |
| OQ-17: Which languages, and which channels (phone call, WhatsApp, web), first? | BR-DESC-04, BR-DESC-06, BR-UX-04, BR-UX-05, BR-UX-11, BR-RUN-07 |
| OQ-18: Who is the person who checks a plan, who employs them, and may they read a company's record? | BR-ID-08, BR-DIAG-06, BR-RUN-06, BR-OPS-03 |
| OQ-19: Do providers sign in, and what do they see? | BR-ID-09, BR-DEPL-05, BR-PROC-07 |

## 11. Where the requirements stand

The counts are computed from the tables in section 7 by [the traceability script](../../scripts/check-traceability.mjs) and checked by a test, so they cannot drift from the tables. They are not a completion percentage. All formal acceptance is pending.

<!-- STATUS-COUNTS-START -->
| Area | Requirements | Built | Partial | Not built | Open | Unverified |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Governance and constraints (GOV) | 10 | 2 | 2 | 2 | 4 | 0 |
| Identity, access and audit (ID) | 9 | 3 | 2 | 4 | 0 | 0 |
| Describe (DESC) | 9 | 2 | 2 | 5 | 0 | 0 |
| Diagnose (DIAG) | 12 | 5 | 3 | 4 | 0 | 0 |
| Procure (PROC) | 11 | 5 | 0 | 5 | 1 | 0 |
| Deploy (DEPL) | 10 | 4 | 1 | 4 | 1 | 0 |
| Run (RUN) | 10 | 4 | 0 | 6 | 0 | 0 |
| Operator (OPS) | 8 | 4 | 1 | 3 | 0 | 0 |
| User experience (UX) | 11 | 1 | 2 | 2 | 1 | 5 |
| Data and privacy (DATA) | 7 | 2 | 0 | 3 | 2 | 0 |
| Commercial (COM) | 4 | 1 | 0 | 2 | 1 | 0 |
| Non-functional (NFR) | 15 | 5 | 4 | 6 | 0 | 0 |
| **All** | **116** | **38** | **17** | **46** | **10** | **5** |

By priority (a proposal, OQ-16): 67 Must, 40 Should, 9 Could. Of the 67 Must requirements, 32 are not fully built.
<!-- STATUS-COUNTS-END -->

## 12. Sign-off

Not signed. The sponsor's signature, and the date, go here when the sponsor accepts a version of this document. Nothing in this repository treats the document as accepted until then.

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Sponsor | | | |

## 13. Change log

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 5 October 2026 | First draft by Claude from the thesis, decisions, status pages and code. Replaces the unrecovered PRD v0.2 |
