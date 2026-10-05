# Quality module: validation

Status of this document: draft, 6 October 2026. Not reviewed by a person. Everything in it was run by the agent that wrote the module, in the development container, on the branch `quality-11-tests` (base b741f59), on the application as built from that commit. Nothing was run on a phone, on a hosted environment or by an owner of a factory.

This file has four parts: what was run, what it found, whether the measurements can fail, and what the results do not show. [STATUS.md](STATUS.md) says what the module holds and how to run it.

## What was run

Environment: Linux container, 2 cores, about 8 GB shared with other work, Node v22.22.0, `playwright-core` 1.56.1, Chromium 141.0.7390.37 (headless, from `/opt/pw-browsers/chromium`). The application was built with `pnpm build` and started by `scripts/serve.mjs` in demonstration mode with the address open, once for each suite file.

| What | Result |
| --- | --- |
| Command | `node scripts/test.mjs browser unit --only quality/unit/offenders,quality/browser/phone,quality/browser/accessibility,quality/browser/slow-connection,quality/browser/survey-detects --update-baseline --reason "new module quality: slow-connection, detection and offender-list suites"` |
| Date | 6 October 2026, about 01:50 IST |
| Passed | `quality/browser/accessibility` 5 tests, 32 s; `quality/browser/phone` 5 tests, 26 s; `quality/browser/slow-connection` 3 tests, 18 s; `quality/browser/survey-detects` 8 tests, 2 s; `quality/unit/offenders` 6 tests, under 1 s. 27 tests in 5 suites, about 80 seconds without the wait for the queue |
| Recorded counts | `tests/baseline.json`, written by the runner: `browser/accessibility` 5, `browser/phone` 5, `browser/slow-connection` 3, `browser/survey-detects` 8, `unit/offenders` 6 |
| Other commands | `node scripts/test.mjs --check-catalogue`: "Test catalogue clean". `node node_modules/typescript/bin/tsc --noEmit`: exit 0 (whole repository). The two lists of known offenders were first written by a run with `QUALITY_UPDATE_BASELINE=1`; the phone and accessibility suites were then run three times without it, on three separate starts of the application, and passed each time (the same faults, in the same elements, each time) |
| Documentation checks | `docs/static/docindex`, `docs/static/findings` and `static/documentation` fail while the module's pages are not in the index and the register: see "Documentation checks that this module makes fail" below. The others (`api-sync`, `brd`, `dictionary-sync`, `fsd`, `glossary`, `ids`, `lld-sync`, `testdocs`, `wireframes`, `static/traceability`, `static/test-docs`) pass |

The full guard run (`node scripts/test.mjs pr --guard`) was not run, by instruction.

## What it found

