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
