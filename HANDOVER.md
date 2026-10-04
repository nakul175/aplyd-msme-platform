# Handover

Read [AGENTS.md](AGENTS.md) first, then this file. Last updated 5 October 2026.

## Current state

- Documentation base on `main`. Nothing else is merged.
- Slice 1 (the walking skeleton) is draft pull request #1 from `slice-1-walking-skeleton`, labelled `needs-human-review`. Its CI passed on 4 October 2026. Sign-in for synthetic users, one company record with the scope rule, an append-only audit log, the test runner and CI. Details and limits: [modules/platform/STATUS.md](modules/platform/STATUS.md).
- Slice 1b (the browser test layer) is draft pull request #2, stacked on #1.
- Slice 2 (Describe) is draft pull request #3, stacked on #2: the owner describes the factory by questionnaire and every save is a new version. Details and limits: [modules/factory/STATUS.md](modules/factory/STATUS.md).
- Slice 3 (Diagnose v0) is draft pull request #4, stacked on #3: from the confirmed description, a ranked list of ideas (AI and not), the owner's decision on each, and a sign-off with a fingerprint. The opportunity library is SYNTHETIC. A separate agent reviewed it and found one high defect (a second sign-off could overwrite the first through `INSERT OR REPLACE`), now fixed in migration 0007 with the medium and low findings; see [modules/diagnose/VALIDATION.md](modules/diagnose/VALIDATION.md). No person has reviewed it. Details and limits: [modules/diagnose/STATUS.md](modules/diagnose/STATUS.md).
<<<<<<< HEAD
- Slice 4 (Procure) is a draft pull request stacked on #4: from an idea the owner accepted, a standard requirement in a cluster; pools counted by companies with a floor of five (C-04); a provider registry kept by an operator; one flat listing fee for every provider (D-03). **No fee is decided**; the cluster list, the providers and every number are synthetic placeholders. Details, limits and the mutation record: [modules/procure/STATUS.md](modules/procure/STATUS.md), [modules/procure/VALIDATION.md](modules/procure/VALIDATION.md). No person has reviewed it; a separate agent's review is recorded there when it has run.
- Slice 5 (Deploy) is a draft pull request stacked on slice 4: the owner chooses one of the providers listed for a requirement, writes a plan of milestones with the test they will check each by and a price, agrees it, then records deliveries, acceptances, payments they made themselves, and the close. The platform holds and moves no money here and does not contact the provider. Details, limits and the mutation record: [modules/deliver/STATUS.md](modules/deliver/STATUS.md), [modules/deliver/VALIDATION.md](modules/deliver/VALIDATION.md). OQ-15 is open (whether a closed engagement lets the owner choose again). No person has reviewed it; a separate agent's review is recorded there when it has run.
- Slice 6 (Run) is a draft pull request stacked on slice 5: the owner records one starting number for an engagement before the first milestone is accepted, then a review 30, 90 and 180 days after the first acceptance (the number, whether it did what the assessment expected, whether it is still in use), sees the change since the starting number and is offered the next idea they accepted. The dates are the owner's own record; nothing is measured by the platform, and no aggregate across companies is made (C-04 is unaffected). Details, limits and the mutation record: [modules/run/STATUS.md](modules/run/STATUS.md), [modules/run/VALIDATION.md](modules/run/VALIDATION.md). No person has reviewed it; a separate agent's review is recorded there when it has run.
- The ten-owner test the thesis calls for has a worksheet and a proposed bar, written before the test and for the sponsor to change: [docs/ten-owner-test.md](docs/ten-owner-test.md). It needs a person. Nothing in this repository can run it.
=======
- Slice 4 (Procure) is a draft pull request stacked on #4: from an idea the owner accepted, a standard requirement in a cluster; pools counted by companies with a floor of five (C-04); a provider registry kept by an operator; one flat listing fee for every provider (D-03). **No fee is decided**; the cluster list, the providers and every number are synthetic placeholders. Details, limits and the mutation record: [modules/procure/STATUS.md](modules/procure/STATUS.md), [modules/procure/VALIDATION.md](modules/procure/VALIDATION.md). No person has reviewed it. A separate agent reviewed it (0 high, 4 medium, 5 low); the findings and what was done about each are recorded there, and one (a trigger) waits in the fix branch at the top of the stack.
>>>>>>> slice-4-procure
- The sponsor asked on 4 October 2026 for building to continue without stopping. Later slices are therefore built as further stacked draft pull requests, each on the branch of the one before. This departs from the rule below that a slice is not started until the one before it is merged, and from the instruction in the thesis that the ten-owner test decides whether slice 3 is built as described. The risk is specific: slices 3 to 5 may be built on a picture of the owner's problem that the ten-owner test would have corrected. Nothing in the stack is merged, deployed or shown to a real owner. The sponsor merges, bottom of the stack first, and may close any slice above the point where the ten-owner test says the design is wrong.
- Direction decided: marketplace++ (D-05). The thesis is [docs/thesis.md](docs/thesis.md), version 2. Stack decided: D-06.
- Open questions that change what gets built: OQ-03 (first sector and cluster), OQ-09 (right to reuse study material, including disclosure), OQ-11 (revenue under D-03), OQ-12 (platform as principal or agent), OQ-13 (how real owners sign in).

