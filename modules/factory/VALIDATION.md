# Factory module: validation

Environment for every result below: a Linux container, Node v22.22.0, pnpm 11.25.0, Chromium 141.0.7390.37 through `playwright-core` 1.56.1, 4 October 2026. The agent that wrote the code ran every check here. No separate reviewer has read this slice yet and no person has.

## Results

Run in the working tree of branch `slice-2-describe`: `pnpm build`, then `node scripts/test.mjs pr --update-baseline` (every layer passed, then the baselines were recorded through the runner).

| Suite | Result |
| --- | --- |
| factory/unit/questionnaire | 11 passed |
| factory/integration/factory-api | 23 passed, against a real D1 database through Miniflare |
| factory/static/scope-rules | 3 passed |
| factory/smoke/describe | 11 passed, the built application in a local Worker |
| factory/browser/describe | 9 passed, a real headless Chromium |
| platform/unit/guards | 2 passed (new) |
| all other platform suites | unchanged from slice 1, all passed |
| static/typecheck, static/documentation, static/migrations | pass |

## What the first runs found

Recorded because a table of passes hides what the checks were for.

- Typecheck failed after the tests passed. The helper that sets an answer on an object was typed so that it could not take the answer type. Node strips types without checking them, so the unit and integration suites never saw it. Fixed; the lesson is that the typecheck suite is not optional.
- The smoke and browser tests failed on their own mistakes: server-rendered React places comment markers between text and values, so a text match on raw HTML failed (the tests now strip them); a radio named "One" also matched "We have none" (exact match now). Neither was an application defect.

## Mutation checks

Each row is one deliberate break of the code, run against the named layers; "caught" means at least one test failed. Run by `mutate.py`, which restores the file after each run.

| Break | Result |
| --- | --- |
| Read: scope check removed | caught |
| Write: scope check removed | caught |
| Write: owner-role check removed (in the handler, and separately inside `canWriteOwnCompany`) | caught, caught |
| Write: cross-site check removed | caught |
| Query widened with `OR 1 = 1` on the latest-version read | caught |
| Query unbound from the company in the history read, and in the single-version read | caught, caught |
| Stale check removed from the insert | caught |
| Audit entry written even when the insert did nothing | caught |
| Denied write not audited; denied read not audited | caught, caught |
| Confirm allowed without the required answers (form, and JSON) | caught, caught |
| Body size cap removed | caught |
| Content-type check removed | survived at first: the later "unsupported" return gave the same answer. A test now sends an oversized body with an unsupported type and expects 415, not 413, so the body is shown not to be read. Caught after the test was added |
| More than three problems not enforced | caught |
| `no_replace` trigger dropped; `no_replace` ignoring the (company, version) key; `no_update` trigger dropped | caught, caught, caught |
| Seed inserts even when a version exists | caught |
| Page: old versions editable | caught |
| Page: company taken from the URL query | survived at first (no test named another company in the address); a browser test now does so with five parameter names. Caught after the test was added |
| Page: missing-answers notice hidden; stale notice hidden; hidden `based_on` always 0 | caught, caught, caught |

26 breaks, 2 survivors at first, both closed by a test added in response. These show the tests are sensitive to these breaks. They do not show the code is free of defects the author did not think to break.

## After the review-fixes branch

