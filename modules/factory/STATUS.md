# Factory module: status

Owner: the factory module. Paths: `modules/factory/`, `app/factory/`, `app/api/companies/[id]/factory/`, and migrations 0003 and 0004 in `drizzle/`. Last updated 4 October 2026.

This is slice 2, Describe: the owner describes the factory by answering a questionnaire, and the platform keeps every save as a new version. Protected paths touched: data scope (a company's own record, read and written only by that company's owner) and migrations (a new append-only table). An independent reviewer has not yet read this slice, and a person has not read it ([VALIDATION.md](VALIDATION.md)).

## What works

- An owner opens `/factory`, sees the newest saved version filled in, and saves a change. Every save appends a version; nothing is edited or deleted. Earlier versions open read-only from the history list.
- Two kinds of save. A draft needs only one answer. "Confirm this is accurate" needs five answers (sector, products, employees, processes, problems); a form that asks to confirm without them is saved as a draft and the page names what is missing, so typed text is never lost. The JSON interface answers 400 for the same case.
- Stale saves are refused. Each form carries the version it started from. If another save landed first, nothing is written and the person is told (303 to the page for a form, 409 for JSON). The check and the insert are one SQL statement, so two simultaneous saves cannot both succeed.
- The scope rule is the platform's own: an owner reads and writes only their company. A request for another company's record, or from the operator, answers 404, identical to a record that does not exist, and is audited (`factory.read.denied`, `factory.write.denied`). A person who is signed in but not an owner gets 403. Every query is bound to the signed-in person's company, not to the id in the URL; a static test checks every SQL string on the table.
- Every created version writes an audit entry (`factory.revision.created`) in the same database batch, and only when the insert happened.
- `factory_revisions` refuses UPDATE, DELETE and any INSERT that would replace a row, whether it collides on its id or on (company, version), through three triggers. The health check reports `degraded` when one is missing. As with the audit log, `DROP TRIGGER`, `DROP TABLE` and `ALTER TABLE` cannot be stopped inside SQLite.
- Answers are validated against the questionnaire: unknown questions, wrong types, unlisted options, repeated options, more than three problems, over-long text and control characters are refused, with a message per question. A body over 64 KB is refused (413); content types other than JSON and form posts are refused (415) before the body is read.
- Company A has one confirmed SYNTHETIC version; company B has none, so both an existing record and an empty one can be shown.
- Unit, integration, static, smoke and browser tests, and mutation checks ([VALIDATION.md](VALIDATION.md)).

## Not built

- Voice and photos, and the owner's own language. The description is typed, in English, as a form. The thesis describes this step as voice, photos and a few questions, in the owner's own language ([thesis.md](../../docs/thesis.md), section on the journey); this slice builds only "a few questions". It is where the slice is most likely to be wrong about how owners will actually describe a factory.
- Turning free text into structured answers (an AI step). Nothing here calls a model.
- An advisor or consultant role. Only the company's owner can read or write. Diagnose (slice 3) needs a scoped way for APLYD staff to read a company's record, which is a data-scope change and gets its own review.
- Withdrawing or erasing a description. Versions are permanent by design, so a request to remove personal data would need a decision first (OQ-07).
- Comparing two versions, or showing who changed what field.
- Merging after a stale save. The person sees the newest version and retypes.

## Known limits

1. The questionnaire's questions and option lists are assumptions, not findings. The four sectors follow the study's four sectors (source S4 in [sources.md](../../docs/sources.md)) plus "something else"; size bands, budget bands and the list of problems are round numbers and guesses. They are marked as assumptions in the code. OQ-03 (first sector and cluster) decides what they should become. A questionnaire change is a new `QUESTIONNAIRE_VERSION`; old versions keep the version they were saved with.
2. Nothing tests the questionnaire with a real owner. The ten-owner test (thesis section 7) has not been run.
3. A user who has saved a version cannot be deleted (a foreign key protects the history). There is no `disabled` flag on users yet.
4. Only owners write. A company with several people has one author per version, recorded in `created_by`; there is no co-author or approval.
5. The page is server-rendered with a plain form post. It has no client-side checks beyond the browser's own `maxlength`; the server is the check. It was run in one browser engine (Chromium), see the platform limit 11.
6. The browser tests were run only against the local Worker, not against a hosted environment.
7. The inherited platform limits apply, in particular 1 (synthetic sign-in has no password), 8 (an authenticated person can flood the audit log with denied requests) and 9 (the baseline can be edited by hand).
