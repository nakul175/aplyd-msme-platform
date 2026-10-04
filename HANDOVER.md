# Handover

Read [AGENTS.md](AGENTS.md) first, then this file. Last updated 4 October 2026.

## Current state

- Documentation base only. No application code, no tests, no deployment.
- Direction decided: marketplace++ (D-05). The thesis is [docs/thesis.md](docs/thesis.md), version 2.
- Open questions that change what gets built: OQ-03 (first sector and cluster), OQ-09 (right to reuse study material, including disclosure), OQ-11 (revenue under D-03), OQ-12 (platform as principal or agent).

## How to verify a change

There is nothing to run yet. For documentation changes, re-read the cited rows in [docs/sources.md](docs/sources.md) and confirm every figure still traces to one.

## Merged without review

None yet.

## Direct to main

Documentation-only commits made at the sponsor's instruction in conversation:

- 4 October 2026, b918272: documentation base.
- 4 October 2026: thesis version 2 (marketplace++), after the sponsor rejected version 1.

## Next work, in order

Each slice is one reviewable pull request. A slice is not started until the one before it is merged. Slices 1 and 2 are domain-neutral and can start before the sector is chosen.

1. Walking skeleton. Take the stack, test runner, CI and documentation check from Saha (see [docs/saha-lessons.md](docs/saha-lessons.md)) and publish an empty application with a sign-in, a company record and one test per layer, deployed to hosted synthetic staging. Protected path: identity.
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
