# Product thesis

Status: proposal for the sponsor's decision (P-01 in [decisions.md](decisions.md)). Confidence tags: [Certain] is stated in a cited source, [Likely] is a strong inference from the sources, [Guessing] fills a gap and needs testing.

## 1. What we do not know yet

The 13 September session ended on a question it did not answer: what do MSME owners actually ask for when they first arrive? The study documents cannot answer that. They record what interviewers heard on factory visits and what the study team concluded; they do not record what a manufacturer would walk up to a platform and ask for.

- [Certain] The study's own count is 54 factory immersions completed out of 350 planned, with 645 pain points recorded across four sectors (S4, slide 4).
- [Certain] The study labels its nine use cases indicative and a work in progress (S4, slide 8).
- [Likely] So the thesis below is the best reading of an interim study, not a measured demand. Section 6 says how to test it quickly.

## 2. What the study supports

The nine prioritised use cases (S4, slide 8) group into four kinds:

- Factory-floor data capture: automated visual inspection (textiles), production traceability and anomaly detection (electronics), and the pharma quality management system, which combines process, machine and visual data with the factory's own procedures (S4, slides 13, 37, 39).
- Shared data across firms: the textile demand exchange and the electronics supply-chain intelligence platform. Both depend on competitors agreeing to share data through an association (S4, slides 17-20, 33-36).
- Rules and paperwork: national export readiness (textiles) and the CDSCO regulatory assistant (medical devices). The authority-side workflow (medical devices) is the same territory seen from the regulator's side.
- Workforce skill matching (textiles).

The third group is the one this proposal builds on.

| Use case | Sector | Pain / AI score | Source |
| --- | --- | --- | --- |
| National export readiness and compliance platform | Textiles | 4.3 / 4.0 | S4, slides 8, 21-24 |
| CDSCO regulatory intelligence agent | Medical devices | 4.33 / 4.0 | S4, slides 8, 27-30 |
| Authority-side workflow with service-level transparency | Medical devices | 4.33 / 3.5 | S4, slides 8, 31 |

What the sources say about these:

- [Certain] The export readiness and CDSCO cases share one shape: a company and product profile is held against an external rule set; the system maps requirements, finds gaps, assists with documents, and sends complex questions to experts (S4, slides 21 and 27).
- [Certain] The deck judges textile export requirements to be documented and largely static, so the work is aggregation rather than interpreting new regulation (S4, slide 24).
- [Certain] For CDSCO the deck judges the inputs largely structured and public, and names regulator trust as the harder part (S4, slide 30).
- [Certain] One textile respondent reported paying a consultant Rs 65,000 a year plus Rs 1,44,000 in agency fees for one certification, and asked for a single digital locker so know-your-customer documents are not resubmitted to each department and buyer (S4, slide 21). This is one respondent; [Guessing] whether it is typical.
- [Certain] The deck proposes the same route to scale for every case: a government-funded pilot, then rollout led by an industry association, then private investment once savings are shown (S4, slides 16, 20, 24, 30, 36, 42).
- [Certain] The authority-side workflow treats the regulator as the customer and keeps all decisions with the authority (S4, slide 31). A product aimed at the regulator is a different sale from one aimed at manufacturers.

## 3. Proposed first product: readiness companion

A manufacturer enters its company profile once. The platform holds a versioned rule library for a regulatory or certification area, compares the profile against it, shows the gaps, assembles the document pack, and routes questions it cannot settle to a named human expert.

Core objects:

- Company profile: captured once, owned by the company, reused across rule libraries.
- Rule library: a set of requirements for one area, each tied to the official document it came from, versioned, with a named custodian who maintains it.
- Gap map: the comparison of profile against rules, with the reason for every gap.
- Document pack: the forms and attachments assembled from the profile, for the company to submit itself.
- Expert escalation: a hand-off to a person, with the case attached, for anything the rules do not settle.
- Audit trail: append-only record of what was shown, what was changed and by whom.

Why this and not another of the nine:

- [Likely] Of the nine, export readiness and CDSCO are the two that need no cameras, sensors or competitor data-sharing; they work from documents and public rules (S4, slides 24 and 30). A small team can reach a working pilot without hardware integration. The deck still lists technology vendors as partners for both, so this is not a claim that no vendor is involved.
- [Likely] It fits the two sponsor constraints. APLYD can own the platform (D-02), and nothing in it needs a revenue share tied to a vendor choice (D-03).
- [Likely] It is reusable across sectors. A new sector is a new rule library, not a new product. The company profile and the history around it stay with the company, which is where stickiness can come from without selling or locking up data (C-03).

## 4. First configuration

[Likely] Textile export readiness first, CDSCO second. Reasons: the deck rates textile requirements as static and documented, so the first rule library can be checked against official sources; CDSCO depends on a regulator accepting AI-assisted filing, which the platform cannot control. This is open question OQ-03 and the sponsor may weigh it differently.

## 5. What we are not building first

- A marketplace, vendor registry or procurement flow. These need vendors and a revenue model that the sponsor has already limited (D-03), and the fees from the earlier framing are dropped (decisions.md).
- A scoring engine as the product. The study's scoring method belongs to the study.
- Shop-floor vision or traceability. These need hardware integration and sit better with technology partners.
- Automatic filing into government portals. [Guessing] The portals may not expose interfaces that allow it. Check before promising (OQ-05). The first version prepares the pack and the company submits.

## 6. How to test this before building much

- [Likely] Ask ten textile exporters and ten medical-device makers what they would hand to a platform on day one, in their own words. This answers the question from section 1 directly.
- [Likely] Build a thin version with synthetic rules and show it to the same people. If they ask for something else first, change the thesis, not the users.
- Contact rules in C-05 apply: do not approach factories met through the study commercially until OQ-09 is settled.

## 7. Risks

- [Certain] The right to reuse the study's material is unresolved (OQ-09). Building on it before that is settled is a legal and relationship risk to the study engagement.
- [Likely] A wrong rule shown with confidence harms a manufacturer. The product needs a custodian who owns rule accuracy, visible source and date on every rule, and escalation to an expert for anything the rules do not settle. Until a custodian exists, all rules are SYNTHETIC (AGENTS.md).
- [Guessing] Manufacturers may value the document pack and the expert hand-off more than the gap map. The tests in section 6 should find out.
- [Guessing] Willingness to pay is not evidenced in the sources. Revenue is an open question (OQ-06); no figure is proposed here.
