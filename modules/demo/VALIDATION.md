# Demonstration module: validation

Environment for every result below: a Linux container with two cores and no container daemon, Node v22.22.0, pnpm 11.25.0, Chromium 141 through playwright-core, 5 October 2026. The agent that wrote the code ran every check. **No person and no separate reviewer agent has reviewed this slice**, and the results of the repository's continuous-integration checks on GitHub were not read by the agent (it was told not to read check results, so none is claimed). The slice is a draft pull request, labelled `needs-human-review`.

## What was run

`pnpm build`, then `node scripts/test.mjs pr`. The demonstration module has six suites:

| Suite | Tests | What it covers |
| --- | --- | --- |
| demo/unit/cast | 10 | The cast against the engine and the application's own limits: every person and company is marked SYNTHETIC, with an address that cannot receive mail; nothing looks like a real address, phone number or web address; every company's answers pass the questionnaire's validation; the diagnosis ranks the same first and second idea for each (the first not an AI idea, an AI idea shown somewhere); every provider service names a real idea and cluster; the first pool has five companies and the second three, so it stays under the floor with the walked company added; each stage is used and a provider is named exactly from the stage that needs one; the fee is one whole number of rupees; the people are added once each with quotes escaped. |
| demo/unit/script | 5 | The script's own consistency: steps numbered in order, each signing in as someone in the cast; ten to twenty minutes; the five stages in their order; the clusters and "at least 5" / "fewer than 5" match the data, **and the script does not state the listing fee** (D-03); it avoids a short list of claims (a guarantee, a saving, certification, approval, payment through the platform, the platform contacting the provider) and carries a list of what it does not show and a note that a restart resets it. |
| demo/unit/seed-checks | 2 | The seeder's two self-checks as functions: the ranking check and the pool check refuse in each way they should. |
| demo/static/script-labels | 3 | Every button, field and link the script names exists in the sources of the pages it points to. A renamed button fails here. |
| demo/smoke/demo | 10 | The launcher in demonstration mode against the built application: what the seeder reports, every person of the cast can sign in, the finished company's plan, payment and starting number are as the script says, the walked company starts with only its description, the witness company sees none of the others, the first pool says "at least 5" and the second says nothing when the walked company asks, **no page or answer an owner can read shows the listing fee**, and `/demo` exists only in demonstration mode. |
| demo/browser/walk | 2 | A real Chromium follows the script's eight steps as written, signed in as the people it names, through the launcher and its gate, with no request to another origin and no page error; then the cast page and the sign-in page. |

32 tests. The platform module's `source-rules` suite is now 8 tests: the exemption from the header rule now follows imports and fails if any file the Worker runs can reach an exempt file (it was a text match), and a test of the import walk itself.

## What the first runs found