## How to verify a change

- Documentation changes: `node scripts/check-documentation.mjs`, and re-read the cited rows in [docs/sources.md](docs/sources.md) to confirm every figure still traces to one.
- Code changes (on the slice 1 branch and after): `pnpm build`, then `node scripts/test.mjs pr --guard` (the smoke and browser layers run the built application). See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Record results in the module's `VALIDATION.md`.

## Merged without review

None yet.

## Direct to main

Documentation-only commits made at the sponsor's instruction in conversation:

- 4 October 2026, b918272: documentation base.
- 4 October 2026, 7021ceb: thesis version 2 (marketplace++), after the sponsor rejected version 1.

## Next work, in order

Each slice is one reviewable pull request. A slice is not started until the one before it is merged. Slices 1 and 2 are domain-neutral and do not wait for the sector to be chosen.

1. Walking skeleton. Built on the draft pull request, awaiting the sponsor's merge. Delivered: the Saha stack without its hosting layer (D-06), a synthetic sign-in, a company record and the scope rule, an audit log, one suite set per layer, CI. Not delivered, and still open: hosted staging and its access layer (needs the sponsor's Cloudflare account and OQ-07), real sign-in (OQ-13), the supply-chain gate. The browser test layer is draft pull request #2. Protected path: identity.
2. Factory record and Describe. Built on draft pull request #3 for the questionnaire only: a structured record per company, kept as appended versions, with the scope rule enforced on the server and tests that one company cannot read or write another's record. Not built: voice, photos, the owner's own language, and turning free text into structure. Protected paths: data scope, migrations.
3. Diagnose v0. Built on draft pull request #4. A gap assessment that produces ranked opportunities, each labelled AI or non-AI, with benefit range, total cost (one-time, recurring, hidden), prerequisites and risk. The opportunity library is SYNTHETIC until OQ-09 and OQ-03 are settled, and every item carries its source or says it is an assumption. The owner decides on each idea and signs off the assessment (built); editing an idea, and a second person who reviews it, are not built (OQ-08).
4. Requirement and pooling. A chosen opportunity becomes a standard requirement; requirements of the same kind in one cluster can be pooled; a provider registry with one identical flat listing fee for every provider (D-03). Protected path: anything that records money.
5. Deploy and Run. Milestones, acceptance tests, payment tied to acceptance, and outcome tracking, for one pilot cohort.

Alongside slices 1 and 2, the sponsor runs the ten-owner test from [docs/thesis.md](docs/thesis.md) section 7 by hand. Its result decides whether slice 3 is built as described.

## Do not do

- Do not add real company data, real compliance rules, or interview material from the study.
- Do not take a percentage of deals or any fee that depends on which provider is chosen (D-03, OQ-11).
- Do not build the marketplace listing ahead of Describe and Diagnose.
- Do not start more than four writing agents at once.
