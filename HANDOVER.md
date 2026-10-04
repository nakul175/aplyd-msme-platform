# Handover

Read [AGENTS.md](AGENTS.md) first, then this file. Last updated 4 October 2026.

## Current state

- Documentation base only. No application code, no tests, no deployment.
- The proposal is in [docs/thesis.md](docs/thesis.md). It has not been accepted yet (decision P-01).
- Open questions are in [docs/open-questions.md](docs/open-questions.md). The ones that change what gets built are OQ-03 (first sector), OQ-04 (who maintains the rules) and OQ-09 (right to reuse study material).

## How to verify a change

There is nothing to run yet. For documentation changes, re-read the cited source rows in [docs/sources.md](docs/sources.md) and confirm every figure still traces to one.

## Merged without review

None yet.

## Next work, in order

Each slice is one reviewable pull request. A slice is not started until the one before it is merged.

1. Walking skeleton. Take the stack, test runner, CI and documentation check from Saha (see [docs/saha-lessons.md](docs/saha-lessons.md)) and publish an empty application with a sign-in, a company record and one test per layer, deployed to hosted synthetic staging. Protected path: identity.
2. Company profile. One form, captured once, stored per company, with the scope rule enforced on the server and a test that one company cannot read another's profile. Protected path: data scope.
3. Rule library. Versioned rules, each with source document, date read and custodian. Fixtures are labelled SYNTHETIC. Protected path: rule publishing.
4. Gap map for the first configuration (OQ-03). Profile against rule library, with the reason for every gap.
5. Document pack and expert hand-off. Assemble the pack for the company to submit itself; hand-off carries the case and the audit trail.

Before slice 1 starts, the sponsor settles P-01, P-03 and OQ-01.

## Do not do

- Do not add real company data, real compliance rules, or interview material from the study.
- Do not add a fee, a vendor listing or a scoring engine; they were dropped (see [docs/decisions.md](docs/decisions.md)).
- Do not start more than four writing agents at once.