On the review-fixes branch (pull request #8) the factory module has a bounded body reader, a limit of 500 versions per company, form messages for the new refusals, a history capped at 100 versions with a count, and sorted field keys, and migration 0014 makes the table refuse answers that are not a JSON object, a revision number that skips one, a 501st version and a note over 500 characters. A later review of that branch found two holes in the table's rules, both fixed with a test: SQLite's `length()` stops at a NUL, so the note trigger also bounds the note in bytes; and the bytes of `{}` stored as a BLOB passed `json_valid()`, so the answers rule now requires the stored type to be text. The mutation results for these fixes, and a second agent's review of them, are in [modules/platform/VALIDATION.md](../platform/VALIDATION.md) (section "Review-fixes branch").
## What these results do not show

- No independent review has happened. Slice 1's review found a high finding that its author's own mutation table missed; assume the same is possible here, in the append-only triggers and the scope handling in particular.
- Concurrency was tested with a stale `basedOn`, once at a time. Two requests racing inside the Worker were not run in parallel; the guarantee rests on one SQL statement plus a unique key, and SQLite serialises writers.
- The page was run in Chromium only, against a local Worker over plain HTTP, with a synthetic sign-in.
- Accessibility was not checked beyond the browser tests finding fields by their labels. No screen reader was used.
- The questionnaire has not been shown to an owner.

## Slice 10a: the page rebuilt on the shared interface (5 October 2026)

`/factory` was rebuilt on the design system of slice 10 (see [the status page](STATUS.md), "The page after the interface rebuild"). The change is to presentation, structure and wording; the API, the data layer and the migrations were not touched. The author is an agent; no person has read it, and no owner has used the page.

### What was run (real results, on the branch `slice-10a-describe-diagnose`, after `pnpm build`)

| Check | Result |
| --- | --- |
| `static/typecheck` (`tsc --noEmit`) | passed |
| `factory/unit/progress` (new: what counts as an answer, the count for nothing saved, for the five needed questions, for the two follow-up questions, for names such as `__proto__`, and the words) | 7 passed |
| `factory/unit/questionnaire`, `factory/static/scope-rules` | 12 passed, 3 passed |
| `factory/browser/describe` | 9 passed (63.8 s) |
| `factory/smoke/describe` | 11 passed (8.0 s) |
| `factory/integration/factory-api` (nothing it covers was touched) | 34 passed (63.4 s) |
| `platform/static/page-lookups` (every message looked up with `Object.hasOwn`), `platform/static/source-rules`, `platform/static/conflict-markers` | 2, 8 and 2 passed |
| `journey/unit/contrast`, `journey/unit/progress` (the colour pairs and step wording the page is built from) | 8 passed, 22 passed |
| Suites that walk this page from elsewhere: `journey/browser/journey`, `demo/browser/walk`, `platform/smoke/built-app`, `demo/smoke/demo`, `platform/browser/pages`, `demo/static/script-labels` | 1, 2, 12, 10, 3 and 3 passed |
| `node scripts/test.mjs --check-catalogue` | clean, 83 suites |

One test was changed, and only in layout: in `tests/browser/describe.test.ts` three tests now open the "Earlier versions" section (`openHistory`) before counting or reading the list, because that list is intentionally collapsed now. Their titles and every assertion are as they were. A past version's own page opens it by itself and the tests that follow the "Version 1" link do so after opening it.

### What was looked at

The page was opened in Chromium at 360, 390 and 1280 pixels wide, in the light and the dark scheme, as the demonstration's owners A (a confirmed description; then with a draft saved on top, so an old version could be opened read-only; then a confirmed second version), B (nothing saved: the first visit; then a draft saved with the five needed questions unanswered) and C, and with `?problem=invalid&fields=...`, `?stale=1`, `?missing=...`, `?saved=...&confirmed=1` and `?rev=1`. The script that took them reported no horizontal scroll on any of them. Things found by looking and fixed: the state card said the version, the date and whether it was confirmed twice (as tags and as a sentence); the "Needed to confirm" tag left the help text wrapping under it, so the help is now one block beside the tag or under it; the version being looked at was not marked in the list of versions. The demonstration's walk then failed on a different page for a reason that applies here too: tags placed side by side had no space between them in the text, so a reader of the text saw "DraftSYNTHETIC"; a space is now there on this page and on Diagnose.

### What this does not show

- **No keyboard-only or screen-reader walk.** The question groups are real fieldsets with legends and the help lines are tied to their controls, and the browser tests find every control by its label; nobody tabbed through the page or listened to it.
- **Chromium only**, with the synthetic sign-in. No other browser, no real phone, no slow connection. The bar stuck to the bottom of the screen was looked at in screenshots of a scrolled page, not with a phone's on-screen keyboard open.
- **Not independent**, and **no mutation checks** were run for this slice. The count is pinned by its unit test; the wording is pinned only where an existing test names it.
- **The count is a choice.** It leaves out the two follow-up questions until the answer that asks for them is given. Nothing in the questionnaire says to; a different reader could count all 25.
- **Sentences were added**: "A draft can be saved after answering just one question." (from the status above: a draft needs one answer), the line about the questions needed to confirm, "in the newest saved version", and the tag "Shown above". The ten-owner test is where the wording is checked, and it has not been run.

## Slice 11d: polish (6 October 2026, branch `slice-11d-polish`)

The author is an agent; no person has read this. Real results, after `pnpm build` of the tree that commit cbfd34f holds.

| Check | Result |
| --- | --- |
| `factory/unit/progress`, `factory/unit/questionnaire` | 7 and 12 passed |
| `factory/static/scope-rules` | 3 passed |
| `factory/integration/factory-api` | 35 passed (one new: a form post with no cookie, an empty cookie, an altered cookie or a multipart form goes to `/sign-in?expired=1` with nothing saved; a program call still gets 401 JSON; a valid session still saves) |
| `factory/smoke/describe` | 11 passed, unchanged |
| `factory/browser/describe` | 9 passed, unchanged (the saved-date line is now the written date; no assertion named the ISO text) |
| `demo/smoke/interface` (owner B, nothing saved) | the empty Describe page says "Nothing saved yet.", "A draft can be saved after answering just one question." and "No earlier versions yet. Your first save will be version 1." |
| `platform/browser/session-expired` | 3 passed: the Describe form is filled in, the session ends, Save is pressed, the person lands on the sign-in page with the message, and the description is still version 1 |
| `demo/browser/phone` | 2 passed: `/factory` at 390 px does not scroll sideways for any person of the cast or a visitor |

No existing assertion was changed or removed. **What was looked at:** the page's text for owner B (nothing saved) and the demonstration owners; the numbers on the sections were not heard in a screen reader.

**What this does not show.** Chromium only, one width for the phone test, a local Worker. The date is the UTC date, not the Indian date (see STATUS). Nothing here is a mutation check of the factory page itself; the integration test was shown to fail when the no-session answer was made JSON again (see the platform VALIDATION).

## Slice 12a: typed answers kept, the first three pages (6 October 2026, branch `slice-12a-describe-home`)

The author is an agent; no person has read this. Results are from the tree at the commits on this branch (base 696640e), after `pnpm build` (twice: the second build is the tree that the results below were run against), run in a shared 2-core machine on 6 October 2026 between 06:30 and 07:15 IST.

| Check | Result |
| --- | --- |
| `node scripts/test.mjs unit` | 50 of 50 suites passed, including `factory/unit/draft` (8 new: the cookie round trip in English and Hindi, the size limit, the cookie attributes, a draft read only for the company that typed it, a forged cookie, `firstTexts` and `isVersionNumber`) and `journey/unit/contrast` |
| `factory/integration/factory-api` | 39 passed (4 new: a refused form sets the typed-answers cookie, with the address unchanged and no typed word in it, and the record count unchanged; a stale form the same; a save that goes through clears it; a form with nothing typed and a JSON call set no cookie; answers too long for three cookies are not kept) |
| `factory/browser/describe` | 15 passed (6 new: the limit on biggest problems on the page and the refusal that keeps and marks everything typed, including the cookie's attributes in a real browser; the several kinds of box kept; another company's owner on the same browser does not get the typed answers; the head card and the button words; the 44-pixel links at 1000 and 390 px; a made-up `?saved=` and repeated names in the address). One existing test was changed, see below |
| `factory/browser/first-visit` | 3 passed (new: the visitor's two sentences and no price, the sign-in placeholder and its refusal, no "Signed in as" line on the owner's home page) |
| `factory/smoke/describe`, `demo/smoke/interface` | 11 and 5 passed |
| `platform/browser/pages` | 3 passed after one assertion was changed (the sign-in list now starts with "Choose a person") |
| `platform/browser/session-and-scope`, `journey/browser/journey` | 8 and 1 passed (run on the first build of the branch; the second build changed only the biggest-problems limit and a stylesheet). Two assertions of `session-and-scope` were changed, see below |
| `quality/browser/accessibility` | 5 passed |
| `quality/browser/phone` | 3 passed, 2 failed: see below |
| `node scripts/test.mjs static` | 28 of 29 passed; the failing suite is `docs/static/lld-sync` (it names `metadata` on `app/diagnose`, `app/deliver` and `app/run`, pages this slice did not touch) |

**Tests changed, and why.**
- `factory/browser/describe`, the stale-save test: it asserted that the second tab shows the newest saved text in the box. That is the behaviour this slice changes (the typed text stays), so it now asserts the typed text and the new sentence, and then saves again as version 3. The title is unchanged.
- `platform/browser/session-and-scope` (two assertions) read "Signed in as SYNTHETIC Owner A owner" from the home page, a line this slice removes (S5-22); they now read the name from the page header. `platform/browser/pages` listed the sign-in options exactly and now expects the placeholder first. These two files belong to the platform module, which this slice does not own; the change is as small as it can be.

**Quality phone suite.** It reports the six known tap-target offenders for the "Version 1" link on `/factory` (owners A, C, D, E, F, G) as no longer found: they were fixed by this slice and are to be removed from `modules/quality/tests/support/known-offenders/phone.json` (not edited here). It also reports five new faults that are on pages this slice did not change: `/deliver` (owner E) summary "What a good test looks like", `/run` (owner C) summary "Correct this number", and three clipped "Unlist ..." buttons on `/operator`. They are on pages this slice did not touch, so they were there before it (not run separately at the base commit); the owners of those pages decide.

**What this does not show.**
- Chromium only, a local Worker, synthetic sign-in. No real phone, no second browser, no cookies-off browser (the "could not be kept" sentence is read from the code and from the too-long case in the integration test, not from a browser with cookies blocked).
- The inline script that switches the limit was run in Chromium only. With scripts off, the quality no-script suite was not run for this change; the page does not need the script (the server draws the same state when the page opens, and the server refuses a fourth tick).
- The browser check of the year box stops an out-of-range year before the server sees it; the tests switch the browser's check off to reach the server's.
- A cookie holds at most about 9,000 characters of encoded answers across three pieces; a description filled to every limit in a script that needs three bytes per letter does not fit and is not kept (tested with Hindi text).
- The page cannot clear the cookie itself (cookies cannot be changed while a page is drawn in this framework: read in `node_modules/vinext/dist/shims/headers.js`, which refuses it in a render; not run); it lives two minutes and the next save clears it. Not shown: whether a shared computer's next person could open `/factory?problem=invalid` within two minutes as the same company; the cookie holds the company, so only the same company's owner is shown the answers.
- Not independent, and no mutation check was run for this slice.
- No keyboard-only or screen-reader walk of the new marks ("Change this answer.") or the head card.
