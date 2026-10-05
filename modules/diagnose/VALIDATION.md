# Diagnose module: validation

Environment for every result below: a Linux container, Node v22.22.0, pnpm 11.25.0, Chromium 141.0.7390.37 through `playwright-core` 1.56.1, 5 October 2026. The agent that wrote the code ran every check here. A separate agent reviewed the first version (below). No person has read this slice.

## Results

Run in the working tree of branch `slice-3-diagnose`: `pnpm build`, then `node scripts/test.mjs pr --update-baseline`. Run twice: once for the first version (a644577), and again after the review fixes below (the table shows the second run; the counts before the fixes are in the second column). Every layer passed both times, and the baselines were recorded through the runner. The pull request's own CI result is recorded below when it arrives.

| Suite | After the review fixes | Before |
| --- | --- | --- |
| diagnose/unit/engine | 20 passed | 20 |
| diagnose/unit/digest | 3 passed | 3 |
| diagnose/unit/pins | 3 passed (new) | |
| diagnose/unit/not-owner | 1 passed (new) | |
| diagnose/integration/diagnose-api | 32 passed, against a real D1 database through Miniflare | 25 |
| diagnose/static/scope-rules | 4 passed | 4 |
| diagnose/static/problems | 1 passed (new) | |
| diagnose/smoke/diagnose | 8 passed, the built application in a local Worker | 7 |
| diagnose/browser/diagnose | 8 passed, a real headless Chromium | 8 |
| platform/integration/append-only-keys | 2 passed (new) | |
| platform/unit/guards | 2 passed; checks the union of the append-only and rule triggers against the migrations | 2 |
| platform/unit/body | 3 passed | 3 |
| all other suites | unchanged from slice 2, all passed | |
| static/typecheck, static/documentation, static/migrations | pass | pass |

## Independent review

A separate Claude instance, started with no part in writing this slice, read commit a644577 and tried to break it (report not kept in the repository; its findings and what was done are here). It ran the static, unit and integration layers (20 of 20 passed) and wrote probes against the real migrations through Miniflare. Result: **1 high, 3 medium, 6 low.** It found no route that reads or writes another company's record.

| Finding | What was wrong | What was done |
| --- | --- | --- |
| H1, high, proven | `INSERT OR REPLACE` of a second sign-off overwrote the first. The `no_replace` trigger on `assessment_events` tests only the id; a second sign-off has a fresh id, and the partial unique index that stood in the way resolves a REPLACE by deleting the old row without running DELETE triggers. The original who, when and fingerprint were gone and nothing audited it. | New trigger `assessment_events_one_signoff_only` (migration 0007) refuses any second sign-off for an assessment, plain or replace. Integration test tries a plain insert, `INSERT OR REPLACE`, `REPLACE INTO`, `INSERT OR IGNORE` and an upsert and checks the first row is byte-for-byte unchanged. A platform test now reads every unique key of every append-only table from the migrated database and requires a BEFORE INSERT trigger that looks at each (the same defect in another table would fail it). The `audit_events` and `factory_revisions` keys, which the reviewer did not check, were read: `audit_events` has only its id; `factory_revisions` has its id and `(company, revision)` and its trigger tests both. |
| M1, medium | The fingerprint covers less than the status note and the page implied. | Wording narrowed in STATUS (what it covers, what it does not). Not widened: covering the whole event log would be a new digest version. Open. |
| M2, medium | Unbounded decisions per assessment, each permanent and returned on every read. | Trigger `assessment_events_decision_limit`: at most 200 decisions per assessment (an assumption), mapped to 409 / a page message; `MAX_DECISIONS` in code is tested equal to the number in the migration; the limit is per assessment. Paging the history is not done. |
| M3, medium | `LIBRARY_VERSION` is hand-bumped and nothing tied it to the content. | `pins.test.ts` hashes the library, the budget ceilings, the points and the item cap, and the engine's output for eight fixed descriptions, against a table keyed by version. A change without a bump fails; a bump without a new line fails. The table is append-only by convention only: editing an old line is possible and only a reviewer would see it. |
| L1, low | A form post could be answered with raw JSON (`changed`, not found). | Every outcome of a form post goes back to the page with a message; another company's assessment gets the same message a missing one does. |
| L2, low | An assessment with no items could be signed off. | Trigger `assessment_events_signoff_needs_an_item`; 409 `no_items`; page message. |
| L3, low | The static scope rule is weaker than described (a query joining a bound and an unbound table passes; INSERTs are not checked). | Not changed. Recorded as a limit: the rule is a tripwire. |
| L4, low | Denied attempts write unthrottled, permanent audit rows. | Not changed. Existing platform pattern; open (see the platform status). |
| L5, low | STATUS said eight guard triggers; there are ten (now thirteen). The guards test and the health check check names, not behaviour. | Count fixed; the limit is now written in STATUS (limit 6). |
| L6, low | A company member who is not the owner was told they have no company. | Message changed and unit-tested. |

