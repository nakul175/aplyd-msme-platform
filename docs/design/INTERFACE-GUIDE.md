# Interface guide

How the pages of the application are built, so that a new page looks and behaves like the rest. It describes what exists in `app/globals.css`, `app/_ui/` and `modules/journey/` on this branch. It is a working guide for people changing pages, not a requirement: the requirements are in [the business requirements](../brd/BRD.md).

Status: draft, 5 October 2026. Not reviewed by a person. Last updated 6 October 2026 (page titles, dates, two tokens, the table box, corrections and the phone measurements brought up to commit 696640e; before that, corrected on 5 October against the code, after reviews run by agents, not by a person). Nothing here has been tried by an owner of a factory. The design is a first version made by people who are not the users; the ten-owner test ([docs/ten-owner-test.md](../ten-owner-test.md)) is where it is checked. The screens as built are described in the [functional specification](../fsd/FSD.md), section 5, and drawn in the [wireframes](WIREFRAMES.md).

## What the pages are for

An owner of a small factory opens the service on a phone, between jobs, and has to know three things at once: where they are, what is their turn, and what happens if they press the button. Every page is built to answer those, in that order, in plain words.

1. **Where am I.** Each of the five stage pages an owner opens (Describe, Decide, Choose, Deliver, Measure) opens with the five steps, with the finished ones ticked (a step counts as finished only when every step before it is), the one that is the owner's turn marked in marigold, and the current page marked as the current one. When the next step says that nothing is needed from the owner, no step is marked as the owner's turn. The home page shows the five steps as cards instead of the strip. The sign-in, operator and demonstration pages show neither.
2. **What is my turn.** The home page opens with one sentence and one button: the next step. A stage page whose own step is not the owner's turn ends with that same next step, in the card "Your next step". The card is not drawn when the owner's turn is on that page's own step, when the step says that nothing is needed from the owner (work under way, waiting for a provider to be listed, up to date), or when the page already names the step itself (`hideNext`, used by Diagnose after a sign-off). A visitor and a person who is not an owner see no step. The sign-in, operator and demonstration pages have no next step.
3. **What does this do.** A button says what it does in the owner's words ("Sign off", not "Submit"). A page that records something says, next to the button, that it is recorded and whether it can be changed.

## Rules the pages follow

