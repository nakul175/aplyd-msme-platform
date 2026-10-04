# Working rules for every agent and developer

Applies to Claude, GPT/Codex, Cursor and people. Start with [HANDOVER.md](HANDOVER.md) for current state. These rules come from what went wrong and what worked on Saha; the evidence is in [docs/saha-lessons.md](docs/saha-lessons.md).

## Ownership and publication

- The sponsor decides when a pull request merges into `main`. Branch from `main`, open a draft pull request, and do not merge unless the sponsor says so in that conversation.
- A pull request that touches a protected path (below) carries the label `needs-human-review`. If the sponsor merges it without a person reading it, record that fact plainly in [HANDOVER.md](HANDOVER.md) under "Merged without review", with the date. Do not describe such code as reviewed.
- Never force-push `main`. Check the remote before pushing and preserve concurrent work.
- Commit a finished, reviewable slice with its tests and its documentation, push it, and verify the resulting tree before reporting completion. Report a failed push as a failure.

Protected paths: authentication and identity, anything that decides which company's data a person can read, database migrations, anything that moves or records money, and the rule library publishing path.

## Parallel work

- At most four agents write code at the same time. More than that moves the bottleneck to review; it does not speed delivery.
- Each writing agent owns one module directory under `modules/<name>/`. An agent does not edit another module's files. Cross-module changes go through the module owner's pull request.
- There is no single shared tracking file that every pull request must edit. Each module keeps its own `modules/<name>/STATUS.md` and `modules/<name>/VALIDATION.md`. The root documents are updated by the sponsor's integrating pull request only.
- Extra agents beyond four do review, integration and test work. They do not write feature code.

## Data and safety

- Synthetic data only until the data-sharing position (OQ-09) and a data agreement are in place. Mark every synthetic rule, company and figure as SYNTHETIC in the interface and in fixtures.
- No real factory names, contacts or interview content from the study in code, fixtures or documents. Factories introduced through a client engagement are not approached commercially; log the origin of any contact from first touch.
- Keep authorisation on the server. Identity comes only from the trusted provider module; never trust identity headers a client can set. One company's data is never readable by another company's users, and the platform operator's role does not override that scope.
- Corrections append new records with evidence. Confirmed records, revisions, audit entries and applied migrations are never edited or deleted.
- Keep credentials, real company data, local databases, build output and dependencies out of git. Track only the empty environment template.

## Claims and numbers

- Every figure, requirement or rule that appears in the interface or a document names its source from [docs/sources.md](docs/sources.md) or says it is an assumption. Do not invent figures, compliance rules, fees or timelines.
- A compliance rule shown to a user must carry the official document it came from, the date it was read, and the person or body that maintains it. Until a custodian exists (OQ-04), rule content is SYNTHETIC.

## Invariants that need a test

- APLYD's earnings never vary with which vendor, consultant or product a customer picks. Any code path that computes or records revenue must have a test that fails if the amount depends on the chosen provider.
- APLYD does not certify a factory or a product, does not build products listed in any registry it runs, and does not sell company data.
- No aggregate figure is published from fewer than five companies.

## Verification

- Run the affected checks before reporting a change as done, and record the real result, the date and its limits in that module's `VALIDATION.md`.
- A passing unit check does not promote an acceptance case to passed.
- When a check cannot run, say so; do not report it as passed.