## What the first runs found

Recorded because a table of passes hides what the checks were for.

- A score of minus zero. The engine added a risk penalty with `-0`, which compares equal to 0 but prints as "-0" and fails a deep-equality test. The penalties are now written as negative constants.
- Several tests depended on things that are not guaranteed: the order in which two triggers fire (a test now matches on the trigger's own message, not on which fired first), the content type a string body gets when it is sent without one (now stated in the test), a helper name that shadowed another, and a locator that matched two elements.
- A static rule matched an import path ("../db/assessments.ts") as if it were SQL. It now counts only strings that contain a SQL verb.
- A mutation run was killed by the tool's ten-minute limit and left one source file changed. It was restored from Git and compared before anything else ran; mutation runs now go in the background and name the suites they need.

## Mutation checks

Each row is one deliberate break of the code, run against the layers that should see it; "caught" means at least one test failed. Run by `mutate.py` (code) and `uimut2.sh` (the page, which rebuilds the application first); both restore the file after each run.

| Break | Result |
| --- | --- |
| Read: scope check removed; write: scope check removed; write: owner-role check removed; write: cross-site check removed (first in the handler, again in the platform's shared check after the code moved) | caught, caught, caught, caught |
| Assessment load, assessment list, event read, latest-assessment lookup not bound to the company | caught ×4 |
| Duplicate guard removed from the create; assessment-exists guard removed from the decision insert; decision-count guard removed from the sign-off | caught ×3 |
| Audit entry written when the decision insert did nothing | caught |
| Assessment made from the latest version whether confirmed or not | caught |
| Decision value not checked; note length not checked | caught, caught |
| Digest check always true; standing decision keeps the first not the latest; digest ignores the decisions; canonical JSON keeps key order | caught ×4 |
| Body content-type check removed; body size cap removed | caught, caught |
| `no_update` dropped on events; `no_delete` dropped on assessments; `no_replace` on assessments ignoring the inputs key | caught ×3 |
| Trigger dropped: signed-off is final; sign-off needs every decision; decision names an item; needs a confirmed description | caught ×4 |
| Engine: AI items get a bonus; tie-break reversed; budget edge `<` for `<=`; `lacks` inverted; a closed gap still suggested; prerequisite on another item inverted; unknown gap not penalised; no cap on items; an inherited object key read as an answer | caught ×9 |
| Body reader: the refused body not read before answering 415 | survived at first (the integration tests never look at the connection). A unit test now checks the body was read. Caught after the test was added |
| Page: company taken from the query; sign-off button always enabled; decision forms shown after sign-off; AI sentence removed from the ranking text | caught ×4 |
| Page: a wrong point weight in the ranking text | survived at first. The browser test now reads the weights from the page. Caught after the test was added (see the note below) |
| Page: the fingerprint banner always says "it matches" | survived. The browser and smoke tests sign off and see "it matches", which the broken page also says. The mismatch is checked at the API (a stored decision is changed after dropping the guard, and the read says `digestMatches: false`) but not on the page: tampering with the database behind a running Worker is not set up in the browser harness |

### Mutation checks on the review fixes

Run by `mutate.py` against the static, unit and integration layers: 25 breaks, 24 caught on the first run.

| Break | Result |
| --- | --- |
| One-sign-off trigger never fires; fires for any assessment's sign-off; is about decisions instead of sign-offs | caught ×3 |
| Decision cap at 201; at 199; counts sign-offs too; counts every assessment's decisions, not this one's | caught, caught, **equivalent**, caught after a test was added (the first run survived because the test used one assessment) |
| Cap constant differs from the trigger; the refusal not mapped; answered 400; form sent to the wrong message | caught ×4 |
| Empty-assessment trigger never fires; refusal not mapped; form message wrong | caught ×3 |
| A form post answered with JSON for: `changed`; a missing sign-off record; a missing decision record; the sign-off answer's fallback; a different place for not found | caught ×5 |
| A library figure edited without a bump; the version bumped without a pin; a ranking point changed; the item cap changed | caught ×4 |
| A member told they have no company; "already signed off" no longer mapped | caught ×2 |

The equivalent break: counting the sign-off row in a cap that only applies to decision inserts changes nothing, because a decision after a sign-off is refused by the signed-off rule first.

37 breaks of the application code were caught on the first run, plus 4 of the access check again after it moved to the platform, plus 3 of the body reader (one of them survived at first and was closed by a test). Of 6 page breaks, 4 were caught at once, one was closed by a test added in response, and one survives and is recorded here. These show the tests are sensitive to these breaks. They do not show the code is free of defects the author did not think to break.

## After the review-fixes branch

A decision with no decision in it (a NULL passed the table's shape check) and a note over 500 characters are refused by the database as well as by the handler on the review-fixes branch (pull request #8, migration 0014), with a test for each. A later review of that branch found that a NUL character hid a long note from `length()`; the note trigger also bounds the note in bytes, and the test pins it. That review also noted that this module's handler counts characters only and, unlike the factory module's, does not refuse control characters; STATUS limit 4 says so, and it is not changed. The mutation results for these fixes, and a second agent's review of them, are in [modules/platform/VALIDATION.md](../platform/VALIDATION.md) (section "Review-fixes branch").
## What these results do not show

- One agent reviewed the first version and found a high finding that this slice's own mutation table (37 breaks) had missed, as slice 1's review did. Assume a second reviewer could find more, in the triggers and the scope handling in particular. The fixes themselves were not reviewed by anyone but their author and the mutation checks above.
- The ranking weights and every library figure are placeholders. The tests check that the engine does what its rules say; nothing checks that the rules suit a real factory.
- Concurrency was tested with a stale decision count and with three sign-offs sent together, inside one process. Two Workers racing were not run; the guarantee rests on one SQL statement, a partial unique index and a trigger, and SQLite serialises writers.
- The fingerprint detects a change made to the stored rows outside the application. It does not prevent one, and the fingerprint is stored in the same database as the rows it covers.
- The page was run in Chromium only, against a local Worker over plain HTTP, with a synthetic sign-in. Accessibility was not checked beyond the browser tests finding fields by their labels.
- The assessment has not been shown to an owner.

## Slice 10a: the page rebuilt on the shared interface (5 October 2026)

`/diagnose` was rebuilt on the design system of slice 10 (see [the status page](STATUS.md), "The page after the interface rebuild"). The change is to presentation, structure and wording; the API, the data layer and the migrations were not touched. The author is an agent; no person has read it, and no owner has used the page.

### What was run (real results, on the branch `slice-10a-describe-diagnose`, after `pnpm build`)

| Check | Result |
| --- | --- |
| `static/typecheck` (`tsc --noEmit`) | passed |
| `diagnose/unit/progress` (new: the state of the sign-off and its sentence, the next idea to decide, an older description, the words for a decision, the score line adding up to the score for every idea of a real result, and where a signed-off assessment points next, using the journey's own `nextStep`) | 7 passed |
| `diagnose/unit/engine`, `unit/digest`, `unit/pins`, `unit/not-owner` | 20, 3, 3 and 1 passed |
| `diagnose/static/problems` (every `?problem=` key has a message and every message is sent), `diagnose/static/scope-rules` | 1 passed, 4 passed |
| `diagnose/browser/diagnose` | 8 passed (48.9 s) |
| `diagnose/smoke/diagnose` | 8 passed (7.0 s) |
| `diagnose/integration/diagnose-api` (nothing it covers was touched) | 34 passed (72.7 s) |
| `platform/static/page-lookups`, `platform/static/source-rules`, `platform/static/conflict-markers` | 2, 8 and 2 passed |
| `journey/unit/contrast`, `journey/unit/progress` | 8 passed, 22 passed |
| Suites that walk this page from elsewhere: `journey/browser/journey`, `demo/browser/walk`, `platform/smoke/built-app`, `demo/smoke/demo`, `platform/browser/pages`, `demo/static/script-labels` | 1, 2, 12, 10, 3 and 3 passed |
| `docs/static/api-sync` | 20 passed, 1 failed: "section 5 lists page /, which posts no form", the home page of the foundation commit; not from this slice |
| `node scripts/test.mjs --check-catalogue` | clean, 83 suites |

No existing test was changed: every assertion of the eight browser tests and eight smoke tests passes as it was written, including the one that reads the raw HTML of the disabled sign-off button.

### What was looked at

The page was opened in Chromium at 360, 390 and 1280 pixels wide, in the light and the dark scheme, as the demonstration's owners A (a confirmed description and nothing made; then an assessment with nothing decided, with two ideas decided, with every idea decided, signed off; then a newer description confirmed, so the assessment is an older one), B (no confirmed description) and C (the finished example, where the owner's turn is a delivery waiting), and with `?problem=undecided`. The script that took them reported no horizontal scroll on any of them. Things found by looking and fixed: the sign-off card, with its three-sentence explanation, was a full screen before the first idea (the explanation is now one tap away until every idea is decided); the four facts took a screen each on a phone with the label above the figure (the label is now beside it, and the first fact, which is long, has the full width); once signed off, the wide layout kept a column for a one-line decision (now one column); the decision was said three times (a tag, the legend and the checked choice; the legend now only asks the question); the arrow on a full-width button was left at the far edge when the label wrapped (a phone gets the words alone). The demonstration's walk failed once for a reason found by looking at the text, not the picture: the tags of an idea had no space between them, so "Uses AI" ran into "Needs something else first" for anything that reads the text, including a screen reader; a space is now between them.

### What this does not show

- **No keyboard-only or screen-reader walk.** The forms are plain HTML with real labels; nobody tabbed through the page or listened to it.
- **Chromium only**, with the synthetic sign-in. No other browser, no real phone, no slow connection.
- **Not independent**, and **no mutation checks** were run for this slice. The sign-off state, the pointer to the next step and the score line are pinned by their unit test; the wording is pinned only where an existing test names it.
- **The pointer after a sign-off repeats the next step**: the page's frame already ends with the same card when the owner's turn is on another page, so an owner who has signed off sees the same step twice, once under the sign-off and once at the foot of the page. A shared option to leave the foot out would remove it.
- **Sentences were added**: "Next:" with the step and its button, "What signing off means" (the old explanation, kept in full, behind a tap until every idea is decided), the heading "The ideas, ranked", the line "How it scored" (the engine's own points for the idea, which the page did not show before; they add up to the score, and a test checks it), "Answers:", "Shown above", "Older version". The ten-owner test is where the wording is checked, and it has not been run.

## Slice 11a: where the factory stands, and what changed since the earlier assessment (6 October 2026)

`/diagnose` gained a gap view (BR-DIAG-08), a comparison with the earlier assessment (BR-DIAG-11) and a plain statement on each idea of where its figures come from (BR-DIAG-02); see [the status page](STATUS.md). The author is an agent; no person has read it and no owner has used it. Branch `slice-11a-diagnose-gap`, started from b741f59. Same environment as above (Node v22.22.0, pnpm 11.25.0, Chromium 141.0.7390.37 through `playwright-core` 1.56.1), run on 6 October 2026 (Asia/Kolkata; the container's own clock was still 5 October in UTC, which is the date the runner wrote into the baseline file).

### What was run (real results, after `pnpm build`, on the final code of the branch unless a note says otherwise)

| Check | Result |
| --- | --- |
| `node scripts/test.mjs unit --only diagnose/unit/gaps,diagnose/unit/compare` (new) | gaps 15 passed, compare 11 passed |
| `node scripts/test.mjs unit --only diagnose/unit/engine,diagnose/unit/digest,diagnose/unit/pins,diagnose/unit/not-owner,diagnose/unit/progress` | 20, 3, 3, 1 and 7 passed |
| `node scripts/test.mjs unit --only journey/unit/contrast,journey/unit/progress` (the contrast guard; the new styles use only existing tokens, no colour was added and `app/globals.css` is untouched) | 8 passed, 36 passed |
| `node scripts/test.mjs browser --only diagnose/browser/gaps,diagnose/browser/diagnose` (new: four walks in Chromium; the eight existing ones unchanged) | gaps 4 passed, diagnose 8 passed |
| `node scripts/test.mjs smoke --only diagnose/smoke/diagnose` | 8 passed |
| `node scripts/test.mjs browser --only journey/browser/journey,demo/browser/walk` and `smoke --only platform/smoke/built-app,demo/smoke/demo` (suites that walk the Decide page from elsewhere) | 1, 2, 12 and 10 passed |
| `node scripts/test.mjs static` | 28 of 28 passed (includes typecheck, documentation, traceability, test-docs, migrations, `docs/static/lld-sync`, `diagnose/static/scope-rules` and `diagnose/static/problems`) |
| `node scripts/test.mjs --check-catalogue` | clean, 98 suites in 5 layers |
| `node scripts/test.mjs unit browser --only diagnose/unit/gaps,diagnose/unit/compare,diagnose/browser/gaps --update-baseline --reason "..."` | the three new suites recorded in `modules/diagnose/tests/baseline.json` through the runner (15, 11, 4); no other count changed |

The four browser walks are: before any assessment, with a description confirmed (owner A) and without (owner B); one assessment at 390 pixels (the five parts in plain words without the ideas, the ideas' source and "first" lines, the folds, the empty comparison, no sideways scroll, every link, fold and button at least 44 pixels tall, no console errors or failed requests); a second assessment made by changing an answer on Describe and confirming it again (what moved and the answers that caused it, the first assessment still there, the way back to the newest, another company's owner shown none of it); and every idea left out. No existing assertion was changed or weakened. The browser test of the second assessment was extended after the first run with a check of every link, fold and button in the page body, which passes now. The same measure, taken by script before the fix, found three links 20 pixels tall (the new jump link and the two "From version" links in the list of assessments); they were fixed, and the test was not run against the unfixed page.

### Mutation checks

Twenty-five one-line changes were made by hand to `src/gaps.ts` and `src/compare.ts` (a guard removed, a comparison inverted, an order swapped, a case dropped) and the two new unit files were run against each. Three changes survived the first run: the lines in a part sorted by kind before the idea's place, the "ideas held up" count counting lines instead of ideas, and "nothing moved" ignoring ideas that came in or dropped out. A new test and two assertions were added; after that, none of the twenty-five survived, and the files were restored. The script is not in the repository, so the checks are not reproducible by someone else without writing their own; the repository's own tool in `scripts/mutation` was not used. The page file was not mutated: its markup is held only by the browser tests.

### What was looked at

The page was opened in Chromium for owner A with two assessments (the second after changing "How do you keep track of what is being made?" to "In software" and adding quality records) at 390 and 1280 pixels, in the light and the dark scheme: no sideways scroll at either width, nothing under 44 pixels, the text readable in both schemes, no part cut off. A keyboard walk by script (Tab through the page, Enter and Space on a fold) found a visible focus ring on every stop and the folds opening and closing; the headings run h1, then h2 for the assessment, the comparison, the ideas, where the factory stands and the list of assessments, with h3 below them (the sign-off, the groups of changes, each idea, each part). Also seen earlier in the session at 390 pixels: the page was too long with the answers open, so they were folded, the part view was moved below the ideas, and the comparison was put above them.

### What this does not show

- **No owner has read or used it.** Whether "Where your factory stands" and "What changed since the earlier assessment" are understood, and whether an owner can read the parts without the ideas (the acceptance wording of BR-DIAG-08), has not been tested. Passing unit and browser tests are not an accepted case: all 176 acceptance cases remain pending, and BR-DIAG-02, -08 and -11 stay Partial.
- **The parts are a presentation choice** over a thin SYNTHETIC library, not a measure of any factory. People rests on one question.
- **No independent review.** The code, the tests and the mutation checks are the author's.
- **No screen reader, no real phone, Chromium only**, a local Worker over plain HTTP. The keyboard walk was a script, not a person.
- **Left not run**: `diagnose/integration/diagnose-api` (34; nothing in the API, data layer or migrations changed), `platform/browser/pages` and every suite of other modules apart from those named above, `node scripts/test.mjs pr --guard` and the whole suite (not allowed in this push).
- **The engine's own sentences contain the word "gap"** (the reason for a left-out idea). They are shown as written, in the comparison and in the existing list of left-out ideas. Changing them needs a new engine version and new pins.
- **The page is long on a phone** (about 11,000 pixels at 390 pixels wide, two assessments, folds closed).
- **Sources**: the statement of where figures come from is true because the library cites none. It was checked against the library in the test, not against `docs/sources.md`.
