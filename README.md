# APLYD MSME platform

Status: documentation base plus a walking skeleton (sign-in, one company record, the scope rule, tests and CI), on a draft pull request. Nothing here is accepted for use with real factory data.

## What this is

A platform for Indian MSME manufacturers, built and owned by APLYD. The direction, set by the sponsor on 4 October 2026, is marketplace++: a small manufacturer describes its factory, gets a gap assessment, buys through pooled procurement, has the purchase deployed, and gets help running it. It covers AI and other technology. The "++" is the strategy, solution-design, delivery and operations help that a plain marketplace leaves to the owner. See [docs/thesis.md](docs/thesis.md).

The thesis draws on the IndiaAI Mission MSME study (see [docs/sources.md](docs/sources.md)). The direction is decided; the first sector, the revenue model and the accountability model are not. They are in [docs/open-questions.md](docs/open-questions.md).

## Where to start

| If you are | Read first |
| --- | --- |
| A coding agent or developer continuing the work | [AGENTS.md](AGENTS.md), then [HANDOVER.md](HANDOVER.md) |
| Deciding what to build | [docs/thesis.md](docs/thesis.md), then [docs/decisions.md](docs/decisions.md) |
| Checking where a number or claim comes from | [docs/sources.md](docs/sources.md) |
| Planning the build on the Saha pattern | [docs/saha-lessons.md](docs/saha-lessons.md) |
| Running or testing the code | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), then [modules/platform/STATUS.md](modules/platform/STATUS.md) |

## Ownership

The platform is meant to be owned by APLYD, a separate organisation created by Athena Infonomics, and not by the client of the study it draws on. Until this repository is transferred to an APLYD GitHub organisation it sits under a personal account (open question OQ-01).

## Source material

The four study documents are not stored in this repository. [docs/sources.md](docs/sources.md) lists them with checksums so that anyone holding a copy can confirm it is the same file. The reason is open question OQ-09: the right to reuse study material has not been settled.
