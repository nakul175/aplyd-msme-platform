# Decisions

Last updated 4 October 2026. Three groups: decided, carried forward but to be reconfirmed, and deliberately dropped.

## Decided

| ID | Decision | Source |
| --- | --- | --- |
| D-01 | Start from scratch. The earlier PRD, functional specification, meter specification and prototypes from the 13 September session could not be recovered, and that session ended by concluding the direction needed rethinking. | Taken by Claude on the sponsor's instruction to use its own call, 4 October 2026 |
| D-02 | The platform is owned by APLYD. It is not owned by the client of the study or by the Mission. It exists to make APLYD more than a services organisation. | Sponsor, September 2026 |
| D-03 | APLYD's earnings never vary with which vendor a customer chooses. | Sponsor, September 2026 |
| D-04 | The platform is built the way Saha was built: a repository on GitHub as the base, then agent-assisted development on top of it, with the lessons in [saha-lessons.md](saha-lessons.md) applied. | Sponsor, 4 October 2026 |
| D-05 | The product is marketplace++: one journey that takes a small manufacturer from describing its factory, through a gap assessment, pooled procurement and deployment, to running what it bought. It covers AI and other technology. Version 1 of the thesis (a compliance-only readiness companion) is superseded; compliance help becomes one type of opportunity inside the journey. | Sponsor, 4 October 2026, speaking as an MSME owner (see [thesis.md](thesis.md) section 1) |
| D-06 | Build on the Saha stack: Next.js on vinext, Cloudflare Workers, D1 and Drizzle, pnpm, Node 22, with the pinned versions Saha uses. Saha's hosting-platform layer is not reused (see [saha-lessons.md](saha-lessons.md)). Cloudflare is the stack for synthetic data only; where real data is hosted is still open (OQ-07). | Sponsor, 4 October 2026: instruction to continue building on the Saha experience, and "Go ahead" on slice 1 |

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
| P-01 | Start with stages 1 and 2 of the journey (Describe, Diagnose) for one sector in one cluster, run stages 3 to 5 by hand behind them, and test with ten owners before building pooling software ([thesis.md](thesis.md) sections 6 and 7). | Sponsor's yes or no |
| P-02 | Choose the first sector and cluster. The study covers textiles, electronics, medical devices and pharma; no proposal yet. | OQ-03 |
