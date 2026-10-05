# Handover

Read [AGENTS.md](AGENTS.md) first, then this file. Last updated 4 October 2026.

## Current state

- Documentation base on `main`. Slice 1 (the walking skeleton) is on draft pull request #1 from `slice-1-walking-skeleton`, labelled `needs-human-review`, not merged. Its two CI workflows passed on 4 October 2026. It holds sign-in for synthetic users, one company record with the scope rule, an append-only audit log, the test runner and CI. No deployment. Details and limits: [modules/platform/STATUS.md](modules/platform/STATUS.md).
- Direction decided: marketplace++ (D-05). The thesis is [docs/thesis.md](docs/thesis.md), version 2. Stack decided: D-06.
- Open questions that change what gets built: OQ-03 (first sector and cluster), OQ-09 (right to reuse study material, including disclosure), OQ-11 (revenue under D-03), OQ-12 (platform as principal or agent), OQ-13 (how real owners sign in).

## How to verify a change

- Documentation changes: `node scripts/check-documentation.mjs`, and re-read the cited rows in [docs/sources.md](docs/sources.md) to confirm every figure still traces to one.
- Code changes (on the slice 1 branch and after): `node scripts/test.mjs pr --guard`, with `pnpm build` first for the smoke layer. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Record results in the module's `VALIDATION.md`.

## Merged without review

None yet.

## Direct to main

Documentation-only commits made at the sponsor's instruction in conversation:

- 4 October 2026, b918272: documentation base.
- 4 October 2026, 7021ceb: thesis version 2 (marketplace++), after the sponsor rejected version 1.

## Next work, in order

Each slice is one reviewable pull request. A slice is not started until the one before it is merged. Slices 1 and 2 are domain-neutral and do not wait for the sector to be chosen.

1. Walking skeleton. Built on the draft pull request, awaiting the sponsor's merge. Delivered: the Saha stack without its hosting layer (D-06), a synthetic sign-in, a company record and the scope rule, an audit log, one suite set per layer, CI. Not delivered, and still open: hosted staging and its access layer (needs the sponsor's Cloudflare account and OQ-07), real sign-in (OQ-13), a browser test layer, the supply-chain gate. Protected path: identity.
2. Factory record and Describe. The owner describes the factory by text, voice and photos; the platform stores a structured record per company, with the scope rule enforced on the server and a test that one company cannot read another's record. Protected path: data scope.
3. Diagnose v0. A gap assessment that produces ranked opportunities, each labelled AI or non-AI, with benefit range, total cost (one-time, recurring, hidden), prerequisites and risk. The opportunity library is SYNTHETIC until OQ-09 and OQ-03 are settled, and every item carries its source or says it is an assumption. A person can edit and sign off each assessment.
4. Requirement and pooling. A chosen opportunity becomes a standard requirement; requirements of the same kind in one cluster can be pooled; a provider registry with one identical flat listing fee for every provider (D-03). Protected path: anything that records money.
5. Deploy and Run. Milestones, acceptance tests, payment tied to acceptance, and outcome tracking, for one pilot cohort.

Alongside slices 1 and 2, the sponsor runs the ten-owner test from [docs/thesis.md](docs/thesis.md) section 7 by hand. Its result decides whether slice 3 is built as described.

## Do not do

- Do not add real company data, real compliance rules, or interview material from the study.
- Do not take a percentage of deals or any fee that depends on which provider is chosen (D-03, OQ-11).
- Do not build the marketplace listing ahead of Describe and Diagnose.
- Do not start more than four writing agents at once.