- **Plain words, short sentences.** One idea per sentence. No jargon: "idea", "provider", "milestone", "starting number". Numbers in Indian grouping (`₹1,25,000`).
- **One main action per screen.** The main button is `className="primary"`. Everything else is a plain button or a link. Never two primary buttons side by side. The three buttons of the home page's opening block use `btn turn big` instead: `turn` is the marigold button that marks the owner's turn (or, for a visitor, the way in), and `big` makes it larger.
- **Caveats are kept, but they do not sit in front of the work.** The text that says a figure is a placeholder, that dates are in UTC, that a number is typed by the owner and not measured, stays on the page, in a `<details className="card">` after the main action, or in a short `help` line under the field it is about. It is not deleted: the tests and the honesty of the page depend on it.
- **A message is a `Notice`.** `role="status"` for something that went well, `role="alert"` for something that needs attention. The wording is the page's own; the colour is the tone.
- **Everything is reachable by touch and keyboard.** Buttons (the `small` ones too), text fields, drop-down lists and option rows have a minimum height of 2.75rem, which is 44px at the default size, and so do the two summaries that open a section on Diagnose and Procure; a link inside a sentence has no minimum. Nobody measured this on a phone: it is what the style sheets say. Labels are real `<label>`s tied to their control, and a visible outline is set for keyboard focus (`:focus-visible`; not tried on a screen). A tag says "Done" and a tick is not the only sign, with one exception: in the strip of five steps, "your turn" is shown by a colour and a ring, and its words are for a screen reader only (FSD section 12, item 39).
- **It is designed to work at 360px wide with no sideways scroll,** in the light and the dark scheme. This is a design rule. Two browser suites now measure a phone width, 390 by 844, not 360: `modules/quality/tests/browser/phone.test.ts` and `modules/demo/tests/browser/phone.test.ts` (no page of the slice scrolls sideways for any person of the cast; the operator's table scrolls inside its box). The first lists what still fails in `modules/quality/tests/support/known-offenders/phone.json` (on 5 October 2026: small links such as "APLYD home" at 96 by 32 pixels, "Skip to the page" at 155 by 41 and "Back" at 37 by 20, against the 44 the rule asks for), and fails on a fault that is not listed. The longest pages at that width were Describe at 8,934 pixels and Decide at 8,854, and every radio row was at least 44 pixels high ([quality validation](../../modules/quality/VALIDATION.md#page-lengths-on-a-phone)). No page has been used on a real phone.
- **Every page says which page it is.** The home page is titled "APLYD MSME platform". Every other page sets `metadata = { title: "<page>" }`, and the template in `app/layout.tsx` makes the tab read "<page>: APLYD" ("Describe: APLYD", "Decide: APLYD", "Choose: APLYD", "Deliver: APLYD", "Measure: APLYD", "Providers: APLYD", "Sign in: APLYD", "Demonstration: APLYD"). `/export` sets none yet, so its tab reads "APLYD MSME platform". `modules/demo/tests/smoke/interface.test.ts` pins the titles of the pages it walks.
- **A date is written in words.** `formatDate` in `app/_ui/dates.ts` turns "2026-10-30" or a timestamp into "30 October 2026" (the UTC date, no leading zero on the day). Text that is not a real date comes back as it was. The home, Describe, Choose and operator pages use it. The Decide, Deliver and Results pages still print the ISO form ("2026-10-30") in places, which breaks this rule (LLD section 9.12).
- **A number is corrected by adding, never by changing.** On Results, a starting number or a review that was corrected shows the number first recorded, struck through and tagged "Corrected", then each correction with its date and reason; the last is the current value and is in bold. The form to correct a number is folded under "Correct this number" and asks for the right number and the reason, nothing else. It is the owner's word and nothing checks it.
- **A table that may be wider than a phone scrolls in its own box.** The box is `table-wrap`: it scrolls sideways, can be reached with the keyboard, and the page does not scroll. The operator's providers table is the one use, and on a phone a hint says the table scrolls.
- **Nothing is loaded from another site.** No web fonts, no CDN, no analytics. The browser tests refuse any request that leaves the application.
- **Nothing the owner chooses changes what the platform earns, and the listing fee is on no owner page.** This is a rule of the product. The journey test and the demonstration test (`modules/journey/tests/browser/journey.test.ts`, `modules/demo/tests/browser/walk.test.ts`) look for the placeholder fee, ₹1,500, on the owner pages they visit and expect not to find it.

## Colour and type

Tokens are in `app/globals.css` (a light set, and a dark set under `prefers-color-scheme` and `data-theme="dark"`). A page uses tokens (`var(--brand)`), never a colour value. `modules/journey/tests/unit/contrast.test.ts` measures 34 listed text and ground pairs at 4.5 to 1 and 6 listed control edges at 3 to 1, in the light set and in both dark sets. A pair that is not in the list is not measured by that file. The two tokens for text and control edges on a tinted ground (below) were added on 5 October 2026 (commit 2cb63f1) after FSD section 12 item 33 found the edge of a control on a tinted card in the dark sets at 2.54 to 1; `modules/demo/tests/unit/ui-contrast.test.ts` measures them in all three sets (secondary text at 6.9 to 1 or more, an edge at 3.5 to 1 or more).

| Token | Use |
| --- | --- |
| `--bg`, `--surface`, `--surface-2` | page, card, quiet fill |
| `--fg`, `--muted` | text, secondary text |
| `--muted-tint`, `--edge-tint` | secondary text and the edge of a control inside `.notice` and `.card.tint`, where the ground is tinted |
| `--brand`, `--brand-hover`, `--brand-fg`, `--brand-tint` | the service: links, the main button, selected options |
| `--turn`, `--turn-ink`, `--turn-tint`, `--turn-text`, `--turn-edge` | marigold: "your turn" |
| `--warn-tint`, `--warn-text` | the warning tone (`warn`) of a tag or a notice: the same values as `--turn-tint` and `--turn-text`; its border and the mark of a notice use `--turn` |
| `--ok`, `--ok-tint` | done, went well |
| `--danger`, `--danger-tint` | a problem |
| `--line`, `--line-strong` | quiet divider, the edge of a control |

Type is the device's own (`system-ui`, with Devanagari fallbacks for later). Sizes: page title `clamp(1.75rem, …, 2.5rem)`, section 1.3rem, card title 1.19rem, body 1rem, help 0.94rem. Numbers that line up use `className="num"`.

## Parts

All in `app/_ui/parts.tsx` unless stated.

| Part | What it is | Notes |
| --- | --- | --- |
| `Page` | The frame of an owner page: the five steps, the page head, the content, and the next step when it is somewhere else | `stage` is one of `describe`, `diagnose`, `procure`, `deliver`, `run`; pass the `identity` you already read; `title` is the page's existing `h1` text; `lede` is one short sentence; `hideNext` leaves out the card "Your next step" when the page points to the step itself. The strip and the card are drawn only for an owner of a company, with a database bound. If reading the facts fails, `Page` logs `journey.facts_failed` and opens the page without them (the home page has no such guard: FSD section 12, item 38) |
| `PageHead` | The page's `h1` with an eyebrow ("Step 2 of 5 · Decide") and a lede | Used inside `Page`; use alone on pages that are not a stage |
| `SignedOut` | What a visitor sees on a page that needs an account | One link, named "Sign in" |
| `NotOwner` | What a signed-in person who is not an owner sees | `hasCompany` says whether the account has a company: a member of a company reads that the page is for the owner of their company and that the record is on the home page, an account with no company reads that it is not linked to one |
| `Notice` | A message after something happened | `role`, `tone`, and any `data-testid` |
| `Tag` | A small label | `tone`: `ok`, `turn`, `warn`, `brand`, `danger`; none for a grey tag |
| `Meter` | "3 of 5" as a bar with words | |
| `Strip` | The five steps | Used by `Page` |

Classes for plain markup, in `app/globals.css`:

| Class | Use |
| --- | --- |
| `card` | A surface. `card tint` for a quiet highlight, `card flat` for no shadow. A `<fieldset className="card">` gets its legend as a title |
| `items` | A list of cards: `<ul className="items"><li className="card item">` |
| `facts` | A label and value list: `<dl className="facts">` |
| `question`, `label`, `help` | One question of a form: label, a help line, the control |
| `options` | A group of radios or checkboxes, each `<label className="option">`; add `cols` for two columns on a wide screen |
| `field-row two` | Two short fields side by side on a wide screen |
| `actions` | A row of buttons that wraps |
| `sticky-actions` | A bar of buttons stuck to the bottom of a long form |
| `primary`, `turn`, `danger`, `quiet`, `small`, `big` | On a `button` or a `a className="btn …"` |
| `table-wrap` | Around a `<table>` that may be wider than the screen. The box scrolls sideways and takes focus, so the page does not scroll (the operator's providers table) |
| `muted`, `num`, `sr` | Secondary text, tabular figures, text only for screen readers |

## What a test finds a page by

The browser tests find things by what a person sees. A page that is redesigned keeps:

- its `h1` text, and exactly one `h1` per page;
- its page title (`<page>: APLYD`; the home page keeps "APLYD MSME platform");
- the headings of items at the level they have (an idea's heading is an `h3` inside an `li`, and the controls for that idea are inside the same `li`);
- the text of every label, button and link a test names, and the `name` of every field (a form posts what it posted before);
- every `data-testid`, and the `role` of every notice;
- the paragraphs a test matches by text (they may move, and be wrapped, but not be reworded);
- exactly one link named "Sign in" on a visitor's page, and, as a rule, no link whose name contains the name of another page's link ("Delivery", "Results", "What you need", "What to do about it", "Describe your factory"). The rule is not kept everywhere: the link "Go to delivery" on the Procure page contains "Delivery", so a test that looks for "Delivery" by name finds two links there.

`modules/journey/tests/unit/progress.test.ts` keeps the step labels and the next step's button words away from the names of the page links. That is all it tests; no test looks at the other links.

## Not built yet

Another language than English (OQ-17), voice, photos, a notification when a delivery is waiting, and anything for the provider's side (providers do not sign in). The design leaves room for a language switch in the bar at the top, and for a bottom bar of the five steps on a phone, but neither exists.
