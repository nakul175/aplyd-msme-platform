# Decisions

Last updated 4 October 2026. Three groups: decided, carried forward but to be reconfirmed, and deliberately dropped.

## Decided

| ID | Decision | Source |
| --- | --- | --- |
| D-01 | Start from scratch. The earlier PRD, functional specification, meter specification and prototypes from the 13 September session could not be recovered, and that session ended by concluding the direction needed rethinking. | Taken by Claude on the sponsor's instruction to use its own call, 4 October 2026 |
| D-02 | The platform is owned by APLYD. It is not owned by the client of the study or by the Mission. It exists to make APLYD more than a services organisation. | Sponsor, September 2026 |
| D-03 | APLYD's earnings never vary with which vendor a customer chooses. | Sponsor, September 2026 |
| D-04 | The platform is built the way Saha was built: a repository on GitHub as the base, then agent-assisted development on top of it, with the lessons in [saha-lessons.md](saha-lessons.md) applied. | Sponsor, 4 October 2026 |

## Carried forward, to be reconfirmed

These come from the summary of the 13 September session, where they were recorded in a specification that is no longer available. They are consistent with D-02 and D-03 but have not been restated by the sponsor since.

| ID | Position |
| --- | --- |
| C-01 | APLYD does not certify a factory or a product. |
| C-02 | APLYD does not build AI products that are listed in any registry it runs. |
| C-03 | APLYD does not sell company data. |
| C-04 | No aggregate figure is published from fewer than five companies. |
| C-05 | Factories introduced through a client engagement study are not approached commercially, and the origin of every contact is logged from first touch. |

## Dropped

These numbers and mechanisms came out of the 13 September framing, which centred on a scoring engine and a verification fee. The sponsor rejected that framing at the end of the session. They are not requirements. Revisit only if evidence from real users brings them back.

- Pain threshold of 3.5 as a platform rule (the study uses 3.5 as its own screening cut-off; that is a different use).
- Platform fee of Rs 2,500 per active factory per month.
- Vendor listing fee of Rs 3 lakh per year.
- Verification fee of 1.5 percent of money released.
- Escrow as a float mechanism, and the cap of 20 units on vendor waits.

## Proposed, not yet decided

| ID | Proposal | Needs |
| --- | --- | --- |
| P-01 | Build the readiness companion described in [thesis.md](thesis.md) as the first product. | Sponsor's yes or no |
| P-02 | Make textile export readiness the first configuration and CDSCO medical-device regulation the second. | OQ-03 |
| P-03 | Use the Saha stack (Next.js on Cloudflare Workers, D1, Drizzle) so the pipeline, test runner and hosted staging pattern can be reused. | Sponsor's yes or no |
