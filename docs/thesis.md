# Product thesis (version 2)

Status: direction set by the sponsor on 4 October 2026 (D-05 in [decisions.md](decisions.md)). This replaces version 1, the compliance-only readiness companion, which the sponsor rejected. Confidence tags: [Certain] is stated in a cited source, [Likely] is a strong inference, [Guessing] fills a gap and needs testing.

## 1. The need, as an owner states it

Speaking as the owner of a small manufacturing unit, the sponsor put it this way:

- I do not know how to use AI in my factory.
- I do not know how to carry out a gap assessment.
- I do not know how to integrate and deploy, or how to procure.
- Economies of scale do not work for me when I buy, because I am small.
- There are many places where AI, or technology in general, could help me.
- I wish I had a strategy consulting team, a technology consulting team, a technology team that could do everything, and an operations team.

The question is how one platform brings all of that together for the owner. The working name for the answer is marketplace++: a marketplace of providers, plus the consulting, delivery and operations functions the owner would otherwise have to hire.

[Certain] This is one voice, and it is the sponsor's, speaking in character. It is a strong lead on what to build, not measured demand. Section 7 says how to test it.

## 2. What the study says about the same need

- [Certain] The Inception Report says adoption stalls less from lack of interest than from a mismatch between how AI solutions are sold and what a small firm can bear: high upfront capital, unclear ownership of data and models, recurring costs that are hard to forecast, and no financing that fits (S1, pp. 36-37).
- [Certain] It lists the outside capacities a small firm needs: instrumentation and data capture, model operations and failure resolution at MSME scale, deployment infrastructure, trusted system integrators and translators, and role-based training (S1, p. 36). These are the owner's "tech team" and "ops team".
- [Certain] It studies three ways of buying: directly by the firm, shared across a cluster of firms, and as a service rather than an owned asset. It studies three ways of financing: purchase, subscription or pay-per-use, and outcome-linked (S1, p. 37). It frames total cost as one-time, recurring and hidden costs (S1, p. 37).
- [Certain] It requires that the application layer be separable from the data layer, so a factory can change applications without losing what its data has built up (S1, p. 36).
- [Certain] Of 645 pain points recorded, 369 (57.2 percent) were judged not to be AI problems (S4, slide 4). So "AI or technology in general" is the right scope: a diagnosis that only offered AI would have nothing to offer for more than half the problems the study found.
- [Certain] In the six use cases whose scale route was read (S4, slides 16, 20, 24, 30, 36, 42), scale runs through an industry association or cluster body that recruits firms and brokers shared data or shared services. [Likely] That is the vehicle for pooling.
- [Certain] The study's own integration blueprint, procurement and financing toolkit and ecosystem roadmap (D4, D5, D6) were still ahead on the 30 September timeline (S4, slide 43). The study has not yet produced the answers this platform depends on.

## 3. The proposal: one journey in five stages

| Stage | What the owner gets | Who does the work |
| --- | --- | --- |
| 1. Describe | Tells the platform about the factory in their own words, by voice, photos and a few questions, in their own language. | Owner; AI structures it |
| 2. Diagnose | A gap assessment and a ranked list of opportunities, AI and non-AI, each with a benefit range, total cost (one-time, recurring, hidden), prerequisites and risk. | AI drafts; a person checks |
| 3. Procure | The chosen opportunity written as a standard requirement, pooled with similar needs in the cluster, offers from vetted providers compared on total cost and financing model, standard contract terms covering data ownership and exit. | Platform, providers, cluster body |
| 4. Deploy | A named integrator, a milestone plan, acceptance tests, and payment tied to acceptance. | Provider; platform tracks and arbitrates |
| 5. Run | Support, monitoring, review points where a person re-checks the system, outcome tracking, and the next item from the plan. | Provider and platform operations |

A plain marketplace covers stage 3 only. The "++" is stages 1, 2, 4 and 5, which are the strategy, solution design, delivery and operations teams the owner asked for.

Compliance and certification help (export certification, medical-device regulation) is one type of opportunity inside stages 2 to 4, not the product. The study supports it as a strong case where rules are documented and largely static (S4, slides 21, 24, 27, 30).

## 4. What software does and what people do

- [Likely] Software and AI can do: structure the intake, draft the gap assessment, write the requirement, match and pool demand, compare offers on total cost, track milestones, track outcomes.
- [Likely] People must do: vet providers, judge unusual cases, settle disputes, and be accountable when a deployment fails.
- [Likely] One platform does not replace four teams with software. It replaces them with standard playbooks, a partner network and a small core team, and it is the single point of accountability for the owner.
- [Likely] Cluster and association bodies bring demand together and carry trust with owners (S4 pattern above).

## 5. Constraints that shape the design

- D-03 says APLYD's earnings never vary with which vendor a customer picks. [Likely] A percentage commission on each deal earns more when the owner picks the dearer vendor, so on a plain reading it is ruled out. What remains: a subscription or flat project fee from the owner, an identical flat listing fee from every provider, funding for the diagnosis from a programme, or association membership. Open question OQ-11.
- C-01 to C-03 stand: APLYD does not certify, does not build products listed in its own registry, and does not sell company data.
- [Certain] The study is a joint engagement of the IndiaAI Mission, MeitY, NISG and Athena Infonomics (S4, cover). APLYD was created by Athena. A commercial platform built on the study's findings, by an affiliate of a study author, needs the client's agreement and disclosure. [Likely] Without them it is a conflict-of-interest risk to the study engagement (OQ-09).
- [Likely] The best raw material for the diagnosis stage, the study's pain points and solution mappings, is the material whose reuse is unsettled. Until it is settled the opportunity library used in code is SYNTHETIC.
- Accountability: is the platform the owner's single counterparty (principal) or an introducer (agent)? "One platform brings it together for me" points to principal, which carries liability. Open question OQ-12.

## 6. Where to start

- [Likely] Do not start with the marketplace listing. It is the easiest part to build and demonstrate, and the least of what the owner asked for.
- [Likely] Start with stages 1 and 2 for one sector in one cluster, with stages 3 to 5 run by hand behind them. This shows what it costs to serve one owner and how many plans turn into purchases before any pooling software is built.
- The 13 September build put a scoring engine at the front. Here the front is the owner's description of the factory and a plan back.

## 7. Tests before building more

- [Likely] Take ten owners in one cluster who were not met through the study (C-05). Run stages 1 and 2 by hand with a worksheet. Record: time and cost to serve each, how many act on the plan, what they buy, whether they would pay and how much.
- [Likely] Pooling test: find three or more owners with the same requirement, get quotes for the pooled and the individual purchase from two providers, and measure the price gap. [Guessing] The gap is large enough to matter; no source gives its size.

## 8. Risks

- [Likely] Both sides are needed at once. Owners will not come without providers, and providers will not come without owners.
- [Likely] Small tickets make cost to serve the central problem. The diagnosis cannot be priced like consulting.
- [Likely] Pooling only works for items that can be standardised, such as software seats, cameras, sensors and standard integrations. It does not work for bespoke integration.
- [Likely] Counting non-AI fixes widens the supply side a great deal. A first cluster keeps it manageable.
- [Guessing] Willingness to pay is not evidenced in the sources. No revenue figure is proposed here.
