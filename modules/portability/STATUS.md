# Portability module: status

Owner: the portability module. Paths: `modules/portability/`, `app/export/`, `app/api/companies/[id]/export/`. It also adds one entry (API-30) to `docs/design/API-REFERENCE.md` with the count and the error-index ids that go with it, and two audit events to section 5.8 of `docs/design/DATA-DICTIONARY.md`. Last updated 6 October 2026.

Status of this document: draft, 6 October 2026. Not reviewed by a person. No separate agent has reviewed this slice either.

This is slice 11c, "Take your data with you" (BR-DATA-03, BR-GOV-05). An owner, or a member, of a company downloads every record of that company as one JSON file in a documented shape, from the page `/export`. Protected path touched: data scope (which company's data a person can read). No migration, no new table, no new package, and nothing that moves or records money. Every record is SYNTHETIC.

## What works

- **The file.** `GET /api/companies/{id}/export` (API-30) answers one JSON file with `content-disposition: attachment` and the name `aplyd-records-{company id}-{date}.json`. It holds the company record; every version of the factory description with its answers; every assessment with its ranked ideas (`result.items`), every decision and the sign-off with its fingerprint; every requirement, withdrawn ones included and marked; every engagement with the provider chosen (id and name only), its milestones and every event recorded on it; and every baseline and review. Every list is oldest first, and the same records always give the same file apart from `exportedAt`.
- **It documents itself.** The file names its `format` (`aplyd-msme-company-records`) and `version` (1), carries `synthetic: true` and the `SYNTHETIC` tag, the time it was made and the company id, `counts` for each section, and a `readme` that explains each section, the conventions (UTC times, whole rupees, ids) and what is left out and why.
- **Who may have it.** The shared company check, `authorizeCompanyRead`, decides, exactly as for every other company read: a person of that company (owner or member) gets the file; anyone signed in with another company, and the operator, who has none, get 404 `not_found`, the same answer as for a company that does not exist; no session gets 401. The records are read through the identity's company, never through the id in the URL.
- **Audit.** A successful export writes one entry, `company.export`, with the format version and the number of records, after the file is built and before it is sent. A refusal writes `company.export.denied` through the shared check. Nothing else is written.
- **The page `/export`, "Take your data with you".** A person of a company sees what the file holds, counted, the button "Download your records" (a plain link, no script), what happens next (the browser saves the file; downloading does not close the account; the file is theirs and anyone who has it can read it; each download is noted in the log; any person of the company can download it; closing an account is not built), and, behind two summaries, what is not in the file and why, and how the file is laid out. A visitor sees the page's title and one "Sign in" link. The operator is told that the operator cannot download a company's records. A signed-in person with no company gets the existing not-linked notice.
- **It reads only through the other modules' data layers.** `src/read.ts` calls `loadOwnCompany`, `loadHistory` and `loadRevision`, `listAssessments` and `loadAssessment`, `listRequirements`, `listEngagements` and `listOutcomes`, each with the identity's company. The module holds no SQL. It never calls the provider register, the listing terms, the pools or the audit log, and a static test fails if it does.

## What the file leaves out, and why

| Left out | Why |
| --- | --- |
| Other companies' records | They belong to those companies (BR-GOV-05) |
| Pool sizes | They are counts made from other companies' records (C-04) |
| The provider register, a provider's own summary, the listing fee and terms | They are the platform's, not the company's. The engagement keeps the chosen provider's id and name |
| The audit log | No data layer reads it yet, and refusal rows can name another company's id (the requested id). Not built |
| People's names and email addresses | No data layer reads a company's people. The file names a person by account id only. Not built |
| The note written with a withdrawal | `listRequirements` returns the time of the withdrawal but not its note, and this module may not read the procure tables itself. Needs a change in the procure module |
| Sessions and secrets | Never put in a file |

## Known limits

1. **The platform cannot stop serving a company.** BR-DATA-03 asks for both halves: the export (built here) and the platform being able to stop serving the records (not built: there is no way to close an account or remove its records, and removal would collide with the append-only rule). The page says so.
2. **A member can export, not only the owner.** This follows `authorizeCompanyRead`, as the slice brief asked. BR-GOV-05's acceptance text says "to anyone but its owner". Whether a member of the owner's company counts is for the sponsor to decide. Allowing only the owner would mean a role check in the handler after the shared company check, and a change to the page.
3. **Nothing links to `/export` yet.** The home page belongs to another agent this wave; the link is reported to them.
4. The file is not signed. Anyone can change it after it is downloaded, so it is a copy, not a proof.
5. It cannot be loaded back: there is no import.
6. The file is built whole in memory and every view of `/export` reads every record to count it (one read per revision, assessment and engagement after the lists). For a company at the limit of 500 revisions that is over 500 reads per view. Not measured.
7. The date in the file name is the UTC date, so a file made between midnight and 05:30 IST carries the day before.
8. Each download writes an audit row, so repeated downloads add rows that cannot be pruned (the same limit as FND-007).
9. `result` (an assessment) and `spec` (a requirement) are copied as stored. The data layers parse them with a cast and no run-time check, so the file holds whatever the database holds.
10. Format version 1 is this agent's choice. Nobody outside the repository has read it, and no owner has opened the file.