The measurement covers nine people (a visitor who has not signed in, owners A to G, the operator) on nine pages (the home page, sign-in, Describe, Decide, Choose, Deliver, Measure, the operator's page, the demonstration page): 81 page visits, each on a 390 by 844 screen. Every page answered 200 for every person, and each stayed at its own address. A refusal is a 200 page on this application, so a visitor on Describe sees a short page that says to sign in, and that page is measured as a page.

### Sideways scroll, controls outside the screen, covered controls

None found. On every one of the 81 visits the page was exactly 390 pixels wide, no element reached past the edge, no control was outside the screen sideways, and no control was covered at its centre once scrolled to. This is also true at 320 and at 360 pixels wide, which was run once by hand with the same measurement and is not a test (see STATUS.md).

### Targets smaller than 44 by 44 CSS pixels

Every field, option, button and disclosure box is large enough. The radio buttons and checkboxes are small, but each sits inside a label row that is at least 44 pixels high. What is too small is seven links, and they are all links. The sizes are the width and height of what a finger can hit.

| Element | Size | Where | Who | Drawn by | Owner this wave |
| --- | --- | --- | --- | --- | --- |
| The skip link, "Skip to the page" | 155 by 41 | Every page | Everyone | `app/layout.tsx`, `.skip` in `app/globals.css` (its padding) | W4 |
| The mark in the top bar, "APLYD home" | 96 by 32 | Every page | Everyone | `app/_ui/appbar.tsx`, `.brand` in `app/globals.css` | W4 |
| "Back" (to the home page) | 37 by 20 | Describe, Decide, Choose, Deliver and Measure | The operator | `NotOwner` in `app/_ui/parts.tsx` line 84; on Decide `app/diagnose/page.tsx` line 78 | W4; W1 for the Decide page's own |
| "Back" | 37 by 20 | The operator's page | Owners A to G | `app/operator/page.tsx` line 43 | W4 |
| "Home" | 45 by 20 | Choose | Owners A to G | `app/procure/page.tsx` line 347 | W4 |
| "Home" | 45 by 20 | The operator's page | The operator | `app/operator/page.tsx` line 283 | W4 |
| "Back to your assessment" | 189 by 20 | Choose | Owners A to G | `app/procure/page.tsx` line 344 | W4 |
| "Jump to your requirements" | 204 by 20 | Choose | Owners D to G | `app/procure/page.tsx` line 98 | W4 |
| "Version 1", in the list "Earlier versions" | 71 by 25 | Describe | Owners A, C, D, E, F, G | `app/factory/page.tsx` line 241 | W4 |

The line numbers are those of commit b741f59. Links inside a sentence are not counted (the highest on any page is 2); a line that stands alone is counted, which is why the "Back" and "Home" links are on the list. The exact keys are in `tests/support/known-offenders/phone.json`: 31 lines.

### Structure, names and the keyboard

One fault: the demonstration page, for everyone, has two elements with `role="note"`. The layout's banner is one; the page has a second, so a person who looks for the one banner finds two. Every contract the repository keeps says one (the brief of this layer, and the page test in `modules/platform`). The page is `app/demo/page.tsx`, owned by W4 this wave.

Everything else the accessibility suite checks was clean on all 81 visits: one `<main>`, one h1, headings in order (no skipped level), `<html lang="en">`, a title, no block on zooming, a label on every form control, no picture without a name or `alt`, a name in the browser's accessibility tree on every link, button and field, the skip link first in Tab order and on screen when it has focus, a ring or shadow on every Tab stop, and no focused control covered by the bar fixed to the foot of the Describe form.

Two things are worth knowing that the suite passes but does not call faults:

- Tab presses to the first form control. The limit is 10. Describe takes 9 for every owner. Choose takes 9 for owner C and 10 for owners D, E, F and G. Deliver takes 10 for owner C and 9 for D and E. Measure takes 10 for D and E. The sign-in page takes 3 or 4. What comes before the first field is the skip link, the mark, the sign-out button and the five links of the strip, and on the later pages some links of the page. One more link before the field on any of those pages makes the test fail.
- Tab stops on Describe: 72 for owners A, C, D, E, F and G and 69 for B. A radio group is one stop, so the questionnaire's 96 fields are 72 stops, and a person who does not want to answer a question presses Tab through all of them to reach "Save as draft".

### The slow connection

The assumption is in the first lines of `tests/browser/slow-connection.test.ts`: a download and an upload of 400 kbit/s, 400 ms added to each request, no cache, a phone-sized screen, the person already signed in. These are not measurements of any owner's connection. Chromium shapes bytes and delay and does not drop packets. The budget is 10 seconds to a visible h1 and 400 kB on the wire, which is about seven times the time and three times the bytes measured. It is set wide on purpose, because the machine is shared and timings are noisy: it catches a page that has become heavy, not one that is a little slower.

| Page, person | h1 visible, throttled | Load finished, throttled | h1 visible, not throttled | Bytes on the wire | Requests |
| --- | --- | --- | --- | --- | --- |
| Home page, visitor | 1.3 s | 3.4 s | 0.15 s | 126,919 | 6 |
| Decide, owner C | 1.3 s | 3.5 s | 0.18 s | 134,103 | 8 |
| Describe, owner A | 1.2 s | 3.4 s | 0.14 s | 135,229 | 8 |

Times are from the run of 6 October 2026 at about 01:50 IST; two earlier runs gave 1.4 to 1.6 s and 3.5 s. Of the 127 to 135 kB, the page itself is about 5 kB and the stylesheet about 5 kB; the rest is two script files, the framework (59 kB) and the page runtime (57 kB), which the browser fetches although the pages are plain server-rendered pages with forms that post to the server. The page can be read before they arrive. Whether it can be used before they arrive was not tested: no test turns scripts off.

### Page lengths on a phone

The longest page at 390 pixels wide: Describe, 8,934 pixels (about 10 screens of 844) for an owner who has not described the factory; Decide, 8,854 for an owner with an assessment; the demonstration page, 8,987. Choose is up to 6,471; the operator's page 5,034; Deliver 3,243; Measure 3,260; the home page 2,370. These are reported in `reports/quality-phone.json` after a run, and not judged. The [wireframes](../../docs/design/WIREFRAMES.md) quote 5,440 and 6,279 pixels for Describe and Decide and "radio rows 24 pixels high"; neither is what this measurement found on the commit b741f59.

## Can the measurements fail?

Yes, and `quality/browser/survey-detects` is the proof that is run every time. It opens small pages with faults put in, and clean pages beside them, and checks that each measurement finds its fault, names it, and gives nothing on the clean page. It starts no application. What it puts in, and what has to be found:

| Fault put in | Found as |
| --- | --- |
| A block 600 pixels wide in a 390 pixel page | `page-overflow` and `wide-element`, with the element named as `main > div.too-wide` and a width of 600; a 900 pixel table inside a box that scrolls is not a fault |
| A 30 by 30 button; a radio button in a 24 pixel row; a link alone on its line 20 pixels high | `tap-target` for each; a 44 by 44 button, a radio button in a 44 pixel row, a link stretched over its card by a pseudo-element, and a link inside a sentence are not faults (the last is counted as exempt) |
| A button covered by an empty block; a button that reaches past the screen edge; a link that wraps over several lines | `covered-control` and `clipped-control` for the first two; the wrapped link is not a fault, because it is reached at the centre of one of its lines (this fixture was added after the first run on the real application reported such a link as covered) |
| Two `role="note"`, two `<main>`, no h1, an h2 first and an h4 after it, a field with no label, a field with only a placeholder, an image with no `alt`, an unnamed svg, no `lang`, no title, a viewport tag with `maximum-scale=1` | Nine checks, with the two fields as two findings, the two headings as two, and the two pictures as two. A clean page with the structure done properly gives none |
| A link holding only an icon, and an empty button | The browser's accessibility tree gives both an empty name, and the element is found and named (`a#icon`, `button#blank`) |
| `outline: none` and `box-shadow: none` on every focused element; a field the thirteenth stop in Tab order; no skip link; a skip link that stays off the screen when focused | `focus-indicator` on all 13 stops; `tab-to-first-field`; `skip-link` in both ways. A label that lights up around its checkbox, a pseudo-element outline on a link and the browser's own ring each count as a visible focus |
| A bar fixed to the foot of the screen over a focused field | `focus-obscured`; with room kept above the bar the stop is clear |

`quality/unit/offenders` tests the rule that compares a run with the list: a new fault is reported, a fault gone from the page is reported, a check not asked about is not compared, and the two lists are well formed.

What was not shown: the whole suites failing on the real application when a page is broken. That needs a change to a page and a rebuild, and the pages are not this module's. The comparison with the list was shown to fail on the real application by hand: see the next paragraph.

## Documentation checks that this module makes fail

Three checks fail while the module's two pages exist and nothing else in the repository names them. They are the checks of documents this module does not own, so they were not edited. The integrator or the owner of those documents has to make three changes (listed in the report that came with this commit): list `modules/quality/STATUS.md` and `modules/quality/VALIDATION.md` in `docs/DOCUMENTATION-INDEX.md` (`docs/static/docindex`); add at least one finding sourced to each page to `docs/FINDINGS.md`, and `quality` to `FINDING_MODULES` in `modules/docs/src/findings.ts` (`docs/static/findings`). `static/documentation` failed only while `VALIDATION.md` did not exist, and passes with it.

## What these results do not show

- They do not show that BR-UX-05 or BR-UX-09 is met, and the BRD's status for both stays "Unverified". One engine, one version of it, one screen size, headless, on Linux. No phone, no touch hardware, no virtual keyboard, no browser a factory owner is likely to use other than Chrome's engine.
- The accessibility suite is not a WCAG audit. WCAG 2.1 level AA has many more success criteria than it looks at. It does not look at: reading order against visual order, link purpose, labels that are present but wrong, error identification and suggestion, status messages, time limits, orientation, text spacing, content on hover or focus, input purpose, motion, reflow at 200 percent, or any use of a screen reader. Colour contrast is covered separately by `modules/journey/tests/unit/contrast.test.ts`, which measures the pairs the stylesheet defines and not the pairs a page makes.
- The phone suite measures the first state of each page for each person. It presses nothing and fills in nothing. A page after a refusal (`?problem=`), after a save (`?saved=`), with a long list of requirements or milestones, or with a long word in a company's name, is not measured. The questionnaire is measured empty.
- The target size is the box a script can find. A finger has no exact box, and the spacing between targets is not measured.
- The slow-connection numbers are an assumption. They show that the page costs about 130 kB and can be read within about 1.5 seconds of the request on the assumed connection on this machine. They do not show how long it takes on any real connection or phone, and a phone's processor is slower than this machine's.
- Nothing shows that an owner can follow a page on a phone. A test of that is the ten-owner test, not this module.
