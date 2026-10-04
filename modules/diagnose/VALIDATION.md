# Diagnose module: validation

Environment for every result below: a Linux container, Node v22.22.0, pnpm 11.25.0, Chromium 141.0.7390.37 through `playwright-core` 1.56.1, 5 October 2026. The agent that wrote the code ran every check here. No separate reviewer has read this slice yet and no person has.

## Results

Run in the working tree of branch `slice-3-diagnose`: `pnpm build`, then `node scripts/test.mjs pr --update-baseline` (every layer passed, then the baselines were recorded through the runner). The results are copied from that run's output; the pull request's own CI result is recorded below when it arrives.

| Suite | Result |
| --- | --- |
| diagnose/unit/engine | 20 passed |
| diagnose/unit/digest | 3 passed |
| diagnose/integration/diagnose-api | 25 passed, against a real D1 database through Miniflare |
| diagnose/static/scope-rules | 4 passed |
| diagnose/smoke/diagnose | 7 passed, the built application in a local Worker |
| diagnose/browser/diagnose | 8 passed, a real headless Chromium |
| platform/unit/guards | 2 passed; now checks the union of the append-only and rule triggers against the migrations |
| platform/unit/body | 3 passed (new; the body reader moved into the platform) |
| all other suites | unchanged from slice 2, all passed |
| static/typecheck, static/documentation, static/migrations | pass |

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

37 breaks of the application code were caught on the first run, plus 4 of the access check again after it moved to the platform, plus 3 of the body reader (one of them survived at first and was closed by a test). Of 6 page breaks, 4 were caught at once, one was closed by a test added in response, and one survives and is recorded here. These show the tests are sensitive to these breaks. They do not show the code is free of defects the author did not think to break.

## What these results do not show

- No independent review has happened. Slice 1's review found a high finding that its author's own mutation table missed; assume the same is possible here, in the triggers and the scope handling in particular.
- The ranking weights and every library figure are placeholders. The tests check that the engine does what its rules say; nothing checks that the rules suit a real factory.
- Concurrency was tested with a stale decision count and with three sign-offs sent together, inside one process. Two Workers racing were not run; the guarantee rests on one SQL statement, a partial unique index and a trigger, and SQLite serialises writers.
- The fingerprint detects a change made to the stored rows outside the application. It does not prevent one, and the fingerprint is stored in the same database as the rows it covers.
- The page was run in Chromium only, against a local Worker over plain HTTP, with a synthetic sign-in. Accessibility was not checked beyond the browser tests finding fields by their labels.
- The assessment has not been shown to an owner.