- **The script stated the fee.** The `/demo` page is readable by anyone past the gate, owners included, and it carried the placeholder listing fee (₹1,500). The smoke test that checks no owner can read the fee (D-03) failed on `/demo`. The script now says "the one listing fee, which the page states" and the operator's own page shows the amount; a unit test fails if the script states it.
- **A wrong expectation in my own test.** The second idea in the second cluster is offered by providers 1 and 3, and the smoke test said provider 1 only. The cast was right; the test was wrong.
- **A wrong regular expression in my own test.** The browser walk's check that the hidden pool shows no count matched "Fewer than 5 companies", which is the floor, not a count.
- **Type errors.** The seeder's HTTP client used constructor parameter properties, which the repository's `erasableSyntaxOnly` setting (needed for Node's type stripping) refuses; rewritten as plain fields. `tsc` also caught two comparisons of constants in a test.

## Does the suite catch what it claims to?

Each change was made in the working tree, the named suites were run (after a rebuild, so a change to the page was in the build), and the change was reverted with `git checkout`. 10 changes. The first run of 8 caught 6; the survivors were the seeder's own self-checks (that the pools come out as the script says, and that the diagnosis ranks the expected ideas), which no test reached because they fire only when the cast and the application disagree. They were made into functions (`checkRanking`, `checkPools`) with unit tests, and two further changes to those functions were added; all four now fail.

| Change | Failed |
| --- | --- |
| `/demo` shown outside demonstration mode | smoke |
| The fee amount written into the script | smoke, unit/script |
| A fourth company in the cast asks for the second idea (the second pool would show when the walked company joins) | smoke, unit/cast |
| A company at a stage that needs a provider, with none | smoke, unit/cast |
| The seeder's client sends a foreign Origin; sends no session cookie | smoke |
| The pool check removed; the ranking check removed; the ranking check ignoring the second idea; the pool check ignoring the cluster | unit/seed-checks |

What this does not show: the changes are the ones the author thought of, and the browser layer was not run for them.

## Measured, once, on the development machine

- The launcher in demonstration mode was ready after the seeder reported "5 companies, 3 providers, 68 requests". The smoke suite (two launches, ten tests) takes about 6 seconds and the browser walk about 12 seconds.
- Not timed on a hosted container (STATUS.md, limit 8).

## Not checked

- **No person has watched the demonstration being presented.** The browser walk follows the script mechanically; it does not show that a presenter can say it in 15 minutes, that the wording is clear to a factory owner, or that the cast is believable to one. The page's look was seen once, in a screenshot, by the agent.
- **Nothing is deployed**, so the demonstration has not run on DigitalOcean (see modules/hosting/VALIDATION.md).
- **The 30, 90 and 180 day reviews** are shown as dates only (STATUS.md, limit 2).
- **The cast is five similar garment units** (STATUS.md, limit 3). The ranking is the same for each on purpose.

## Final run

`node scripts/test.mjs pr --update-baseline` on the final code of this branch (which includes slice 8), 5 October 2026, run once: **64 of 64 suites passed, none failed** (524 tests across the 61 suites that report a count; the other three are `tsc`, the documentation check and `drizzle-kit check`). The runner recorded a baseline for the demonstration module (new: 32 tests in 6 suites) and changed the platform module's (`static/source-rules` from 7 to 8); the other modules' baselines were not changed, because their counts did not change. The run took about 11 minutes on two cores.

## Slice 10c: the presenter's page rebuilt on the shared interface (5 October 2026)

`/demo` was rebuilt on the design system of slice 10 (see [the status page](STATUS.md), "The page after the interface rebuild"). `src/script.ts` and `src/cast.ts` were not touched. The author is an agent; no presenter has used the new page.

| Check | Result (on the branch `slice-10c-deliver-run`, after `pnpm build`) |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `demo/static/script-labels` (every label the script names is in the page sources; the home page offers every link the script opens from) | 3 passed |
| `demo/unit/cast`, `demo/unit/script`, `demo/unit/seed-checks` | 10, 5 and 2 passed |
| `demo/smoke/demo` | 10 passed |
| `demo/browser/walk` (reads each step card and each person's card) | 2 passed (19.6 s) |

No existing test was changed. The page was opened as the operator at 390 and 1280 pixels, in the light and the dark scheme, with no horizontal scroll; it was read by looking only, not rehearsed aloud. It was not timed, and no presenter has said whether the cards are easier to follow than the list they replace.

## Slice 11d: shared interface, polish (6 October 2026, branch `slice-11d-polish`)

The author is an agent; no person has read this. Real results, after `pnpm build` of the tree that commit cbfd34f holds.

| Check | Result |
| --- | --- |
| `demo/unit/cast`, `script`, `seed-checks` | 10, 5 and 2 passed, unchanged |
| `demo/unit/dates` (new) | 6 passed: day, month name and year with no leading zero; a timestamp reads as its UTC date; all twelve months; a leap day; anything that is not a real date comes back unchanged; and the pages of this slice use the helper and no longer cut a timestamp to its first ten characters |
| `demo/unit/ui-contrast` (new) | 10 passed: secondary text on every tinted ground reads at 6.9 to 1 or more in the light set and both dark sets (the journey guard asks for 4.5); the edge of a control reads at 3.5 to 1 or more on every ground in all three sets (3.94 at the lowest in the dark sets, from 2.54 before; the guard does not measure edges); every `color-mix()` in the five style sheets has a plain colour for the same property before it; the mark in a notice and the number on a section have an empty alternative text |
| `journey/unit/contrast` | 8 passed, unchanged |
| `demo/static/script-labels` | 3 passed |
| `demo/smoke/demo` | 10 passed, unchanged |
| `demo/smoke/interface` (new) | 5 passed: the title of each page; the empty states of Describe, Choose and Providers; a visitor's way in; the operator's home |
| `demo/browser/walk` | 2 passed, unchanged |
| `demo/browser/phone` (new) | 2 passed: 390 px, the operator, owners A to G and a visitor on six pages, no sideways scroll and each page's own title; the operator's table box |
| `journey/browser/journey` | 1 passed, unchanged |

**Mutation checks.** Removing the plain colour before one `color-mix()` made `demo/unit/ui-contrast` fail; a month off by one and a kept leading zero each made `demo/unit/dates` fail. Restored afterwards. The smoke and browser tests were not mutated.

**What was looked at.** The text of the home page for the visitor, the operator and owners A to G (each stage and the step above it), and of the operator's page at 390 and 1000 px. No wording was changed. The "Not yet" beside "Starting number recorded" is a known gap (STATUS).

**What this does not show.** The contrast tests measure colours written in the style sheet; they do not measure a rendered page, and they do not resolve a colour made with `color-mix()`. Chromium only. The home page's sentences about dates ("The next review opens on" followed by an ISO date) come from the journey module, which was not changed, and still show ISO dates; the pages of Decide, Deliver and Measure do too.

## Slice 12b: the script and its page (6 October 2026, branch `slice-12b-choose-operator`)

The author is an agent; no person has read this. Real results, after `pnpm build`, on 6 October 2026 (about 06:54 IST).

| Check | Result |
| --- | --- |
| `demo/unit/script` | 6 passed (1 more: the starting number is a percent, the date and price are typed as the form wants them, the no-contact sentence is in the script) |
| `demo/static/script-labels` | 3 passed |
| `demo/unit/cast`, `dates`, `seed-checks`, `ui-contrast` | 10, 6, 2 and 10 passed |
| `demo/smoke/interface` | 6 passed (1 more: `/demo` has exactly one `role="note"`, and its two links are on a line of their own) |
| `demo/smoke/demo` | 10 passed, unchanged |
| `demo/browser/walk`, `demo/browser/phone` | 2 and 2 passed, unchanged |
| `journey/browser/journey` | 1 passed, unchanged |

**Mutation check.** Putting "late orders" back into the starting-number step made `demo/unit/script` fail; restored.

**One existing assertion was changed:** `demo/smoke/interface` matched "The fee has not been decided (OQ-11), so ..." on the operator's page; the code was taken out of the page's text and the assertion matches the sentence without it.

**What this does not show.** The script was not walked again by a person, and its 15 minutes were not timed; the 12 minutes in the first-time walkthrough belong to its own order of ten steps. The browser test `demo/browser/walk` walks the pages with the script's labels, not with its figures: nothing typed in the script's step 6 is checked against the form by a test, except by wording (the unit test). The page was not looked at as a picture. The two links under the introduction are 44 px high by their style; no tap-target measurement was made of `/demo` apart from `quality/browser/phone`, whose list still holds the layout's own "Skip to the page" and "APLYD home".
