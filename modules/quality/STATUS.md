# Quality module: status

Owner: the quality module. Paths: `modules/quality/` only (tests, this file and `VALIDATION.md`). It adds no code to the application and no page, and it changes no file of another module. Last updated 6 October 2026. Status: draft. Not reviewed by a person.

The module measures two requirements that nothing measured before: BR-UX-05 (works on a phone) and BR-UX-09 (WCAG 2.1 level AA). It is a set of browser tests that open every page, as every kind of synthetic person who can open it, on a phone-sized screen, and report what is wrong. It does not fix anything. The pages belong to other modules. What it found is in [VALIDATION.md](VALIDATION.md).

It does not show that either requirement is met. The accessibility checks are a small part of a WCAG audit, and no one has used a real phone or a screen reader on the application. See "What the module does not measure".

## What the module holds

| File | What it is | Tests |
| --- | --- | --- |
| `tests/browser/phone.test.ts` | Every person over every page at 390 by 844: no sideways scroll and no element past the screen edge; every link, button, field and disclosure box has a target of at least 44 by 44 CSS pixels; every control is inside the screen sideways and not covered at its centre | 5 |
| `tests/browser/accessibility.test.ts` | Every person over every page: one `<main>`, one h1, one `role="note"` banner, headings that do not skip, `<html lang>`, a title, no block on zooming; a name on every form control and picture; a name on every link and button in the browser's own accessibility tree; Tab order, focus ring and a covered focus | 5 |
| `tests/browser/slow-connection.test.ts` | The home page, the Decide page and the Describe page loaded cold on a throttled connection (400 kbit/s, 400 ms latency): the h1 must be visible within 10 seconds and the page must cost under 400 kB | 3 |
| `tests/browser/survey-detects.test.ts` | Small pages with faults put in on purpose. Each measurement must find its fault, and a clean page must give nothing. No application is started | 8 |
| `tests/unit/offenders.test.ts` | The rule that compares a run with the list of known offenders, and the shape of the two lists | 6 |
| `tests/support/probe.ts` | The measurements, written to run inside a page | none |
| `tests/support/matrix.ts` | The people, the pages, the phone-sized browser context, and the walk | none |
| `tests/support/findings.ts` | Turns measurements into findings; presses Tab; reads the browser's accessibility tree | none |
| `tests/support/offenders.ts` | The comparison with the list of known offenders, and the rewrite of the list | none |
| `tests/support/known-offenders/phone.json`, `accessibility.json` | The faults found today, one to a line | none |

The counts are in `tests/baseline.json`. The suites' own start-up is the one the demonstration module uses: `scripts/serve.mjs` in demonstration mode with the address open, through `modules/hosting/tests/support/launcher.ts`. That gives the platform's two owners (A and B), the five owners the demonstration adds (C to G) at different stages, and the operator, and it is the only way to see the pages with records on them. The people are the nine of `PERSONAS` in `tests/support/matrix.ts`: a visitor who has not signed in, owners A to G, and the operator. The pages are the nine of `PAGES` in the same file: the home page, sign-in, Describe, Decide, Choose, Deliver, Measure, the operator's page and the demonstration page. A page that a person is refused is still a page: the refusal is what that person sees, so it is measured.

## How to run it

Build first (`pnpm build`), then, through the queue for heavy work on a shared machine:

- `/home/claude/bin/heavy node scripts/test.mjs browser unit --only quality/unit/offenders,quality/browser/phone,quality/browser/accessibility,quality/browser/slow-connection,quality/browser/survey-detects`
- One suite: `/home/claude/bin/heavy node --test modules/quality/tests/browser/phone.test.ts`

The four browser suites take about two minutes together, once the queue lets them start.

## The lists of known offenders

The two files in `tests/support/known-offenders/` are the faults that were there when the module was written. A test does not fail because of a fault that is on the list. It fails in two cases:

1. A fault is found that is not on the list. Either a page got worse, or a page changed so that an old kind of fault appeared in a new element, or a new page or person was added. The failure names the page, the person, the check and the element.
2. A fault on the list is no longer found. A page was fixed. The failure asks for the line to be removed, so that the fault cannot come back without being noticed.

To record a new state on purpose, run the suite with the environment variable `QUALITY_UPDATE_BASELINE=1`. The suite rewrites its file from what it found and passes. Read the difference in the file before committing it. This is not the runner's own `--update-baseline`, which only records how many tests pass in `tests/baseline.json`.

A key is the element's tag, type, name or identifier, the words on it and, for a link, where it goes. Long numbers and identifiers are replaced by `*`. A change of wording on a button or link therefore shows up as one fault gone and one new: that is expected, and the fix is to record the new state.

## The numbers the measurements use

All are constants in the files named, and `tests/unit/offenders.test.ts` pins them.

- Screen: 390 by 844 CSS pixels, a mobile layout viewport, touch, the person's wish for no motion (`VIEWPORT` in `matrix.ts`).
- Smallest target: 44 by 44 CSS pixels (`MIN_TARGET_PX`), with half a pixel of tolerance. The wireframes' rule 10 and BR-UX-05 give the 44. The target of a field or option may be its label. The target of a link may be a stretched box laid over its card by a pseudo-element. A link inside a sentence is exempt (WCAG 2.5.5 names the exception) and is counted in the report.
- Tab: the first form control must be reached within 10 presses (`MAX_TABS_TO_FIRST_FIELD`).
- Slow connection: 400 kbit/s down and up, 400 ms added to each request, a budget of 10 seconds to a visible h1 and 400 kB. These are an assumption, not a measurement of any owner's connection (AS-02 in the BRD is still a guess). The reasons are in the first lines of `slow-connection.test.ts`.

## What the module does not measure

- One engine: headless Chromium 141 on Linux, from the development container, at one screen size (and, once by hand, at 320 and 360 pixels wide: see VALIDATION.md). No other browser, no real phone, no touch hardware, no virtual keyboard.
- It is not a screen-reader test and not a WCAG audit. It checks what a script can check about structure, names, focus and size. It does not check reading order, link purpose, error messages, the wording of labels, time limits, motion, orientation, text spacing, or what a person who cannot see the page would make of it.
- Colour contrast is not measured here. `modules/journey/tests/unit/contrast.test.ts` measures the colour pairs the stylesheet defines.
- It measures the pages in the states the demonstration seeds. It does not fill in a form or press a button, so a page after a refusal, a page with a saved message and the page after each step are not measured, and neither is a page with a long list of requirements or milestones.
- The throttle shapes bytes and delay. It does not drop packets, and a real radio is not like it.
- It does not say that BR-UX-05 or BR-UX-09 is met. The BRD's status for both stays "Unverified" until a person has used the pages on a phone and a screen reader and a full audit has been done.

## Known follow-ups

1. The offenders in VALIDATION.md belong to pages other modules own. They are listed there with the file and the rule that makes the fault.
2. The checks run in one state of each page. A second pass after the main action on each page (a saved decision, a refused request) would find faults the first cannot.
3. A 320 pixel pass for the sideways scroll, and a zoom pass at 200 percent, were done once by hand and found nothing; they are not tests.
4. The Tab check records how many presses it takes to reach the first field. Three pages reach it on the ninth or tenth press (VALIDATION.md). The limit of 10 is the one the plan names; a smaller limit is a design decision.
