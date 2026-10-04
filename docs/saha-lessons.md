# What to take from Saha, and what not to

Reference: `nakul175/saha-health` at commit 2adfbde (4 October 2026). Paths below are in that repository. Findings come from reading its AGENTS.md, CLAUDE.md, package.json and CI workflow; the code itself has not been audited here.

## Take

| Pattern | Where it lives in Saha | Why |
| --- | --- | --- |
| Authorisation on the server; identity from one trusted module only | AGENTS.md, `lib/saha/identity.ts` | Same risk here: one company must never read another's data |
| Append-only corrections; confirmed records and audit are never edited | AGENTS.md | Needed for a rule library and an audit trail people will rely on |
| Synthetic data only until a real agreement exists | AGENTS.md | Matches OQ-07 and OQ-09 |
| One test runner with named layers, and a guard that fails when a suite disappears or reports fewer passes than the recorded baseline | `scripts/test.mjs`, `tests/regression-baseline.json`, `.github/workflows/ci.yml` | Agents add tests quickly; the guard stops them silently dropping some |
| Documentation integrity check and requirement audit in CI | `scripts/check-documentation.py`, `scripts/audit-requirements.mjs` | Keeps documents and code from drifting |
| Supply-chain gate (SBOM and dependency audit) | `scripts/security-gate.mjs` | Cheap and already written |
| Hosted synthetic staging deployed on each merge to `main`, with a freeze switch | AGENTS.md, `docs/current/HOSTED-STAGING.md` | Gives the sponsor something to look at after each slice |
| HANDOVER.md as the first file any new agent reads | `HANDOVER.md`, `AGENTS.md` | Lets development move between Claude, GPT and people without a re-briefing |

Stack in Saha: Next.js 16 on a Vite-based Cloudflare build (vinext), Drizzle on Cloudflare D1, Playwright for browser tests, pnpm, Node 22 (`package.json`). Proposal P-03 reuses it.

## Do not repeat

- Merging without anyone reading the code. Saha's `CLAUDE.md` records, one after another, merges of whole batches of pull requests at the sponsor's instruction without human review, and says plainly that no person has reviewed that code. Agent-run reviews found defects afterwards, including a high-severity one that was fixed in a later slice. The practice of recording it honestly is good; the volume is the problem. Here, protected paths get a human reader (AGENTS.md, OQ-08).
- One tracking file that every change must edit. Saha's rule is to update the implementation boundary, requirement assessments, next-delivery row, evidence and `VALIDATION.md` together (AGENTS.md), and `VALIDATION.md` is about 329 KB. Parallel pull requests collide on these files. Here each module keeps its own status and validation files.
- Loose release files at the root. Saha has RELEASE-1.md to RELEASE-11.md plus more than a dozen other root-level markdown files. Here the root holds only README, AGENTS and HANDOVER; everything else sits under `docs/` or the module.
- Binary evidence in git. Saha tracks about 7,900 files under `tests/`, including screenshots of up to about 1 MB each. Here, evidence that is a screenshot or a recording goes to artifact storage and the repository holds a link and a checksum.
- Calling something done because a related check passed. `CLAUDE.md` at this commit states that all 176 formal acceptance criteria remain pending, after a very large volume of merged work. Count acceptance, not slices.
- Running out of CI minutes. Saha's workflow runs every check on every non-documentation pull request, and `CLAUDE.md` mentions a merged change for CI minutes. Plan the suite so a pull request runs the layers it touches, and the full suite runs on `main`.

## Open point

`CLAUDE.md` states that no person had reviewed the merged code. Whether a named person has since reviewed Saha's authentication or data-scope changes was not checked here (the clone is shallow). Treat review of those paths as a gap to close in this repository, not a pattern to copy.
