# Ten-owner test: worksheet

Prepared 5 October 2026 from [thesis.md](thesis.md) section 7. The test is the sponsor's to run, with real owners, by hand. Nothing in this repository can run it. This page is the worksheet and the rules for reading the result, written before the test so the result cannot choose its own bar.

## What the test decides

The thesis says the result decides whether slice 3 (Diagnose) is built as described. At the sponsor's request on 4 October 2026 slices 3, 4 and 5 were built ahead of it (see [HANDOVER.md](../HANDOVER.md)). So the test now decides something different and larger: which of those slices stay as built, which are reworked, and which are closed before anyone reviews them. Each is a pull request stacked on the one below, so the sponsor can stop at any point in the stack.

## Rules for running it

- Ten owners in one cluster, none met through the study (C-05). Log how each contact came about, from first touch, before anything else is written down. A contact whose origin cannot be shown is not counted.
- Run stages 1 and 2 by hand: a person describes the factory with the owner, and a person (not this application) writes the plan. Do not show an owner the opportunity library in the application: it is SYNTHETIC, its figures are placeholders, and the diagnose status page says it must not be shown to a real owner as advice.
- Keep the filled worksheet outside this repository, under codes (O1 to O10), with the key to the codes held separately. Real company data does not go into Git ([AGENTS.md](../AGENTS.md)).
- Fill in the bar below before the first conversation, not after the last.
- Record what the owner said, in their words, before you record your reading of it.

## Worksheet: one row per owner

Copy this table to a private spreadsheet.

| Field | What to record |
| --- | --- |
| Code | O1 to O10 |
| Origin of the contact | How you came to speak to them, and on what date (C-05) |
| Sector, size, place | As the owner describes it; no more than you need |
| Stage 1: the factory | Minutes spent with the owner; minutes of your own preparation and writing up; whether anyone else's time was used; any cost in rupees (travel, interpreter) |
| What they said they struggle with | In their words, up to five lines |
| Stage 2: the plan | The ideas you gave them (AI and not), each with benefit, one-time, yearly and hidden cost, what to do first, risk. Minutes to write it; who checked it |
| Did they understand it | What they asked; what they did not follow |
| Acted on it | Within 30, 60 and 90 days: nothing, asked a provider, bought something, started something. What exactly, and at what price |
| What they bought | Item, provider, price, who paid |
| Would they pay for the plan | Yes, no, or only if someone else pays. If yes: how much, how often, to whom. Ask before telling them any price |
| Who else should pay | Owner, a programme, an association, a provider. In their words |
| Surprises | Anything that does not fit the five stages in the thesis |

## The pooling test

Find three or more owners in the cluster with the same requirement. Ask two providers for a quote for the pooled purchase and for each owner buying alone. Record the quotes and the dates.

| Field | What to record |
| --- | --- |
| Requirement | In one line, as the owners would say it |
| Owners | Codes only |
| Provider and quote, pooled | Price, what is included, validity |
| Provider and quote, each alone | Price per owner, what is included |
| Gap | Pooled price against the sum of the individual prices, in rupees and as a share |
| What the providers said | Why they would or would not price differently |

[Guessing] The thesis assumes the gap is large enough to matter and no source gives its size. This test is the first evidence of it.

## The bar, to be set by the sponsor before starting

The values below are proposals, labelled as guesses, for the sponsor to change. They are not findings.

| Question | Proposed bar | If it is missed |
| --- | --- | --- |
| How many of the ten act on the plan within 90 days? | [Guessing] at least 4 | The plan is not what moves an owner. Close slices 4 and 5 and find what does before building more |
| How many would pay, and is the amount above what it costs to serve one owner? | [Guessing] at least 3 would pay, at more than the time and cost recorded | Stage 2 does not stand as a business. Decide who pays (OQ-06, OQ-11) before any more code |
| Does a person's plan from the same facts differ from the order the engine ranks the synthetic library in? | [Guessing] the top three ideas agree for at least 6 of 10 | The ranking rules in the engine are a poor model of the person's judgement. Rework slice 3 before anything stacks on it |
| Is there a pooled-purchase gap, and how large? | [Guessing] at least 10 percent for two providers on one requirement | Pooling is not the reason to build slice 4's pools. Keep the requirement and the registry, drop pooling |
| Did owners ask for something the five stages do not contain? | Any repeated request | Add it to the thesis before building more |

## After the test

- Write the result in this file under a dated heading, with the codes and no company names.
- Update [HANDOVER.md](../HANDOVER.md) and the module status pages for any slice that was closed, reworked or confirmed.
- Open questions the result bears on: OQ-02 (what owners ask for first), OQ-03 (first sector and cluster), OQ-06 (what the owner pays for), OQ-11 (revenue under D-03), OQ-12 (principal or agent).
